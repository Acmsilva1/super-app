/** Fallback quando o mês ainda não tem lançamentos suficientes. */
export const DICAS_FINANCEIRO_FALLBACK = [
  'Marque despesas fixas como pagas ou pendentes em um toque.',
  'Use o filtro de mês e ano para navegar sem perder o histórico.',
  'Gastos variados ficam melhores com categoria (ex.: Alimentação).',
  'Defina uma meta de poupança e acompanhe o progresso na aba Poupança.',
];

/** @deprecated use DICAS_FINANCEIRO_FALLBACK — mantido para o mount inicial */
export const DICAS_FINANCEIRO = DICAS_FINANCEIRO_FALLBACK;

function moneyDefault(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function descricaoCurta(row) {
  const raw = String(row?.descricao || row?.nome_meta || 'sem descrição').trim();
  if (raw.length <= 42) return raw;
  return `${raw.slice(0, 39)}...`;
}

function maxByValor(rows) {
  let best = null;
  for (const row of rows || []) {
    const valor = Number(row?.valor) || 0;
    if (!best || valor > (Number(best.valor) || 0)) best = row;
  }
  return best && (Number(best.valor) || 0) > 0 ? best : null;
}

function mesLabelFromMesAno(mesAno) {
  const m = String(mesAno || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const idx = Number(m[2]) - 1;
  if (idx < 0 || idx > 11) return ` de ${m[1]}-${m[2]}`;
  return ` de ${meses[idx]}/${m[1]}`;
}

/**
 * Monta dicas a partir do payload do GET /api/financeiro (dados reais do mês).
 * @param {Record<string, unknown>} data
 * @param {{ formatMoney?: (n: number) => string }} [options]
 */
export function buildDicasFinanceiroFromData(data = {}, options = {}) {
  const fmt = typeof options.formatMoney === 'function' ? options.formatMoney : moneyDefault;
  const tips = [];
  const dash = data.dashboard || {};
  const tabelas = data.tabelas || {};
  const graficos = data.graficos || {};
  const mesSuffix = mesLabelFromMesAno(data.mes_ano);

  const receitas = Array.isArray(tabelas.receitas) ? tabelas.receitas : [];
  const gastos = Array.isArray(tabelas.gastos_variados) ? tabelas.gastos_variados : [];
  const fixas = Array.isArray(tabelas.despesas_fixas) ? tabelas.despesas_fixas : [];

  const topReceita = maxByValor(receitas);
  if (topReceita) {
    tips.push(`Maior receita${mesSuffix}: ${descricaoCurta(topReceita)} (${fmt(topReceita.valor)}).`);
  }

  const topGasto = maxByValor(gastos);
  if (topGasto) {
    tips.push(`Maior gasto variável${mesSuffix}: ${descricaoCurta(topGasto)} (${fmt(topGasto.valor)}).`);
  }

  const topFixa = maxByValor(fixas);
  if (topFixa) {
    tips.push(`Maior despesa fixa${mesSuffix}: ${descricaoCurta(topFixa)} (${fmt(topFixa.valor)}).`);
  }

  const receitasTotal = Number(dash.receitas) || 0;
  const fixasTotal = Number(dash.despesas_fixas) || 0;
  const variadasTotal = Number(dash.despesas_variadas) || 0;
  const despesasTotal = Math.round((fixasTotal + variadasTotal) * 100) / 100;
  const liquido = Number(dash.liquido);

  if (receitasTotal > 0) {
    tips.push(`Receitas${mesSuffix}: ${fmt(receitasTotal)}.`);
  }
  if (despesasTotal > 0) {
    tips.push(`Despesas${mesSuffix}: ${fmt(despesasTotal)} (fixas + variáveis).`);
  }
  if (Number.isFinite(liquido) && (receitasTotal > 0 || despesasTotal > 0)) {
    tips.push(`Saldo líquido${mesSuffix}: ${fmt(liquido)}.`);
  }

  const categorias = Array.isArray(graficos.categorias_gastos) ? graficos.categorias_gastos : [];
  const topCat = categorias[0];
  if (topCat && Number(topCat.valor) > 0) {
    tips.push(`Categoria com mais gastos${mesSuffix}: ${String(topCat.categoria || 'Outros')} (${fmt(topCat.valor)}).`);
  }

  const pagosPendentes = graficos.pagos_pendentes || {};
  const pendenteValor = Number(pagosPendentes.pendente) || 0;
  const pagoValor = Number(pagosPendentes.pago) || 0;
  if (pendenteValor > 0) {
    tips.push(`Ainda há ${fmt(pendenteValor)} em despesas fixas pendentes${mesSuffix}.`);
  }
  if (pagoValor > 0) {
    tips.push(`Você já pagou ${fmt(pagoValor)} em despesas fixas${mesSuffix}.`);
  }

  const pendCount = fixas.filter((r) => String(r?.status || '').toLowerCase() !== 'pago').length;
  if (pendCount > 0) {
    tips.push(`${pendCount} despesa(s) fixa(s) ainda pendente(s)${mesSuffix}.`);
  }

  const poupanca = data.poupanca || {};
  const poupancaTotal = Number(poupanca.total) || 0;
  if (poupancaTotal > 0) {
    tips.push(`Total na poupança: ${fmt(poupancaTotal)}.`);
  }
  const meta = poupanca.meta_ativa;
  if (meta && Number(meta.valor_meta) > 0) {
    const pct = Math.round((Number(meta.progresso) || 0) * 100);
    const nome = String(meta.nome_meta || 'sua meta').trim() || 'sua meta';
    tips.push(`Meta "${nome}": ${pct}% (${fmt(poupancaTotal)} de ${fmt(meta.valor_meta)}).`);
  }

  const comprasTotal = Number(data.compras?.total) || 0;
  if (comprasTotal > 0) {
    tips.push(`Compras${mesSuffix}: ${fmt(comprasTotal)}.`);
  }

  const unique = Array.from(new Set(tips.map((t) => String(t).trim()).filter(Boolean)));
  if (unique.length < 2) {
    return Array.from(new Set([...unique, ...DICAS_FINANCEIRO_FALLBACK]));
  }
  return unique;
}
