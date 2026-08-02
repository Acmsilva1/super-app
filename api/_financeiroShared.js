import { supabase } from '../lib/supabase.js';
import {
  TABLE_COMPRAS,
  TABLE_DESPESAS_FIXAS,
  TABLE_FINANCAS,
  TABLE_FINANCEIRO_MODELO_ESTADO,
  TABLE_POUPANCA_METAS,
  TABLE_POUPANCA,
  TIPO_REGISTRO_COMPRA,
  TIPO_REGISTRO_DESPESA_FIXA,
  TIPO_REGISTRO_GASTO_VARIADO,
  TIPO_REGISTRO_META_POUPANCA,
  TIPO_REGISTRO_POUPANCA,
  TIPO_REGISTRO_RECEITA,
  parseMesAno,
  rangeMes,
  filtrarFinancasPorMes,
  classificarFinancas,
  calcularDashboard,
  calcularGraficos,
  calcularGraficosAnuais,
  montarTabelaFinanceiroRows,
  payloadInsertFinanceiro,
  payloadUpdateFinanceiro,
  inferTipoRegistro,
  buildReplicationSlotsFromStart,
  seriesDefinitionsFromYearRows,
  slotsNeededForMonth,
  rowMatchesReplicationSlot,
  buildInsertPayloadFromSlot,
  createdAtForMesAno,
  calcularAnaliseRiscoConsumo,
  detectarPadroesEInconsistencias,
  calcularNaiveBayesWeights,
  inferCategory,
} from '../features/financeiro/index.js';
import crypto from 'node:crypto';

