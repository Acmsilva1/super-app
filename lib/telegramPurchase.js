import { telegramEnabled } from './messagingChannels.js';
import crypto from 'node:crypto';
import { payloadInsertFinanceiro, getBrazilTodayIso } from '../features/financeiro/service/financeiroService.js';
import { unsupportedPurchaseIntent } from './purchaseRules.js';

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
  const match = text.trim().match(/^([^,;\r\n]+),\s*(\d{1,7})\s*,\s*(\d{2})\s*$/);
  if (!match) return null;
  const description = match[1].trim();
  if (unsupportedPurchaseIntent(description)) return null;
  const value = (Number(match[2])*100+Number(match[3]))/100;
  if (!description || description.length > 120 || /[\x00-\x1f]/.test(description) || /\b(?:valor|pagamento|parcelas|credito|crédito)\b/i.test(description) || value <= 0) return null;
  return { ...payloadInsertFinanceiro({ tipo_registro: 'gasto_variado', descricao: description,
    valor: value, metodo_pagamento: 'debito_pix', categoria: 'Outros', data_lancamento: getBrazilTodayIso() }).payload,
    payment_label: 'Débito' };
}

const purchaseHelp = 'Envie somente texto, uma compra por linha, no formato descrição,reais,centavos:\npadaria,4,25\nmercado,15,30\n\nUse duas casas para os centavos; para um valor inteiro, use ,00. Pagamento: débito. Data: hoje. Categoria: Outros. Nada é salvo antes de confirmar. Use /pendente para recuperar a última confirmação.';

export function parseTelegramPurchases(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > 4096) return {error:'Envie uma mensagem de texto com até 4096 caracteres.'};
  const lines = text.replace(/\r\n?/g,'\n').split('\n').map((text,index)=>({text:text.trim(),line:index+1})).filter(line=>line.text);
  if (lines.length > 20) return {error:'Envie até 20 lançamentos por mensagem.'};
  const items = [];
  for (const line of lines) {
    const purchase = parseTelegramPurchase(line.text);
    if (!purchase) return {error:`Linha ${line.line} inválida. Use o formato padaria,4,25. Nenhum lançamento desta mensagem foi preparado.`};
    const {payment_label,...payload} = purchase;
    items.push(payload);
  }
  return {items};
}

export async function telegramCall(method, body) {
  if (!telegramEnabled()) throw new Error('telegram_disabled');
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
      text: data === 'saved' ? 'Lançamento(s) registrado(s).' : data === 'cancelled' ? 'Cancelado.' : 'Já processado ou expirado.' });
    await telegramCall('editMessageText', { chat_id: chatId, message_id: message.message_id,
      text: data === 'saved' ? '✅ Todos os lançamentos desta confirmação foram registrados no Financeiro.' : data === 'cancelled' ? 'Cancelado. Nada foi registrado.' : 'Esta confirmação já foi processada ou expirou.',
      reply_markup: { inline_keyboard: [] } });
    return;
  }
  if (message.forward_origin || !Number.isSafeInteger(update.update_id)
    || !Number.isSafeInteger(message.date) || message.date * 1000 < Date.now() - 15 * 60 * 1000) return;
  if (String(message.text || '').trim() === '/pendente') {
    const { data, error } = await client.from('tb_telegram_compras').select('id,payload,created_at')
      .eq('chat_id',chatId).eq('sender_id',String(sender.id)).eq('owner_id',owner).eq('status','pending')
      .gte('created_at',new Date(Date.now()-15*60*1000).toISOString()).order('created_at',{ascending:false}).limit(1);
    if (error) throw new Error('purchase_pending_failed');
    if (!data?.length) { await reply('Nenhuma compra pendente dentro dos últimos 15 minutos.'); return; }
    await sendPurchaseConfirmation(reply,data[0].id,data[0].payload);
    return;
  }
  if (message.voice || message.audio) {
    await reply(`O modo de voz foi desativado.\n\n${purchaseHelp}`);
    return;
  }
  const parsed = parseTelegramPurchases(message.text);
  if (parsed.error) {
    await reply(`${parsed.error}\n\n${purchaseHelp}`);
    return;
  }
  const id = crypto.randomUUID();
  const payload = parsed.items.length === 1 ? parsed.items[0] : {items:parsed.items};
  const { error } = await client.from('tb_telegram_compras').insert({ id, update_id: update.update_id,
    chat_id: chatId, sender_id: String(sender.id), owner_id: owner, payload });
  if (error?.code === '23505') return;
  if (error) throw new Error('purchase_pending_failed');
  await sendPurchaseConfirmation(reply,id,payload);
}

async function sendPurchaseConfirmation(reply,id,payload) {
  const items = Array.isArray(payload.items) ? payload.items : [payload];
  const money = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value);
  const total = items.reduce((sum,item)=>sum+Math.round(item.valor*100),0)/100;
  await reply(`Confirme ${items.length === 1 ? 'o lançamento' : `os ${items.length} lançamentos`}:\n${items.map((item,index)=>`${index+1}. ${item.descricao} — ${money(item.valor)}`).join('\n')}\n\nTotal: ${money(total)}\nPagamento: Débito\nData: ${items[0].data_lancamento}\nCategoria: Outros\n\n${items.length > 1 ? 'Confirmar salva todas as linhas; Cancelar descarta todas. ' : ''}Confirmação válida por 15 minutos. Para recuperar os botões, envie /pendente.`, {
    reply_markup: { inline_keyboard: [[{ text: items.length > 1 ? 'Confirmar todos' : 'Confirmar', callback_data: `confirm:${id}` }, { text: 'Cancelar', callback_data: `cancel:${id}` }]] },
  });
}
