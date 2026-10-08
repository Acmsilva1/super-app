import { afterEach,describe,it,expect,vi } from 'vitest';
import request from 'supertest';
import { requireUser } from '../../lib/auth.js';
import cron from '../../api/cron-treinar-modelo.js';
import { validatePngHeader } from '../../lib/pngLimits.js';
import { PNG } from 'pngjs';
import { createApp } from '../../server.js';
import { parseTelegramPurchase,processTelegramPurchase } from '../../lib/telegramPurchase.js';
import { normalizeVoicePurchase } from '../../lib/telegramVoice.js';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('Regressoes da auditoria',()=>{
  it.each([{NODE_ENV:'production',OFFLINE_DEV:'true'},{VERCEL:'1',NODE_ENV:'test'},{VERCEL:'1',NODE_ENV:'production',AUTH_MODE:'fixed'}])('bloqueia configuracao insegura %j',async(env)=>{
    for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
    expect((await requireUser({headers:{}})).status).toBe(503);
  });
  it('nao entrega admin fixo sem verificacao Basic Auth',async()=>{
    vi.stubEnv('NODE_ENV','production');vi.stubEnv('OFFLINE_DEV','false');vi.stubEnv('AUTH_MODE','fixed');
    expect((await requireUser({headers:{}})).status).toBe(401);
  });
  it.each(['','curto'])('cron recusa segredo ausente/curto',async(secret)=>{
    vi.stubEnv('CRON_SECRET',secret);
    const res={setHeader(){},status(c){this.code=c;return this;},end(){}};
    await cron({method:'GET',headers:{}},res);expect(res.code).toBe(401);
  });
  it('cron legado carregavel retorna 410 depois da autenticacao',async()=>{
    vi.stubEnv('CRON_SECRET','a'.repeat(32));
    const res={setHeader(){},status(c){this.code=c;return this;},end(){}};
    await cron({method:'GET',headers:{authorization:`Bearer ${'a'.repeat(32)}`}},res);expect(res.code).toBe(410);
  });
  it.each(['Almoco ontem, 15','Almoco amanha, 15','Compra 06/10/2026, 15','Compra no credito, 15','Compra parcelada, 15'])('texto rejeita intencao incompatível: %s',text=>expect(parseTelegramPurchase(text)).toBeNull());
  it('texto/voz aceitam a mesma compra simples',()=>{
    expect(parseTelegramPurchase('Almoco, 15')?.valor).toBe(15);
    expect(parseTelegramPurchase(normalizeVoicePurchase('Almoco, quinze reais'))?.valor).toBe(15);
  });
  it('PNG excessivo e rejeitado pelo IHDR sem descomprimir',()=>{
    const buffer=PNG.sync.write(new PNG({width:1,height:1}));buffer.writeUInt32BE(0xffffffff,16);
    expect(validatePngHeader(buffer)).toContain('Dimensoes');
    expect(validatePngHeader(Buffer.from('not png'))).toContain('invalido');
  });
  it('headers de seguranca e fallback offline sao servidos',async()=>{
    const response=await request(createApp()).get('/offline.html');
    expect(response.status).toBe(200);expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.text).toContain('Sem conexão');
  });
  it('recupera a confirmacao explicitamente com o mesmo id',async()=>{
    vi.stubEnv('TELEGRAM_CHAT_ID','123');vi.stubEnv('SAUDE_ALERTS_OWNER_USER_ID','owner');vi.stubEnv('TELEGRAM_BOT_TOKEN','123:fake');
    const id='00000000-0000-4000-8000-000000000005';
    const payload=parseTelegramPurchase('Almoco, 15');
    const chain={select(){return this;},eq(){return this;},gte(){return this;},order(){return this;},limit:async()=>({data:[{id,payload}]})};
    const client={from(table){return table==='app_user_roles'?{select(){return {eq:async()=>({data:[{role:'owner'}]})};}}:chain;}};
    const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({ok:true,result:{message_id:1}})});vi.stubGlobal('fetch',fetchMock);
    await processTelegramPurchase({update_id:1,message:{date:Math.floor(Date.now()/1000),text:'/pendente',from:{id:123},chat:{type:'private',id:123}}},client);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).reply_markup.inline_keyboard[0][0].callback_data).toBe(`confirm:${id}`);
  });
});
