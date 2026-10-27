import { CARRO_JULIANA_PARCELAS } from '../data/carroJulianaParcelas.js';

/** Catálogo usado pelo alerta (fonte PDF real). */
export const CARNES_PARA_ALERTA = [
  {
    id: 'carro-juliana',
    titulo: 'Carro Juliana',
    banco: 'Bradesco Financiamento',
    contrato: '0001 42.5.029738-4',
    parcelas: CARRO_JULIANA_PARCELAS,
  },
];

/** Soma dias a uma data ISO (calendário), sem fuso. */
export function shiftIsoDate(iso, deltaDays) {
  const [year, month, day] = String(iso || '').split('-').map(Number);
  if (!year || !month || !day) return null;
  const utc = new Date(Date.UTC(year, month - 1, day + Number(deltaDays)));
  return utc.toISOString().slice(0, 10);
}

/** Diferença em dias de calendário: toIso - fromIso. */
export function daysBetweenIso(fromIso, toIso) {
  const [y1, m1, d1] = String(fromIso || '').split('-').map(Number);
  const [y2, m2, d2] = String(toIso || '').split('-').map(Number);
  if (![y1, m1, d1, y2, m2, d2].every(Number.isFinite)) return null;
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/**
 * Elegível a partir de D-3 do vencimento (hoje >= vencimento - 3 dias),
 * inclusive após o vencimento, até a parcela ser marcada como paga.
 */
export function isCarneAlertEligible(vencimentoIso, todayIso) {
  const start = shiftIsoDate(vencimentoIso, -3);
  return Boolean(start && todayIso && todayIso >= start);
}

/**
 * Próxima parcela em aberto: a primeira não paga na ordem do carnê
 * (sempre a seguinte ao último pagamento contíguo desde a parcela 1).
 */
export function nextParcelaAposPago(parcelas, paidNumeros) {
  const paid = paidNumeros instanceof Set
    ? paidNumeros
    : new Set([...(paidNumeros || [])].map(Number).filter((n) => Number.isFinite(n)));
  const sorted = [...(parcelas || [])].sort((a, b) => a.numero - b.numero);
  return sorted.find((row) => !paid.has(Number(row.numero))) || null;
}

export function paidSetForCarne(pagoRows, carneId) {
  const set = new Set();
  for (const row of pagoRows || []) {
    if (String(row.carne_id) === String(carneId) && row.pago !== false) {
      set.add(Number(row.parcela_numero));
    }
  }
  return set;
}

function money(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
}

function prazoTexto(vencimentoIso, vencimentoLabel, todayIso) {
  const daysLeft = daysBetweenIso(todayIso, vencimentoIso);
  const label = vencimentoLabel || String(vencimentoIso).split('-').reverse().join('/');
  if (daysLeft == null) return `Vencimento: ${label}`;
  if (daysLeft > 1) return `Faltam ${daysLeft} dias para o vencimento (${label}).`;
  if (daysLeft === 1) return `Falta 1 dia para o vencimento (${label}).`;
  if (daysLeft === 0) return `Vence hoje (${label}).`;
  if (daysLeft === -1) return `Já passou 1 dia do vencimento (${label}).`;
  return `Já passaram ${Math.abs(daysLeft)} dias do vencimento (${label}).`;
}

/** Leitura service-role para o scheduler (sem importar supabase no módulo). */
export async function listCarnePagoForUser(client, userId) {
  const { data, error } = await client.from('tb_financeiro_carne_pago')
    .select('carne_id,parcela_numero')
    .eq('user_id', userId)
    .order('carne_id')
    .order('parcela_numero');
  if (['42P01', 'PGRST205', '42703', 'PGRST204'].includes(error?.code)) return [];
  if (error) throw new Error('financeiro_alerts_carne_pago_unavailable');
  return data || [];
}

/**
 * Linha(s) do carnê no alerta financeiro.
 * Parâmetro: vencimentoIso da próxima parcela em aberto (ex.: 2026-11-19).
 * Elegível de D-3 (ex.: 2026-11-16) até marcar como paga.
 */
export function buildCarneAlertMessage(pagoRows, todayIso, carnes = CARNES_PARA_ALERTA) {
  const blocks = [];
  for (const carne of carnes) {
    const next = nextParcelaAposPago(carne.parcelas, paidSetForCarne(pagoRows, carne.id));
    if (!next?.vencimentoIso) continue;
    if (!isCarneAlertEligible(next.vencimentoIso, todayIso)) continue;
    blocks.push([
      `📄 Carnê · ${carne.titulo}`,
      `${carne.banco} · ${carne.contrato}`,
      `Parcela ${next.numero} · ${money(next.valor)}`,
      prazoTexto(next.vencimentoIso, next.vencimento, todayIso),
      next.linhaDigitavel ? `Linha digitável: ${next.linhaDigitavel}` : null,
    ].filter(Boolean).join('\n'));
  }
  return blocks.length ? blocks.join('\n\n') : null;
}
