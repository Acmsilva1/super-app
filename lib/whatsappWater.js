import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { getBrazilTodayIso } from '../features/financeiro/service/financeiroService.js';
import { WATER_AMOUNTS_ML } from '../features/saude/service/waterIntakeService.js';

function callbackToken() {
  const token = String(process.env.WHATSAPP_WATER_CALLBACK_TOKEN || '');
  return token.length >= 32 && token.length <= 512 && !/[\r\n]/.test(token) ? token : null;
}
function equal(left, right) {
  return timingSafeEqual(createHash('sha256').update(left).digest(), createHash('sha256').update(right).digest());
}
function validPrompt(prompt) {
  if (!prompt || typeof prompt !== 'object' || Array.isArray(prompt)) return false;
  if (typeof prompt.profile_id !== 'string' || !/^[1-9]\d{0,14}$/.test(prompt.profile_id)) return false;
  if (typeof prompt.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(prompt.date)) return false;
  if (typeof prompt.dedupe_key !== 'string') return false;
  const match = /^agua:(\d{4}-\d{2}-\d{2}):([01]\d|2[0-3]):([0-5]\d):([1-9]\d{0,14})$/.exec(prompt.dedupe_key);
  return Boolean(match && match[1] === prompt.date && match[4] === prompt.profile_id);
}
function signature(prompt, token) {
  return createHmac('sha256', token).update(JSON.stringify([prompt.profile_id, prompt.date, prompt.dedupe_key])).digest('hex');
}
export function createWhatsAppWaterPrompt({ profileId, date, dedupeKey }) {
  const token = callbackToken();
  const prompt = { profile_id: String(profileId), date, dedupe_key: dedupeKey };
  if (!token || !validPrompt(prompt)) return null;
  return { ...prompt, signature: signature(prompt, token) };
}
export async function whatsappWaterHandler(req, res, { getClient } = {}) {
  res.setHeader('Cache-Control', 'no-store');
  const reply = (status, error) => res.status(status).json({ ok: false, error });
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(405, 'method_not_allowed'); }
  const token = callbackToken();
  if (!token) return reply(503, 'water_unavailable');
  const authorization = req.headers?.authorization;
  if (typeof authorization !== 'string' || authorization.length > 600 || !equal(authorization, `Bearer ${token}`)) return reply(401, 'unauthorized');
  let body;
  try {
    if (typeof req.body === 'string' && Buffer.byteLength(req.body) > 4096) return reply(413, 'invalid_request');
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch { return reply(400, 'invalid_request'); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Number.isInteger(body.amount_ml) || !WATER_AMOUNTS_ML.includes(body.amount_ml)) return reply(400, 'invalid_request');
  const prompt = body.water_prompt;
  if (!validPrompt(prompt) || typeof prompt.signature !== 'string' || !/^[a-f0-9]{64}$/.test(prompt.signature) || !equal(prompt.signature, signature(prompt, token))) return reply(400, 'invalid_prompt');
  if (prompt.date !== getBrazilTodayIso()) return reply(410, 'water_prompt_expired');
  const owner = String(process.env.SAUDE_ALERTS_OWNER_USER_ID || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(owner)) return reply(503, 'water_unavailable');
  try {
    const client = getClient ? await getClient() : (await import('./alertServiceClient.js')).getAlertServiceClient({ deadline: Date.now() + 20000 });
    const { data: roles, error: rolesError } = await client.from('app_user_roles').select('role').eq('user_id', owner);
    if (rolesError) return reply(503, 'water_unavailable');
    if (!roles?.some(row => ['owner', 'admin'].includes(row.role))) return reply(403, 'profile_forbidden');
    const { data: profile, error: profileError } = await client.from('tb_saude_perfis').select('id,nome,created_by').eq('id', prompt.profile_id).maybeSingle();
    if (profileError) return reply(503, 'water_unavailable');
    if (!profile || !/^[0-9a-f-]{36}$/i.test(String(profile.created_by || ''))) return reply(403, 'profile_forbidden');
    const { data, error } = await client.rpc('saude_record_water_ml', { p_owner: profile.created_by, p_profile: Number(prompt.profile_id), p_amount: body.amount_ml, p_request: `wa-water:${prompt.dedupe_key}` });
    if (error) {
      if (/water_request_conflict/.test(error.message || '')) return reply(409, 'water_request_conflict');
      if (/water_goal_required/.test(error.message || '')) return reply(409, 'water_goal_required');
      return reply(503, 'water_unavailable');
    }
    if (!data || !Number.isInteger(data.realizado_ml) || data.realizado_ml < 0 || !Number.isInteger(data.meta_ml) || data.meta_ml <= 0 || typeof data.duplicate !== 'boolean') return reply(503, 'water_unavailable');
    return res.status(200).json({ ok: true, duplicate: data.duplicate, profile_name: String(profile.nome || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 80), amount_ml: body.amount_ml, realizado_ml: data.realizado_ml, meta_ml: data.meta_ml, remaining_ml: Math.max(0, data.meta_ml - data.realizado_ml) });
  } catch { return reply(503, 'water_unavailable'); }
}
