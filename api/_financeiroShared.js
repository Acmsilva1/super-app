import { supabase } from '../lib/supabase.js';
import {
  TABLE_DESPESAS_FIXAS,
  TABLE_FINANCAS,
  TIPO_REGISTRO_DESPESA_FIXA,
  TIPO_REGISTRO_GASTO_VARIADO,
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
} from '../modulos/financeiro/index.js';

function getBody(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
}

function rowOrFirst(data) {
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
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

  const financasMes = filtrarFinancasPorMes(allFinancasRows || [], ano, mes);
  const { receitas, gastosVariados } = classificarFinancas(financasMes);

  const receitasTabela = montarTabelaFinanceiroRows(receitas, TIPO_REGISTRO_RECEITA);
  const gastosVariadosTabela = montarTabelaFinanceiroRows(gastosVariados, TIPO_REGISTRO_GASTO_VARIADO);
  const despesasFixasTabela = montarTabelaFinanceiroRows(despesasFixasRowsRaw || [], TIPO_REGISTRO_DESPESA_FIXA);

  const dashboard = calcularDashboard({
    receitasRows: receitas,
    gastosRows: gastosVariados,
    despesasFixasRows: despesasFixasRowsRaw || [],
  });
  const graficos = calcularGraficos({
    gastosRows: gastosVariados,
    despesasFixasRows: despesasFixasRowsRaw || [],
  });

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
      },
    },
  };
}

export async function criarRegistroFinanceiro(req) {
  const body = getBody(req);
  const parsed = payloadInsertFinanceiro(body);
  if (parsed.error) return { status: 400, data: { error: parsed.error } };

  const table = parsed.tipo_registro === TIPO_REGISTRO_DESPESA_FIXA ? TABLE_DESPESAS_FIXAS : TABLE_FINANCAS;
  const payload = { ...parsed.payload };
  if (parsed.tipo_registro === TIPO_REGISTRO_DESPESA_FIXA && body.mes_ano && /^\d{4}-\d{2}$/.test(String(body.mes_ano))) {
    const { ano, mes } = parseMesAno(String(body.mes_ano));
    payload.created_at = new Date(ano, mes - 1, 1, 12, 0, 0, 0).toISOString();
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

  const table = parsed.tipo_registro === TIPO_REGISTRO_DESPESA_FIXA ? TABLE_DESPESAS_FIXAS : TABLE_FINANCAS;
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
    if (!tipoRegistro) return { status: 404, data: { error: 'registro nao encontrado para exclusao' } };
  }

  if (![TIPO_REGISTRO_DESPESA_FIXA, TIPO_REGISTRO_GASTO_VARIADO, TIPO_REGISTRO_RECEITA].includes(tipoRegistro)) {
    return { status: 400, data: { error: 'tipo_registro invalido' } };
  }
  const table = tipoRegistro === TIPO_REGISTRO_DESPESA_FIXA ? TABLE_DESPESAS_FIXAS : TABLE_FINANCAS;
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) return { status: 500, data: { error: error.message } };
  return { status: 200, data: { ok: true } };
}
