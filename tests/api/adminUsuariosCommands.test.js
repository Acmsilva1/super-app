import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({
  requireUser:vi.fn(),createUser:vi.fn(),updateUserById:vi.fn(),listUsers:vi.fn(),upsert:vi.fn(),select:vi.fn(),
}));
vi.mock('../../lib/auth.js',()=>({requireUser:mocks.requireUser}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({
  auth:{admin:{createUser:mocks.createUser,updateUserById:mocks.updateUserById,listUsers:mocks.listUsers}},
  from:()=>({select:()=>({eq:()=>({limit:()=>Promise.resolve({data:[],error:null})}),data:[],error:null}),upsert:mocks.upsert}),
})}));
import handler from '../../lib/adminUsuariosHandler.js';
const owner='00000000-0000-4000-8000-000000000001';
const user='00000000-0000-4000-8000-000000000002';
function response(){return {code:null,body:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},end(text){this.body=text?JSON.parse(text):null;return this;}};}
beforeEach(()=>{
  vi.clearAllMocks();vi.stubEnv('AUTH_MODE','supabase');
  vi.stubEnv('SUPABASE_URL','https://example.invalid');vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY','mock-key');
  mocks.requireUser.mockResolvedValue({ok:true,user:{id:owner},isAdmin:true});
  mocks.createUser.mockResolvedValue({data:{user:{id:user}},error:null});
  mocks.updateUserById.mockResolvedValue({error:null});
});
describe('Admin commands through Supabase Auth',()=>{
  it('requires admin authorization before creating an account',async()=>{
    mocks.requireUser.mockResolvedValue({ok:false,status:403,data:{error:'restricted'}});
    const res=response();await handler({method:'POST',body:{name:'Novo',email:'new@example.invalid'}},res,[]);
    expect(res.code).toBe(403);expect(mocks.createUser).not.toHaveBeenCalled();
    expect(mocks.requireUser).toHaveBeenCalledWith(expect.anything(),{adminOnly:true});
  });
  it('creates a Supabase account and returns a generated password without caching',async()=>{
    const res=response();await handler({method:'POST',body:{name:'Novo',email:'NEW@example.invalid'}},res,[]);
    expect(res.code).toBe(201);expect(res.headers['Cache-Control']).toBe('no-store');
    expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({email:'new@example.invalid',user_metadata:expect.objectContaining({name:'Novo'}),email_confirm:true}));
    expect(res.body.temporary_password.length).toBeGreaterThanOrEqual(32);
  });
  it('validates registration data before contacting Supabase Admin',async()=>{
    const res=response();await handler({method:'POST',body:{name:'',email:'bad'}},res,[]);
    expect(res.code).toBe(400);expect(mocks.createUser).not.toHaveBeenCalled();
  });
  it('protects the owner against password reset through the user table',async()=>{
    const res=response();await handler({method:'PATCH',body:{action:'reset_password',user_id:owner}},res,[]);
    expect(res.code).toBe(400);expect(mocks.updateUserById).not.toHaveBeenCalled();
  });
  it('resets another users password using Supabase Admin',async()=>{
    const res=response();await handler({method:'PATCH',body:{action:'reset_password',user_id:user}},res,[]);
    expect(res.code).toBe(200);expect(mocks.updateUserById).toHaveBeenCalledWith(user,{password:res.body.temporary_password});
  });
});
