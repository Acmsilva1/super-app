import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../server.js';
import { readFileSync } from 'node:fs';

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

  it('negocia gzip para HTML e CSS preservando o conteúdo e os headers', async () => {
    for (const [url, file] of [['/', 'index.html'], ['/styles/bank-theme.css', 'styles/bank-theme.css']]) {
      const response = await request(app).get(url).set('Accept-Encoding', 'gzip');
      expect(response.status).toBe(200);
      expect(response.headers['content-encoding']).toBe('gzip');
      expect(response.headers.vary).toContain('Accept-Encoding');
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
      expect(response.text).toBe(readFileSync(file, 'utf8'));
    }
    const identity = await request(app).get('/').set('Accept-Encoding', 'identity');
    expect(identity.headers['content-encoding']).toBeUndefined();
    expect(identity.headers['cache-control']).toContain('no-store');
  });

  it('serve WebP versionado sem recompressão e mantém validação condicional', async () => {
    const image = await request(app).get('/backgrounds/home-640-v1.webp').set('Accept-Encoding', 'gzip');
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toContain('image/webp');
    expect(image.headers['content-encoding']).toBeUndefined();
    expect(image.headers['cache-control']).toContain('immutable');
    expect(image.body).toEqual(readFileSync('backgrounds/home-640-v1.webp'));
    const cached = await request(app).get('/backgrounds/home-640-v1.webp').set('If-None-Match', image.headers.etag);
    expect(cached.status).toBe(304);
    const head = await request(app).head('/').set('Accept-Encoding', 'gzip');
    expect(head.status).toBe(200);
    expect(head.text).toBeUndefined();
  });
});
