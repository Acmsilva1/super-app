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

import { rebuildFinanceiroAnalises } from '../../features/financeiro/service/financeiroRebuildService.js';

function createRowsResult(data) {
  return Promise.resolve({ data, error: null });
}

function createDeleteChain() {
  return {
    delete: vi.fn(() => ({
      not: vi.fn().mockResolvedValue({ error: null }),
    })),
  };
}

describe('financeiroRebuildService', () => {
  beforeEach(() => {
    fromMock.mockReset();
    analistaMock.mockReset();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  });

  it('ignora meses de janeiro no recorte do rebuild', async () => {
    fromMock.mockImplementation((table) => {
      if (table === 'tb_financas') {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              range: vi.fn(() => createRowsResult([
                { created_at: '2026-01-03T10:00:00.000Z' },
                { created_at: '2026-02-03T10:00:00.000Z' },
                { created_at: '2026-03-03T10:00:00.000Z' },
              ])),
            })),
          })),
        };
      }
      if (table === 'tb_despesas_fixas') {
        return {
          select: vi.fn(() => ({
            order: vi.fn(() => ({
              range: vi.fn(() => createRowsResult([
                { created_at: '2026-01-05T10:00:00.000Z' },
                { created_at: '2026-02-05T10:00:00.000Z' },
              ])),
            })),
          })),
        };
      }
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

    const result = await rebuildFinanceiroAnalises();

    expect(result.months.map((item) => item.mes_ano)).toEqual(['2026-02', '2026-03']);
    expect(analistaMock).toHaveBeenCalledTimes(2);
    expect(analistaMock.mock.calls.map((call) => call[0].query.mes_ano)).toEqual(['2026-02', '2026-03']);
  });
});
