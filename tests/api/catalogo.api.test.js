import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import appsHandler, { APPS } from '../../api/apps.js';
import statisticsHandler from '../../api/statistics.js';
import roadmapHandler from '../../api/roadmap.js';

function createApp(handler) {
  const app = express();
  app.use(express.json());
  app.all('/api/test', async (req, res) => handler(req, res));
  return app;
}

describe('APIs de catalogo', () => {
  it('GET /apps retorna o catalogo', async () => {
    const app = createApp(appsHandler);
    const res = await request(app).get('/api/test');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(APPS.length);
  });

  it('apps ativos declaram rota de health check', () => {
    const activeApps = APPS.filter((app) => app.status === 'active');
    expect(activeApps.length).toBeGreaterThan(0);
    for (const app of activeApps) {
      expect(app.health_path, app.id).toMatch(/^\/api\//);
      expect(app.health_path, app.id).toContain('health=1');
    }
  });

  it('metodo invalido em /apps retorna 405', async () => {
    const app = createApp(appsHandler);
    const res = await request(app).post('/api/test');
    expect(res.status).toBe(405);
    expect(res.headers.allow).toBe('GET');
  });

  it('GET /statistics retorna totais consistentes com APPS', async () => {
    const app = createApp(statisticsHandler);
    const res = await request(app).get('/api/test');
    expect(res.status).toBe(200);
    expect(res.body.totalApps).toBe(APPS.length);
    expect(res.body.activeApps).toBe(APPS.filter((a) => a.status === 'active').length);
  });

  it('GET /roadmap retorna lista de etapas', async () => {
    const app = createApp(roadmapHandler);
    const res = await request(app).get('/api/test');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});
