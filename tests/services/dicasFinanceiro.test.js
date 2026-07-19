import { describe, expect, it } from 'vitest';

import {
  DICAS_FINANCEIRO_FALLBACK,
  buildDicasFinanceiroFromData,
} from '../../components/robo/dicasFinanceiro.js';

describe('buildDicasFinanceiroFromData', () => {
  const fmt = (n) => `R$ ${Number(n).toFixed(2)}`;

  it('gera dicas com maior receita e maior gasto do mes', () => {
    const tips = buildDicasFinanceiroFromData({
      mes_ano: '2026-07',
      dashboard: { receitas: 5000, despesas_fixas: 1200, despesas_variadas: 800, liquido: 3000 },
      tabelas: {
        receitas: [
          { descricao: 'Salario', valor: 4000 },
          { descricao: 'Freelance', valor: 1000 },
        ],
        gastos_variados: [
          { descricao: 'Mercado', valor: 600 },
          { descricao: 'Padaria', valor: 50 },
        ],
        despesas_fixas: [
          { descricao: 'Aluguel', valor: 1500, status: 'pendente' },
          { descricao: 'Internet', valor: 100, status: 'pago' },
        ],
      },
      graficos: {
        categorias_gastos: [{ categoria: 'Alimentação', valor: 650 }],
        pagos_pendentes: { pago: 100, pendente: 1500 },
      },
      poupanca: { total: 2000, meta_ativa: { nome_meta: 'Reserva', valor_meta: 5000, progresso: 0.4 } },
      compras: { total: 320 },
    }, { formatMoney: fmt });

    expect(tips.some((t) => t.includes('Maior receita') && t.includes('Salario'))).toBe(true);
    expect(tips.some((t) => t.includes('Maior gasto variável') && t.includes('Mercado'))).toBe(true);
    expect(tips.some((t) => t.includes('Maior despesa fixa') && t.includes('Aluguel'))).toBe(true);
    expect(tips.some((t) => t.includes('Categoria com mais gastos') && t.includes('Alimentação'))).toBe(true);
    expect(tips.some((t) => t.includes('Meta "Reserva"') && t.includes('40%'))).toBe(true);
    expect(tips.some((t) => t.includes('jul/2026'))).toBe(true);
  });

  it('usa fallback quando nao ha dados', () => {
    const tips = buildDicasFinanceiroFromData({ mes_ano: '2026-07', dashboard: {}, tabelas: {} }, { formatMoney: fmt });
    expect(tips.length).toBeGreaterThanOrEqual(DICAS_FINANCEIRO_FALLBACK.length);
    expect(tips).toEqual(expect.arrayContaining(DICAS_FINANCEIRO_FALLBACK));
  });
});
