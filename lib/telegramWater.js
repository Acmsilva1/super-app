import {telegramCall} from './telegramPurchase.js';
import {getBrazilTodayIso} from '../features/financeiro/service/financeiroService.js';
import {validWaterAmount} from '../features/saude/service/waterIntakeService.js';

export function parseWaterAnswer(text) {
  const normalized=String(text || '').trim();
  const litres=normalized.match(/^([12])\s*(?:l|lt|litros?)$/i);
  if(litres) return Number(litres[1])*1000;
  const match=normalized.match(/^(100|200|300|400|500|1000|2000)\s*(?:ml)?$/i);
  return match ? Number(match[1]) : null;
}

export async function processTelegramWater(update,client) {
  const callback=update.callback_query;
  const message=callback?.message || update.message;
  const sender=callback?.from || message?.from;
  const action=String(callback?.data || '').match(/^water:(\d+):(\d{4}-\d{2}-\d{2}):(\d{4}):(100|200|300|400|500|1000|2000)$/);
  const replyId=message?.reply_to_message?.message_id;
  const typed=parseWaterAnswer(message?.text);
  if (!action && !replyId && typed===null) return false;
  if (callback && !String(callback.data || '').startsWith('water:')) return false;
  const chatId=String(process.env.TELEGRAM_CHAT_ID || '');
  if (!/^\d+$/.test(chatId) || message?.chat?.type!=='private' || String(message.chat.id)!==chatId
    || String(sender?.id)!==chatId || sender?.is_bot || message?.forward_origin) return true;
  const owner=process.env.SAUDE_ALERTS_OWNER_USER_ID;
  const {data:roles,error:roleError}=await client.from('app_user_roles').select('role').eq('user_id',owner);
  if (roleError || !roles?.some(row=>['owner','admin'].includes(row.role))) throw new Error('owner_invalid');
  const reply=text=>telegramCall('sendMessage',{chat_id:chatId,text});
  const acknowledge=text=>callback ? telegramCall('answerCallbackQuery',{callback_query_id:callback.id,text}) : reply(text);
  if (!callback && !replyId) {await reply('Responda diretamente ao lembrete do perfil desejado ou use um dos botões.');return true;}
  let query=client.from('tb_saude_alertas_envios').select('dedupe_key,perfil_id,data_local,telegram_message_id')
    .eq('created_by',owner).eq('status','sent').eq('data_local',getBrazilTodayIso()).not('perfil_id','is',null);
  if (action) query=query.eq('dedupe_key',`agua:${action[2]}:${action[3].slice(0,2)}:${action[3].slice(2)}:${action[1]}`);
  else if (replyId) query=query.eq('telegram_message_id',replyId);
  const {data:prompts,error}=await query.order('created_at',{ascending:false}).limit(100);
  if (error) throw new Error('water_prompt_failed');
  if (!prompts?.length) {
    if (callback) await acknowledge('Este lembrete expirou. Use o lembrete de hoje.');
    if (!callback && typed!==null) {await reply('Nenhum lembrete de água disponível para hoje. Registre pelo app ou aguarde o próximo alerta.');return true;}
    return Boolean(callback);
  }
  const prompt=prompts[0];
  if (callback && prompt.telegram_message_id!==message.message_id) {await acknowledge('Lembrete inválido.');return true;}
  const amount=action ? Number(action[4]) : typed;
  if (!validWaterAmount(amount)) {await reply('Quanto você bebeu? Escolha 100, 200, 300, 400, 500 ml, 1 L ou 2 L.');return true;}
  const {data:profile,error:profileError}=await client.from('tb_saude_perfis').select('id,nome').eq('id',prompt.perfil_id).eq('created_by',owner).maybeSingle();
  if (profileError || !profile) {await acknowledge('Perfil indisponível para este lembrete.');return true;}
  const {data,error:saveError}=await client.rpc('saude_record_water_ml',{
    p_owner:owner,p_profile:prompt.perfil_id,p_amount:amount,p_request:`tg-water:${prompt.dedupe_key}`,
  });
  if (saveError) {
    if (/water_request_conflict/.test(saveError.message || '')) {await acknowledge('Este lembrete já foi registrado.');return true;}
    if (/water_goal_required/.test(saveError.message || '')) {await acknowledge('Configure a meta diária em ml no app.');return true;}
    throw new Error('water_checkin_failed');
  }
  const text=`✅ ${data.duplicate ? 'Check-in já registrado' : `Check-in confirmado: ${amount} ml`} — ${profile.nome}.\n💧 Hoje: ${data.realizado_ml} / ${data.meta_ml} ml.${data.realizado_ml>=data.meta_ml?'\n🎯 Meta diária atingida!':''}`;
  if (callback) await acknowledge(data.duplicate?'Já registrado.':`${amount} ml registrados.`);
  await telegramCall('editMessageText',{chat_id:chatId,message_id:prompt.telegram_message_id,text,reply_markup:{inline_keyboard:[]}});
  return true;
}