function getBody(req) {
  if (typeof req.body !== 'string') return req.body || {};
  const raw = String(req.body || '').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function rowOrFirst(data) {
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

function isMissingTableError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01' || message.includes('does not exist') || message.includes('nao existe');
}

function tableForTipoRegistro(tipoRegistro) {
  if (tipoRegistro === TIPO_REGISTRO_DESPESA_FIXA) return TABLE_DESPESAS_FIXAS;
  if (tipoRegistro === TIPO_REGISTRO_POUPANCA) return TABLE_POUPANCA;
  if (tipoRegistro === TIPO_REGISTRO_META_POUPANCA) return TABLE_POUPANCA_METAS;
  if (tipoRegistro === TIPO_REGISTRO_COMPRA) return TABLE_COMPRAS;
  return TABLE_FINANCAS;
}

function getContextUserId(context = {}) {
  return context?.userId ? String(context.userId) : '';
}

function scopeQueryByUser(query, context = {}) {
  const userId = getContextUserId(context);
  return userId ? query.eq('user_id', userId) : query;
}

function withContextUser(payload, context = {}) {
  const userId = getContextUserId(context);
  return userId ? { ...payload, user_id: userId } : payload;
}

function withContextUserRows(rows, context = {}) {
  return (rows || []).map((row) => withContextUser(row, context));
}

function normalizeDate(dateLike) {
  const s = String(dateLike || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function resolveTipoRegistroFinanceiro(row, fallback = TIPO_REGISTRO_GASTO_VARIADO) {
  const tipo = String(row?.tipo || '').toLowerCase();
  if (tipo === 'receita') return TIPO_REGISTRO_RECEITA;
  return fallback;
}

function replicationOptionsFromPayload(payload = {}) {
  const contaFixa = payload.conta_fixa === true;
  const pt = Number(payload.parcela_total);
  const pa = Number(payload.parcela_atual);
  const hasParcelas = Number.isFinite(pt) && Number.isFinite(pa) && pt >= 1 && pa >= 1;
  return {
    contaFixa,
    parcelaAtual: hasParcelas ? pa : null,
    parcelaTotal: hasParcelas ? pt : null,
    serieId: payload.serie_id || null,
  };
}

function buildDespesaFixaInsertPayloads(basePayload, mesAno) {
  const contaFixa = basePayload.conta_fixa === true;
  const pt = Number(basePayload.parcela_total);
  const pa = Number(basePayload.parcela_atual);
  const hasParcelas = Number.isFinite(pt) && Number.isFinite(pa) && pt >= 1 && pa >= 1;

  const serieId = basePayload.serie_id || ((contaFixa || hasParcelas) ? crypto.randomUUID() : null);

  const slots = buildReplicationSlotsFromStart(mesAno, {
    ...replicationOptionsFromPayload(basePayload),
    serieId,
  });
  return slots.map((slot) => ({
    descricao: basePayload.descricao,
    valor: basePayload.valor,
    status: basePayload.status || 'pendente',
    conta_fixa: slot.conta_fixa === true,
    parcela_atual: slot.parcela_atual,
    parcela_total: slot.parcela_total,
    serie_id: slot.serie_id || serieId || null,
    created_at: createdAtForMesAno(slot.mes_ano, basePayload.created_at || null),
  }));
}

function normalizeSerieDescricao(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function mesAnoFromDateLike(dateLike) {
  const match = String(dateLike || '').match(/^(\d{4})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : '';
}

function isParcelaRow(row) {
  const atual = Number(row?.parcela_atual);
  const total = Number(row?.parcela_total);
  return Number.isInteger(atual) && Number.isInteger(total) && atual >= 1 && total >= 1 && atual <= total;
}

function addMonthsToMesAno(mesAno, offset) {
  if (!/^\d{4}-\d{2}$/.test(String(mesAno || ''))) return '';
  const [ano, mes] = String(mesAno).split('-').map(Number);
  const date = new Date(Date.UTC(ano, mes - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function buildFutureParcelaSlotsFromRow(row) {
  if (!isParcelaRow(row)) return [];
  const currentMesAno = mesAnoFromDateLike(row.created_at);
  if (!currentMesAno) return [];
  const atual = Number(row.parcela_atual);
  const total = Number(row.parcela_total);
  const startMesAno = addMonthsToMesAno(currentMesAno, -(atual - 1));
  if (!startMesAno) return [];
  return buildReplicationSlotsFromStart(startMesAno, {
    parcelaAtual: 1,
    parcelaTotal: total,
    serieId: row.serie_id || null,
  }).filter((slot) => Number(slot.parcela_atual) > atual);
}

async function findFutureParcelaIds(row, context = {}) {
  if (!isParcelaRow(row)) return [];
  const futureSlots = buildFutureParcelaSlotsFromRow(row);
  if (!futureSlots.length) return [];

  if (row.serie_id) {
    const { data, error } = await scopeQueryByUser(supabase
      .from(TABLE_DESPESAS_FIXAS)
      .select('id, parcela_atual')
      .eq('serie_id', row.serie_id)
      .gt('parcela_atual', row.parcela_atual), context);
    if (error) throw error;
    return (data || []).map((r) => r.id).filter(Boolean);
  }

  const { data, error } = await scopeQueryByUser(supabase
    .from(TABLE_DESPESAS_FIXAS)
    .select('id, descricao, parcela_atual, parcela_total, created_at')
    .eq('parcela_total', row.parcela_total), context);

  if (error) throw error;

  const descricaoSerie = normalizeSerieDescricao(row.descricao);
  const futureSlotKeys = new Set(futureSlots.map((slot) => `${slot.mes_ano}:${slot.parcela_atual}`));

  return (data || [])
    .filter((candidate) => normalizeSerieDescricao(candidate?.descricao) === descricaoSerie)
    .filter((candidate) => Number(candidate?.parcela_total) === Number(row.parcela_total))
    .filter((candidate) => futureSlotKeys.has(`${mesAnoFromDateLike(candidate?.created_at)}:${Number(candidate?.parcela_atual)}`))
    .map((candidate) => candidate.id)
    .filter(Boolean);
}

async function cleanupFutureParcelas(row, context = {}) {
  const ids = await findFutureParcelaIds(row, context);
  if (!ids.length) return;
  const { error } = await scopeQueryByUser(supabase.from(TABLE_DESPESAS_FIXAS).delete().in('id', ids), context);
  if (error) throw error;
}

async function cleanupFutureContaFixa(row, context = {}) {
  if (row?.conta_fixa !== true && row?.conta_fixa !== 'true') return;
  const rowMesAno = mesAnoFromDateLike(row.created_at);
  if (!rowMesAno) return;
  const [ano, mes] = rowMesAno.split('-').map(Number);
  const futuroCutoff = new Date(Date.UTC(ano, mes - 1, 1)).toISOString();

  if (row.serie_id) {
    const { data, error } = await scopeQueryByUser(
      supabase
        .from(TABLE_DESPESAS_FIXAS)
        .select('id, created_at')
        .eq('serie_id', row.serie_id)
        .gte('created_at', futuroCutoff),
      context
    );
    if (error) throw error;
    const ids = (data || [])
      .filter((r) => String(r.id) !== String(row.id))
      .map((r) => r.id)
      .filter(Boolean);
    if (!ids.length) return;
    const { error: delErr } = await scopeQueryByUser(
      supabase.from(TABLE_DESPESAS_FIXAS).delete().in('id', ids),
      context
    );
    if (delErr) throw delErr;
    return;
  }

  const descricaoNorm = normalizeSerieDescricao(row.descricao);
  if (!descricaoNorm) return;

  const { data, error } = await scopeQueryByUser(
    supabase
      .from(TABLE_DESPESAS_FIXAS)
      .select('id, descricao, conta_fixa, created_at')
      .eq('conta_fixa', true)
      .gte('created_at', futuroCutoff),
    context
  );
  if (error) throw error;

  const ids = (data || [])
    .filter((r) => String(r.id) !== String(row.id))
    .filter((r) => normalizeSerieDescricao(r.descricao) === descricaoNorm)
    .map((r) => r.id)
    .filter(Boolean);

  if (!ids.length) return;
  const { error: delErr } = await scopeQueryByUser(
    supabase.from(TABLE_DESPESAS_FIXAS).delete().in('id', ids),
    context
  );
  if (delErr) throw delErr;
}

const DESPESA_FIXA_SERIES_COLUMNS = 'descricao, valor, status, conta_fixa, parcela_atual, parcela_total, serie_id, created_at';
const FINANCAS_ANUAL_COLUMNS = 'tipo, valor, categoria, data_lancamento, created_at';
const DESPESA_FIXA_ANUAL_COLUMNS = 'valor, status, created_at';

function wantsGraficosAnuais(query = {}) {
  const bi = String(query?.bi ?? '').toLowerCase();
  const flag = String(query?.incluir_anuais ?? '').toLowerCase();
  return bi === '1' || bi === 'true' || flag === '1' || flag === 'true';
}

function rangeDiasMes(ano, mes) {
  const lastDay = new Date(ano, mes, 0).getDate();
  const mm = String(mes).padStart(2, '0');
  return {
    dayStart: `${ano}-${mm}-01`,
    dayEnd: `${ano}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

function periodOrFilter({ dayStart, dayEnd, start, end }) {
  return `and(data_lancamento.gte.${dayStart},data_lancamento.lte.${dayEnd}),and(created_at.gte.${start},created_at.lte.${end})`;
}

export async function materializeDespesasFixasMes(mesAno, context = {}) {
  if (!mesAno || !/^\d{4}-\d{2}$/.test(mesAno)) return;
  const { ano, mes } = parseMesAno(mesAno);
  const yearStart = new Date(ano, 0, 1).toISOString();
  const yearEnd = new Date(ano, 11, 31, 23, 59, 59, 999).toISOString();

  const { data: yearRows, error: yearErr } = await scopeQueryByUser(supabase
    .from(TABLE_DESPESAS_FIXAS)
    .select(DESPESA_FIXA_SERIES_COLUMNS)
    .gte('created_at', yearStart)
    .lte('created_at', yearEnd), context);

  if (yearErr || !yearRows) return;

  const series = seriesDefinitionsFromYearRows(yearRows);
  if (!series.length) return;

  const { start, end } = rangeMes(ano, mes);
  const { data: monthRows, error: monthErr } = await scopeQueryByUser(supabase
    .from(TABLE_DESPESAS_FIXAS)
    .select(DESPESA_FIXA_SERIES_COLUMNS)
    .gte('created_at', start)
    .lte('created_at', end), context);

  if (monthErr) return;
  const existing = monthRows || [];

  const toInsert = [];
  for (const item of series) {
    const alreadyInitializedInYear = yearRows.some((row) => rowMatchesReplicationSlot(row, { conta_fixa: item.type === 'conta_fixa', parcela_atual: item.parcelaAtual, parcela_total: item.parcelaTotal, serie_id: item.serieId }, item.descricao));
    if (alreadyInitializedInYear) continue;

    const needed = slotsNeededForMonth(item, mesAno);
    for (const slot of needed) {
      const alreadyExists = existing.some((row) => rowMatchesReplicationSlot(row, slot, item.descricao));
      if (alreadyExists) continue;
      toInsert.push(buildInsertPayloadFromSlot(item, slot));
    }
  }

  if (!toInsert.length) return;
  await supabase.from(TABLE_DESPESAS_FIXAS).insert(withContextUserRows(toInsert, context));
}

export async function garantirDespesasFixasMes(mesAno, context = {}) {
  await materializeDespesasFixasMes(mesAno, context);
}

export async function obterFinanceiroMes(query = {}, context = {}) {
  const { ano, mes } = parseMesAno(query.mes_ano);
  const { start, end, mes_ano } = rangeMes(ano, mes);
  const { dayStart, dayEnd } = rangeDiasMes(ano, mes);
  const includeAnuais = wantsGraficosAnuais(query);
  const yearStart = new Date(ano, 0, 1, 0, 0, 0, 0).toISOString();
  const yearEnd = new Date(ano, 11, 31, 23, 59, 59, 999).toISOString();
  const yearDayStart = `${ano}-01-01`;
  const yearDayEnd = `${ano}-12-31`;
  const monthPeriodFilter = periodOrFilter({ dayStart, dayEnd, start, end });
  const yearPeriodFilter = periodOrFilter({
    dayStart: yearDayStart,
    dayEnd: yearDayEnd,
    start: yearStart,
    end: yearEnd,
  });

  // Materializa apenas o mês aberto (não os 12 meses do ano).
  await garantirDespesasFixasMes(mes_ano, context);

  const [
    financasMesResult,
    financasAnoResult,
    despesasFixasMesResult,
    despesasFixasAnoResult,
    poupancaResult,
    metaResult,
    comprasResult,
  ] = await Promise.all([
    scopeQueryByUser(supabase
      .from(TABLE_FINANCAS)
      .select('*')
      .or(monthPeriodFilter)
      .order('created_at', { ascending: false }), context),
    includeAnuais
      ? scopeQueryByUser(supabase
        .from(TABLE_FINANCAS)
        .select(FINANCAS_ANUAL_COLUMNS)
        .or(yearPeriodFilter)
        .order('created_at', { ascending: false }), context)
      : Promise.resolve({ data: [], error: null }),
    scopeQueryByUser(supabase
      .from(TABLE_DESPESAS_FIXAS)
      .select('*')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false }), context),
    includeAnuais
      ? scopeQueryByUser(supabase
        .from(TABLE_DESPESAS_FIXAS)
        .select(DESPESA_FIXA_ANUAL_COLUMNS)
        .gte('created_at', yearStart)
        .lte('created_at', yearEnd)
        .order('created_at', { ascending: false }), context)
      : Promise.resolve({ data: [], error: null }),
    scopeQueryByUser(supabase
      .from(TABLE_POUPANCA)
      .select('*')
      .order('created_at', { ascending: false }), context),
    scopeQueryByUser(supabase
      .from(TABLE_POUPANCA_METAS)
      .select('*')
      .eq('ativa', true)
      .order('created_at', { ascending: false })
      .limit(1), context),
    scopeQueryByUser(supabase
      .from(TABLE_COMPRAS)
      .select('*')
      .or(monthPeriodFilter)
      .order('created_at', { ascending: false }), context),
  ]);

  if (financasMesResult.error) return { error: financasMesResult.error.message, status: 500 };
  if (financasAnoResult.error) return { error: financasAnoResult.error.message, status: 500 };
  if (despesasFixasMesResult.error) return { error: despesasFixasMesResult.error.message, status: 500 };
  if (despesasFixasAnoResult.error) return { error: despesasFixasAnoResult.error.message, status: 500 };

  let poupancaRowsRaw = [];
  let poupancaConfigured = true;
  if (poupancaResult.error) {
    if (isMissingTableError(poupancaResult.error)) {
      poupancaConfigured = false;
    } else {
      return { error: poupancaResult.error.message, status: 500 };
    }
  } else {
    poupancaRowsRaw = poupancaResult.data || [];
  }

  let poupancaMetaAtiva = null;
  let poupancaMetaConfigured = true;
  if (metaResult.error) {
    if (isMissingTableError(metaResult.error)) {
      poupancaMetaConfigured = false;
    } else {
      return { error: metaResult.error.message, status: 500 };
    }
  } else {
    const metaRows = metaResult.data;
    poupancaMetaAtiva = Array.isArray(metaRows) && metaRows.length > 0 ? metaRows[0] : null;
  }

  let comprasRowsRaw = [];
  let comprasConfigured = true;
  if (comprasResult.error) {
    if (isMissingTableError(comprasResult.error)) {
      comprasConfigured = false;
    } else {
      return { error: comprasResult.error.message, status: 500 };
    }
  } else {
    comprasRowsRaw = comprasResult.data || [];
  }

  const despesasFixasRowsRaw = despesasFixasMesResult.data || [];
  const despesasFixasAnoRowsRaw = despesasFixasAnoResult.data || [];

  const financasMes = filtrarFinancasPorMes(financasMesResult.data || [], ano, mes);
  const { receitas, gastosVariados } = classificarFinancas(financasMes);
  const comprasMes = filtrarFinancasPorMes(comprasRowsRaw || [], ano, mes);

  // Para gráficos anuais, usa o conjunto do ano (leve), não o histórico completo.
  const financasParaAnual = includeAnuais
    ? (financasAnoResult.data || []).filter((row) => {
      const raw = String(row?.data_lancamento || row?.created_at || '').trim();
      const match = raw.match(/^(\d{4})/);
      if (match) return Number(match[1]) === ano;
      const date = new Date(raw);
      return !Number.isNaN(date.getTime()) && date.getUTCFullYear() === ano;
    })
    : [];

  const receitasTabela = montarTabelaFinanceiroRows(receitas, TIPO_REGISTRO_RECEITA);
  const gastosVariadosTabela = montarTabelaFinanceiroRows(gastosVariados, TIPO_REGISTRO_GASTO_VARIADO)
    .map((r) => ({ ...r, tipo_registro: resolveTipoRegistroFinanceiro(r, TIPO_REGISTRO_GASTO_VARIADO) }));
  const despesasFixasTabela = montarTabelaFinanceiroRows(despesasFixasRowsRaw || [], TIPO_REGISTRO_DESPESA_FIXA);
  const poupancaTabela = montarTabelaFinanceiroRows(poupancaRowsRaw || [], TIPO_REGISTRO_POUPANCA);
  const comprasTabela = montarTabelaFinanceiroRows(comprasMes, TIPO_REGISTRO_COMPRA);

  const dashboard = calcularDashboard({
    receitasRows: receitas,
    gastosRows: gastosVariados,
    despesasFixasRows: despesasFixasRowsRaw || [],
  });
  const graficos = calcularGraficos({
    gastosRows: gastosVariados,
    despesasFixasRows: despesasFixasRowsRaw || [],
  });
  const graficosAnuais = includeAnuais
    ? calcularGraficosAnuais({
      ano,
      rows: financasParaAnual,
      despesasFixasRows: despesasFixasAnoRowsRaw || [],
    })
    : calcularGraficosAnuais({ ano, rows: [], despesasFixasRows: [] });

  const poupancaTotal = Math.round((poupancaRowsRaw || []).reduce((acc, r) => acc + (Number(r?.valor) || 0), 0) * 100) / 100;
  const comprasTotal = Math.round((comprasMes || []).reduce((acc, r) => acc + (Number(r?.valor) || 0), 0) * 100) / 100;
  const valorMeta = Number(poupancaMetaAtiva?.valor_meta || 0);
  const progressoMeta = valorMeta > 0 ? Math.max(0, Math.min(1, poupancaTotal / valorMeta)) : 0;
  const statusMeta = valorMeta <= 0
    ? 'sem_meta'
    : progressoMeta >= 1
      ? 'alvo'
      : progressoMeta >= 0.7
        ? 'alerta'
        : 'progresso';

  // ── Análise de Risco e Padrões (Modelo Analítico) ─────────────────────────
  const brazilNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const diaAtual = brazilNow.getDate();
  const totalDias = new Date(ano, mes, 0).getDate(); // último dia do mês

  const analiseRisco = calcularAnaliseRiscoConsumo({
    receitas: dashboard.receitas,
    despesasFixas: dashboard.despesas_fixas,
    gastosVariados: gastosVariados,
    diaAtual,
    totalDias,
  });

  const { grupos: padroeGrupos, inconsistencias } = detectarPadroesEInconsistencias(gastosVariados);

  return {
    status: 200,
    data: {
      mes_ano,
      dashboard,
      graficos,
      graficos_anuais: graficosAnuais,
      tabelas: {
        despesas_fixas: despesasFixasTabela,
        gastos_variados: gastosVariadosTabela,
        receitas: receitasTabela,
        poupanca: poupancaTabela,
        compras: comprasTabela,
      },
      poupanca: {
        configurada: poupancaConfigured,
        meta_configurada: poupancaMetaConfigured,
        total: poupancaTotal,
        logs: poupancaTabela,
        meta_ativa: poupancaMetaAtiva
          ? {
              id: poupancaMetaAtiva.id,
              nome_meta: String(poupancaMetaAtiva.nome_meta || ''),
              valor_meta: valorMeta,
              data_inicio: normalizeDate(poupancaMetaAtiva.data_inicio) || normalizeDate(poupancaMetaAtiva.created_at),
              progresso: Math.round(progressoMeta * 10000) / 10000,
              status: statusMeta,
            }
          : null,
      },
      compras: {
        configurada: comprasConfigured,
        total: comprasTotal,
        logs: comprasTabela,
      },
      analise_risco: analiseRisco,
      padroes: {
        grupos: padroeGrupos,
        inconsistencias,
      },
    },
  };
}

export async function criarRegistroFinanceiro(req, context = {}) {
  const body = getBody(req);
  const parsed = payloadInsertFinanceiro(body);
  if (parsed.error) return { status: 400, data: { error: parsed.error } };
  const table = tableForTipoRegistro(parsed.tipo_registro);
  const payload = withContextUser(parsed.payload, context);

  if (parsed.tipo_registro === TIPO_REGISTRO_DESPESA_FIXA && body.mes_ano && /^\d{4}-\d{2}$/.test(String(body.mes_ano))) {
    const mesAno = String(body.mes_ano);
    const insertPayloads = withContextUserRows(buildDespesaFixaInsertPayloads(payload, mesAno), context);
    const { data, error } = await supabase
      .from(table)
      .insert(insertPayloads)
      .select();
    if (error) return { status: 500, data: { error: error.message } };
    const rows = Array.isArray(data) ? data : (data ? [data] : []);
    const row = rows.find((item) => String(item?.created_at || '').slice(0, 7) === mesAno) || rows[0] || null;
    return { status: 201, data: { ...(row || {}), tipo_registro: parsed.tipo_registro } };
  }

  if (parsed.tipo_registro === TIPO_REGISTRO_META_POUPANCA) {
    const metaDeactivateQuery = supabase
      .from(TABLE_POUPANCA_METAS)
      .update({ ativa: false })
      .eq('ativa', true);
    const { error: deactivateErr } = await scopeQueryByUser(metaDeactivateQuery, context);
    if (deactivateErr && !isMissingTableError(deactivateErr)) {
      return { status: 500, data: { error: deactivateErr.message } };
    }
  }

  const { data, error } = await supabase.from(table).insert(payload).select().single();
  if (error) return { status: 500, data: { error: error.message } };
  const row = rowOrFirst(data);
  return { status: 201, data: { ...(row || {}), tipo_registro: parsed.tipo_registro } };
}

export async function atualizarRegistroFinanceiro(req, context = {}) {
  const body = getBody(req);
  const parsed = payloadUpdateFinanceiro(body);
  if (parsed.error) return { status: 400, data: { error: parsed.error } };

  const table = tableForTipoRegistro(parsed.tipo_registro);
  const originalTipoRegistro = body.original_tipo_registro
    ? inferTipoRegistro({ tipo_registro: body.original_tipo_registro })
    : parsed.tipo_registro;
  const originalTable = tableForTipoRegistro(originalTipoRegistro);

  if (originalTipoRegistro && originalTable !== table) {
    const insertParsed = payloadInsertFinanceiro({ ...body, id: undefined, tipo_registro: parsed.tipo_registro });
    if (insertParsed.error) return { status: 400, data: { error: insertParsed.error } };

    let insertedRow = null;
    if (insertParsed.tipo_registro === TIPO_REGISTRO_DESPESA_FIXA && body.mes_ano && /^\d{4}-\d{2}$/.test(String(body.mes_ano))) {
      const mesAno = String(body.mes_ano);
      const insertPayloads = withContextUserRows(buildDespesaFixaInsertPayloads({ ...insertParsed.payload }, mesAno), context);
      const { data: insertedRows, error: insertErr } = await supabase
        .from(table)
        .insert(insertPayloads)
        .select();
      if (insertErr) return { status: 500, data: { error: insertErr.message } };
      const rows = Array.isArray(insertedRows) ? insertedRows : (insertedRows ? [insertedRows] : []);
      insertedRow = rows.find((item) => String(item?.created_at || '').slice(0, 7) === mesAno) || rows[0] || null;
    } else {
      const { data: inserted, error: insertErr } = await supabase.from(table).insert(withContextUser(insertParsed.payload, context)).select().single();
      if (insertErr) return { status: 500, data: { error: insertErr.message } };
      insertedRow = rowOrFirst(inserted);
    }

    const { error: deleteErr } = await scopeQueryByUser(supabase.from(originalTable).delete().eq('id', parsed.id), context);
    if (deleteErr) return { status: 500, data: { error: deleteErr.message } };

    return { status: 200, data: { ...(insertedRow || {}), tipo_registro: parsed.tipo_registro, realocado: true } };
  }

  let existingRow = null;
  if (parsed.tipo_registro === TIPO_REGISTRO_DESPESA_FIXA) {
    const { data: currentRow, error: currentErr } = await scopeQueryByUser(supabase.from(table).select('*').eq('id', parsed.id), context).single();
    if (currentErr) return { status: 500, data: { error: currentErr.message } };
    existingRow = rowOrFirst(currentRow);
  }

  const { data, error } = await scopeQueryByUser(supabase.from(table).update(parsed.payload).eq('id', parsed.id), context).select().single();
  if (error) return { status: 500, data: { error: error.message } };

  const turningParcelasOff = parsed.tipo_registro === TIPO_REGISTRO_DESPESA_FIXA
    && body.parcelas !== undefined
    && !(body.parcelas === true || body.parcelas === 'true');

  const turningContaFixaOff = parsed.tipo_registro === TIPO_REGISTRO_DESPESA_FIXA
    && body.conta_fixa !== undefined
    && !(body.conta_fixa === true || body.conta_fixa === 'true')
    && (existingRow?.conta_fixa === true || existingRow?.conta_fixa === 'true');

  if (turningParcelasOff && existingRow && isParcelaRow(existingRow)) {
    try {
      await cleanupFutureParcelas(existingRow, context);
    } catch (cleanupErr) {
      return { status: 500, data: { error: cleanupErr.message } };
    }
  }

  if (turningContaFixaOff && existingRow) {
    try {
      await cleanupFutureContaFixa(existingRow, context);
    } catch (cleanupErr) {
      return { status: 500, data: { error: cleanupErr.message } };
    }
  }

  const row = rowOrFirst(data);
  return { status: 200, data: { ...(row || {}), tipo_registro: parsed.tipo_registro } };
}

export async function removerRegistroFinanceiro(req, context = {}) {
  const body = getBody(req);
  let tipoRegistro = String(body.tipo_registro || req.query?.tipo_registro || '').trim();
  if (!tipoRegistro) tipoRegistro = inferTipoRegistro({ ...req.query, ...body });
  const id = body.id ?? req.query?.id;
  if (!id) return { status: 400, data: { error: 'id obrigatorio' } };

  if (!tipoRegistro) {
    const { data: inFin, error: errFin } = await scopeQueryByUser(supabase.from(TABLE_FINANCAS).select('id, tipo_gasto, tipo').eq('id', id), context).limit(1);
    if (errFin) return { status: 500, data: { error: errFin.message } };
    if (Array.isArray(inFin) && inFin.length > 0) {
      const row = inFin[0];
      if (row.tipo === 'receita') {
        tipoRegistro = TIPO_REGISTRO_RECEITA;
      } else {
        tipoRegistro = TIPO_REGISTRO_GASTO_VARIADO;
      }
    }
    if (!tipoRegistro) {
      const { data: inFix, error: errFix } = await scopeQueryByUser(supabase.from(TABLE_DESPESAS_FIXAS).select('id').eq('id', id), context).limit(1);
      if (errFix) return { status: 500, data: { error: errFix.message } };
      if (Array.isArray(inFix) && inFix.length > 0) tipoRegistro = TIPO_REGISTRO_DESPESA_FIXA;
    }
    if (!tipoRegistro) {
      const { data: inPoupa, error: errPoupa } = await scopeQueryByUser(supabase.from(TABLE_POUPANCA).select('id').eq('id', id), context).limit(1);
      if (errPoupa && !isMissingTableError(errPoupa)) return { status: 500, data: { error: errPoupa.message } };
      if (Array.isArray(inPoupa) && inPoupa.length > 0) tipoRegistro = TIPO_REGISTRO_POUPANCA;
    }
    if (!tipoRegistro) {
      const { data: inMeta, error: errMeta } = await scopeQueryByUser(supabase.from(TABLE_POUPANCA_METAS).select('id').eq('id', id), context).limit(1);
      if (errMeta && !isMissingTableError(errMeta)) return { status: 500, data: { error: errMeta.message } };
      if (Array.isArray(inMeta) && inMeta.length > 0) tipoRegistro = TIPO_REGISTRO_META_POUPANCA;
    }
    if (!tipoRegistro) {
      const { data: inCompra, error: errCompra } = await scopeQueryByUser(supabase.from(TABLE_COMPRAS).select('id').eq('id', id), context).limit(1);
      if (errCompra && !isMissingTableError(errCompra)) return { status: 500, data: { error: errCompra.message } };
      if (Array.isArray(inCompra) && inCompra.length > 0) tipoRegistro = TIPO_REGISTRO_COMPRA;
    }
    if (!tipoRegistro) return { status: 404, data: { error: 'registro nao encontrado para exclusao' } };
  }

  if (![
    TIPO_REGISTRO_DESPESA_FIXA,
    TIPO_REGISTRO_GASTO_VARIADO,
    TIPO_REGISTRO_RECEITA,
    TIPO_REGISTRO_POUPANCA,
    TIPO_REGISTRO_META_POUPANCA,
    TIPO_REGISTRO_COMPRA,
  ].includes(tipoRegistro)) {
    return { status: 400, data: { error: 'tipo_registro invalido' } };
  }

  const table = tableForTipoRegistro(tipoRegistro);

  let currentDespesaFixa = null;
  if (tipoRegistro === TIPO_REGISTRO_DESPESA_FIXA) {
    const { data: currentRow, error: currentErr } = await scopeQueryByUser(supabase.from(table).select('*').eq('id', id), context).single();
    if (currentErr) return { status: 500, data: { error: currentErr.message } };
    currentDespesaFixa = rowOrFirst(currentRow);
  }

  const { error } = await scopeQueryByUser(supabase.from(table).delete().eq('id', id), context);
  if (error) return { status: 500, data: { error: error.message } };

  if (currentDespesaFixa) {
    try {
      if (isParcelaRow(currentDespesaFixa)) {
        await cleanupFutureParcelas(currentDespesaFixa, context);
      }
      if (currentDespesaFixa.conta_fixa === true || currentDespesaFixa.conta_fixa === 'true') {
        await cleanupFutureContaFixa(currentDespesaFixa, context);
      }
    } catch (cleanupErr) {
      return { status: 500, data: { error: cleanupErr.message } };
    }
  }

  return { status: 200, data: { ok: true } };
}

// ─── Funções exportadas para rotas de Modelo Analítico ───────────────────────

/**
 * Carrega o estado do modelo treinado (pesos Naive Bayes) do banco para um usuário.
 * @param {object} context
 * @returns {object|null}
 */
export async function carregarPesosModelo(context = {}) {
  const userId = String(context?.userId || '');
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from(TABLE_FINANCEIRO_MODELO_ESTADO)
      .select('pesos, aprendizado_percentual, created_at')
      .eq('escopo', 'financeiro')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Treina o modelo Naive Bayes com TODO o histórico de gastos variados categorizados do usuário.
 * Persiste os pesos em tb_financeiro_modelo_estado.
 * @param {object} context
 * @returns {object}
 */
export async function treinarModeloUsuario(context = {}) {
  const userId = String(context?.userId || '');
  if (!userId) return { error: 'userId obrigatorio' };

  // Busca todo o histórico de gastos variados com categoria preenchida
  const { data: historico, error: histErr } = await supabase
    .from(TABLE_FINANCAS)
    .select('descricao, categoria')
    .eq('user_id', userId)
    .eq('tipo', 'despesa')
    .not('categoria', 'is', null)
    .not('descricao', 'is', null);

  if (histErr) return { error: histErr.message };

  const transactions = (historico || []).filter(t => t.descricao && t.categoria);
  const pesos = calcularNaiveBayesWeights(transactions);
  const aprendizado = Math.min(100, Math.round((transactions.length / 30) * 100));

  const payload = {
    user_id: userId,
    mes_ano: new Date().toISOString().slice(0, 7),
    escopo: 'financeiro',
    origem: 'treinamento_manual',
    pesos,
    aprendizado_percentual: aprendizado,
    payload: { total_transacoes: transactions.length },
    metadados: { treinado_em: new Date().toISOString() },
  };

  const { error: insertErr } = await supabase
    .from(TABLE_FINANCEIRO_MODELO_ESTADO)
    .insert(payload);

  if (insertErr) return { error: insertErr.message };

  return {
    ok: true,
    total_transacoes: transactions.length,
    vocab_size: pesos.vocab_size || 0,
    aprendizado_percentual: aprendizado,
  };
}

/**
 * Treina o modelo Naive Bayes de TODOS os usuários do sistema.
 * Ideal para execução agendada via Cron (ex: Vercel Crons toda madrugada).
 * @returns {object}
 */
export async function treinarModeloTodosUsuarios() {
  try {
    const { data: usersData, error: usersErr } = await supabase
      .from(TABLE_FINANCAS)
      .select('user_id')
      .not('user_id', 'is', null);

    if (usersErr) return { error: usersErr.message };

    const userIds = Array.from(new Set((usersData || []).map(u => String(u.user_id)).filter(Boolean)));
    const resultados = [];

    for (const userId of userIds) {
      const res = await treinarModeloUsuario({ userId });
      resultados.push({ userId, status: res.ok ? 'sucesso' : 'erro', detalhe: res });
    }

    return { ok: true, total_usuarios_treinados: resultados.length, resultados };
  } catch (err) {
    return { error: err.message || 'Erro ao treinar modelos de todos os usuários' };
  }
}

/**
 * Classifica a descrição de uma transação usando o modelo treinado do usuário.
 * @param {string} descricao
 * @param {object} context
 * @returns {object}
 */
export async function classificarTransacao(descricao, context = {}) {
  if (!descricao) return { error: 'descricao obrigatoria' };

  const modeloState = await carregarPesosModelo(context);
  const pesos = modeloState?.pesos || {};

  const categoria = inferCategory(descricao, pesos);

  return {
    descricao,
    categoria_sugerida: categoria,
    modelo_treinado: modeloState !== null,
    aprendizado_percentual: modeloState?.aprendizado_percentual || 0,
  };
}
