import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const FIXED_ID = '11111111-2222-4333-8444-555555555555';

function stubFixedEnv() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('OFFLINE_DEV', 'false');
  vi.stubEnv('AUTH_MODE', 'fixed');
  vi.stubEnv('FIXED_USER_ID', FIXED_ID);
  vi.stubEnv('FIXED_USER_EMAIL', 'teste@local');
  vi.stubEnv('POSTGREST_URL', 'http://rest:3000/');
  vi.stubEnv('POSTGREST_TOKEN', 'token-de-teste');
}

describe('AUTH_MODE=fixed', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('requireUser devolve o usuario fixo sem token', async () => {
    stubFixedEnv();
    const { requireUser } = await import('../../lib/auth.js');
    const result = await requireUser({ headers: {} }, { adminOnly: true });
    expect(result).toEqual({ ok: true, user: { id: FIXED_ID, email: 'teste@local' }, isAdmin: true });
  });

  it('auth-config informa o modo fixo ao front', async () => {
    stubFixedEnv();
    const { default: handler } = await import('../../api/apps.js');
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, end(body) { this.body = JSON.parse(body); } };
    await handler({ method: 'GET', query: { route: 'auth-config' } }, res);
    expect(res.code).toBe(200);
    expect(res.body).toEqual({ authMode: 'fixed', user: { id: FIXED_ID, email: 'teste@local' } });
  });

  it('cliente de dados aponta para o PostgREST com o token de servico', async () => {
    stubFixedEnv();
    const { supabase } = await import('../../lib/supabase.js');
    const builder = supabase.from('financeiro');
    expect(String(builder.url)).toBe('http://rest:3000/financeiro');
    expect(builder.headers instanceof Headers ? builder.headers.get('Authorization') : builder.headers.Authorization).toBe('Bearer token-de-teste');
  });

  it('server exige Basic Auth quando configurado', async () => {
    vi.stubEnv('BASIC_AUTH_USER', 'andre');
    vi.stubEnv('BASIC_AUTH_PASSWORD', 'senha-forte-123');
    const { createApp } = await import('../../server.js');
    const app = createApp();
    expect((await request(app).get('/')).status).toBe(401);
    expect((await request(app).get('/').auth('andre', 'errada')).status).toBe(401);
    expect((await request(app).get('/').auth('andre', 'senha-forte-123')).status).toBe(200);
    expect((await request(app).get('/healthz')).status).toBe(200);
    expect((await request(app).get('/manifest.json')).status).toBe(200);
  });
});
