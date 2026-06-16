import { supabase } from '../lib/supabase.js';
import {
  TABLE_DESPESAS_FIXAS,
  TABLE_FINANCAS,
  TABLE_FINANCEIRO_ANALISES,
  TABLE_FINANCEIRO_FEATURES_MENSAIS,
  buildFinanceiroAnalise,
  classificarFinancas,
  defaultFinanceiroPesos,
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

async function getHistoricalFeatures(limit = 12) {
  const query = supabase.from(TABLE_FINANCEIRO_FEATURES_MENSAIS).select('*');
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
    const { ano, mes } = parseMesAno(mesAno);
    const { start, end } = rangeMes(ano, mes);
    const yearStart = new Date(ano, 0, 1).toISOString();
    const yearEnd = new Date(ano, 11, 31, 23, 59, 59, 999).toISOString();
    const prevMes = previousMesAno(mesAno);

    const [yearFinancasResult, yearFixasResult, currentFeatureResult, prevFeatureResult, historyFeatureResult] = await Promise.all([
      supabase.from(TABLE_FINANCAS).select('*').gte('created_at', yearStart).lte('created_at', yearEnd),
      supabase.from(TABLE_DESPESAS_FIXAS).select('*').gte('created_at', yearStart).lte('created_at', yearEnd),
      supabase.from(TABLE_FINANCEIRO_FEATURES_MENSAIS).select('*').eq('mes_ano', mesAno).limit(1),
      prevMes
        ? supabase.from(TABLE_FINANCEIRO_FEATURES_MENSAIS).select('*').eq('mes_ano', prevMes).limit(1)
        : Promise.resolve({ data: [], error: null }),
      getHistoricalFeatures(12),
    ]);

    const yearFinancas = yearFinancasResult.data || [];
    const yearFinancasErr = yearFinancasResult.error;
    const yearFixas = yearFixasResult.data || [];
    const yearFixasErr = yearFixasResult.error;
    const currentFeatureRow = rowOrFirst(currentFeatureResult.data);
    const prevFeatureRow = rowOrFirst(prevFeatureResult.data);
    const historyRows = historyFeatureResult.data || [];

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

    const analise = buildFinanceiroAnalise({
      mesAno,
      receitasMes,
      gastosMes,
      despesasFixasMes: monthFixas,
      receitasAno,
      gastosAno,
      despesasFixasAno: yearFixas,
      historico: historyRows,
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
      },
      modelo_versao: analise.modelo?.versao || 'financeiro-adaptive-v1',
      modo_aprendizado: analise.modelo?.modo_aprendizado || 'somente_cron',
    };
    const analysisRow = await persistMonthlyRecord(TABLE_FINANCEIRO_ANALISES, analysisPayload, 'mes_ano');

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
        previous_cycle: Boolean(previousState),
        historico: historyRows.map((row) => ({
          mes_ano: row?.mes_ano || null,
          receitas_total: Number(row?.receitas_total ?? row?.payload?.resumo_mensal?.receitas ?? 0),
          despesas_totais: Number(row?.despesas_totais ?? row?.payload?.resumo_mensal?.despesas_totais ?? 0),
          saldo_real: Number(row?.saldo_real ?? row?.payload?.resumo_mensal?.saldo ?? 0),
          top_categoria: row?.top_categoria ?? row?.payload?.metadados?.top_category?.categoria ?? null,
          risco_score: Number(row?.risco_score ?? row?.payload?.modelo?.score_risco?.score ?? 0),
          risco_classificado: String(row?.risco_classificado ?? row?.payload?.modelo?.score_risco?.classificado ?? 'baixo'),
          aprendizado_percentual: Number(row?.payload?.modelo?.aprendizado?.percentual ?? 0),
        })),
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
