import {
  STATUS_PAGO,
  STATUS_PENDENTE,
  TIPO_REGISTRO_DESPESA_FIXA,
  TIPO_REGISTRO_GASTO_VARIADO,
  TIPO_REGISTRO_RECEITA,
} from '../model/financeiro.js';

export function inferTipoRegistro(body = {}) {
  const explicit = String(body.tipo_registro || '').trim();
  if (explicit) return explicit;

  const hasStatus = body.status !== undefined;
  const tipo = String(body.tipo || '').toLowerCase().trim();
  if (hasStatus) return TIPO_REGISTRO_DESPESA_FIXA;
  if (tipo === 'receita') return TIPO_REGISTRO_RECEITA;
  if (tipo === 'despesa') return TIPO_REGISTRO_GASTO_VARIADO;
  return '';
}

export function parseMesAno(mesAno) {
  const now = new Date();
  let ano = now.getFullYear();
  let mes = now.getMonth() + 1;
  if (mesAno && /^\d{4}-\d{2}$/.test(mesAno)) {
    const [a, m] = mesAno.split('-').map(Number);
    ano = a;
    mes = m;
  }
  return { ano, mes };
}

export function rangeMes(ano, mes) {
  const start = new Date(ano, mes - 1, 1);
  const end = new Date(ano, mes, 0, 23, 59, 59, 999);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    mes_ano: `${ano}-${String(mes).padStart(2, '0')}`,
  };
}

export function getBrazilTodayIso() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date());
}

function dataLanc(row) {
  return String(row?.data_lancamento || (row?.created_at && String(row.created_at).slice(0, 10)) || '').slice(0, 10);
}

function stamp(row) {
  return String(row?.created_at || '');
}

export function sortCronologiaDesc(rows) {
  return [...(rows || [])].sort((a, b) => {
    const da = dataLanc(a);
    const db = dataLanc(b);
    if (da !== db) return db.localeCompare(da);
    return stamp(b).localeCompare(stamp(a));
  });
}

export function sortCronologiaAsc(rows) {
  return [...(rows || [])].sort((a, b) => {
    const da = dataLanc(a);
    const db = dataLanc(b);
    if (da !== db) return da.localeCompare(db);
    return stamp(a).localeCompare(stamp(b));
  });
}

export function filtrarFinancasPorMes(rows, ano, mes) {
  return (rows || []).filter((r) => {
    const d = dataLanc(r);
    if (!d) return false;
    const [y, m] = d.split('-').map(Number);
    return y === ano && m === mes;
  });
}

export function classificarFinancas(rows) {
  const receitas = [];
  const gastosVariados = [];
  for (const row of rows || []) {
    const tipo = String(row?.tipo || 'despesa').toLowerCase();
    if (tipo === 'receita') receitas.push(row);
    else gastosVariados.push(row);
  }
  return { receitas, gastosVariados };
}

export function calcularDashboard({ receitasRows, gastosRows, despesasFixasRows }) {
  const receitas = Math.round((receitasRows || []).reduce((acc, r) => acc + (Number(r?.valor) || 0), 0) * 100) / 100;
  const despesas_variadas = Math.round((gastosRows || []).reduce((acc, r) => acc + (Number(r?.valor) || 0), 0) * 100) / 100;
  const despesas_fixas = Math.round((despesasFixasRows || []).reduce((acc, r) => acc + (Number(r?.valor) || 0), 0) * 100) / 100;
  const liquido = Math.round((receitas - despesas_variadas - despesas_fixas) * 100) / 100;
  return { receitas, despesas_fixas, despesas_variadas, liquido };
}

