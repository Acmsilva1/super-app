import { testDiagnostic, responseDiagnostic } from './whatsappTestDiagnostics.js';
import { createHash } from 'node:crypto';

export function whatsappAlertsEnabled() { return process.env.WHATSAPP_ALERTS_ENABLED === 'true'; }
function configuration() {
  if (!whatsappAlertsEnabled()) return null;
  let origin;
  try { origin = new URL(String(process.env.WHATSAPP_API_ORIGIN || '').trim()); }
  catch { throw new Error('whatsapp_config_invalid'); }
  const token = String(process.env.WHATSAPP_INTEGRATION_TOKEN || '').trim();
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || token.length < 32) throw new Error('whatsapp_config_invalid');
  return { url: new URL('/api/control?action=event', origin).toString(), token };
}
export function whatsappDeliveryKey(dedupeKey, audience, part) {
  return 'whatsapp:' + createHash('sha256').update(JSON.stringify([dedupeKey, String(audience), part])).digest('hex');
}
export async function whatsappAlertRecorded(config, dedupeKey, audience, message) {
  if (!whatsappAlertsEnabled()) return true;
  const parts = splitMessage(message);
  for (const [index] of parts.entries()) {
    const { data, error } = await config.client.from('tb_saude_alertas_envios').select('dedupe_key')
      .eq('created_by', config.ownerId).eq('dedupe_key', whatsappDeliveryKey(dedupeKey, audience, index)).maybeSingle();
    if (error) throw new Error('whatsapp_delivery_history_failed');
    if (!data) return false;
  }
  return true;
}
export function splitMessage(message) {
  if (typeof message !== 'string' || !message.trim()) throw new Error('whatsapp_message_invalid');
  const parts = []; let current = '';
  for (const character of message) {
    if (current.length + character.length > 3500) { parts.push(current); current = ''; }
    current += character;
  }
  if (current) parts.push(current);
  return parts;
}
export async function enqueueWhatsAppAlert(config, { eventType, audience, title, message, dedupeKey, onDiagnostic }) {
  const report = (code, state = 'error', httpStatus) => { if (typeof onDiagnostic === 'function') onDiagnostic(testDiagnostic(code, state, httpStatus)); };
  let settings;
  try { settings = configuration(); } catch (error) { report('whatsapp_config_invalid'); throw error; }
  if (!settings) return false;
  report('configuration_ok', 'ok');
  const profile = String(audience ?? '').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_:-]{0,79}$/.test(profile)) throw new Error('whatsapp_audience_invalid');
  const parts = splitMessage(message);
  let queued = false;
  for (const [index, part] of parts.entries()) {
    if (config.deadline && config.deadline - Date.now() < 1500) throw new Error('whatsapp_time_budget');
    const key = whatsappDeliveryKey(dedupeKey, profile, index);
    const { error: claimError } = await config.client.from('tb_saude_alertas_envios').insert({ created_by: config.ownerId, dedupe_key: key, status: 'sending' });
    if (claimError?.code === '23505') { report('duplicate_request', 'warning'); continue; }
    if (claimError) { report('whatsapp_claim_failed'); throw new Error('whatsapp_claim_failed'); }
    report('record_ok', 'ok');
    const record = body => config.client.from('tb_saude_alertas_envios').update({ ...body, updated_at: new Date().toISOString() })
      .eq('created_by', config.ownerId).eq('dedupe_key', key);
    let failureReported = false;
    let accepted = false;
    try {
      report('request_started', 'ok');
      const response = await fetch(settings.url, {
        method: 'POST', redirect: 'error',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.token}` },
        body: JSON.stringify({ source: 'superapp', event_type: eventType, audience: profile,
          idempotency_key: key, title: String(title || '').slice(0, 120), message: part }),
        signal: AbortSignal.timeout(Math.max(1, Math.min(15000, (config.deadline || Date.now() + 16000) - Date.now() - 1000)))
      });
      let payload; try { payload = await response.json(); } catch {}
      // Um perfil sem numero/tipo habilitado nao deve interromper os alertas Telegram.
      const noRecipients = response.status === 422 && payload?.error === 'no_authorized_recipients';
      if (!noRecipients && (response.status !== 202 || payload?.ok !== true || !Array.isArray(payload.jobs) || !payload.jobs.length || payload.jobs.some(job => !job?.id || !['pending','sending','sent','failed','uncertain','cancelled'].includes(job.status)))) {
        report(responseDiagnostic(response.status, payload), 'error', response.status);
        failureReported = true;
        throw new Error('whatsapp_gateway_failed');
      }
      accepted = !noRecipients;
      report(noRecipients ? 'no_recipients' : 'queue_accepted', noRecipients ? 'warning' : 'ok', response.status);
      // Estado legado 'sent' aqui significa pedido aceito pela fila, nao entrega no celular.
      const { error } = await record({ status: 'sent', last_error: noRecipients ? 'whatsapp_no_recipients' : 'whatsapp_queue_accepted' });
      if (error) { report('whatsapp_record_failed'); failureReported = true; throw new Error('whatsapp_record_failed'); }
      queued ||= !noRecipients;
    } catch (error) {
      if (!failureReported) report(accepted ? 'whatsapp_record_failed' : ['TimeoutError', 'AbortError'].includes(error?.name) ? 'request_timeout' : ['ENOTFOUND', 'EAI_AGAIN'].includes(error?.cause?.code) ? 'request_dns' : 'request_network');
      try { await record({ status: 'uncertain', last_error: 'whatsapp_delivery_unconfirmed' }); } catch {}
      throw new Error('whatsapp_delivery_uncertain');
    }
  }
  return queued;
}
export async function deliverAlertChannels(telegram, config, alert) {
  const results = await Promise.allSettled([Promise.resolve().then(telegram), enqueueWhatsAppAlert(config, alert)]);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  // Preserva a contagem antiga do cron: WhatsApp e enfileirado, nao entregue aqui.
  return results[0].value;
}
