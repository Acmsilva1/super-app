import { describe, expect, it } from 'vitest';

import { buildFinanceiroAnalise, defaultFinanceiroPesos } from '../../features/financeiro/service/financeiroAnalistaService.js';

describe('financeiroAnalistaService', () => {
  it('gera analise mensal e anual com projeção', () => {
    const out = buildFinanceiroAnalise({
      mesAno: '2026-06',
      todayIso: '2026-06-16',
      receitasMes: [
        { valor: 3000 },
      ],
      gastosMes: [
        { valor: 900, categoria: 'Mercado' },
        { valor: 400, categoria: 'Transporte' },
      ],
      despesasFixasMes: [
        { valor: 1200 },
      ],
      receitasAno: [
        { valor: 3000 },
        { valor: 3100 },
        { valor: 2900 },
      ],
      gastosAno: [
        { valor: 900, categoria: 'Mercado' },
        { valor: 400, categoria: 'Transporte' },
        { valor: 800, categoria: 'Mercado' },
      ],
      despesasFixasAno: [
        { valor: 1200 },
        { valor: 1250 },
      ],
    });

    expect(out.periodo.mes_ano).toBe('2026-06');
    expect(out.resumo_mensal.receitas).toBe(3000);
    expect(out.resumo_mensal.despesas_totais).toBe(2500);
    expect(out.projecao.ativa).toBe(true);
    expect(out.projecao.saldo_projetado).toBeTypeOf('number');
    expect(out.sinais.length).toBeGreaterThan(0);
    expect(out.recomendacoes.length).toBeGreaterThan(0);
  });

  it('ajusta pesos quando o ciclo anterior erra para baixo', () => {
    const baseline = defaultFinanceiroPesos();
    const out = buildFinanceiroAnalise({
      mesAno: '2026-06',
      todayIso: '2026-06-16',
      receitasMes: [
        { valor: 2400 },
      ],
      gastosMes: [
        { valor: 1100, categoria: 'Mercado' },
        { valor: 900, categoria: 'Transporte' },
      ],
      despesasFixasMes: [
        { valor: 800 },
      ],
      receitasAno: [
        { valor: 2400 },
        { valor: 2500 },
      ],
      gastosAno: [
        { valor: 1100, categoria: 'Mercado' },
        { valor: 900, categoria: 'Transporte' },
      ],
      despesasFixasAno: [
        { valor: 800 },
      ],
      previousState: {
        saldo_projetado: 1000,
        receitas_projetadas: 3200,
        despesas_projetadas: 1800,
      },
    });

    expect(out.modelo.feedback.tem_feedback).toBe(true);
    expect(out.modelo.feedback.saldo_erro).toBeLessThan(0);
    expect(out.modelo.pesos.despesas_fixas).toBeGreaterThan(baseline.despesas_fixas);
  });

  it('zera aprendizado quando ainda nao houve ciclo real', () => {
    const out = buildFinanceiroAnalise({
      mesAno: '2026-06',
      todayIso: '2026-06-16',
      receitasMes: [{ valor: 2000 }],
      gastosMes: [{ valor: 700, categoria: 'Mercado' }],
      despesasFixasMes: [{ valor: 500 }],
    });

    expect(out.modelo.aprendizado.ciclos_processados).toBe(0);
    expect(out.modelo.aprendizado.percentual).toBe(0);
  });
});
