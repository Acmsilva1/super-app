import { describe, it, expect } from 'vitest';
import { monthTotals } from '../../features/financeiro/tendenciaUi.js';

describe('totais do gráfico anual', () => {
  it('soma fixas e extrato, sem incluir poupança', () => {
    const total = monthTotals({ mes_ano: '2026-01', dashboard: { receitas: 15000, despesas_fixas: 8000.10, despesas_variadas: 2000.20 }, tabelas: { receitas: [{}] }, poupanca: { total: 5000 } });
    expect(total).toMatchObject({ receita: 15000, despesa: 10000.30, hasData: true });
  });
  it('distingue mês sem registros de mês com valor zero', () => {
    expect(monthTotals({ dashboard: {}, tabelas: {} }).hasData).toBe(false);
    expect(monthTotals({ dashboard: {}, tabelas: { receitas: [{ valor: 0 }] } }).hasData).toBe(true);
  });
  it('recusa totais inválidos', () => {
    expect(() => monthTotals({ dashboard: { receitas: 'inválido' } })).toThrow();
  });
});
