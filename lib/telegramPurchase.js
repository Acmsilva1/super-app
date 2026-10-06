import crypto from 'node:crypto';
import { payloadInsertFinanceiro, getBrazilTodayIso } from '../features/financeiro/service/financeiroService.js';

export function getTelegramWebhookSecret() {
  if (process.env.TELEGRAM_WEBHOOK_SECRET) return process.env.TELEGRAM_WEBHOOK_SECRET;
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) return '';
  return crypto.createHmac('sha256', token).update('superapp/telegram-webhook/v1').digest('hex');
}

export function telegramWebhookAuthorized(req) {
  const secret = getTelegramWebhookSecret();
  const supplied = String(req.headers?.['x-telegram-bot-api-secret-token'] || '');
  const a = Buffer.from(secret), b = Buffer.from(supplied);
  return secret.length >= 32 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function parseTelegramPurchase(text) {
  if (typeof text !== 'string' || text.length > 500) return null;
  // Deliberately bounded grammar: unknown or repeated fields must never be guessed.
  const shortMatch = text.trim().match(/^([^,;\n]+),\s*(?:r\$\s*)?(\d{1,7}(?:[,.]\d{1,2})?)\s*(?:reais)?\s*,\s*(d[eé]bito|pix)\s*$/i);
  const match = shortMatch || text.trim().match(/^(?:compra\s*[:;,-]?\s*)?(?:local|descri[cç][aã]o)\s*:?\s*(.+?)\s*[,;\n]\s*valor\s*:?\s*(?:r\$\s*)?(\d{1,7}(?:[,.]\d{1,2})?)\s*(?:reais)?\s*[,;\n]\s*(?:forma\s+de\s+pagamento|pagamento)\s*:?\s*(d[eé]bito|pix)\s*$/i);
  if (!match) return null;
  const description = match[1].trim();
  const value = Number(match[2].replace(',', '.'));
  if (!description || description.length > 120 || /[\x00-\x1f]/.test(description) || /\b(?:valor|pagamento|parcelas|credito|crédito)\b/i.test(description) || value <= 0) return null;
  return { ...payloadInsertFinanceiro({ tipo_registro: 'gasto_variado', descricao: description,
    valor: value, metodo_pagamento: 'debito_pix', categoria: 'Outros', data_lancamento: getBrazilTodayIso() }).payload,
    payment_label: /^pix$/i.test(match[3]) ? 'Pix' : 'Débito' };
}

export async function telegramCall(method, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) throw new Error('telegram_config_missing');
  // Never propagate fetch exceptions: the request URL contains the bot token.
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error();
    return result.result;
  } catch { throw new Error('telegram_request_failed'); }
}

export async function processTelegramPurchase(update, client) {
  const message = update.message || update.callback_query?.message;
  const sender = update.message?.from || update.callback_query?.from;
  const chatId = String(process.env.TELEGRAM_CHAT_ID || '');
  // Initial version only accepts the configured personal account, never groups or forwards.
  if (!/^\d+$/.test(chatId) || message?.chat?.type !== 'private'
    || String(message.chat.id) !== chatId || String(sender?.id) !== chatId || sender?.is_bot) return;
  const owner = process.env.SAUDE_ALERTS_OWNER_USER_ID;
  const { data: roles, error: roleError } = await client.from('app_user_roles').select('role').eq('user_id', owner);
  if (roleError || !roles?.some(row => ['owner', 'admin'].includes(row.role))) throw new Error('owner_invalid');
  const reply = (text, extra = {}) => telegramCall('sendMessage', { chat_id: chatId, text, ...extra });
  if (update.callback_query) {
    const action = String(update.callback_query.data || '').match(/^(confirm|cancel):([0-9a-f-]{36})$/);
    if (!action) return;
    const { data, error } = await client.rpc('telegram_confirm_purchase', {
      p_id: action[2], p_chat_id: chatId, p_sender_id: String(sender.id), p_owner_id: owner, p_cancel: action[1] === 'cancel',
    });
    if (error) throw new Error('purchase_save_failed');
    await telegramCall('answerCallbackQuery', { callback_query_id: update.callback_query.id,
      text: data === 'saved' ? 'Compra registrada.' : data === 'cancelled' ? 'Compra cancelada.' : 'Já processada ou expirada.' });
    await telegramCall('editMessageText', { chat_id: chatId, message_id: message.message_id,
      text: data === 'saved' ? '✅ Compra registrada no Financeiro.' : data === 'cancelled' ? 'Compra cancelada. Nada foi registrado.' : 'Esta confirmação já foi processada ou expirou.',
      reply_markup: { inline_keyboard: [] } });
    return;
  }
  if (message.forward_origin || !Number.isSafeInteger(update.update_id)
    || !Number.isSafeInteger(message.date) || message.date * 1000 < Date.now() - 15 * 60 * 1000) return;
  const purchase = parseTelegramPurchase(message.text);
  if (!purchase) {
    await reply('Para registrar uma compra, envie lugar, valor, pagamento:\nAlmoço, 15, débito\nSupermercado, 30,50, pix\n\nAceito débito ou Pix. A data será hoje e a categoria Outros. Crédito e parcelas ainda devem ser registrados no app. Nada é salvo antes de confirmar.');
    return;
  }
  const id = crypto.randomUUID();
  const { payment_label, ...payload } = purchase;
  const { error } = await client.from('tb_telegram_compras').insert({ id, update_id: update.update_id,
    chat_id: chatId, sender_id: String(sender.id), owner_id: owner, payload });
  if (error?.code === '23505') return;
  if (error) throw new Error('purchase_pending_failed');
  await reply(`Confirme a compra:\nLocal: ${payload.descricao}\nValor: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(payload.valor)}\nPagamento: ${payment_label}\nData: ${payload.data_lancamento}\nCategoria: Outros\n\nConfirmação válida por 15 minutos.`, {
    reply_markup: { inline_keyboard: [[{ text: 'Confirmar', callback_data: `confirm:${id}` }, { text: 'Cancelar', callback_data: `cancel:${id}` }]] },
  });
}
