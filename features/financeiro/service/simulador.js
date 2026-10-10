// Motor determinístico. Valores monetários agregados em centavos.
export const SIMULADOR_VERSION = '1.0.0-prototipo';
const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
export function monthOffset(month, offset) {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1 + offset, 1)).toISOString().slice(0, 7);
}
export function brazilMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(now);
  return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}`;
}
export function validateProposal(input = {}) {
  const p = { nome: String(input.nome || '').trim(), preco: Number(input.preco), entrada: Number(input.entrada ?? 0), parcelas: Number(input.parcelas), parcela: Number(input.parcela), historico: String(input.historico ?? '6'), horizonte: Number(input.horizonte ?? 6) };
  if (!p.nome || p.nome.length > 120) throw new Error('Informe um nome de até 120 caracteres.');
  if (![p.preco, p.entrada, p.parcela].every(Number.isFinite) || round(p.preco) <= 0 || p.preco > 1e9 || p.entrada < 0 || round(p.entrada) >= round(p.preco) || round(p.parcela) <= 0 || p.parcela > 1e9) throw new Error('Revise preço, entrada e valor da parcela.');
  if (!Number.isInteger(p.parcelas) || p.parcelas < 1 || p.parcelas > 600) throw new Error('Use de 1 a 600 parcelas.');
  if (!['6', '12', 'all'].includes(p.historico) || ![6, 12].includes(p.horizonte)) throw new Error('Período inválido.');
  return { ...p, preco: round(p.preco), entrada: round(p.entrada), parcela: round(p.parcela) };
}
export function aggregateHistory(financas, fixas, currentMonth) {
  const buckets = new Map();
  const add = (row, fixed) => {
    const date = String((fixed ? row.created_at : row.data_lancamento || row.created_at) || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Histórico contém data inválida.');
    const month = date.slice(0, 7);
    if (month >= currentMonth) return;
    const value = Number(row.valor);
    if (!Number.isFinite(value) || value < 0) throw new Error('Histórico contém valor inválido.');
    const item = buckets.get(month) || { mes: month, receitasCent: 0, gastosCent: 0 };
    item[!fixed && row.tipo === 'receita' ? 'receitasCent' : 'gastosCent'] += Math.round(value * 100);
    buckets.set(month, item);
  };
  financas.forEach(row => add(row, false));
  fixas.forEach(row => add(row, true));
  return [...buckets.values()].sort((a, b) => a.mes.localeCompare(b.mes)).map(r => ({ mes: r.mes, receitas: r.receitasCent / 100, gastos: r.gastosCent / 100 }));
}
function fit(rows, key) {
  const first = rows[0].mes;
  const index = month => { const [y, m] = month.split('-').map(Number); const [fy, fm] = first.split('-').map(Number); return (y - fy) * 12 + m - fm; };
  const xs = rows.map(r => index(r.mes));
  const ys = rows.map(r => r[key]);
  const xMean = mean(xs), yMean = mean(ys);
  const denominator = xs.reduce((sum, x) => sum + (x - xMean) ** 2, 0);
  const slope = denominator ? xs.reduce((sum, x, i) => sum + (x - xMean) * (ys[i] - yMean), 0) / denominator : 0;
  return { slope, predict: month => Math.max(0, yMean + slope * (index(month) - xMean)) };
}
// Prestação mensal fixa, primeira parcela um mês após a compra. Não é CET.
export function implicitRate(principal, payment, count) {
  if (payment * count < principal - 0.01) return null;
  if (Math.abs(payment * count - principal) <= 0.01) return 0;
  const pv = rate => payment * (1 - (1 + rate) ** -count) / rate;
  let low = 0, high = 1;
  while (pv(high) > principal && high < 1e14) high *= 2;
  for (let i = 0; i < 100; i++) { const mid = (low + high) / 2; if (pv(mid) > principal) low = mid; else high = mid; }
  return round((low + high) / 2 * 100);
}
export function simulate(input, history, currentMonth = brazilMonth()) {
  const proposal = validateProposal(input);
  const start = proposal.historico === 'all' ? '0000-01' : monthOffset(currentMonth, -Number(proposal.historico));
  const rows = history.filter(r => r.mes >= start && r.mes < currentMonth).map(r => ({ ...r, sobra: round(r.receitas - r.gastos), aposParcela: round(r.receitas - r.gastos - proposal.parcela) }));
  const total = round(proposal.entrada + proposal.parcelas * proposal.parcela);
  const compra = { total, acrescimo: round(total - proposal.preco), percentual: round((total - proposal.preco) / proposal.preco * 100), taxaMensal: implicitRate(proposal.preco - proposal.entrada, proposal.parcela, proposal.parcelas) };
  if (!rows.length) return { version: SIMULADOR_VERSION, proposal, referencia: currentMonth, compra, historico: [], resumo: null, projecao: [], avisos: ['Sem meses anteriores com registros. Cadastre seu histórico para analisar o orçamento.'] };
  const spares = rows.map(r => r.sobra), sorted = [...spares].sort((a, b) => a - b), average = mean(spares);
  const receipts = fit(rows, 'receitas'), expenses = fit(rows, 'gastos');
  const covered = rows.filter(r => r.sobra >= proposal.parcela).length;
  const expected = proposal.historico === 'all' ? (() => { const [y, m] = currentMonth.split('-').map(Number); const [fy, fm] = rows[0].mes.split('-').map(Number); return (y - fy) * 12 + m - fm; })() : Number(proposal.historico);
  const avisos = ['Meses com registros não garantem cadastro completo; o primeiro mês cadastrado pode estar incompleto. Mês atual excluído. Poupança não incluída como renda ou reserva disponível.', 'Projeção estatística: não antecipa fim de parcelas existentes, novas contas ou mudanças de salário. Entrada considerada no primeiro mês projetado.'];
  if (rows.length < expected) avisos.push(`${expected - rows.length} mês(es) sem registros excluído(s), sem presumir gasto zero.`);
  if (rows.length < 3) avisos.push('Poucos meses para avaliar tendência; interprete a projeção com cautela.');
  const resumo = { meses: rows.length, receitas: round(mean(rows.map(r => r.receitas))), gastos: round(mean(rows.map(r => r.gastos))), sobra: round(average), mediana: round((sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2), desvio: round(Math.sqrt(mean(spares.map(v => (v - average) ** 2)))), menor: sorted[0], negativos: rows.filter(r => r.sobra < 0).length, cobertos: covered, cobertura: round(covered / rows.length * 100), consumo: average > 0 ? round(proposal.parcela / average * 100) : null, tendenciaSobra: round(receipts.slope - expenses.slope) };
  const projecao = Array.from({ length: proposal.horizonte }, (_, i) => {
    const mes = monthOffset(currentMonth, i + 1), compromisso = (i < proposal.parcelas ? proposal.parcela : 0) + (i === 0 ? proposal.entrada : 0);
    const receitas = round(receipts.predict(mes)), gastos = round(expenses.predict(mes));
    return { mes, receitas, gastos, compromisso, media: round(average - compromisso), tendencia: round(receitas - gastos - compromisso) };
  });
  return { version: SIMULADOR_VERSION, proposal, referencia: currentMonth, compra, historico: rows, resumo, projecao, avisos };
}
