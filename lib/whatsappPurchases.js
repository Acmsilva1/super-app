import { createHash, timingSafeEqual } from 'node:crypto';
import { getBrazilTodayIso } from '../features/financeiro/service/financeiroService.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHONE = /^\+[1-9]\d{7,14}$/;
const MAX_CENTS = 999999999;
const ROW_FIELDS = 'id,owner_id,chat_id,sender_id,payload,status';
function equal(left, right) {
  return timingSafeEqual(createHash('sha256').update(left).digest(), createHash('sha256').update(right).digest());
}
function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableJson(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function configuration() {
  const token = String(process.env.WHATSAPP_PURCHASE_CALLBACK_TOKEN || '');
  const phone = String(process.env.WHATSAPP_PURCHASE_OWNER_PHONE || '');
  const owner = String(process.env.SAUDE_ALERTS_OWNER_USER_ID || '');
  return token.length >= 32 && token.length <= 512 && !/[\r\n]/.test(token) && PHONE.test(phone) && UUID.test(owner) ? { token, phone, owner } : null;
}
function validDate(date) {
  if (typeof date !== 'string' || !/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(date)) return false;
  return new Date(date + 'T12:00:00Z').toISOString().slice(0, 10) === date;
}
export function whatsappPurchaseInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  if (body.action !== 'record' || typeof body.request_id !== 'string' || !UUID.test(body.request_id) || body.confirmed !== true || !validDate(body.date)
    || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) return null;
  const items = [];
  for (const item of body.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['description', 'amount_cents', 'payment'].includes(key))
      || typeof item.description !== 'string' || !Number.isSafeInteger(item.amount_cents) || item.amount_cents < 1 || item.amount_cents > MAX_CENTS
      || !['debito', 'pix'].includes(item.payment)) return null;
    const description = item.description.normalize('NFC').trim();
    if (!description || description.length > 120 || /[\u0000-\u001f\u007f-\u009f]/.test(description)) return null;
    items.push({ description, amount_cents: item.amount_cents, payment: item.payment });
  }
  const input = { date: body.date, items };
  const payload = {
    items: items.map(item => ({ descricao: item.description, valor: item.amount_cents / 100, tipo: 'despesa', categoria: 'Outros', data_lancamento: body.date, metodo_pagamento: 'debito_pix' })),
    whatsapp_request: { version: 1, input_hash: createHash('sha256').update(stableJson(input)).digest('hex') },
  };
  const requestId = body.request_id.toLowerCase();
  // Negative 52-bit namespace avoids Telegram's positive update IDs and stays JS-safe.
  const updateId = -(Number.parseInt(createHash('sha256').update('wa-purchase:' + requestId).digest('hex').slice(0, 13), 16) + 1);
  return { requestId, payload, updateId, date: body.date, count: items.length, total: items.reduce((sum, item) => sum + item.amount_cents, 0) };
}
export async function whatsappPurchasesHandler(req, res, { getClient } = {}) {
  res.setHeader('Cache-Control', 'no-store');
  const failure = (status, error) => res.status(status).json({ ok: false, error });
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return failure(405, 'method_not_allowed'); }
  const config = configuration();
  if (!config) return failure(503, 'purchase_unavailable');
  const auth = req.headers?.authorization;
  if (typeof auth !== 'string' || auth.length > 600 || !equal(auth, 'Bearer ' + config.token)) return failure(401, 'unauthorized');
  let body;
  try {
    if (typeof req.body === 'string' && Buffer.byteLength(req.body) > 16384) return failure(413, 'invalid_request');
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch { return failure(400, 'invalid_request'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return failure(400, 'invalid_request');
  if (body.sender_phone !== config.phone) return failure(403, 'sender_forbidden');
  const healthcheck = body.action === 'healthcheck';
  const input = healthcheck ? null : whatsappPurchaseInput(body);
  if (!healthcheck && !input) return failure(400, 'invalid_request');
  try {
    const client = getClient ? await getClient() : (await import('./alertServiceClient.js')).getAlertServiceClient({ deadline: Date.now() + 25000 });
    const { data: roles, error: roleError } = await client.from('app_user_roles').select('role').eq('user_id', config.owner);
    if (roleError) return failure(503, 'purchase_unavailable');
    if (!roles?.some(row => ['owner', 'admin'].includes(row.role))) return failure(403, 'owner_forbidden');
    const chatId = 'wa:' + config.phone;
    if (healthcheck) {
      const { data, error } = await client.rpc('telegram_confirm_purchase', { p_id: '00000000-0000-0000-0000-000000000000', p_chat_id: 'wa:healthcheck', p_sender_id: 'wa:healthcheck', p_owner_id: config.owner, p_cancel: false });
      if (error || data !== 'unavailable') return failure(503, 'purchase_unavailable');
      return res.status(200).json({ ok: true, purchases_available: true });
    }
    const saved = duplicate => res.status(200).json({ ok: true, status: 'saved', duplicate, request_id: input.requestId, count: input.count, total_cents: input.total, date: input.date });
    const read = () => client.from('tb_telegram_compras').select(ROW_FIELDS).eq('id', input.requestId).maybeSingle();
    const matches = row => row.owner_id === config.owner && row.chat_id === chatId && row.sender_id === chatId && stableJson(row.payload) === stableJson(input.payload);
    const initial = await read();
    if (initial.error) return failure(503, 'purchase_unavailable');
    let row = initial.data;
    let duplicate = Boolean(row);
    if (row && !matches(row)) return failure(409, 'request_conflict');
    if (row?.status === 'saved') return saved(true);
    if (row?.status === 'cancelled') return failure(409, 'purchase_cancelled');
    if (input.date !== getBrazilTodayIso()) return failure(410, 'purchase_date_expired');
    if (!row) {
      const { error } = await client.from('tb_telegram_compras').insert({ id: input.requestId, update_id: input.updateId, chat_id: chatId, sender_id: chatId, owner_id: config.owner, payload: input.payload });
      if (error && error.code !== '23505') return failure(503, 'purchase_unavailable');
      if (error?.code === '23505') {
        const concurrent = await read();
        if (concurrent.error) return failure(503, 'purchase_unavailable');
        row = concurrent.data;
        if (!row || !matches(row)) return failure(409, 'request_conflict');
        duplicate = true;
        if (row.status === 'saved') return saved(true);
        if (row.status === 'cancelled') return failure(409, 'purchase_cancelled');
      }
    }
    const { data, error } = await client.rpc('telegram_confirm_purchase', { p_id: input.requestId, p_chat_id: chatId, p_sender_id: chatId, p_owner_id: config.owner, p_cancel: false });
    if (error) return failure(503, 'purchase_unavailable');
    if (data === 'saved') return saved(duplicate);
    if (data === 'cancelled' || data === 'expired') return failure(409, data === 'cancelled' ? 'purchase_cancelled' : 'purchase_expired');
    return failure(503, 'purchase_unavailable');
  } catch { return failure(503, 'purchase_unavailable'); }
}
