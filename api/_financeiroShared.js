import { supabase } from '../lib/supabase.js';
import {
  TABLE_DESPESAS_FIXAS,
  TABLE_FINANCAS,
  TABLE_POUPANCA_METAS,
  TABLE_POUPANCA,
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
  montarTabelaFinanceiroRows,
  payloadInsertFinanceiro,
  payloadUpdateFinanceiro,
  inferTipoRegistro,
} from '../features/financeiro/index.js';

function getBody(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
}

function rowOrFirst(data) {
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

function isMissingTableError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01' || message.includes('does not exist') || message.includes('não existe');
}

function normalizeDate(dateLike) {
  const s = String(dateLike || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function obterFinanceiroMes(query = {}) {
  const { ano, mes } = parseMesAno(query.mes_ano);
  const { start, end, mes_ano } = rangeMes(ano, mes);

  const { data: allFinancasRows, error: errFin } = await supabase
    .from(TABLE_FINANCAS)
    .select('*')
    .order('created_at', { ascending: false });
  if (errFin) return { error: errFin.message, status: 500 };

  const { data: despesasFixasRowsRaw, error: errFixas } = await supabase
    .from(TABLE_DESPESAS_FIXAS)
    .select('*')
    .gte('created_at', start)
    .lte('created_at', end)
    .order('created_at', { ascending: false });
  if (errFixas) return { error: errFixas.message, status: 500 };

  let poupancaRowsRaw = [];
  let poupancaConfigured = true;
  const { data: poupaData, error: errPoupa } = await supabase
    .from(TABLE_POUPANCA)
    .select('*')
    .order('data_lancamento', { ascending: false })
    .order('created_at', { ascending: false });
  if (errPoupa) {
    if (isMissingTableError(errPoupa)) {
      poupancaConfigured = false;
      poupancaRowsRaw = [];
    } else {
      return { error: errPoupa.message, status: 500 };
    }
  } else {
    poupancaRowsRaw = poupaData || [];
  }

  let poupancaMetaAtiva = null;
  let poupancaMetaConfigured = true;
  const { data: metaRows, error: errMeta } = await supabase
    .from(TABLE_POUPANCA_METAS)
    .select('*')
    .eq('ativa', true)
    .order('created_at', { ascending: false })
    .limit(1);
  if (errMeta) {
    if (isMissingTableError(errMeta)) {
      poupancaMetaConfigured = false;
    } else {
      return { error: errMeta.message, status: 500 };
    }
  } else {
    poupancaMetaAtiva = Array.isArray(metaRows) && metaRows.length > 0 ? metaRows[0] : null;
  }

  const financasMes = filtrarFinancasPorMes(allFinancasRows || [], ano, mes);
  const { receitas, gastosVariados } = classificarFinancas(financasMes);

  const receitasTabela = montarTabelaFinanceiroRows(receitas, TIPO_REGISTRO_RECEITA);
  const gastosVariadosTabela = montarTabelaFinanceiroRows(gastosVariados, TIPO_REGISTRO_GASTO_VARIADO);
  const despesasFixasTabela = montarTabelaFinanceiroRows(despesasFixasRowsRaw || [], TIPO_REGISTRO_DESPESA_FIXA);
  const poupancaTabela = montarTabelaFinanceiroRows(poupancaRowsRaw || [], TIPO_REGISTRO_POUPANCA);

  const dashboard = calcularDashboard({
    receitasRows: receitas,
    gastosRows: gastosVariados,
    despesasFixasRows: despesasFixasRowsRaw || [],
  });
  const graficos = calcularGraficos({
    gastosRows: gastosVariados,
    despesasFixasRows: despesasFixasRowsRaw || [],
  });

  const poupancaTotal = Math.round((poupancaRowsRaw || []).reduce((acc, r) => acc + (Number(r?.valor) || 0), 0) * 100) / 100;
  const valorMeta = Number(poupancaMetaAtiva?.valor_meta || 0);
  const progressoMeta = valorMeta > 0 ? Math.max(0, Math.min(1, poupancaTotal / valorMeta)) : 0;
  const statusMeta = valorMeta <= 0
    ? 'sem_meta'
    : progressoMeta >= 1
      ? 'alvo'
      : progressoMeta >= 0.7
        ? 'alerta'
        : 'progresso';

  return {
    status: 200,
    data: {
      mes_ano,
      dashboard,
      graficos,
      tabelas: {
        despesas_fixas: despesasFixasTabela,
        gastos_variados: gastosVariadosTabela,
        receitas: receitasTabela,
        poupanca: poupancaTabela,
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
    },
  };
}

export async function criarRegistroFinanceiro(req) {
  const body = getBody(req);
  const parsed = payloadInsertFinanceiro(body);
  if (parsed.error) return { status: 400, data: { error: parsed.error } };
  const table = parsed.tipo_registro === TIPO_REGISTRO_DESPESA_FIXA
    ? TABLE_DESPESAS_FIXAS
    : parsed.tipo_registro === TIPO_REGISTRO_POUPANCA
      ? TABLE_POUPANCA
      : parsed.tipo_registro === TIPO_REGISTRO_META_POUPANCA
        ? TABLE_POUPANCA_METAS
        : TABLE_FINANCAS;
  const payload = { ...parsed.payload };
  if (parsed.tipo_registro === TIPO_REGISTRO_DESPESA_FIXA && body.mes_ano && /^\d{4}-\d{2}$/.test(String(body.mes_ano))) {
    const { ano, mes } = parseMesAno(String(body.mes_ano));
    payload.created_at = new Date(ano, mes - 1, 1, 12, 0, 0, 0).toISOString();
  }

  if (parsed.tipo_registro === TIPO_REGISTRO_META_POUPANCA) {
    const { error: deactivateErr } = await supabase
      .from(TABLE_POUPANCA_METAS)
      .update({ ativa: false })
      .eq('ativa', true);
    if (deactivateErr && !isMissingTableError(deactivateErr)) {
      return { status: 500, data: { error: deactivateErr.message } };
    }
  }

  const { data, error } = await supabase.from(table).insert(payload).select().single();
  if (error) return { status: 500, data: { error: error.message } };
  const row = rowOrFirst(data);
  return { status: 201, data: { ...(row || {}), tipo_registro: parsed.tipo_registro } };
}

export async function atualizarRegistroFinanceiro(req) {
  const body = getBody(req);
  const parsed = payloadUpdateFinanceiro(body);
  if (parsed.error) return { status: 400, data: { error: parsed.error } };

  const table = parsed.tipo_registro === TIPO_REGISTRO_DESPESA_FIXA
    ? TABLE_DESPESAS_FIXAS
    : parsed.tipo_registro === TIPO_REGISTRO_POUPANCA
      ? TABLE_POUPANCA
      : parsed.tipo_registro === TIPO_REGISTRO_META_POUPANCA
        ? TABLE_POUPANCA_METAS
      : TABLE_FINANCAS;
  const { data, error } = await supabase.from(table).update(parsed.payload).eq('id', parsed.id).select().single();
  if (error) return { status: 500, data: { error: error.message } };
  const row = rowOrFirst(data);
  return { status: 200, data: { ...(row || {}), tipo_registro: parsed.tipo_registro } };
}

export async function removerRegistroFinanceiro(req) {
  const body = getBody(req);
  let tipoRegistro = String(body.tipo_registro || req.query?.tipo_registro || '').trim();
  if (!tipoRegistro) tipoRegistro = inferTipoRegistro({ ...req.query, ...body });
  const id = body.id ?? req.query?.id;
  if (!id) return { status: 400, data: { error: 'id obrigatorio' } };

  if (!tipoRegistro) {
    const { data: inFin, error: errFin } = await supabase.from(TABLE_FINANCAS).select('id').eq('id', id).limit(1);
    if (errFin) return { status: 500, data: { error: errFin.message } };
    if (Array.isArray(inFin) && inFin.length > 0) tipoRegistro = TIPO_REGISTRO_GASTO_VARIADO;
    if (!tipoRegistro) {
      const { data: inFix, error: errFix } = await supabase.from(TABLE_DESPESAS_FIXAS).select('id').eq('id', id).limit(1);
      if (errFix) return { status: 500, data: { error: errFix.message } };
      if (Array.isArray(inFix) && inFix.length > 0) tipoRegistro = TIPO_REGISTRO_DESPESA_FIXA;
    }
    if (!tipoRegistro) {
      const { data: inPoupa, error: errPoupa } = await supabase.from(TABLE_POUPANCA).select('id').eq('id', id).limit(1);
      if (errPoupa && !isMissingTableError(errPoupa)) return { status: 500, data: { error: errPoupa.message } };
      if (Array.isArray(inPoupa) && inPoupa.length > 0) tipoRegistro = TIPO_REGISTRO_POUPANCA;
    }
    if (!tipoRegistro) {
      const { data: inMeta, error: errMeta } = await supabase.from(TABLE_POUPANCA_METAS).select('id').eq('id', id).limit(1);
      if (errMeta && !isMissingTableError(errMeta)) return { status: 500, data: { error: errMeta.message } };
      if (Array.isArray(inMeta) && inMeta.length > 0) tipoRegistro = TIPO_REGISTRO_META_POUPANCA;
    }
    if (!tipoRegistro) return { status: 404, data: { error: 'registro nao encontrado para exclusao' } };
  }

  if (![TIPO_REGISTRO_DESPESA_FIXA, TIPO_REGISTRO_GASTO_VARIADO, TIPO_REGISTRO_RECEITA, TIPO_REGISTRO_POUPANCA, TIPO_REGISTRO_META_POUPANCA].includes(tipoRegistro)) {
    return { status: 400, data: { error: 'tipo_registro invalido' } };
  }
  const table = tipoRegistro === TIPO_REGISTRO_DESPESA_FIXA
    ? TABLE_DESPESAS_FIXAS
    : tipoRegistro === TIPO_REGISTRO_POUPANCA
      ? TABLE_POUPANCA
      : tipoRegistro === TIPO_REGISTRO_META_POUPANCA
        ? TABLE_POUPANCA_METAS
      : TABLE_FINANCAS;
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) return { status: 500, data: { error: error.message } };
  return { status: 200, data: { ok: true } };
}
