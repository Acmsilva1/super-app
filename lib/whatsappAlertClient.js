const EVENTS = new Set(['health.water_progress', 'health.diet_menu', 'financeiro.daily_summary']);
const TIMEOUT_MS = 15000;
const TELEGRAM_RESERVE_MS = 22000;

function logFailure(reason) {
  console.error(`[whatsapp] ${reason}`);
}

function eventUrl(origin) {
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) return null;
  const endpoint = new URL('/api/control', parsed.origin);
  endpoint.searchParams.set('action', 'event');
  return endpoint.href;
}

export async function enqueueWhatsAppAlert({
  eventType,
  audience,
  idempotencyKey,
  title,
  message,
} = {}, { deadline = null } = {}) {
  try {
    const origin = String(process.env.WHATSAPP_API_ORIGIN || '').trim();
    const token = String(process.env.WHATSAPP_INTEGRATION_TOKEN || '').trim();
    const profileId = String(audience ?? '').trim();
    if (!origin || !token || !profileId) return false;
    if (/[\r\n]/.test(token) || !EVENTS.has(eventType)) {
      logFailure('configuração recusada');
      return false;
    }
    const url = eventUrl(origin);
    if (!url) {
      logFailure('origem recusada');
      return false;
    }
    const key = String(idempotencyKey ?? '').trim();
    if (!key) return false;
    // Folga para o Telegram deste cron. A próxima execução repete a mesma chave.
    if (Number.isFinite(deadline) && Date.now() + TIMEOUT_MS + TELEGRAM_RESERVE_MS > deadline) {
      console.warn('[whatsapp] adiado para preservar o prazo do Telegram');
      return false;
    }
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        source: 'superapp',
        event_type: String(eventType),
        audience: profileId,
        idempotency_key: key,
        title: String(title ?? '').slice(0, 120),
        message: String(message ?? '').slice(0, 3500),
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 202) return true;
    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }
    if (payload?.duplicate === true) return true;
    logFailure(`falha http_${response.status}`);
    return false;
  } catch {
    logFailure('falha de rede');
    return false;
  }
}
