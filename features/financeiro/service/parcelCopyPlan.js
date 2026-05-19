/**
 * Regras usadas ao copiar despesas fixas do mês M-1 para M (mesmo código conceitual que no cliente).
 *
 * @param {{ parcela_atual?: unknown, parcela_total?: unknown }} row Linha do mês anterior.
 * @returns {{ skip: false, parcelas: boolean, parcela_atual: number|null, parcela_total: number|null }
 *   | { skip: true, reason: 'last'|'invalid' }}
 */
export function parcelCopyPlanFromPreviousMonthRow(row) {
  const isContaFixa = row?.conta_fixa === true || row?.conta_fixa === 'true';
  const pt = Number(row?.parcela_total);
  const pa = Number(row?.parcela_atual);
  const hasParcelas = Number.isFinite(pt) && Number.isFinite(pa) && pt >= 1 && pa >= 1;

  if (isContaFixa) {
    return { skip: false, conta_fixa: true, parcelas: false, parcela_atual: null, parcela_total: null };
  }

  if (hasParcelas) {
    if (pa > pt) return { skip: true, reason: 'invalid' };
    if (pa >= pt) return { skip: true, reason: 'last' };
    return { skip: false, conta_fixa: false, parcelas: true, parcela_atual: pa + 1, parcela_total: pt };
  }

  return { skip: true, reason: 'not_recurring' };
}
