import { describe, it, expect, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), from: vi.fn(), limit: vi.fn() }));
vi.mock('../../lib/auth.js', () => ({ requireUser: mocks.requireUser }));
vi.mock('../../lib/supabase.js', () => ({ supabase: { from: mocks.from } }));
vi.mock('../../lib/actionRateLimit.js', () => ({ consumeActionLimit: mocks.limit }));
vi.mock('../../lib/authMode.js', () => ({ isFixedAuthMode: () => false }));
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
  it('denies unauthenticated export before reading data', async () => {
    mocks.requireUser.mockResolvedValue({ok:false,status:401,data:{error:'login'}});
    const res=response(); await handler({method:'GET'},res);
    expect(res.statusCode).toBe(401); expect(mocks.from).not.toHaveBeenCalled();
  });
  it('does not expose self-service deletion and directs requests to the administrator', async () => {
    const res=response(); await handler({method:'DELETE',body:{user_id:'victim'}},res);
    expect(res.statusCode).toBe(405);
    expect(res.body.error).toContain('administrador');
    expect(mocks.requireUser).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
