import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    from: fromMock,
  },
}));

import financeiroAnalistaHandler from '../../api/financeiro-analista.js';

function createApp(handler) {
  const app = express();
  app.use(express.json());
  app.all('/api/test', async (req, res) => handler(req, res));
  return app;
}

function createRowsResult(data) {
  return Promise.resolve({ data, error: null });
}

function createPersistTable({ insertedId = 1001, updatedId = 1002 } = {}) {
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    })),
    insert: vi.fn((payload) => ({
      select: vi.fn().mockResolvedValue({
        data: [{ id: insertedId, ...payload }],
        error: null,
      }),
    })),
    update: vi.fn((payload) => ({
      eq: vi.fn(() => ({
        select: vi.fn().mockResolvedValue({
          data: [{ id: updatedId, ...payload }],
          error: null,
        }),
      })),
    })),
  };
}

describe('API do financeiro analista', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('GET health retorna status sem consultar Supabase', async () => {
    const app = createApp(financeiroAnalistaHandler);
    const res = await request(app).get('/api/test?health=1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, service: 'financeiro-analista' });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('gera analise e persiste estado adaptativo', async () => {
    const rowsFinancas = [
      { id: 1, tipo: 'receita', valor: 3000, created_at: '2026-06-03T10:00:00.000Z', categoria: 'Salario' },
      { id: 2, tipo: 'despesa', valor: 400, created_at: '2026-06-10T10:00:00.000Z', categoria: 'Transporte' },
    ];
    const rowsFixas = [
      { id: 3, valor: 1200, created_at: '2026-06-05T10:00:00.000Z' },
    ];

    fromMock.mockImplementation((table) => {
      if (table === 'tb_financas') {
        return {
          select: vi.fn(() => ({
            gte: vi.fn(() => ({
              lte: vi.fn(() => createRowsResult(rowsFinancas)),
            })),
          })),
        };
      }
      if (table === 'tb_despesas_fixas') {
        return {
          select: vi.fn(() => ({
            gte: vi.fn(() => ({
              lte: vi.fn(() => createRowsResult(rowsFixas)),
            })),
          })),
        };
      }
      if (table === 'tb_financeiro_features_mensais') {
        return createPersistTable();
      }
      if (table === 'tb_financeiro_analises') {
        return createPersistTable({ insertedId: 2001, updatedId: 2002 });
      }
      throw new Error(`Tabela inesperada: ${table}`);
    });

    const app = createApp(financeiroAnalistaHandler);
    const res = await request(app).get('/api/test?mes_ano=2026-06');

    expect(res.status).toBe(200);
    expect(res.body.mes_ano).toBe('2026-06');
    expect(res.body.analista.resumo_mensal.receitas).toBe(3000);
    expect(res.body.analista.resumo_mensal.despesas_totais).toBe(1600);
    expect(res.body.analista.modelo.pesos).toBeTruthy();
    expect(res.body.aprendizado).toBeTruthy();
    expect(res.body.aprendizado.percentual).toBeGreaterThan(0);
    expect(res.body.aprendizado.feature_id).toBe(1001);
    expect(res.body.aprendizado.analysis_id).toBe(2001);
  });
});
