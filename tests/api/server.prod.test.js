import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server.js';

describe('server.js (producao)', () => {
  const app = createApp();

  it('serve index.html sem cache', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.text).toContain('<html');
  });

  it('serve assets publicos', async () => {
    expect((await request(app).get('/styles/bank-theme.css')).status).toBe(200);
    expect((await request(app).get('/manifest.json')).headers['content-type']).toContain('application/manifest+json');
    expect((await request(app).get('/icon-192.png')).headers['cache-control']).toContain('immutable');
  });

  it('nao expoe segredos nem codigo de servidor', async () => {
    for (const p of ['/.env.local', '/.env.example', '/package.json', '/server.js', '/lib/auth.js', '/api/financeiro.js', '/migration/', '/AGENTS.md', '/node_modules/express/package.json']) {
      const res = await request(app).get(p);
      expect(res.status, p).toBe(404);
    }
  });

  it('bloqueia modulos internos da API', async () => {
    expect((await request(app).get('/api/_financeiroShared')).status).toBe(404);
    expect((await request(app).get('/api/inexistente')).status).toBe(404);
    expect((await request(app).get('/api/../lib/auth')).status).toBe(404);
  });

  it('healthcheck responde', async () => {
    const res = await request(app).get('/healthz');
    expect(res.body).toEqual({ ok: true });
  });
});
