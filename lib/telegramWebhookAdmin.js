import { getTelegramWebhookSecret, telegramCall } from './telegramPurchase.js';

function webhookUrl() {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base = host ? `https://${host}` : process.env.ALERTS_API_URL;
  const url = new URL(base || '');
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
  return new URL('/api/telegram-webhook', url.origin).href;
}

// Invoked exclusively after the existing owner-only authorization.
export async function configureTelegramWebhook(client, ownerId) {
  if (process.env.OFFLINE_DEV === 'true' || process.env.NODE_ENV === 'test') {
    return { status: 503, body: { error: 'Ativação disponível somente no servidor publicado.' } };
  }
  if (process.env.SAUDE_ALERTS_OWNER_USER_ID !== ownerId || !/^\d+$/.test(process.env.TELEGRAM_CHAT_ID || '')) {
    return { status: 503, body: { error: 'Confira o proprietário dos alertas e o chat privado na Vercel.' } };
  }
  const secret = getTelegramWebhookSecret();
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(secret)) return { status: 503, body: { error: 'Confira a configuração do bot e do segredo do webhook na Vercel.' } };
  let url;
  try { url = webhookUrl(); } catch {
    return { status: 503, body: { error: 'Configure o domínio de produção ou a URL do gateway na Vercel.' } };
  }
  const { error: schemaError } = await client.from('tb_telegram_compras').select('id').limit(1);
  if (schemaError) return { status: 503, body: { error: 'Aplique a migration de compras pelo Telegram antes de ativar.' } };
  try {
    const previous = await telegramCall('getWebhookInfo', {});
    if (previous.url && previous.url !== url) return { status: 409, body: { error: 'Este bot já tem outro webhook. Confira o receptor anterior antes de substituí-lo.' } };
    await telegramCall('setWebhook', { url, secret_token: secret, allowed_updates: ['message', 'callback_query'], max_connections: 1 });
    const info = await telegramCall('getWebhookInfo', {});
    if (info.url !== url) throw new Error();
    return { status: 200, body: { ok: true, registered: true, pending_updates: Number(info.pending_update_count || 0) } };
  } catch { return { status: 502, body: { error: 'Não foi possível confirmar o cadastro no Telegram. Confira as variáveis e tente novamente.' } }; }
}
