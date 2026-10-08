import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
const state=vi.hoisted(()=>({user:null,role:'',permission:false}));
vi.mock('../../lib/supabase.js',()=>({supabase:{
  auth:{getUser:async()=>({data:{user:state.user}}),admin:{getUserById:async()=>({data:{user:state.user}})}},
  from(table){return {select(){return this;},eq(){return this;},limit:async()=>({data:table==='app_user_roles'?(state.role?[{role:state.role}]:[]):(state.permission?[{can_access:true}]:[])})};},
}}));
import {requireUser} from '../../lib/auth.js';
beforeEach(()=>{
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('VERCEL','1');vi.stubEnv('OFFLINE_DEV','false');vi.stubEnv('AUTH_MODE','supabase');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','fake-key');
  state.user={id:'00000000-0000-4000-8000-000000000002',email:'mock@example.invalid'};state.role='';state.permission=false;
});
afterEach(()=>vi.unstubAllEnvs());
const req={headers:{authorization:'Bearer fake-token'}};
describe('Autorizacao real da funcao com provedor simulado',()=>{
  it('recusa token ausente',async()=>expect((await requireUser({headers:{}})).status).toBe(401));
  it('recusa sessao expirada',async()=>{state.user=null;expect((await requireUser(req)).status).toBe(401);});
  it('recusa conta bloqueada',async()=>{state.user.banned_until=new Date(Date.now()+60000).toISOString();expect((await requireUser(req)).status).toBe(403);});
  it('usuario comum nao acessa admin',async()=>expect((await requireUser(req,{adminOnly:true})).status).toBe(403));
  it('role admin com identidade diferente nao concede master',async()=>{state.role='admin';expect((await requireUser(req,{adminOnly:true})).status).toBe(403);});
  it('email do owner em outro id nao concede master',async()=>{state.role='owner';state.user.email='andrecarlos.miranda@gmail.com';expect((await requireUser(req,{adminOnly:true})).status).toBe(403);});
  it('owner correto precisa da role',async()=>{state.user={id:'f88a6351-317d-425b-afcd-9430c8a34f53',email:'andrecarlos.miranda@gmail.com'};expect((await requireUser(req,{adminOnly:true})).status).toBe(403);state.role='owner';expect((await requireUser(req,{adminOnly:true})).isAdmin).toBe(true);});
  it('permissao do modulo e obrigatoria para usuario comum',async()=>{expect((await requireUser(req,{appId:'saude'})).status).toBe(403);state.permission=true;expect((await requireUser(req,{appId:'saude'})).ok).toBe(true);});
});