export function calcularGraficos({ gastosRows, despesasFixasRows }) {
  const categoriaMap = {};
  for (const row of gastosRows || []) {
    const categoria = String(row?.categoria || 'Sem categoria');
    categoriaMap[categoria] = (categoriaMap[categoria] || 0) + (Number(row?.valor) || 0);
  }
  const categorias_gastos = Object.entries(categoriaMap)
    .map(([categoria, valor]) => ({ categoria, valor: Math.round(valor * 100) / 100 }))
    .sort((a, b) => b.valor - a.valor);

  let pago = 0;
  let pendente = 0;
  for (const row of despesasFixasRows || []) {
    const v = Number(row?.valor) || 0;
    if (String(row?.status || '').toLowerCase() === STATUS_PAGO) pago += v;
    else pendente += v;
  }

  return {
    categorias_gastos,
    pagos_pendentes: {
      pago: Math.round(pago * 100) / 100,
      pendente: Math.round(pendente * 100) / 100,
    },
  };
}

export function montarTabelaFinanceiroRows(rows, tipoRegistro) {
  return sortCronologiaDesc(rows).map((r) => ({
    ...r,
    tipo_registro: tipoRegistro,
  }));
}

export function payloadInsertFinanceiro(body = {}) {
  const tipoRegistro = inferTipoRegistro(body);
  if (!tipoRegistro) return { error: 'tipo_registro obrigatorio' };

  if (tipoRegistro === TIPO_REGISTRO_DESPESA_FIXA) {
    if (!(body.descricao != null && String(body.descricao).trim() !== '')) return { error: 'descricao obrigatoria' };
    return {
      tipo_registro: tipoRegistro,
      payload: {
        descricao: String(body.descricao || '').trim(),
        valor: Math.round((Number(body.valor) || 0) * 100) / 100,
        status: String(body.status || STATUS_PENDENTE).toLowerCase() === STATUS_PAGO ? STATUS_PAGO : STATUS_PENDENTE,
      },
    };
  }

  if (tipoRegistro === TIPO_REGISTRO_GASTO_VARIADO || tipoRegistro === TIPO_REGISTRO_RECEITA) {
    if (!(body.descricao != null && String(body.descricao).trim() !== '')) return { error: 'descricao obrigatoria' };
    const tipo = tipoRegistro === TIPO_REGISTRO_RECEITA ? 'receita' : 'despesa';
    return {
      tipo_registro: tipoRegistro,
      payload: {
        descricao: String(body.descricao || '').trim(),
        valor: Math.round((Number(body.valor) || 0) * 100) / 100,
        tipo,
        categoria: body.categoria || null,
        data_lancamento: body.data_lancamento || getBrazilTodayIso(),
      },
    };
  }

  return { error: 'tipo_registro invalido' };
}

export function payloadUpdateFinanceiro(body = {}) {
  const tipoRegistro = inferTipoRegistro(body);
  if (!tipoRegistro) return { error: 'tipo_registro obrigatorio' };
  if (!body.id) return { error: 'id obrigatorio' };

  if (tipoRegistro === TIPO_REGISTRO_DESPESA_FIXA) {
    const out = {};
    if (body.descricao !== undefined) out.descricao = String(body.descricao).trim();
    if (body.valor !== undefined) out.valor = Math.round((Number(body.valor) || 0) * 100) / 100;
    if (body.status !== undefined) out.status = String(body.status).toLowerCase() === STATUS_PAGO ? STATUS_PAGO : STATUS_PENDENTE;
    if (Object.keys(out).length === 0) return { error: 'nada para atualizar' };
    return { tipo_registro: tipoRegistro, id: body.id, payload: out };
  }

  if (tipoRegistro === TIPO_REGISTRO_GASTO_VARIADO || tipoRegistro === TIPO_REGISTRO_RECEITA) {
    const out = {};
    if (body.descricao !== undefined) out.descricao = String(body.descricao).trim();
    if (body.valor !== undefined) out.valor = Math.round((Number(body.valor) || 0) * 100) / 100;
    if (body.categoria !== undefined) out.categoria = body.categoria || null;
    if (body.data_lancamento !== undefined) out.data_lancamento = body.data_lancamento || null;
    out.tipo = tipoRegistro === TIPO_REGISTRO_RECEITA ? 'receita' : 'despesa';
    if (Object.keys(out).length === 0) return { error: 'nada para atualizar' };
    return { tipo_registro: tipoRegistro, id: body.id, payload: out };
  }

  return { error: 'tipo_registro invalido' };
}
