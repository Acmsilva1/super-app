import { describe, expect, it } from 'vitest';
import { aggregateHistory, brazilMonth, implicitRate, monthOffset, simulate, validateProposal } from '../../features/financeiro/service/simulador.js';
const proposal = { nome: 'Carro', preco: 20000, entrada: 0, parcelas: 60, parcela: 1000, historico: '6', horizonte: 6 };
const history = [7000, 14500, 8000, 16000, 6000, 8500].map((gastos, i) => ({ mes: monthOffset('2026-10', i - 6), receitas: 15000, gastos }));
describe('Simulador matemático', () => {
  it('distingue folga média de capacidade em cada mês', () => {
    const r = simulate(proposal, history, '2026-10');
    expect(r.resumo).toMatchObject({ receitas: 15000, gastos: 10000, sobra: 5000, cobertos: 4, negativos: 1, cobertura: 66.67, consumo: 20, menor: -1000 });
    expect(r.resumo.desvio).toBeGreaterThan(3000);
    expect(r.compra).toMatchObject({ total: 60000, acrescimo: 40000, percentual: 200 });
    expect(r.compra.taxaMensal).toBeGreaterThan(4);
  });
  it('não transforma meses ausentes em gasto zero ou mistura mês atual', () => {
    const r = simulate(proposal, [history[0], { mes: '2026-10', receitas: 999999, gastos: 0 }], '2026-10');
    expect(r.resumo.meses).toBe(1);
    expect(r.resumo.receitas).toBe(15000);
    expect(r.avisos.join(' ')).toContain('5 mês(es) sem registros');
  });
  it('calcula tendência usando distância real entre meses com lacunas', () => {
    const r = simulate(proposal, [{ mes: '2026-04', receitas: 15000, gastos: 10000 }, { mes: '2026-09', receitas: 15000, gastos: 12000 }], '2026-10');
    expect(r.resumo.tendenciaSobra).toBe(-400);
    expect(r.projecao[0]).toMatchObject({ mes: '2026-11', gastos: 12800, media: 3000, tendencia: 1200 });
  });
  it('aplica entrada uma vez e encerra a parcela no prazo', () => {
    const r = simulate({ ...proposal, entrada: 5000, parcelas: 2, horizonte: 12 }, history, '2026-10');
    expect(r.projecao).toHaveLength(12);
    expect(r.projecao.slice(0, 3).map(p => p.compromisso)).toEqual([6000, 1000, 0]);
  });
  it('atualiza a janela e preserva resultado anterior', () => {
    const previous = simulate(proposal, history, '2026-10');
    const next = simulate(proposal, [...history, { mes: '2026-10', receitas: 16000, gastos: 9000 }], '2026-11');
    expect(previous.resumo.sobra).toBe(5000);
    expect(next.historico[0].mes).toBe('2026-05');
    expect(next.historico.at(-1).mes).toBe('2026-10');
    expect(simulate({ ...proposal, historico: 'all' }, [...history, { mes: '2026-10', receitas: 16000, gastos: 9000 }], '2026-11').resumo.meses).toBe(7);
  });
  it('agrega centavos e usa data de lançamento com contas fixas', () => {
    expect(aggregateHistory([{ valor: 0.1, tipo: 'receita', data_lancamento: '2026-09-01', created_at: '2026-10-01' }, { valor: 0.2, tipo: 'receita', data_lancamento: '2026-09-02' }], [{ valor: 0.15, created_at: '2026-09-01' }], '2026-10')).toEqual([{ mes: '2026-09', receitas: 0.3, gastos: 0.15 }]);
    expect(() => aggregateHistory([{ valor: 10, created_at: '2026-02-30' }], [], '2026-10')).toThrow();
  });
  it('trata orçamento deficitário, vazio e juros zero', () => {
    expect(simulate(proposal, [], '2026-10').resumo).toBeNull();
    expect(simulate(proposal, [{ mes: '2026-09', receitas: 100, gastos: 200 }], '2026-10').resumo.consumo).toBeNull();
    expect(implicitRate(12000, 1000, 12)).toBe(0);
    expect(implicitRate(12000, 500, 12)).toBeNull();
    expect(implicitRate(10000, 888.49, 12)).toBeCloseTo(1, 2);
  });
  it('rejeita entradas inválidas e usa calendário brasileiro', () => {
    for (const changes of [{ preco: Infinity }, { parcela: -1 }, { parcela: 0.001 }, { entrada: 20000 }, { parcelas: 1.5 }, { horizonte: 24 }, { historico: '3' }]) expect(() => validateProposal({ ...proposal, ...changes })).toThrow();
    expect(brazilMonth(new Date('2026-11-01T01:00:00Z'))).toBe('2026-10');
  });
});
