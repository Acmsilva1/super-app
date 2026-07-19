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

function createDespesaFixaParceladaTableMock({ currentRow, updatedRow = null, futureRows = [] }) {
  const select = vi.fn((fields) => ({
    eq: vi.fn((column, value) => {
      if (column === 'id') {
        return {
          single: vi.fn().mockResolvedValue({
            data: currentRow && String(value) === String(currentRow.id) ? currentRow : null,
            error: null,
          }),
        };
      }
      if (column === 'parcela_total') {
        return Promise.resolve({
          data: Number(value) === Number(currentRow?.parcela_total) ? futureRows : [],
          error: null,
        });
      }
      throw new Error(`Filtro inesperado em select: ${column}`);
    }),
  }));

  const update = vi.fn((payload) => ({
    eq: vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: updatedRow || { ...currentRow, ...payload },
          error: null,
        }),
      })),
    })),
  }));

  const deleteEq = vi.fn().mockResolvedValue({ error: null });
  const deleteIn = vi.fn().mockResolvedValue({ error: null });
  const deleteFn = vi.fn(() => ({
    eq: deleteEq,
    in: deleteIn,
  }));

  return {
    select,
    update,
    delete: deleteFn,
    deleteEq,
    deleteIn,
  };
}

describe('API do financeiro', () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it('GET health retorna status sem consultar Supabase', async () => {
    const app = createApp(financeiroHandler);
    const res = await request(app).get('/api/test?health=1');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, service: 'financeiro' });
    expect(fromMock).not.toHaveBeenCalled();
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

  it('cria um registro de compra em tb_compras', async () => {
    const compraInsert = vi.fn((payload) => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: 12,
            ...payload,
          },
          error: null,
        }),
      })),
    }));

    fromMock.mockImplementation((table) => {
      if (table === 'tb_compras') {
        return {
          insert: compraInsert,
        };
      }
      throw new Error('Tabela inesperada: ' + table);
    });

    const app = createApp(financeiroHandler);
    const res = await request(app)
      .post('/api/test')
      .send({
        tipo_registro: 'compra',
        descricao: 'Geladeira',
        valor: 2800,
        data_lancamento: '2026-07-10',
        created_at: '2026-07-10T15:00:00.000Z',
      });

    expect(res.status).toBe(201);
    expect(compraInsert).toHaveBeenCalledWith(expect.objectContaining({
      descricao: 'Geladeira',
      valor: 2800,
      data_lancamento: '2026-07-10',
    }));
    expect(res.body.tipo_registro).toBe('compra');
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

  it('realoca uma compra para debito pix criando em financas e removendo de compras', async () => {
    const financeInsert = vi.fn((payload) => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: { id: 88, ...payload },
          error: null,
        }),
      })),
    }));
    const compraDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const compraDelete = vi.fn(() => ({ eq: compraDeleteEq }));

    fromMock.mockImplementation((table) => {
      if (table === 'tb_financas') return { insert: financeInsert };
      if (table === 'tb_compras') return { delete: compraDelete };
      throw new Error(`Tabela inesperada: ${table}`);
    });

    const app = createApp(financeiroHandler);
    const res = await request(app)
      .patch('/api/test')
      .send({
        id: 12,
        original_tipo_registro: 'compra',
        tipo_registro: 'gasto_variado',
        descricao: 'Mercado corrigido',
        valor: 145.5,
        metodo_pagamento: 'debito_pix',
        categoria: 'Compras',
        data_lancamento: '2026-07-10',
        created_at: '2026-07-10T15:00:00.000Z',
      });

    expect(res.status).toBe(200);
    expect(financeInsert).toHaveBeenCalledWith(expect.objectContaining({
      descricao: 'Mercado corrigido',
      tipo: 'despesa',
      metodo_pagamento: 'debito_pix',
    }));
    expect(compraDeleteEq).toHaveBeenCalledWith('id', 12);
    expect(res.body).toMatchObject({ tipo_registro: 'gasto_variado', realocado: true });
  });

  it('realoca uma despesa fixa para compras criando em compras e removendo da origem', async () => {
    const compraInsert = vi.fn((payload) => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: { id: 77, ...payload },
          error: null,
        }),
      })),
    }));
    const fixaDeleteEq = vi.fn().mockResolvedValue({ error: null });
    const fixaDelete = vi.fn(() => ({ eq: fixaDeleteEq }));

    fromMock.mockImplementation((table) => {
      if (table === 'tb_compras') return { insert: compraInsert };
      if (table === 'tb_despesas_fixas') return { delete: fixaDelete };
      throw new Error(`Tabela inesperada: ${table}`);
    });

    const app = createApp(financeiroHandler);
    const res = await request(app)
      .patch('/api/test')
      .send({
        id: 34,
        original_tipo_registro: 'despesa_fixa',
        tipo_registro: 'compra',
        descricao: 'Monitor',
        valor: 900,
        data_lancamento: '2026-07-12',
        created_at: '2026-07-12T12:00:00.000Z',
      });

    expect(res.status).toBe(200);
    expect(compraInsert).toHaveBeenCalledWith(expect.objectContaining({
      descricao: 'Monitor',
      valor: 900,
      data_lancamento: '2026-07-12',
    }));
    expect(fixaDeleteEq).toHaveBeenCalledWith('id', 34);
    expect(res.body).toMatchObject({ tipo_registro: 'compra', realocado: true });
  });

  it('remove um registro financeiro sem tocar no ledger paralelo', async () => {
    const financeDelete = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({
        error: null,
      }),
    }));

    fromMock.mockImplementation((table) => {
      if (table === 'tb_financas') {
        return {
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

  it('ao desmarcar parcelas remove somente as parcelas futuras da mesma serie', async () => {
    const currentRow = {
      id: 202,
      descricao: 'Notebook',
      valor: 250,
      status: 'pendente',
      conta_fixa: false,
      parcela_atual: 2,
      parcela_total: 4,
      created_at: '2026-06-01T12:00:00.000Z',
    };
    const futureRows = [
      currentRow,
      {
        id: 303,
        descricao: 'Notebook',
        parcela_atual: 3,
        parcela_total: 4,
        created_at: '2026-07-01T12:00:00.000Z',
      },
      {
        id: 404,
        descricao: 'Notebook',
        parcela_atual: 4,
        parcela_total: 4,
        created_at: '2026-08-01T12:00:00.000Z',
      },
      {
        id: 909,
        descricao: 'Outra compra',
        parcela_atual: 3,
        parcela_total: 4,
        created_at: '2026-07-01T12:00:00.000Z',
      },
    ];
    const tableMock = createDespesaFixaParceladaTableMock({
      currentRow,
      updatedRow: {
        ...currentRow,
        parcela_atual: null,
        parcela_total: null,
      },
      futureRows,
    });

    fromMock.mockImplementation((table) => {
      if (table === 'tb_despesas_fixas') return tableMock;
      throw new Error(`Tabela inesperada: ${table}`);
    });

    const app = createApp(financeiroHandler);
    const res = await request(app)
      .patch('/api/test')
      .send({
        id: 202,
        tipo_registro: 'despesa_fixa',
        descricao: 'Notebook',
        parcelas: false,
      });

    expect(res.status).toBe(200);
    expect(tableMock.update).toHaveBeenCalled();
    expect(tableMock.deleteIn).toHaveBeenCalledWith('id', [303, 404]);
    expect(tableMock.deleteEq).not.toHaveBeenCalled();
  });

  it('ao excluir uma parcela remove a atual e limpa apenas as futuras da serie', async () => {
    const currentRow = {
      id: 202,
      descricao: 'Notebook',
      valor: 250,
      status: 'pendente',
      conta_fixa: false,
      parcela_atual: 2,
      parcela_total: 4,
      created_at: '2026-06-01T12:00:00.000Z',
    };
    const futureRows = [
      currentRow,
      {
        id: 303,
        descricao: 'Notebook',
        parcela_atual: 3,
        parcela_total: 4,
        created_at: '2026-07-01T12:00:00.000Z',
      },
      {
        id: 404,
        descricao: 'Notebook',
        parcela_atual: 4,
        parcela_total: 4,
        created_at: '2026-08-01T12:00:00.000Z',
      },
      {
        id: 505,
        descricao: 'Notebook',
        parcela_atual: 1,
        parcela_total: 4,
        created_at: '2026-05-01T12:00:00.000Z',
      },
    ];
    const tableMock = createDespesaFixaParceladaTableMock({ currentRow, futureRows });

    fromMock.mockImplementation((table) => {
      if (table === 'tb_despesas_fixas') return tableMock;
      throw new Error(`Tabela inesperada: ${table}`);
    });

    const app = createApp(financeiroHandler);
    const res = await request(app)
      .delete('/api/test')
      .send({
        id: 202,
        tipo_registro: 'despesa_fixa',
      });

    expect(res.status).toBe(200);
    expect(tableMock.deleteEq).toHaveBeenCalledWith('id', 202);
    expect(tableMock.deleteIn).toHaveBeenCalledWith('id', [303, 404]);
    expect(res.body.ok).toBe(true);
  });

  function createThenableQuery({ data = [], track } = {}) {
    const result = Promise.resolve({ data, error: null });
    const builder = {
      select: vi.fn((cols) => {
        track?.selects?.push(cols);
        return builder;
      }),
      eq: vi.fn(() => builder),
      gte: vi.fn((col, value) => {
        track?.filters?.push({ op: 'gte', col, value });
        return builder;
      }),
      lte: vi.fn((col, value) => {
        track?.filters?.push({ op: 'lte', col, value });
        return builder;
      }),
      or: vi.fn((expr) => {
        track?.ors?.push(expr);
        return builder;
      }),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      then: result.then.bind(result),
      catch: result.catch.bind(result),
    };
    return builder;
  }

  it('GET do mes materializa so o mes aberto e filtra periodos no SQL', async () => {
    const track = {
      tables: [],
      selects: [],
      filters: [],
      ors: [],
    };

    fromMock.mockImplementation((table) => {
      track.tables.push(table);
      return createThenableQuery({
        data: [],
        track,
      });
    });

    const app = createApp(financeiroHandler);
    const res = await request(app).get('/api/test?mes_ano=2026-07&bi=1');

    expect(res.status).toBe(200);
    expect(res.body.mes_ano).toBe('2026-07');
    expect(Array.isArray(res.body.graficos_anuais)).toBe(true);
    expect(res.body.graficos_anuais).toHaveLength(12);

    const despesasCalls = track.tables.filter((t) => t === 'tb_despesas_fixas').length;
    // materializacao (ano+mes) + leitura do mes + leitura leve do ano = 4 (nao 24+)
    expect(despesasCalls).toBeLessThanOrEqual(4);
    expect(despesasCalls).toBeGreaterThanOrEqual(3);

    expect(track.ors.length).toBeGreaterThan(0);
    expect(track.selects.some((cols) => String(cols).includes('tipo') && String(cols).includes('valor'))).toBe(true);
  });

  it('GET sem bi nao busca dataset anual leve', async () => {
    const track = { tables: [], selects: [], filters: [], ors: [] };

    fromMock.mockImplementation((table) => {
      track.tables.push(table);
      return createThenableQuery({ data: [], track });
    });

    const app = createApp(financeiroHandler);
    const res = await request(app).get('/api/test?mes_ano=2026-07');

    expect(res.status).toBe(200);
    expect(res.body.graficos_anuais).toHaveLength(12);
    const lightAnnualSelects = track.selects.filter((cols) => cols === 'tipo, valor, data_lancamento, created_at'
      || cols === 'valor, created_at');
    expect(lightAnnualSelects).toHaveLength(0);
  });
});
