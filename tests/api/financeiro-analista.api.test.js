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

function createThenableQuery({ data = [], error = null } = {}) {
  const result = Promise.resolve({ data, error });
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    then: result.then.bind(result),
    catch: result.catch.bind(result),
  };
  return builder;
}

describe('API do analista financeiro', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('usa a view anual de categorias para cards e categorias_ano', async () => {
    fromMock.mockImplementation((table) => {
      if (table === 'vw_financeiro_resumo_mensal') {
        return createThenableQuery({
          data: [{
            receitas: 5000,
            despesas_variadas: 1200,
            despesas_fixas: 1800,
            saldo: 2000,
            fixas_pagas: 1000,
            fixas_pendentes: 800,
          }],
        });
      }

      if (table === 'vw_financeiro_historico_anual') {
        return createThenableQuery({
          data: [{
            mes_ano: '2026-07',
            receitas: 5000,
            despesas_fixas: 1800,
            despesas_variadas: 1200,
            despesas_totais: 3000,
            saldo: 2000,
          }],
        });
      }

      if (table === 'vw_financeiro_categoria_mensal') {
        return createThenableQuery({
          data: [{ categoria: 'Transporte', valor_total: 200, quantidade_lancamentos: 2, media_lancamento: 100 }],
        });
      }

      if (table === 'vw_financeiro_categoria_anual') {
        return createThenableQuery({
          data: [
            { categoria: 'Alimentacao', valor_total: 2500, quantidade_lancamentos: 20, media_lancamento: 125 },
            { categoria: 'Lazer', valor_total: 300, quantidade_lancamentos: 3, media_lancamento: 100 },
          ],
        });
      }

      return createThenableQuery({ data: [] });
    });

    const app = createApp(financeiroAnalistaHandler);
    const res = await request(app).get('/api/test?mes_ano=2026-07');

    expect(res.status).toBe(200);
    expect(res.body.analista.categorias_ano).toEqual([
      { categoria: 'Alimentacao', valor: 2500, quantidade: 20, media: 125 },
      { categoria: 'Lazer', valor: 300, quantidade: 3, media: 100 },
    ]);
    expect(res.body.analista.cards.categoria_mais_gasta.categoria).toBe('Alimentacao');
    expect(res.body.analista.cards.categoria_menos_gasta.categoria).toBe('Lazer');
  });

  it('mantem resposta quando a view anual ainda nao foi aplicada', async () => {
    fromMock.mockImplementation((table) => {
      if (table === 'vw_financeiro_categoria_anual') {
        return createThenableQuery({ error: { code: '42P01', message: 'relation does not exist' } });
      }

      return createThenableQuery({ data: [] });
    });

    const app = createApp(financeiroAnalistaHandler);
    const res = await request(app).get('/api/test?mes_ano=2026-07');

    expect(res.status).toBe(200);
    expect(res.body.analista.categorias_ano).toEqual([]);
  });
});
