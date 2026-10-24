import { getTelegramWebhookSecret, telegramCall } from './telegramPurchase.js';

function webhookUrl() {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base = host ? `https://${host}` : process.env.ALERTS_API_URL;
  const url = new URL(base || '');
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
  return new URL('/api/telegram-webhook', url.origin).href;
}

// Invoked exclusively after the existing owner-only authorization.
export async function configureTelegramWebhook(client, ownerId, enabled = true) {
  if (typeof enabled !== 'boolean') return { status:400,body:{error:'Estado inválido.'} };
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
  if (enabled) {
    const { error: schemaError } = await client.from('tb_telegram_compras').select('id').limit(1);
    if (schemaError) return { status: 503, body: { error: 'Aplique a migration de compras pelo Telegram antes de ativar.' } };
  }
  try {
    const previous = await telegramCall('getWebhookInfo', {});
    if (previous.url && previous.url !== url) return { status: 409, body: { error: 'Este bot já tem outro webhook. Confira o receptor anterior antes de substituí-lo.' } };
    if (enabled) await telegramCall('setWebhook', { url, secret_token: secret, allowed_updates: ['message', 'callback_query'], max_connections: 1 });
    else await telegramCall('deleteWebhook', { drop_pending_updates:false });
    const info = await telegramCall('getWebhookInfo', {});
    if (enabled ? info.url !== url : Boolean(info.url)) throw new Error();
    return { status: 200, body: { ok: true, registered: enabled, enabled, pending_updates: Number(info.pending_update_count || 0) } };
  } catch { return { status: 502, body: { error: 'Não foi possível confirmar o cadastro no Telegram. Confira as variáveis e tente novamente.' } }; }
}

export async function getTelegramWebhookStatus(ownerId) {
  if (process.env.OFFLINE_DEV === 'true' || process.env.NODE_ENV === 'test') return {status:200,body:{ok:true,enabled:false,simulated:true}};
  if (process.env.SAUDE_ALERTS_OWNER_USER_ID !== ownerId) return {status:403,body:{error:'Configuração disponível para o proprietário do bot.'}};
  let url;
  try { url=webhookUrl(); } catch {return {status:503,body:{error:'Confira o domínio do webhook na Vercel.'}};}
  try {
    const info=await telegramCall('getWebhookInfo',{});
    if (info.url && info.url!==url) return {status:409,body:{error:'O bot está vinculado a outro webhook. Confira o receptor antes de alterar.'}};
    return {status:200,body:{ok:true,enabled:info.url===url}};
  } catch {return {status:502,body:{error:'Não foi possível consultar o estado no Telegram.'}};}
}
