import { beforeEach,afterEach,it,expect,vi } from 'vitest';
const {requireUser,from}=vi.hoisted(()=>({requireUser:vi.fn(),from:vi.fn()}));
vi.mock('../../lib/auth.js',()=>({requireUser}));
vi.mock('../../lib/supabase.js',()=>({supabase:{from}}));
import handler from '../../lib/financeiroAlertas.js';
const payload={nome:'Resumo',tipo:'diario',mensagem:'',cron:'0 13 * * *',ativo:true};
async function call(method,body={}){
  const res={code:0,body:null,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};
  await handler({method,body},res);return res;
}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('NODE_ENV','development');vi.stubEnv('OFFLINE_DEV','true');requireUser.mockResolvedValue({ok:true,user:{id:crypto.randomUUID()}});});
afterEach(()=>vi.unstubAllEnvs());
it('exige permissão Financeiro e recusa outra conta vinculada ao bot',async()=>{
  requireUser.mockResolvedValueOnce({ok:false,status:403,data:{error:'bloqueado'}});
  expect((await call('GET')).code).toBe(403);
  vi.stubEnv('OFFLINE_DEV','false');vi.stubEnv('SAUDE_ALERTS_OWNER_USER_ID','outro');
  expect((await call('POST',payload)).code).toBe(403);expect(from).not.toHaveBeenCalled();
});
it('cria, edita, pausa e exclui no mock sem acessar serviços externos',async()=>{
  requireUser.mockResolvedValue({ok:true,user:{id:'local-one'}});
  expect((await call('POST',payload)).code).toBe(201);
  const row=(await call('GET')).body.rows[0];
  expect((await call('PATCH',{...row,ativo:false,nome:'Editado'})).code).toBe(200);
  expect((await call('GET')).body.rows[0]).toMatchObject({ativo:false,nome:'Editado'});
  expect((await call('DELETE',{id:row.id})).code).toBe(200);
  expect((await call('GET')).body.rows).toHaveLength(0);expect(from).not.toHaveBeenCalled();
});
it('isola regras de duas contas e rejeita cron inválido',async()=>{
  expect((await call('POST',{...payload,cron:'* * * * *'})).code).toBe(400);
  requireUser.mockResolvedValue({ok:true,user:{id:'local-two'}});await call('POST',payload);
  const row=(await call('GET')).body.rows[0];
  requireUser.mockResolvedValue({ok:true,user:{id:'local-three'}});
  expect((await call('PATCH',{...row,ativo:false})).code).toBe(404);
  expect((await call('DELETE',{id:row.id})).code).toBe(404);
});
it('consulta persistida aplica owner e avisa quando falta a migration',async()=>{
  vi.stubEnv('OFFLINE_DEV','false');vi.stubEnv('SAUDE_ALERTS_OWNER_USER_ID','owner');requireUser.mockResolvedValue({ok:true,user:{id:'owner'}});
  const query={select:vi.fn().mockReturnThis(),eq:vi.fn().mockReturnThis(),order:vi.fn().mockReturnThis(),limit:vi.fn().mockResolvedValue({error:{code:'42P01'}})};from.mockReturnValue(query);
  const result=await call('GET');expect(query.eq).toHaveBeenCalledWith('user_id','owner');expect(result.body.persistencia).toBe(false);
});
