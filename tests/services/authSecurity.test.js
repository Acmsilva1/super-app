import { beforeEach, afterEach, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({ user: { id: 'owner', email: 'owner@example.test' }, role: '', permissions: [], limit: true }));
vi.mock('../../lib/actionRateLimit.js', () => ({ consumeActionLimit: async () => {
  if (state.limit instanceof Error) throw state.limit;
  return state.limit;
} }));
vi.mock('../../lib/supabase.js', () => ({ supabase: {
  auth: {
    getUser: async () => ({ data: { user: state.user } }),
    admin: { getUserById: async () => ({ data: { user: state.user } }) },
  },
  from: table => ({ select() { return this; }, eq() { return this; }, limit: async () => ({
    data: table === 'app_user_roles' ? (state.role ? [{ role: state.role }] : []) : state.permissions,
  }) }),
} }));
import { requireUser } from '../../lib/auth.js';
const req = { headers: { authorization: 'Bearer test-session' } };
beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('OFFLINE_DEV', 'false'); vi.stubEnv('AUTH_MODE', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-server-key');
  state.user = { id: 'owner', email: 'owner@example.test' }; state.role = ''; state.permissions = []; state.limit = true;
});
afterEach(() => vi.unstubAllEnvs());
it('rejects unauthenticated callers and ignores forged admin claims in requests', async () => {
  expect((await requireUser({ headers: {} })).status).toBe(401);
  const result = await requireUser({ ...req, body: { isAdmin: true, user_id: 'admin' } }, { adminOnly: true });
  expect(result.status).toBe(403);
});
it('requires module permission before privileged data access', async () => {
  expect((await requireUser(req, { appId: 'saude' })).status).toBe(403);
  state.permissions = [{ can_access: true }];
  expect((await requireUser(req, { appId: 'saude' })).ok).toBe(true);
});
it('cannot escalate with role alone or matching admin email alone', async () => {
  state.role = 'admin';
  expect((await requireUser(req, { adminOnly: true })).status).toBe(403);
  state.user.email = 'andrecarlos.miranda@gmail.com';
  expect((await requireUser(req, { adminOnly: true })).status).toBe(403);
});
it('blocks banned accounts and fails closed on shared rate-limit outages', async () => {
  state.user.banned_until = new Date(Date.now() + 60000).toISOString();
  expect((await requireUser(req)).status).toBe(403);
  delete state.user.banned_until;
  state.limit = false; expect((await requireUser(req)).status).toBe(429);
  state.limit = Error('provider down'); expect((await requireUser(req)).status).toBe(503);
});
