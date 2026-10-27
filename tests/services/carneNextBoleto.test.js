import { describe, expect, it } from 'vitest';
import {
  buildCarneAlertMessage,
  isCarneAlertEligible,
  nextParcelaAposPago,
  shiftIsoDate,
} from '../../features/financeiro/service/carneNextBoleto.js';

const parcelas = [
  { numero: 1, vencimento: '19/11/2026', vencimentoIso: '2026-11-19', valor: 1570.01, linhaDigitavel: '23794.15009 96294.008725 39071.230005 6 16350000157001' },
  { numero: 2, vencimento: '19/12/2026', vencimentoIso: '2026-12-19', valor: 1570.01, linhaDigitavel: 'LINHA-2' },
  { numero: 3, vencimento: '19/01/2027', vencimentoIso: '2027-01-19', valor: 1570.01, linhaDigitavel: 'LINHA-3' },
];

describe('carneNextBoleto', () => {
  it('calcula D-3 do vencimento', () => {
    expect(shiftIsoDate('2026-11-19', -3)).toBe('2026-11-16');
    expect(isCarneAlertEligible('2026-11-19', '2026-11-15')).toBe(false);
    expect(isCarneAlertEligible('2026-11-19', '2026-11-16')).toBe(true);
    expect(isCarneAlertEligible('2026-11-19', '2026-11-25')).toBe(true);
  });

  it('escolhe a primeira parcela não paga após o prefixo pago', () => {
    expect(nextParcelaAposPago(parcelas, new Set()).numero).toBe(1);
    expect(nextParcelaAposPago(parcelas, new Set([1])).numero).toBe(2);
    expect(nextParcelaAposPago(parcelas, new Set([1, 2])).numero).toBe(3);
    expect(nextParcelaAposPago(parcelas, new Set([1, 2, 3]))).toBeNull();
  });

  it('de D-3 em diante avisa faltam X ou já passou Y até pagar', () => {
    const carnes = [{ id: 'carro-juliana', titulo: 'Carro Juliana', banco: 'Bradesco', contrato: 'X', parcelas }];
    expect(buildCarneAlertMessage([], '2026-11-15', carnes)).toBeNull();
    expect(buildCarneAlertMessage([], '2026-11-16', carnes)).toMatch(/Faltam 3 dias/);
    expect(buildCarneAlertMessage([], '2026-11-18', carnes)).toMatch(/Falta 1 dia/);
    expect(buildCarneAlertMessage([], '2026-11-19', carnes)).toMatch(/Vence hoje/);
    expect(buildCarneAlertMessage([], '2026-11-21', carnes)).toMatch(/Já passaram 2 dias/);
    expect(buildCarneAlertMessage(
      [{ carne_id: 'carro-juliana', parcela_numero: 1 }],
      '2026-11-21',
      carnes,
    )).toBeNull();
    expect(buildCarneAlertMessage(
      [{ carne_id: 'carro-juliana', parcela_numero: 1 }],
      '2026-12-16',
      carnes,
    )).toMatch(/Parcela 2/);
  });
});
