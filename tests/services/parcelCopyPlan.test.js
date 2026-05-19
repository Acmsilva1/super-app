import { describe, expect, it } from 'vitest';

import { parcelCopyPlanFromPreviousMonthRow } from '../../features/financeiro/service/parcelCopyPlan.js';

describe('parcelCopyPlanFromPreviousMonthRow', () => {
  it('sem conta fixa nem parcelas no registro deve pular (não recorrente)', () => {
    const out = parcelCopyPlanFromPreviousMonthRow({ conta_fixa: false, parcela_atual: null, parcela_total: null });
    expect(out.skip).toBe(true);
    expect(out.reason).toBe('not_recurring');
  });

  it('com conta fixa ativada copia mantendo conta fixa', () => {
    const out = parcelCopyPlanFromPreviousMonthRow({ conta_fixa: true, parcela_atual: null, parcela_total: null });
    expect(out.skip).toBe(false);
    expect(out.conta_fixa).toBe(true);
    expect(out.parcelas).toBe(false);
  });

  it('Parcela 4 de 5 vira 5 de 5 no destino', () => {
    const out = parcelCopyPlanFromPreviousMonthRow({ conta_fixa: false, parcela_atual: 4, parcela_total: 5 });
    expect(out.skip).toBe(false);
    expect(out.parcelas).toBe(true);
    expect(out.parcela_atual).toBe(5);
    expect(out.parcela_total).toBe(5);
    expect(out.conta_fixa).toBe(false);
  });

  it('Parcela 5 de 5 não é copiada', () => {
    const out = parcelCopyPlanFromPreviousMonthRow({ conta_fixa: false, parcela_atual: 5, parcela_total: 5 });
    expect(out.skip).toBe(true);
    expect(out.reason).toBe('last');
  });
});
