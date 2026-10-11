import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import { parseTelegramPurchase,parseTelegramPurchases,processTelegramPurchase } from '../../lib/telegramPurchase.js';

describe('Compras por texto, uma linha por lançamento',()=>{
  it('preserva descrições e converte centavos sem arredondar a entrada',()=>{
    const result=parseTelegramPurchases('padaria,4,25\r\n\nmercado da esquina,15,30\ncafé,0,01');
    expect(result.items.map(item=>[item.descricao,item.valor])).toEqual([['padaria',4.25],['mercado da esquina',15.30],['café',0.01]]);
    expect(result.items.every(item=>item.tipo==='despesa'&&item.metodo_pagamento==='debito_pix')).toBe(true);
    expect(parseTelegramPurchase('Almoço,15,00')?.valor).toBe(15);
  });
  it.each(['padaria,4.25','padaria,4','padaria,4,2','padaria,4,250','padaria,0,00','padaria,-4,25','padaria,4,25,extra','padaria,quinze,30'])('recusa formato inválido %s',text=>expect(parseTelegramPurchase(text)).toBeNull());
  it('recusa toda a mensagem ao encontrar uma linha inválida',()=>{
    expect(parseTelegramPurchases('padaria,4,25\nmercado,15')).toMatchObject({error:expect.stringContaining('Linha 2')});
    expect(parseTelegramPurchases('padaria,4,25\nmercado,15')).not.toHaveProperty('items');
    expect(parseTelegramPurchases(Array(21).fill('padaria,4,25').join('\n')).error).toContain('20');
  });
});

describe('Rascunho e confirmação do Telegram',()=>{
  let inserts, drafts, fetchMock, client;
  const message = text => ({update_id:123,message:{text,date:Math.floor(Date.now()/1000),from:{id:123},chat:{id:123,type:'private'}}});
  beforeEach(()=>{
    vi.stubEnv('TELEGRAM_CHAT_ID','123');vi.stubEnv('TELEGRAM_BOT_TOKEN','123:fake');vi.stubEnv('SAUDE_ALERTS_OWNER_USER_ID','owner');
    inserts=[];drafts=[];
    fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({ok:true,result:{message_id:1}})});vi.stubGlobal('fetch',fetchMock);
    client={rpc:vi.fn().mockResolvedValue({data:'saved'}),from:vi.fn(table=>{
      if(table==='app_user_roles')return {select(){return {eq:async()=>({data:[{role:'owner'}]})};}};
      if(table!=='tb_telegram_compras')throw new Error('Unexpected table');
      const chain={select(){return chain;},eq(){return chain;},gte(){return chain;},order(){return chain;},limit:async()=>({data:drafts}),insert:async row=>{inserts.push(row);return {error:null};}};
      return chain;
    })};
  });
  afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
  it('prepara um lote e mostra total sem gravar no Financeiro antes de confirmar',async()=>{
    await processTelegramPurchase(message('padaria,4,25\nmercado,15,30'),client);
    expect(inserts).toHaveLength(1);expect(inserts[0].payload.items).toHaveLength(2);
    expect(client.rpc).not.toHaveBeenCalled();
    const response=JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(response.text.replaceAll('\u00a0',' ')).toContain('Total: R$ 19,55');
    expect(response.reply_markup.inline_keyboard[0][0]).toMatchObject({text:'Confirmar todos',callback_data:`confirm:${inserts[0].id}`});
  });
  it('não prepara nenhuma compra se a segunda linha for inválida',async()=>{
    await processTelegramPurchase(message('padaria,4,25\nmercado,15'),client);
    expect(inserts).toHaveLength(0);expect(JSON.parse(fetchMock.mock.calls[0][1].body).text).toContain('Linha 2');
  });
  it('recusa voz sem baixar áudio nem usar transcrição',async()=>{
    const update=message(undefined);update.message.voice={file_id:'audio',duration:5};
    await processTelegramPurchase(update,client);
    expect(inserts).toHaveLength(0);expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain('/sendMessage');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).text).toContain('O modo de voz foi desativado');
  });
  it('recupera o mesmo lote pelo comando /pendente',async()=>{
    const id='00000000-0000-4000-8000-000000000005';
    drafts=[{id,payload:{items:parseTelegramPurchases('padaria,4,25\nmercado,15,30').items}}];
    await processTelegramPurchase(message('/pendente'),client);
    expect(inserts).toHaveLength(0);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).reply_markup.inline_keyboard[0][0].callback_data).toBe(`confirm:${id}`);
  });
  it.each(['confirm','cancel'])('encaminha %s pela confirmação transacional existente',async action=>{
    const id='00000000-0000-4000-8000-000000000005';
    await processTelegramPurchase({callback_query:{id:'callback',data:`${action}:${id}`,from:{id:123},message:{message_id:1,chat:{id:123,type:'private'}}}},client);
    expect(client.rpc).toHaveBeenCalledExactlyOnceWith('telegram_confirm_purchase',{p_id:id,p_chat_id:'123',p_sender_id:'123',p_owner_id:'owner',p_cancel:action==='cancel'});
  });
  it('não responde a outro remetente nem cria rascunhos',async()=>{
    const update=message('padaria,4,25');update.message.from.id=456;
    await processTelegramPurchase(update,client);expect(fetchMock).not.toHaveBeenCalled();expect(inserts).toHaveLength(0);
  });
});
