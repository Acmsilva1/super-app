import { supabase } from '../lib/supabase.js';
import {
  TABLE_COMPRAS,
  TABLE_DESPESAS_FIXAS,
  TABLE_FINANCAS,
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
function buildGraficosAnuaisFromView(ano, viewRows) {
  const year = Number(ano);
  const meses = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    mes_ano: `${year}-${String(i + 1).padStart(2, '0')}`,
    receitas: 0,
    despesas_fixas: 0,
    despesas_variadas: 0,
    despesas: 0,
    saldo: 0,
  }));
  for (const row of viewRows || []) {
    const idx = meses.findIndex((m) => m.mes_ano === row.mes_ano);
    if (idx === -1) continue;
    meses[idx].receitas = Number(row.receitas || 0);
    meses[idx].despesas_fixas = Number(row.despesas_fixas || 0);
    meses[idx].despesas_variadas = Number(row.despesas_variadas || 0);
    meses[idx].despesas = Number(row.despesas_totais || 0);
    meses[idx].saldo = Number(row.saldo || 0);
  }
  return meses;
}

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
  const monthPeriodFilter = periodOrFilter({ dayStart, dayEnd, start, end });

  await garantirDespesasFixasMes(mes_ano, context);

  const [
    resumoMensalResult,
    categoriasMensalResult,
    historicoAnualResult,
    poupancaResumoResult,
    comprasMensalResult,
    financasMesResult,
    despesasFixasMesResult,
    poupancaLogsResult,
    comprasLogsResult,
  ] = await Promise.all([
    // ── Views: o banco agrega e entrega pronto ─────────────────────────────
    scopeQueryByUser(
      supabase.from('vw_financeiro_resumo_mensal')
        .select('receitas,despesas_variadas,despesas_fixas,saldo,fixas_pagas,fixas_pendentes')
        .eq('mes_ano', mes_ano),
      context
    ),
    scopeQueryByUser(
      supabase.from('vw_financeiro_categoria_mensal')
        .select('categoria,valor_total,quantidade_lancamentos,media_lancamento,ranking_maior,ranking_menor')
        .eq('mes_ano', mes_ano)
        .order('ranking_maior', { ascending: true }),
      context
    ),
    includeAnuais
      ? scopeQueryByUser(
          supabase.from('vw_financeiro_historico_anual')
            .select('mes_ano,receitas,despesas_fixas,despesas_variadas,despesas_totais,saldo')
            .eq('ano', ano),
          context
        )
      : Promise.resolve({ data: [], error: null }),
    scopeQueryByUser(
      supabase.from('vw_financeiro_poupanca_resumo')
        .select('total_acumulado,meta_id,nome_meta,valor_meta,data_inicio,progresso,status_meta'),
      context
    ),
    scopeQueryByUser(
      supabase.from('vw_financeiro_compras_mensal')
        .select('valor_total,quantidade_compras,ticket_medio')
        .eq('mes_ano', mes_ano),
      context
    ),
    // ── Raw: apenas linhas do mês para tabelas de exibição e análise textual ─
    scopeQueryByUser(
      supabase.from(TABLE_FINANCAS)
        .select('*')
        .or(monthPeriodFilter)
        .order('created_at', { ascending: false }),
      context
    ),
    scopeQueryByUser(
      supabase.from(TABLE_DESPESAS_FIXAS)
        .select('*')
        .gte('created_at', start)
        .lte('created_at', end)
        .order('created_at', { ascending: false }),
      context
    ),
    scopeQueryByUser(
      supabase.from(TABLE_POUPANCA)
        .select('*')
        .order('created_at', { ascending: false }),
      context
    ),
    scopeQueryByUser(
      supabase.from(TABLE_COMPRAS)
        .select('*')
        .or(monthPeriodFilter)
        .order('created_at', { ascending: false }),
      context
    ),
  ]);

  if (financasMesResult.error) return { error: financasMesResult.error.message, status: 500 };
  if (despesasFixasMesResult.error) return { error: despesasFixasMesResult.error.message, status: 500 };

  let poupancaConfigured = true;
  if (poupancaLogsResult.error) {
    if (isMissingTableError(poupancaLogsResult.error)) poupancaConfigured = false;
    else return { error: poupancaLogsResult.error.message, status: 500 };
  }

  let poupancaMetaConfigured = true;
  if (poupancaResumoResult.error && !isMissingTableError(poupancaResumoResult.error)) {
    poupancaMetaConfigured = false;
  }

  let comprasConfigured = true;
  if (comprasLogsResult.error) {
    if (isMissingTableError(comprasLogsResult.error)) comprasConfigured = false;
    else return { error: comprasLogsResult.error.message, status: 500 };
  }

  // ── Dashboard (banco agregou, Node só lê) ─────────────────────────────────
  const resumoRow = resumoMensalResult.data?.[0] || {};
  const despesas_variadas_val = Number(resumoRow.despesas_variadas || 0);
  const despesas_fixas_val = Number(resumoRow.despesas_fixas || 0);
  const despesas_totais_val = Math.round((despesas_variadas_val + despesas_fixas_val) * 100) / 100;
  const saldo_val = Number(resumoRow.saldo || 0);
  const dashboard = {
    receitas: Number(resumoRow.receitas || 0),
    despesas_fixas: despesas_fixas_val,
    despesas_variadas: despesas_variadas_val,
    despesas_totais: despesas_totais_val,
    saldo: saldo_val,
    liquido: saldo_val,
  };

  // ── Gráficos (banco agregou por categoria) ────────────────────────────────
  const graficos = {
    categorias_gastos: (categoriasMensalResult.data || []).map((c) => ({
      categoria: c.categoria,
      valor: Number(c.valor_total || 0),
      quantidade: c.quantidade_lancamentos,
      media: Number(c.media_lancamento || 0),
    })),
    pagos_pendentes: {
      pago: Number(resumoRow.fixas_pagas || 0),
      pendente: Number(resumoRow.fixas_pendentes || 0),
    },
  };

  // ── Histórico anual (banco fez o join e os rankings) ─────────────────────
  const graficosAnuais = buildGraficosAnuaisFromView(ano, historicoAnualResult.data || []);

  // ── Poupança (banco calculou total, progresso e status) ───────────────────
  const poupancaResumoRow = poupancaResumoResult.data?.[0] || {};
  const poupancaTotal = Number(poupancaResumoRow.total_acumulado || 0);
  const valorMeta = Number(poupancaResumoRow.valor_meta || 0);
  const progressoMeta = Number(poupancaResumoRow.progresso || 0);
  const statusMeta = poupancaResumoRow.status_meta || 'sem_meta';
  const poupancaMetaAtiva = poupancaResumoRow.meta_id
    ? {
        id: poupancaResumoRow.meta_id,
        nome_meta: String(poupancaResumoRow.nome_meta || ''),
        valor_meta: valorMeta,
        data_inicio: normalizeDate(poupancaResumoRow.data_inicio),
        progresso: Math.round(progressoMeta * 10000) / 10000,
        status: statusMeta,
      }
    : null;

  // ── Compras (banco agregou o total do mês) ────────────────────────────────
  const comprasMensalRow = comprasMensalResult.data?.[0] || {};
  const comprasTotal = Number(comprasMensalRow.valor_total || 0);

  // ── Tabelas de exibição (rows individuais para o frontend) ────────────────
  const financasMes = filtrarFinancasPorMes(financasMesResult.data || [], ano, mes);
  const { receitas: receitasRaw, gastosVariados } = classificarFinancas(financasMes);
  const comprasMes = filtrarFinancasPorMes(comprasLogsResult.data || [], ano, mes);
  const despesasFixasRowsRaw = despesasFixasMesResult.data || [];
  const poupancaRowsRaw = poupancaLogsResult.data || [];

  const receitasTabela = montarTabelaFinanceiroRows(receitasRaw, TIPO_REGISTRO_RECEITA);
  const gastosVariadosTabela = montarTabelaFinanceiroRows(gastosVariados, TIPO_REGISTRO_GASTO_VARIADO)
    .map((r) => ({ ...r, tipo_registro: resolveTipoRegistroFinanceiro(r, TIPO_REGISTRO_GASTO_VARIADO) }));
  const despesasFixasTabela = montarTabelaFinanceiroRows(despesasFixasRowsRaw, TIPO_REGISTRO_DESPESA_FIXA);
  const poupancaTabela = montarTabelaFinanceiroRows(poupancaRowsRaw, TIPO_REGISTRO_POUPANCA);
  const comprasTabela = montarTabelaFinanceiroRows(comprasMes, TIPO_REGISTRO_COMPRA);

  // ── Análise de Risco e Padrões (precisam dos rows brutos — inevitável) ────
  const brazilNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const diaAtual = brazilNow.getDate();
  const totalDias = new Date(ano, mes, 0).getDate();

  const analiseRisco = calcularAnaliseRiscoConsumo({
    receitas: dashboard.receitas,
    despesasFixas: dashboard.despesas_fixas,
    gastosVariados,
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
        meta_ativa: poupancaMetaAtiva,
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


