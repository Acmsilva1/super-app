import crypto from 'node:crypto';

let lastAttempt = 0;
const TEST_ALERTS = [
  { event_type: 'health.water_progress', title: '[TESTE MANUAL] Água', message: 'Teste do SuperApp: perfil fictício com 3 de 8 doses. Não representa seus dados reais.' },
  { event_type: 'health.diet_menu', title: '[TESTE MANUAL] Dieta', message: 'Teste do SuperApp: refeição e calorias fictícias. Envio pelo Node e gateway Python da Vercel.' },
];

// Chamado apenas depois da autorização administrativa no handler.
export async function runTelegramManualTest() {
  if (process.env.OFFLINE_DEV === 'true' || process.env.NODE_ENV === 'test') {
    return { status: 200, body: { ok: true, simulated: true, sent: 0 } };
  }
  for (const name of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'ALERTS_API_TOKEN']) {
    if (!String(process.env[name] || '').trim()) {
      return { status: 503, body: { ok: false, error: `Configure ${name} na Vercel e faça um novo deploy.` } };
    }
  }
  const token = process.env.ALERTS_API_TOKEN;
  if (token.trim().length < 32) {
    return { status: 503, body: { ok: false, error: 'ALERTS_API_TOKEN precisa ter pelo menos 32 caracteres.' } };
  }
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  let gateway;
  try {
    gateway = new URL(process.env.ALERTS_API_URL || (host ? `https://${host}/api/telegram-alert` : ''));
    if (gateway.protocol !== 'https:' || gateway.username || gateway.password || gateway.pathname !== '/api/telegram-alert' || gateway.search || gateway.hash) throw new Error();
  } catch {
    return { status: 503, body: { ok: false, error: 'Configure ALERTS_API_URL com a URL HTTPS do gateway /api/telegram-alert.' } };
  }
  const now = Date.now();
  // Limite adicional por instância; o botão também fica bloqueado durante a chamada.
  if (now - lastAttempt < 60000) {
    return { status: 429, body: { ok: false, error: 'Aguarde um minuto antes de repetir o teste.' } };
  }
  lastAttempt = now;
  const results = [];
  for (const alert of TEST_ALERTS) {
    try {
      const headers = { 'Content-Type': 'application/json', 'X-Alert-Token': token };
      if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
      const response = await fetch(gateway.href, {
        method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(20000),
        body: JSON.stringify({ source: 'superapp-node', severity: 'info', dedupe_key: `manual:${crypto.randomUUID()}`, occurred_at: new Date().toISOString(), ...alert }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok || !Number.isSafeInteger(payload.telegram_message_id)) {
        const errors = {
          401: 'O gateway recusou a chave interna. Confira ALERTS_API_TOKEN e o deploy.',
          403: 'O deploy bloqueou o gateway. Confira a proteção de deployment.',
          503: 'O gateway não encontrou uma configuração válida do Telegram.',
          502: 'O gateway não confirmou o envio ao Telegram. Confira o bot e o chat de destino.',
        };
        const sent = results.length;
        return { status: 502, body: { ok: false, sent, results, error: `${sent ? 'Água enviada; dieta sem confirmação. ' : ''}${errors[response.status] || 'O gateway não confirmou a entrega.'} Não há reenvio automático.` } };
      }
      results.push({ type: alert.event_type, message_id: payload.telegram_message_id });
    } catch {
      return { status: 502, body: { ok: false, sent: results.length, results, error: `${results.length ? 'Água enviada. ' : ''}O envio ficou sem confirmação. Verifique o Telegram antes de repetir o teste.` } };
    }
  }
  return { status: 200, body: { ok: true, simulated: false, sent: results.length, results } };
}
