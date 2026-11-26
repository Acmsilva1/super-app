import { afterEach,describe,it,expect,vi } from 'vitest';
import request from 'supertest';
import { requireUser } from '../../lib/auth.js';
import cron from '../../lib/cronTreinarModeloHandler.js';
import { validatePngHeader } from '../../lib/pngLimits.js';
import { PNG } from 'pngjs';
import { createApp } from '../../server.js';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('Regressoes da auditoria',()=>{
  it.each([{NODE_ENV:'production',OFFLINE_DEV:'true'}])('bloqueia configuracao insegura %j',async(env)=>{
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
});
