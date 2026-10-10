import { describe, expect, it } from 'vitest';
import { formatMoneyValue, maskMoneyInput, parseMoneyInput } from '../../features/financeiro/simuladorUi.js';

describe('Valores monetários do simulador', () => {
  it('formata a sequência digitada em reais e centavos', () => {
    expect(['1', '10', '100', '1000', '10000', '100000'].map(maskMoneyInput)).toEqual(['0,01', '0,10', '1,00', '10,00', '100,00', '1.000,00']);
    expect(maskMoneyInput('2000000')).toBe('20.000,00');
    expect(maskMoneyInput('')).toBe('');
    expect(maskMoneyInput('R$ 1.234,56')).toBe('1.234,56');
  });
  it('envia valores numéricos corretos para o Node, incluindo entrada opcional', () => {
    expect(parseMoneyInput('20.000,00')).toBe(20000);
    expect(parseMoneyInput('1.234,56')).toBe(1234.56);
    expect(parseMoneyInput('0,01')).toBe(0.01);
    expect(parseMoneyInput('')).toBe(0);
    for (const value of ['1,234.56', '-1,00', 'abc']) expect(() => parseMoneyInput(value)).toThrow();
  });
  it('reabre valores salvos com centavos e sem multiplicar a parcela', () => {
    for (const value of [0, 0.01, 1000, 1234.56, 20000, 1000000000]) expect(parseMoneyInput(formatMoneyValue(value))).toBe(value);
  });
});
