import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), rpc: vi.fn(), from: vi.fn(), limit: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }));
vi.mock('../../lib/auth.js', () => ({ requireUser: mocks.requireUser }));
vi.mock('../../lib/supabase.js', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock('../../lib/actionRateLimit.js', () => ({ consumeActionLimit: mocks.limit }));
vi.mock('../../lib/authMode.js', () => ({ isFixedAuthMode: () => false }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { signInWithPassword: mocks.signIn, signOut: mocks.signOut } }) }));
import handler, { exportOwnedData, PRIVACY_TABLES } from '../../lib/privacyHandler.js';
function response() { return { statusCode: 0, body: null, setHeader: vi.fn(), status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } }; }
beforeEach(() => {
  vi.clearAllMocks(); delete process.env.OFFLINE_DEV;
  mocks.requireUser.mockResolvedValue({ ok: true, user: { id: 'self', email: 'self@example.test' } });
  mocks.limit.mockResolvedValue(true);
});
describe('privacy authorization', () => {
  it('every exported table is filtered to the authenticated owner', async () => {
    const filters = [];
    const client = { from: table => ({ select: () => ({ eq: (column, id) => ({ range: async () => { filters.push({table,column,id}); return {data:[]}; } }) }) }) };
    await exportOwnedData(client, {id:'self'});
    expect(filters.length).toBe(Object.values(PRIVACY_TABLES).flat().length);
    expect(filters.every(row => row.id === 'self')).toBe(true);
  });
  it('denies unauthenticated export and deletion before reading data', async () => {
    mocks.requireUser.mockResolvedValue({ok:false,status:401,data:{error:'login'}});
    for (const method of ['GET','DELETE']) { const res=response(); await handler({method,body:{user_id:'victim'}},res); expect(res.statusCode).toBe(401); }
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('requires typed confirmation and password before deletion', async () => {
    const res=response(); await handler({method:'DELETE',body:{user_id:'victim'}},res);
    expect(res.statusCode).toBe(400); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('rejects another identity returned by password verification', async () => {
    mocks.signIn.mockResolvedValue({data:{user:{id:'victim'}}});
    const res=response(); await handler({method:'DELETE',body:{confirmation:'EXCLUIR MINHA CONTA',password:'current'}},res);
    expect(res.statusCode).toBe(403); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('deletion RPC uses self even if the body requests another user', async () => {
    mocks.signIn.mockResolvedValue({data:{user:{id:'self'}}}); mocks.signOut.mockResolvedValue({}); mocks.rpc.mockResolvedValue({});
    const res=response(); await handler({method:'DELETE',body:{user_id:'victim',confirmation:'EXCLUIR MINHA CONTA',password:'current'}},res);
    expect(mocks.rpc).toHaveBeenCalledWith('delete_superapp_account_data',{p_user_id:'self'}); expect(res.statusCode).toBe(200);
  });
});
