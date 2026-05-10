import { describe, expect, it } from 'vitest';

import { parcelCopyPlanFromPreviousMonthRow } from '../../features/financeiro/service/parcelCopyPlan.js';

describe('parcelCopyPlanFromPreviousMonthRow', () => {
  it('sem parcelas no registro copia sem parcelamento', () => {
    const out = parcelCopyPlanFromPreviousMonthRow({ parcela_atual: null, parcela_total: null });
    expect(out.skip).toBe(false);
    expect(out.parcelas).toBe(false);
  });

  it('Parcela 4 de 5 vira 5 de 5 no destino', () => {
    const out = parcelCopyPlanFromPreviousMonthRow({ parcela_atual: 4, parcela_total: 5 });
    expect(out.skip).toBe(false);
    expect(out.parcelas).toBe(true);
    expect(out.parcela_atual).toBe(5);
    expect(out.parcela_total).toBe(5);
  });

  it('Parcela 5 de 5 não é copiada', () => {
    const out = parcelCopyPlanFromPreviousMonthRow({ parcela_atual: 5, parcela_total: 5 });
    expect(out.skip).toBe(true);
    expect(out.reason).toBe('last');
  });
});
