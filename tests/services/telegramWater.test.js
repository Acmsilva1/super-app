import {beforeEach,it,expect,vi} from 'vitest';
const send=vi.hoisted(()=>vi.fn(async()=>({message_id:10})));
vi.mock('../../lib/telegramPurchase.js',()=>({telegramCall:send}));
import {processTelegramWater,parseWaterAnswer} from '../../lib/telegramWater.js';
import {getBrazilTodayIso} from '../../features/financeiro/service/financeiroService.js';
const day=getBrazilTodayIso();
let rows,rpc;
function client(){return {rpc,from(table){const filters=[];const q={select(){return q;},eq(key,value){filters.push(row=>row[key]===value);return q;},not(){return q;},order(){return q;},limit(){return q;},maybeSingle(){q.single=true;return q;},then(resolve){let data=(rows[table]||[]).filter(row=>filters.every(fn=>fn(row)));return Promise.resolve({data:q.single?data[0]:data,error:null}).then(resolve);}};return q;}};}
beforeEach(()=>{
 send.mockClear();vi.stubEnv('TELEGRAM_CHAT_ID','123');vi.stubEnv('SAUDE_ALERTS_OWNER_USER_ID','owner');
 rows={app_user_roles:[{user_id:'owner',role:'owner'}],tb_saude_alertas_envios:[{created_by:'owner',status:'sent',dedupe_key:`agua:${day}:07:30:1`,perfil_id:1,data_local:day,telegram_message_id:10}],tb_saude_perfis:[{id:1,created_by:'owner',nome:'Perfil A'}]};
 rpc=vi.fn(async()=>({data:{realizado_ml:200,meta_ml:2000,duplicate:false},error:null}));
});
function callback(amount=200){return {update_id:1,callback_query:{id:'callback',from:{id:123},data:`water:1:${day}:0730:${amount}`,message:{message_id:10,chat:{id:123,type:'private'}}}};}
it('botão registra no perfil vinculado e remove os botões após confirmação',async()=>{
 expect(await processTelegramWater(callback(),client())).toBe(true);
 expect(rpc).toHaveBeenCalledWith('saude_record_water_ml',expect.objectContaining({p_profile:1,p_amount:200,p_request:`tg-water:agua:${day}:07:30:1`}));
 expect(send).toHaveBeenCalledWith('editMessageText',expect.objectContaining({reply_markup:{inline_keyboard:[]},text:expect.stringContaining('200 ml')}));
 expect(send).toHaveBeenCalledWith('sendMessage',{chat_id:'123',text:'✅ Check-in confirmado: 200 ml — Perfil A.\n💧 Hoje: 200 / 2000 ml.'});
});
it('repetição de um check-in não envia outra mensagem de confirmação',async()=>{
 rpc.mockResolvedValue({data:{realizado_ml:200,meta_ml:2000,duplicate:true},error:null});
 await processTelegramWater(callback(),client());
 expect(send.mock.calls.filter(([method])=>method==='sendMessage')).toHaveLength(0);
 expect(send).toHaveBeenCalledWith('answerCallbackQuery',expect.objectContaining({text:'Já registrado.'}));
});
it('falha na gravação não envia confirmação de sucesso nem remove os seletores',async()=>{
 rpc.mockResolvedValue({data:null,error:{message:'database unavailable'}});
 await expect(processTelegramWater(callback(),client())).rejects.toThrow('water_checkin_failed');
 expect(send).not.toHaveBeenCalled();
});
it('resposta escrita ao lembrete usa a mesma chave de check-in do botão',async()=>{
 await processTelegramWater({update_id:2,message:{from:{id:123},chat:{id:123,type:'private'},text:'300 ml',reply_to_message:{message_id:10}}},client());
 expect(rpc).toHaveBeenCalledWith('saude_record_water_ml',expect.objectContaining({p_amount:300,p_profile:1}));
});
it('não grava para outro usuário nem para uma mensagem adulterada',async()=>{
 const update=callback();update.callback_query.from.id=456;await processTelegramWater(update,client());expect(rpc).not.toHaveBeenCalled();
 const wrong=callback();wrong.callback_query.message.message_id=11;await processTelegramWater(wrong,client());expect(rpc).not.toHaveBeenCalled();
});
it('resposta sem referência exige responder ao lembrete para não trocar o perfil nem duplicar retries',async()=>{
 rows.tb_saude_alertas_envios.push({...rows.tb_saude_alertas_envios[0],perfil_id:2,dedupe_key:`agua:${day}:07:30:2`,telegram_message_id:11});
 await processTelegramWater({message:{from:{id:123},chat:{id:123,type:'private'},text:'200'}},client());expect(rpc).not.toHaveBeenCalled();
 expect(send).toHaveBeenCalledWith('sendMessage',expect.objectContaining({text:expect.stringContaining('perfil desejado')}));
 expect(parseWaterAnswer('250')).toBeNull();expect(parseWaterAnswer('500 ml')).toBe(500);expect(parseWaterAnswer('1lt')).toBe(1000);expect(parseWaterAnswer('2 L')).toBe(2000);
});

it('botão de 2 L registra 2000 ml',async()=>{
 await processTelegramWater(callback(2000),client());
 expect(rpc).toHaveBeenCalledWith('saude_record_water_ml',expect.objectContaining({p_amount:2000}));
});

it('três perfis no mesmo chat mantêm seletores independentes e podem responder em qualquer ordem',async()=>{
 for(const id of [2,3]){
  rows.tb_saude_alertas_envios.push({...rows.tb_saude_alertas_envios[0],perfil_id:id,dedupe_key:`agua:${day}:07:30:${id}`,telegram_message_id:9+id});
  rows.tb_saude_perfis.push({id,created_by:'owner',nome:`Perfil ${id}`});
 }
 const edits=()=>send.mock.calls.filter(([method])=>method==='editMessageText').map(([,body])=>body.message_id);
 for(const [id,amount] of [[2,300],[3,1000],[1,200]]){
  const update=callback(amount);
  update.callback_query.data=`water:${id}:${day}:0730:${amount}`;
  update.callback_query.message.message_id=9+id;
  await processTelegramWater(update,client());
  expect(rpc).toHaveBeenLastCalledWith('saude_record_water_ml',expect.objectContaining({p_profile:id,p_amount:amount,p_request:`tg-water:agua:${day}:07:30:${id}`}));
  expect(edits()).toEqual(id===2?[11]:id===3?[11,12]:[11,12,10]);
 }
 expect(rpc).toHaveBeenCalledTimes(3);
 const confirmations=send.mock.calls.filter(([method])=>method==='sendMessage');
 expect(confirmations).toHaveLength(3);
 expect(confirmations.map(([,body])=>body.text)).toEqual([
  expect.stringContaining('300 ml — Perfil 2'),
  expect.stringContaining('1000 ml — Perfil 3'),
  expect.stringContaining('200 ml — Perfil A'),
 ]);
});
