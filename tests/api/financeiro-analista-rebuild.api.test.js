import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rebuildMock } = vi.hoisted(() => ({
  rebuildMock: vi.fn(),
}));

vi.mock('../../features/financeiro/service/financeiroRebuildService.js', () => ({
  rebuildFinanceiroAnalises: rebuildMock,
}));

import rebuildHandler from '../../api/financeiro-analista-rebuild.js';

function createApp(handler) {
  const app = express();
  app.use(express.json());
  app.all('/api/test', async (req, res) => handler(req, res));
  return app;
}

describe('API de rebuild do financeiro analista', () => {
  beforeEach(() => {
    rebuildMock.mockReset();
    delete process.env.FINANCEIRO_REBUILD_TOKEN;
  });

  it('bloqueia sem token valido', async () => {
    const app = createApp(rebuildHandler);
    const res = await request(app).post('/api/test');

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('token de rebuild');
  });

  it('encaminha para o helper de rebuild quando autenticado', async () => {
    rebuildMock.mockResolvedValue({
      ok: true,
      months_processed: 3,
      months: [
        { mes_ano: '2026-04' },
        { mes_ano: '2026-05' },
        { mes_ano: '2026-06' },
      ],
    });

    const app = createApp(rebuildHandler);
    const res = await request(app)
      .post('/api/test')
      .set('x-rebuild-token', 'superapp-financeiro-rebuild-v1');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.months_processed).toBe(3);
    expect(res.body.months.map((item) => item.mes_ano)).toEqual(['2026-04', '2026-05', '2026-06']);
    expect(rebuildMock).toHaveBeenCalledTimes(1);
  });
});
