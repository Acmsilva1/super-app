import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock, analistaMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  analistaMock: vi.fn(),
}));

vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    from: fromMock,
  },
}));

vi.mock('../../api/financeiro-analista.js', () => ({
  default: analistaMock,
}));

import rebuildHandler from '../../api/financeiro-analista-rebuild.js';

function createApp(handler) {
  const app = express();
  app.use(express.json());
  app.all('/api/test', async (req, res) => handler(req, res));
  return app;
}

function createSelectChain(data) {
  return {
    select: vi.fn(() => ({
      order: vi.fn(() => ({
        range: vi.fn().mockResolvedValue({ data, error: null }),
      })),
    })),
  };
}

function createDeleteChain() {
  return {
    delete: vi.fn(() => ({
      not: vi.fn().mockResolvedValue({ error: null }),
    })),
  };
}

describe('API de rebuild do financeiro analista', () => {
  beforeEach(() => {
    fromMock.mockReset();
    analistaMock.mockReset();
    delete process.env.FINANCEIRO_REBUILD_TOKEN;
  });

  it('bloqueia sem token configurado', async () => {
    const app = createApp(rebuildHandler);
    const res = await request(app).post('/api/test');

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('FINANCEIRO_REBUILD_TOKEN');
  });

  it('recalcula os meses em ordem e limpa as tabelas derivadas', async () => {
    process.env.FINANCEIRO_REBUILD_TOKEN = 'rebuild-secret';

    const financasRows = [
      { created_at: '2026-06-03T10:00:00.000Z' },
      { created_at: '2026-04-03T10:00:00.000Z' },
    ];
    const fixasRows = [
      { created_at: '2026-05-05T10:00:00.000Z' },
    ];

    fromMock.mockImplementation((table) => {
      if (table === 'tb_financas') return createSelectChain(financasRows);
      if (table === 'tb_despesas_fixas') return createSelectChain(fixasRows);
      if (
        table === 'tb_financeiro_analise_runs'
        || table === 'tb_financeiro_modelo_estado'
        || table === 'tb_financeiro_analises'
        || table === 'tb_financeiro_features_mensais'
      ) {
        return createDeleteChain();
      }
      throw new Error(`Tabela inesperada: ${table}`);
    });

    analistaMock.mockImplementation(async (req, res) => {
      res.status(200).end(JSON.stringify({
        aprendizado: {
          feature_id: `${req.query.mes_ano}-feature`,
          analysis_id: `${req.query.mes_ano}-analysis`,
          run_id: `${req.query.mes_ano}-run`,
          model_state_id: `${req.query.mes_ano}-state`,
        },
      }));
    });

    const app = createApp(rebuildHandler);
    const res = await request(app)
      .post('/api/test')
      .set('x-rebuild-token', 'rebuild-secret');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.months_processed).toBe(3);
    expect(res.body.months.map((item) => item.mes_ano)).toEqual(['2026-04', '2026-05', '2026-06']);
    expect(analistaMock).toHaveBeenCalledTimes(3);
    expect(analistaMock.mock.calls.map((call) => call[0].query.mes_ano)).toEqual(['2026-04', '2026-05', '2026-06']);
  });
});
