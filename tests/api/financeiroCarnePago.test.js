import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { requireUser, from } = vi.hoisted(() => ({ requireUser: vi.fn(), from: vi.fn() }));
vi.mock('../../lib/auth.js', () => ({ requireUser }));
vi.mock('../../lib/supabase.js', () => ({ supabase: { from } }));
import handler from '../../lib/financeiroCarnePago.js';

async function call(method, body = {}) {
  const res = {
    code: 0,
    body: null,
    setHeader() {},
    status(code) { this.code = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  await handler({ method, body }, res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('OFFLINE_DEV', 'true');
  requireUser.mockResolvedValue({ ok: true, user: { id: 'local-owner' } });
});
afterEach(() => vi.unstubAllEnvs());

it('marca e desmarca parcela paga no mock offline', async () => {
  expect((await call('POST', { carne_id: 'carro-juliana', parcela_numero: 1, pago: true })).code).toBe(200);
  expect((await call('GET')).body.rows).toEqual([
    expect.objectContaining({ carne_id: 'carro-juliana', parcela_numero: 1 }),
  ]);
  expect((await call('POST', { carne_id: 'carro-juliana', parcela_numero: 1, pago: false })).code).toBe(200);
  expect((await call('GET')).body.rows).toEqual([]);
});

it('recusa carnê desconhecido', async () => {
  expect((await call('POST', { carne_id: 'inexistente', parcela_numero: 1, pago: true })).code).toBe(400);
});
