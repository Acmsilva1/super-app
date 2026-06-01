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

import financeiroHandler from '../../api/financeiro.js';

function createApp(handler) {
  const app = express();
  app.use(express.json());
  app.all('/api/test', async (req, res) => handler(req, res));
  return app;
}

describe('API do financeiro', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('aplica debito no saldo e grava uma nova linha de movimento', async () => {
    const movementInsert = vi.fn((payload) => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 2,
            ...payload,
          },
          error: null,
        }),
      })),
    }));
    const movementSelect = vi.fn(() => ({
      order: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue({
            data: [{
              id: 1,
              saldo_anterior: 0,
              delta: 1000,
              saldo_atual: 1000,
              valor: 1000,
              negativo: false,
              tipo_movimento: 'manual',
              origem_tipo: 'saldo_conta_corrente',
              origem_id: '1',
              descricao: 'Saldo inicial',
              created_at: '2026-05-31T12:00:00.000Z',
              updated_at: '2026-05-31T12:00:00.000Z',
            }],
            error: null,
          }),
        })),
      })),
    }));
    const financeInsert = vi.fn((payload) => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 55,
            ...payload,
          },
          error: null,
        }),
      })),
    }));

    fromMock.mockImplementation((table) => {
      if (table === 'tb_saldo_conta_corrente_movimentos') {
        return {
          select: movementSelect,
          insert: movementInsert,
        };
      }
      if (table === 'tb_saldo_conta_corrente') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({
                data: [{
                  id: 1,
                  valor: 1000,
                  negativo: false,
                  updated_at: '2026-05-31T12:00:00.000Z',
                }],
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === 'tb_financas') {
        return {
          insert: financeInsert,
        };
      }
      throw new Error(`Tabela inesperada: ${table}`);
    });

    const app = createApp(financeiroHandler);
    const res = await request(app)
      .post('/api/test')
      .send({
        tipo_registro: 'gasto_variado',
        descricao: 'Mercado',
        valor: 200,
        metodo_pagamento: 'debito_pix',
        categoria: 'Compras',
        data_lancamento: '2026-05-31',
        created_at: '2026-05-31T12:00:00.000Z',
        mes_ano: '2026-05',
      });

    expect(res.status).toBe(201);
    expect(movementInsert).toHaveBeenCalledWith(expect.objectContaining({
      saldo_anterior: 1000,
      delta: -200,
      saldo_atual: 800,
      valor: 800,
      negativo: false,
      tipo_movimento: 'insercao',
      origem_tipo: 'gasto_variado',
      descricao: 'Mercado',
    }));
    expect(res.body.tipo_registro).toBe('gasto_variado');
  });

  it('grava o saldo inicial na linha 1 e nao cria movimento duplicado no primeiro cadastro', async () => {
    const snapshotInsert = vi.fn((payload) => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 1,
            ...payload,
          },
          error: null,
        }),
      })),
    }));
    const movementInsert = vi.fn();
    const movementSelect = vi.fn(() => ({
      order: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        })),
      })),
    }));

    fromMock.mockImplementation((table) => {
      if (table === 'tb_saldo_conta_corrente_movimentos') {
        return {
          select: movementSelect,
          insert: movementInsert,
        };
      }
      if (table === 'tb_saldo_conta_corrente') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            })),
          })),
          insert: snapshotInsert,
        };
      }
      throw new Error(`Tabela inesperada: ${table}`);
    });

    const app = createApp(financeiroHandler);
    const res = await request(app)
      .post('/api/test')
      .send({
        tipo_registro: 'saldo_conta_corrente',
        valor: 1000,
        negativo: false,
      });

    expect(res.status).toBe(201);
    expect(snapshotInsert).toHaveBeenCalledWith(expect.objectContaining({
      id: 1,
      valor: 1000,
      negativo: false,
    }));
    expect(movementInsert).not.toHaveBeenCalled();
    expect(res.body.tipo_registro).toBe('saldo_conta_corrente');
  });
});
