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

  it('cria um registro financeiro sem depender de ledger paralelo', async () => {
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
      });

    expect(res.status).toBe(201);
    expect(financeInsert).toHaveBeenCalledWith(expect.objectContaining({
      descricao: 'Mercado',
      valor: 200,
      metodo_pagamento: 'debito_pix',
    }));
    expect(res.body.tipo_registro).toBe('gasto_variado');
  });

  it('atualiza um registro financeiro sem chamar a tabela de saldo', async () => {
    const financeUpdate = vi.fn(() => ({
      eq: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 99,
              tipo_registro: 'receita',
              tipo: 'receita',
              descricao: 'Salario',
              valor: 2500,
              created_at: '2026-05-31T12:00:00.000Z',
            },
            error: null,
          }),
        })),
      })),
    }));

    fromMock.mockImplementation((table) => {
      if (table === 'tb_financas') {
        return {
          update: financeUpdate,
        };
      }
      throw new Error(`Tabela inesperada: ${table}`);
    });

    const app = createApp(financeiroHandler);
    const res = await request(app)
      .patch('/api/test')
      .send({
        id: 99,
        tipo_registro: 'receita',
        descricao: 'Salario',
        valor: 2500,
      });

    expect(res.status).toBe(200);
    expect(financeUpdate).toHaveBeenCalled();
    expect(res.body.tipo_registro).toBe('receita');
  });

  it('remove um registro financeiro sem tocar no ledger paralelo', async () => {
    const financeSelect = vi.fn(() => ({
      eq: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue({
          data: [{
            id: 99,
            tipo_registro: 'gasto_variado',
            tipo: 'despesa',
            descricao: 'Cafe',
            valor: 1,
            metodo_pagamento: 'debito_pix',
            status: null,
            created_at: '2026-05-31T12:00:00.000Z',
          }],
          error: null,
        }),
      })),
    }));
    const financeDelete = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({
        error: null,
      }),
    }));

    fromMock.mockImplementation((table) => {
      if (table === 'tb_financas') {
        return {
          select: financeSelect,
          delete: financeDelete,
        };
      }
      throw new Error(`Tabela inesperada: ${table}`);
    });

    const app = createApp(financeiroHandler);
    const res = await request(app)
      .delete('/api/test')
      .send({
        id: 99,
        tipo_registro: 'gasto_variado',
      });

    expect(res.status).toBe(200);
    expect(financeDelete).toHaveBeenCalled();
    expect(res.body.ok).toBe(true);
  });
});
