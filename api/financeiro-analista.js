import { supabase } from '../lib/supabase.js';
import {
  TABLE_DESPESAS_FIXAS,
  TABLE_FINANCAS,
  TABLE_FINANCEIRO_ANALISE_RUNS,
  TABLE_FINANCEIRO_ANALISES,
  TABLE_FINANCEIRO_FEATURES_MENSAIS,
  TABLE_FINANCEIRO_MODELO_ESTADO,
  buildFinanceiroAnalise,
  classificarFinancas,
  defaultFinanceiroPesos,
  getBrazilTodayIso,
  filtrarFinancasPorMes,
  normalizarFinanceiroPesos,
  parseMesAno,
  rangeMes,
} from '../features/financeiro/index.js';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

function rowOrFirst(data) {
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

async function insertRecord(table, payload) {
  const insert = await supabase.from(table).insert(payload).select();
  if (insert.error) throw insert.error;
  return rowOrFirst(insert.data);
}

function isHealth(req) {
  return req.query?.health === '1';
}

function previousMesAno(mesAno) {
  const [ano, mes] = String(mesAno || '').split('-').map(Number);
  if (!Number.isFinite(ano) || !Number.isFinite(mes)) return null;
  const d = new Date(Date.UTC(ano, mes - 1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
}

function rowMesAno(row) {
  const raw = String(row?.data_lancamento || row?.created_at || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.slice(0, 7) : null;
}

function isFutureMesAno(mesAno, referenceMesAno) {
  const current = String(mesAno || '').slice(0, 7);
  const reference = String(referenceMesAno || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(current) || !/^\d{4}-\d{2}$/.test(reference)) return false;
  return current > reference;
}

function isRealLearningState(row) {
  return String(row?.origem || '') === 'cron_aprendizado'
    && String(row?.metadados?.allow_learning ?? true) !== 'false'
    && String(row?.metadados?.cron_run ?? false) === 'true';
}

function buildHistoricoMensalAno({ financasRows = [], fixasRows = [] } = {}) {
  const grupos = new Map();
  const ensure = (mesAno) => {
    if (!mesAno) return null;
    if (!grupos.has(mesAno)) {
      grupos.set(mesAno, { mes_ano: mesAno, receitas: [], gastos: [], fixas: [] });
    }
    return grupos.get(mesAno);
  };

  for (const row of financasRows || []) {
    const mesAno = rowMesAno(row);
    const bucket = ensure(mesAno);
    if (!bucket) continue;
    if (String(row?.tipo || '').toLowerCase() === 'receita') bucket.receitas.push(row);
    else bucket.gastos.push(row);
  }

  for (const row of fixasRows || []) {
    const mesAno = rowMesAno(row);
    const bucket = ensure(mesAno);
    if (!bucket) continue;
    bucket.fixas.push(row);
  }

  return [...grupos.values()]
    .sort((a, b) => a.mes_ano.localeCompare(b.mes_ano))
    .map((item) => {
      const dashboard = (() => {
        const receitas = item.receitas.reduce((acc, row) => acc + Number(row?.valor || 0), 0);
        const despesasVariadas = item.gastos.reduce((acc, row) => acc + Number(row?.valor || 0), 0);
        const despesasFixas = item.fixas.reduce((acc, row) => acc + Number(row?.valor || 0), 0);
        return {
          receitas: Number(receitas.toFixed(2)),
          despesas_variadas: Number(despesasVariadas.toFixed(2)),
          despesas_fixas: Number(despesasFixas.toFixed(2)),
          saldo: Number((receitas - despesasVariadas - despesasFixas).toFixed(2)),
        };
      })();

      return {
        mes_ano: item.mes_ano,
        receitas_total: dashboard.receitas,
        despesas_totais: Number((dashboard.despesas_variadas + dashboard.despesas_fixas).toFixed(2)),
        saldo_real: dashboard.saldo,
      };
    });
}

function extractModelWeights(row) {
  return row?.metadados?.pesos
    || row?.payload?.modelo?.pesos
    || row?.pesos
    || null;
}

function extractPreviousState(row) {
  if (!row) return null;
  return {
    saldo_projetado: Number(row.saldo_projetado ?? row?.payload?.projecao?.saldo_projetado ?? 0),
    receitas_projetadas: Number(row.receitas_projetadas ?? row?.payload?.projecao?.receitas_projetadas ?? 0),
    despesas_projetadas: Number(row.despesas_projetadas ?? row?.payload?.projecao?.despesas_projetadas ?? 0),
    saldo_real: Number(row.saldo_real ?? row?.payload?.resumo_mensal?.saldo ?? 0),
    receitas_reais: Number(row.receitas_total ?? row?.payload?.resumo_mensal?.receitas ?? 0),
    despesas_reais: Number(row.despesas_totais ?? row?.payload?.resumo_mensal?.despesas_totais ?? 0),
    mes_ano: row.mes_ano ?? null,
    status_mes: row.status_mes ?? null,
  };
}

function buildFeaturePayload({ analise, riskScore, mesAno, model, saldoReal, currentCategory, counts = {} }) {
  const resumo = analise?.resumo_mensal || {};
  const projecao = analise?.projecao || {};
  const metadados = analise?.metadados || {};
  const topCategory = currentCategory || metadados.top_category || null;
  return {
    mes_ano: mesAno,
    escopo: 'financeiro',
    receitas_total: Number(resumo.receitas || 0),
    despesas_fixas_total: Number(resumo.despesas_fixas || 0),
    despesas_variaveis_total: Number(resumo.despesas_variadas || 0),
    despesas_totais: Number(resumo.despesas_totais || 0),
    saldo_real: Number(saldoReal ?? resumo.saldo ?? 0),
    dias_no_mes: Number(projecao.dias_no_mes || 0),
    dias_decorridos: Number(projecao.dias_decorridos || 0),
    ritmo_receitas_diario: Number(projecao.ritmo_receitas_diario || 0),
    ritmo_despesas_diario: Number(projecao.ritmo_despesas_diario || 0),
    ritmo_saldo_diario: Number(projecao.ritmo_saldo_diario || 0),
    receitas_projetadas: Number(projecao.receitas_projetadas ?? 0),
    despesas_projetadas: Number(projecao.despesas_projetadas ?? 0),
    saldo_projetado: Number(projecao.saldo_projetado ?? 0),
    peso_despesas_fixas_pct: Number(resumo.fixas_ratio_receitas || 0),
    peso_despesas_variaveis_pct: Number(resumo.variaveis_ratio_receitas || 0),
    top_categoria: topCategory?.categoria || null,
    top_categoria_valor: Number(topCategory?.valor || 0),
    top_categoria_pct: Number(metadados.top_category?.valor ? ((Number(metadados.top_category.valor) / Math.max(1, Number(resumo.despesas_totais || 0))) * 100).toFixed(4) : 0),
    qtd_lancamentos: Number(counts.lancamentos || 0),
    qtd_receitas: Number(counts.receitas || 0),
    qtd_gastos_variados: Number(counts.gastos_variados || 0),
    qtd_despesas_fixas: Number(counts.despesas_fixas || 0),
    risco_score: Number(riskScore?.score ?? 0),
    risco_classificado: String(riskScore?.classificado || 'baixo'),
    status_mes: 'aberto',
    fechamento_realizado: false,
    analise_id: null,
    payload: {
      resumo_mensal: resumo,
      resumo_anual: analise?.resumo_anual || {},
      projecao,
      projecao_variavel: {
        ritmo_despesas_fixas_diario: Number(projecao.ritmo_despesas_fixas_diario || 0),
        ritmo_despesas_variaveis_diario: Number(projecao.ritmo_despesas_variaveis_diario || 0),
        ritmo_despesas_variaveis_semanal: Number(projecao.ritmo_despesas_variaveis_semanal || 0),
        despesas_fixas_projetadas: Number(projecao.despesas_fixas_projetadas ?? 0),
        despesas_variaveis_projetadas: Number(projecao.despesas_variaveis_projetadas ?? 0),
        categoria_variavel_risco: String(projecao.categoria_variavel_risco || topCategory?.categoria || ''),
        fator_categoria_variavel: Number(projecao.fator_categoria_variavel || 1),
      },
      sinais: analise?.sinais || [],
      recomendacoes: analise?.recomendacoes || [],
      modelo: model || {},
      metadados: {
        ...(metadados || {}),
        top_category: topCategory || null,
      },
    },
    metadados: {
      ...(model || {}),
      generated_at: metadados.generated_at || new Date().toISOString(),
      top_category: topCategory || null,
    },
  };
}

async function persistMonthlyRecord(table, payload, conflictKey = 'mes_ano') {
  const existing = await supabase.from(table).select('id').eq(conflictKey, payload[conflictKey]).limit(1);
  if (existing.error) throw existing.error;
  const found = rowOrFirst(existing.data);
  if (found?.id) {
    const update = await supabase.from(table).update(payload).eq('id', found.id).select();
    if (!update.error) return rowOrFirst(update.data);
    throw update.error;
  }
  const insert = await supabase.from(table).insert(payload).select();
  if (!insert.error) {
    return rowOrFirst(insert.data);
  }
  throw insert.error;
}

async function appendFinanceiroRecord(table, payload) {
  return insertRecord(table, payload);
}

async function getHistoricalFeatures(limit = 12) {
  const query = supabase.from(TABLE_FINANCEIRO_FEATURES_MENSAIS).select('*');
  if (query && typeof query.order === 'function' && typeof query.limit === 'function') {
    return query.order('created_at', { ascending: false }).limit(limit);
  }
  return { data: [], error: null };
}

async function getHistoricalModelState(limit = 24) {
  const query = supabase.from(TABLE_FINANCEIRO_MODELO_ESTADO).select('*');
  if (query && typeof query.order === 'function' && typeof query.limit === 'function') {
    return query.order('created_at', { ascending: false }).limit(limit);
  }
  return { data: [], error: null };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return json(res, 405, { error: 'Method Not Allowed' });
    }

    if (isHealth(req)) {
      return json(res, 200, { ok: true, service: 'financeiro-analista' });
    }

    const mesAno = String(req.query?.mes_ano || '').trim() || new Date().toISOString().slice(0, 7);
    const allowLearning = String(req.query?.learn || '') === '1';
    const cronRun = String(req.query?.cron || '') === '1';
    const generatedAt = new Date().toISOString();
    const referenciaAtualMesAno = getBrazilTodayIso().slice(0, 7);
    const { ano, mes } = parseMesAno(mesAno);
    const { start, end } = rangeMes(ano, mes);
    const yearStart = new Date(ano, 0, 1).toISOString();
    const yearEnd = new Date(ano, 11, 31, 23, 59, 59, 999).toISOString();
    const prevMes = previousMesAno(mesAno);

    const [yearFinancasResult, yearFixasResult, currentFeatureResult, prevFeatureResult, historyFeatureResult, modelStateHistoryResult] = await Promise.all([
      supabase.from(TABLE_FINANCAS).select('*').gte('created_at', yearStart).lte('created_at', yearEnd),
      supabase.from(TABLE_DESPESAS_FIXAS).select('*').gte('created_at', yearStart).lte('created_at', yearEnd),
      supabase.from(TABLE_FINANCEIRO_FEATURES_MENSAIS).select('*').eq('mes_ano', mesAno).limit(1),
      prevMes
        ? supabase.from(TABLE_FINANCEIRO_FEATURES_MENSAIS).select('*').eq('mes_ano', prevMes).limit(1)
        : Promise.resolve({ data: [], error: null }),
      getHistoricalFeatures(12),
      getHistoricalModelState(24),
    ]);

    const yearFinancas = yearFinancasResult.data || [];
    const yearFinancasErr = yearFinancasResult.error;
    const yearFixas = yearFixasResult.data || [];
    const yearFixasErr = yearFixasResult.error;
    const currentFeatureRow = rowOrFirst(currentFeatureResult.data);
    const prevFeatureRow = rowOrFirst(prevFeatureResult.data);
    const historyRows = historyFeatureResult.data || [];
    const modelStateHistoryRows = modelStateHistoryResult.data || [];

    if (yearFinancasErr) return json(res, 500, { error: yearFinancasErr.message });
    if (yearFixasErr) return json(res, 500, { error: yearFixasErr.message });

    const monthFinancas = filtrarFinancasPorMes(yearFinancas, ano, mes);
    const monthFixas = filtrarFinancasPorMes(yearFixas, ano, mes);
    const { receitas: receitasMes, gastosVariados: gastosMes } = classificarFinancas(monthFinancas);
    const { receitas: receitasAno, gastosVariados: gastosAno } = classificarFinancas(yearFinancas);

    const baseWeights = normalizarFinanceiroPesos(
      extractModelWeights(currentFeatureRow)
      || extractModelWeights(prevFeatureRow)
      || defaultFinanceiroPesos()
    );
    const previousState = extractPreviousState(currentFeatureRow) || extractPreviousState(prevFeatureRow);

    const historicoMensalAno = buildHistoricoMensalAno({
      financasRows: yearFinancas,
      fixasRows: yearFixas,
    });
    const historicoAprendizado = (historicoMensalAno.length ? historicoMensalAno : historyRows)
      .filter((row) => !isFutureMesAno(row?.mes_ano, referenciaAtualMesAno));
    const modelStateHistoryAprendizado = modelStateHistoryRows
      .filter(isRealLearningState)
      .filter((row) => !isFutureMesAno(row?.mes_ano, referenciaAtualMesAno));
    const futureIgnoredCount = Math.max(0, (historicoMensalAno.length ? historicoMensalAno : historyRows).length - historicoAprendizado.length)
      + Math.max(0, modelStateHistoryRows.length - modelStateHistoryAprendizado.length);

    const analise = buildFinanceiroAnalise({
      mesAno,
      receitasMes,
      gastosMes,
      despesasFixasMes: monthFixas,
      receitasAno,
      gastosAno,
      despesasFixasAno: yearFixas,
      historico: historicoAprendizado,
      learningHistory: modelStateHistoryAprendizado,
      pesos: baseWeights,
      previousState,
      allowLearning,
    });

    const featurePayload = buildFeaturePayload({
      analise,
      riskScore: analise.modelo?.score_risco,
      mesAno,
      model: analise.modelo,
      saldoReal: analise.resumo_mensal?.saldo,
      currentCategory: analise.metadados?.top_category || null,
      counts: {
        lancamentos: monthFinancas.length + monthFixas.length,
        receitas: receitasMes.length,
        gastos_variados: gastosMes.length,
        despesas_fixas: monthFixas.length,
      },
    });
    const featureRow = await persistMonthlyRecord(TABLE_FINANCEIRO_FEATURES_MENSAIS, featurePayload, 'mes_ano');

    const analysisPayload = {
      mes_ano: mesAno,
      escopo: 'financeiro',
      origem: 'analista_local_adaptativo',
      resumo_mensal: analise.resumo_mensal,
      resumo_anual: analise.resumo_anual,
      projecao: analise.projecao,
      sinais: analise.sinais,
      recomendacoes: analise.recomendacoes,
      metadados: {
        ...analise.metadados,
        modelo: analise.modelo,
        feature_id: featureRow?.id ?? null,
        modo_aprendizado: analise.modelo?.modo_aprendizado || 'somente_cron',
      },
      modelo_versao: analise.modelo?.versao || 'financeiro-adaptive-v1',
    };
    const analysisRow = await persistMonthlyRecord(TABLE_FINANCEIRO_ANALISES, analysisPayload, 'mes_ano');

    const runRow = await appendFinanceiroRecord(TABLE_FINANCEIRO_ANALISE_RUNS, {
      mes_ano: mesAno,
      escopo: 'financeiro',
      origem: allowLearning ? 'cron_aprendizado' : 'consulta_aba',
      tipo_execucao: allowLearning ? 'aprendizado' : 'recalculo',
      allow_learning: allowLearning,
      feature_id: featureRow?.id ?? null,
      analysis_id: analysisRow?.id ?? null,
      payload: {
        analista: analise,
        aprendizado: {
          ...(analise?.modelo?.aprendizado || {}),
          previous_cycle: Boolean(previousState),
          modo_aprendizado: analise.modelo?.modo_aprendizado || 'somente_cron',
          ciclos_aprendizado_reais: modelStateHistoryRows.length,
        },
        resumo_mensal: analise.resumo_mensal,
        resumo_anual: analise.resumo_anual,
        projecao: analise.projecao,
        sinais: analise.sinais,
        recomendacoes: analise.recomendacoes,
        features: featurePayload,
        counts: {
          lancamentos: monthFinancas.length + monthFixas.length,
          receitas: receitasMes.length,
          gastos_variados: gastosMes.length,
          despesas_fixas: monthFixas.length,
        },
        previous_state: previousState,
      },
      metadados: {
        generated_at: generatedAt,
        modelo_versao: analise.modelo?.versao || 'financeiro-adaptive-v1',
        score_risco: analise.modelo?.score_risco?.score ?? null,
        risco_classificado: analise.modelo?.score_risco?.classificado || 'baixo',
        aprendizado_percentual: analise.modelo?.aprendizado?.percentual ?? 0,
        allow_learning: allowLearning,
        cron_run: cronRun,
      },
    });

    let modelStateRow = null;
    if (allowLearning) {
      modelStateRow = await appendFinanceiroRecord(TABLE_FINANCEIRO_MODELO_ESTADO, {
        mes_ano: mesAno,
        escopo: 'financeiro',
        origem: 'cron_aprendizado',
        run_id: runRow?.id ?? null,
        feature_id: featureRow?.id ?? null,
        analysis_id: analysisRow?.id ?? null,
        pesos: analise.modelo?.pesos || {},
        feedback: analise.modelo?.feedback || {},
        score_risco: analise.modelo?.score_risco?.score ?? null,
        risco_classificado: analise.modelo?.score_risco?.classificado || 'baixo',
        aprendizado_percentual: analise.modelo?.aprendizado?.percentual ?? 0,
        payload: {
          analista: analise,
          previous_state: previousState,
          feature_row: featureRow,
          analysis_row: analysisRow,
        },
        metadados: {
          generated_at: generatedAt,
          modelo_versao: analise.modelo?.versao || 'financeiro-adaptive-v1',
          allow_learning: allowLearning,
          cron_run: cronRun,
        },
      });
    }

    return json(res, 200, {
      mes_ano: mesAno,
      janela: {
        month_start: start,
        month_end: end,
        year_start: yearStart,
        year_end: yearEnd,
      },
      analista: analise,
      aprendizado: {
        ...(analise?.modelo?.aprendizado || {}),
        feature_id: featureRow?.id ?? null,
        analysis_id: analysisRow?.id ?? null,
        run_id: runRow?.id ?? null,
        model_state_id: modelStateRow?.id ?? null,
        previous_cycle: Boolean(previousState),
        historico: historicoAprendizado.map((row) => ({
          mes_ano: row?.mes_ano || null,
          receitas_total: Number(row?.receitas_total ?? row?.payload?.resumo_mensal?.receitas ?? 0),
          despesas_totais: Number(row?.despesas_totais ?? row?.payload?.resumo_mensal?.despesas_totais ?? 0),
          saldo_real: Number(row?.saldo_real ?? row?.payload?.resumo_mensal?.saldo ?? 0),
          top_categoria: row?.top_categoria ?? row?.payload?.metadados?.top_category?.categoria ?? null,
          risco_score: Number(row?.risco_score ?? row?.payload?.modelo?.score_risco?.score ?? 0),
          risco_classificado: String(row?.risco_classificado ?? row?.payload?.modelo?.score_risco?.classificado ?? 'baixo'),
          aprendizado_percentual: Number(row?.payload?.modelo?.aprendizado?.percentual ?? 0),
        })),
        ciclos_aprendizado_reais: modelStateHistoryAprendizado.length,
        snapshots_modelo: modelStateHistoryRows.length,
        meses_futuros_ignorados: futureIgnoredCount,
      },
    });
  } catch (error) {
    const message = error?.message
      || error?.error?.message
      || error?.details
      || 'Erro interno no analista financeiro';
    return json(res, 500, { error: message });
  }
}
