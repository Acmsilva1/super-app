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
      { id: 10, tipo: 'receita', valor: 10000, created_at: '2026-01-03T10:00:00.000Z', categoria: 'Salario' },
      { id: 18, tipo: 'despesa', valor: 100, created_at: '2026-01-10T10:00:00.000Z', categoria: 'Transporte' },
      { id: 11, tipo: 'receita', valor: 2800, created_at: '2026-02-03T10:00:00.000Z', categoria: 'Salario' },
      { id: 12, tipo: 'despesa', valor: 700, created_at: '2026-02-10T10:00:00.000Z', categoria: 'Transporte' },
      { id: 13, tipo: 'receita', valor: 3200, created_at: '2026-03-03T10:00:00.000Z', categoria: 'Salario' },
      { id: 14, tipo: 'despesa', valor: 900, created_at: '2026-03-11T10:00:00.000Z', categoria: 'Mercado' },
      { id: 15, tipo: 'receita', valor: 2900, created_at: '2026-04-03T10:00:00.000Z', categoria: 'Salario' },
      { id: 16, tipo: 'despesa', valor: 1100, created_at: '2026-04-11T10:00:00.000Z', categoria: 'Lazer' },
      { id: 1, tipo: 'receita', valor: 3000, created_at: '2026-06-03T10:00:00.000Z', categoria: 'Salario' },
      { id: 2, tipo: 'despesa', valor: 400, created_at: '2026-06-10T10:00:00.000Z', categoria: 'Transporte' },
    ];
    const rowsFixas = [
      { id: 20, valor: 100, created_at: '2026-01-05T10:00:00.000Z' },
      { id: 21, valor: 1000, created_at: '2026-02-05T10:00:00.000Z' },
      { id: 22, valor: 1150, created_at: '2026-03-05T10:00:00.000Z' },
      { id: 23, valor: 1180, created_at: '2026-04-05T10:00:00.000Z' },
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
        return createPersistTable({ insertedId: 1001, updatedId: 1002 });
      }
      if (table === 'tb_financeiro_analises') {
        return createPersistTable({ insertedId: 2001, updatedId: 2002 });
      }
      if (table === 'tb_financeiro_analise_runs') {
        return createPersistTable({ insertedId: 3001, updatedId: 3002 });
      }
      if (table === 'tb_financeiro_modelo_estado') {
        return createPersistTable({ insertedId: 4001, updatedId: 4002 });
      }
      throw new Error(`Tabela inesperada: ${table}`);
    });

    const app = createApp(financeiroAnalistaHandler);
    const res = await request(app).get('/api/test?mes_ano=2026-06');

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.mes_ano).toBe('2026-06');
    expect(res.body.analista.resumo_mensal.receitas).toBe(3000);
    expect(res.body.analista.resumo_mensal.despesas_totais).toBe(1600);
    expect(res.body.analista.modelo.pesos).toBeTruthy();
    expect(res.body.aprendizado).toBeTruthy();
    expect(res.body.aprendizado.percentual).toBe(0);
    expect(res.body.aprendizado.historico.length).toBeGreaterThanOrEqual(4);
    expect(res.body.aprendizado.historico.some((item) => item.mes_ano === '2026-01')).toBe(false);
    expect(res.body.analista.comparativos.resumo_historico.melhor_mes.mes_ano).toBe('2026-06');
    expect(res.body.analista.cards.melhor_mes.mes_ano).toBe('2026-06');
    expect(res.body.analista.cards.historico_sem_janeiro.some((item) => item.mes_ano === '2026-01')).toBe(false);
    expect(res.body.analista.cards.historico_sem_janeiro.find((item) => item.mes_ano === '2026-06')?.receitas).toBe(3000);
    expect(res.body.analista.cards.historico_sem_janeiro.find((item) => item.mes_ano === '2026-06')?.saldo).toBe(1400);
    expect(res.body.analista.metadados.recorte_inicio_mes_ano).toBe('2026-02');
    expect(res.body.aprendizado.feature_id).toBe(1001);
    expect(res.body.aprendizado.analysis_id).toBe(2001);
    expect(res.body.aprendizado.run_id).toBe(3001);
    expect(res.body.aprendizado.model_state_id).toBeNull();
  });

  it('gera estado do modelo quando o aprendizado esta ativo', async () => {
    const rowsFinancas = [
      { id: 11, tipo: 'receita', valor: 2800, created_at: '2026-02-03T10:00:00.000Z', categoria: 'Salario' },
      { id: 12, tipo: 'despesa', valor: 700, created_at: '2026-02-10T10:00:00.000Z', categoria: 'Transporte' },
      { id: 1, tipo: 'receita', valor: 3000, created_at: '2026-06-03T10:00:00.000Z', categoria: 'Salario' },
      { id: 2, tipo: 'despesa', valor: 400, created_at: '2026-06-10T10:00:00.000Z', categoria: 'Transporte' },
    ];
    const rowsFixas = [
      { id: 21, valor: 1000, created_at: '2026-02-05T10:00:00.000Z' },
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
        return createPersistTable({ insertedId: 1010, updatedId: 1011 });
      }
      if (table === 'tb_financeiro_analises') {
        return createPersistTable({ insertedId: 2010, updatedId: 2011 });
      }
      if (table === 'tb_financeiro_analise_runs') {
        return createPersistTable({ insertedId: 3010, updatedId: 3011 });
      }
      if (table === 'tb_financeiro_modelo_estado') {
        return createPersistTable({ insertedId: 4010, updatedId: 4011 });
      }
      throw new Error(`Tabela inesperada: ${table}`);
    });

    const app = createApp(financeiroAnalistaHandler);
    const res = await request(app).get('/api/test?mes_ano=2026-06&learn=1');

    expect(res.status).toBe(200);
    expect(res.body.aprendizado.run_id).toBe(3010);
    expect(res.body.aprendizado.model_state_id).toBe(4010);
  });
});
