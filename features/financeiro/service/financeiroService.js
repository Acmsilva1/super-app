import {
  METODO_COMPRA_A_VISTA,
  METODO_COMPRA_PARCELADO,
  STATUS_PAGO,
  STATUS_PENDENTE,
  TIPO_REGISTRO_COMPRA,
  TIPO_REGISTRO_DESPESA_FIXA,
  TIPO_REGISTRO_GASTO_VARIADO,
  TIPO_REGISTRO_META_POUPANCA,
  TIPO_REGISTRO_POUPANCA,
  TIPO_REGISTRO_RECEITA,
} from '../model/financeiro.js';

export function normalizeFinanceiroMetodoPagamento(value) {
  const raw = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
  if (!raw) return '';
  if (raw.includes('credito')) return 'credito';
  if (raw.includes('debito') || raw.includes('pix')) return 'debito_pix';
  return raw;
}

export function normalizeCompraMetodoPagamento(value) {
  const raw = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
  if (!raw) return '';
  if (raw === 'avista' || raw === 'avist') return METODO_COMPRA_A_VISTA;
  if (raw === 'parcelado') return METODO_COMPRA_PARCELADO;
  return '';
}

export function normalizeFinanceiroCategoriaText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export function canonicalFinanceiroCategoriaLabel(value) {
  const key = normalizeFinanceiroCategoriaText(value);
  const map = {
    alimentacao: 'Alimenta\u00e7\u00e3o',
    habitacao: 'Habita\u00e7\u00e3o',
    transporte: 'Transporte',
    lazer: 'Lazer',
    saude: 'Sa\u00fade',
    ticket: 'Ticket',
    compras: 'Compras',
    contas: 'Contas',
    outros: 'Outros',
    outro: 'Outro',
    salario: 'Sal\u00e1rio',
    beneficio: 'Benef\u00edcio',
  };
  return map[key] || String(value || '').trim();
}

export function inferTipoRegistro(body = {}) {
  const explicit = String(body.tipo_registro || '').trim();
  if (explicit) return explicit;

  const hasStatus = body.status !== undefined;
  const tipo = String(body.tipo || '').toLowerCase().trim();
  if (hasStatus) return TIPO_REGISTRO_DESPESA_FIXA;
  if (explicit === TIPO_REGISTRO_META_POUPANCA) return TIPO_REGISTRO_META_POUPANCA;
  if (tipo === 'poupanca' || tipo === 'poupança') return TIPO_REGISTRO_POUPANCA;
  if (tipo === 'receita') return TIPO_REGISTRO_RECEITA;
  if (tipo === 'despesa') return TIPO_REGISTRO_GASTO_VARIADO;
  return '';
}

export function parseMesAno(mesAno) {
  const nowIso = getBrazilTodayIso();
  const nowMatch = String(nowIso || '').match(/^(\d{4})-(\d{2})/);
  let ano = nowMatch ? Number(nowMatch[1]) : new Date().getFullYear();
  let mes = nowMatch ? Number(nowMatch[2]) : new Date().getMonth() + 1;
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
  const raw = String(row?.data_lancamento || row?.created_at || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(date);
  const map = {};
  parts.forEach((p) => { map[p.type] = p.value; });
  return `${map.year}-${map.month}-${map.day}`;
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

export function sortByValorDesc(rows) {
  return [...(rows || [])].sort((a, b) => {
    const diff = (Number(b?.valor) || 0) - (Number(a?.valor) || 0);
    if (diff !== 0) return diff;
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
    if (tipo === 'receita') {
      receitas.push(row);
    } else {
      gastosVariados.push(row);
    }
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
  const categoriaMap = new Map();
  for (const row of gastosRows || []) {
    const categoriaRaw = String(row?.categoria || 'Sem categoria').trim() || 'Sem categoria';
    const categoriaKey = normalizeFinanceiroCategoriaText(categoriaRaw);
    const current = categoriaMap.get(categoriaKey) || { categoria: canonicalFinanceiroCategoriaLabel(categoriaRaw), valor: 0 };
    categoriaMap.set(categoriaKey, {
      categoria: current.categoria || canonicalFinanceiroCategoriaLabel(categoriaRaw),
      valor: Math.round(((Number(current.valor) || 0) + (Number(row?.valor) || 0)) * 100) / 100,
    });
  }
  const categorias_gastos = [...categoriaMap.values()]
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

function getYearMonthKey(row) {
  const raw = String(row?.data_lancamento || row?.created_at || '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d{4})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}`;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function calcularGraficosAnuais({ ano, rows, despesasFixasRows }) {
  const year = Number(ano);
  const meses = Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    mes_ano: `${year}-${String(i + 1).padStart(2, '0')}`,
    receitas: 0,
    despesas: 0,
  }));
  const slotByKey = new Map(meses.map((item) => [item.mes_ano, item]));
  const { receitas, gastosVariados } = classificarFinancas(rows || []);

  for (const row of receitas || []) {
    const key = getYearMonthKey(row);
    const slot = slotByKey.get(key);
    if (!slot) continue;
    slot.receitas = Math.round((slot.receitas + (Number(row?.valor) || 0)) * 100) / 100;
  }

  for (const row of gastosVariados || []) {
    const key = getYearMonthKey(row);
    const slot = slotByKey.get(key);
    if (!slot) continue;
    slot.despesas = Math.round((slot.despesas + (Number(row?.valor) || 0)) * 100) / 100;
  }

  for (const row of despesasFixasRows || []) {
    const key = getYearMonthKey(row);
    const slot = slotByKey.get(key);
    if (!slot) continue;
    slot.despesas = Math.round((slot.despesas + (Number(row?.valor) || 0)) * 100) / 100;
  }

  return meses.map((item) => ({
    ...item,
    saldo: Math.round((item.receitas - item.despesas) * 100) / 100,
  }));
}

export function montarTabelaFinanceiroRows(rows, tipoRegistro) {
  return sortCronologiaDesc(rows).map((r) => ({
    ...r,
    tipo_registro: tipoRegistro,
  }));
}

/** @returns {{ parcela_atual: number|null, parcela_total: number|null } | { error: string }} */
function parcelasDespesaFixaFromBody(body) {
  const ativo = body.parcelas === true || body.parcelas === 'true';
  if (!ativo) return { parcela_atual: null, parcela_total: null };
  const pa = Number(body.parcela_atual);
  const pt = Number(body.parcela_total);
  const atual = Math.round(pa);
  const total = Math.round(pt);
  if (!Number.isFinite(pa) || !Number.isFinite(pt)) return { error: 'parcelas invalidas' };
  if (atual < 1 || total < 1 || atual > total) return { error: 'parcelas invalidas' };
  return { parcela_atual: atual, parcela_total: total };
}

function validateExclusividadeContaFixaParcelas(body) {
  const contaFixa = body.conta_fixa === true || body.conta_fixa === 'true';
  const parcelas = body.parcelas === true || body.parcelas === 'true';
  if (contaFixa && parcelas) return { error: 'conta_fixa e parcelas nao podem coexistir' };
  return { contaFixa, parcelas };
}

export function payloadInsertFinanceiro(body = {}) {
  const tipoRegistro = inferTipoRegistro(body);
  if (!tipoRegistro) return { error: 'tipo_registro obrigatorio' };

  if (tipoRegistro === TIPO_REGISTRO_DESPESA_FIXA) {
    if (!(body.descricao != null && String(body.descricao).trim() !== '')) return { error: 'descricao obrigatoria' };
    const exclusividade = validateExclusividadeContaFixaParcelas(body);
    if ('error' in exclusividade) return { error: exclusividade.error };
    const par = parcelasDespesaFixaFromBody(body);
    if ('error' in par) return { error: par.error };
    return {
      tipo_registro: tipoRegistro,
      payload: {
        descricao: String(body.descricao || '').trim(),
        valor: Math.round((Number(body.valor) || 0) * 100) / 100,
        status: String(body.status || STATUS_PENDENTE).toLowerCase() === STATUS_PAGO ? STATUS_PAGO : STATUS_PENDENTE,
        parcela_atual: par.parcela_atual,
        parcela_total: par.parcela_total,
        conta_fixa: exclusividade.contaFixa,
        ...(body.created_at !== undefined ? { created_at: String(body.created_at || '').trim() || null } : {}),
      },
    };
  }

  if (tipoRegistro === TIPO_REGISTRO_GASTO_VARIADO || tipoRegistro === TIPO_REGISTRO_RECEITA) {
    if (!(body.descricao != null && String(body.descricao).trim() !== '')) return { error: 'descricao obrigatoria' };
    const tipo = tipoRegistro === TIPO_REGISTRO_RECEITA ? 'receita' : 'despesa';
    const payload = {
      descricao: String(body.descricao || '').trim(),
      valor: Math.round((Number(body.valor) || 0) * 100) / 100,
      tipo,
      categoria: body.categoria ? canonicalFinanceiroCategoriaLabel(body.categoria) : null,
      data_lancamento: body.data_lancamento || getBrazilTodayIso(),
      ...(body.created_at !== undefined ? { created_at: String(body.created_at || '').trim() || null } : {}),
    };
    if (tipoRegistro === TIPO_REGISTRO_GASTO_VARIADO) {
      payload.metodo_pagamento = String(body.metodo_pagamento || 'debito_pix').trim() || 'debito_pix';
    }
    return {
      tipo_registro: tipoRegistro,
      payload,
    };
  }

  if (tipoRegistro === TIPO_REGISTRO_POUPANCA) {
    return {
      tipo_registro: tipoRegistro,
      payload: {
        descricao: String(body.descricao || 'Poupança').trim() || 'Poupança',
        valor: Math.round((Number(body.valor) || 0) * 100) / 100,
        data_lancamento: body.data_lancamento || getBrazilTodayIso(),
        ...(body.created_at !== undefined ? { created_at: String(body.created_at || '').trim() || null } : {}),
      },
    };
  }

  if (tipoRegistro === TIPO_REGISTRO_COMPRA) {
    if (!(body.descricao != null && String(body.descricao).trim() !== '')) return { error: 'descricao obrigatoria' };
    const metodo = normalizeCompraMetodoPagamento(body.metodo_pagamento || METODO_COMPRA_A_VISTA);
    if (!metodo) return { error: 'metodo_pagamento invalido' };
    return {
      tipo_registro: tipoRegistro,
      payload: {
        descricao: String(body.descricao || '').trim(),
        valor: Math.round((Number(body.valor) || 0) * 100) / 100,
        metodo_pagamento: metodo,
        data_lancamento: body.data_lancamento || getBrazilTodayIso(),
        ...(body.created_at !== undefined ? { created_at: String(body.created_at || '').trim() || null } : {}),
      },
    };
  }

  if (tipoRegistro === TIPO_REGISTRO_META_POUPANCA) {
    const nomeMeta = String(body.nome_meta || body.descricao || '').trim();
    if (!nomeMeta) return { error: 'nome_meta obrigatorio' };
    const valorMetaRaw = body.valor_meta ?? body.valor;
    const valorMeta = Math.round((Number(valorMetaRaw) || 0) * 100) / 100;
    if (!(valorMeta > 0)) return { error: 'valor_meta deve ser maior que zero' };
    const dataInicio = body.data_inicio || getBrazilTodayIso();
    return {
      tipo_registro: tipoRegistro,
      payload: {
        nome_meta: nomeMeta,
        valor_meta: valorMeta,
        data_inicio: dataInicio,
        ativa: true,
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
    const exclusividade = validateExclusividadeContaFixaParcelas(body);
    if ('error' in exclusividade) return { error: exclusividade.error };
    const out = {};
    if (body.descricao !== undefined) out.descricao = String(body.descricao).trim();
    if (body.valor !== undefined) out.valor = Math.round((Number(body.valor) || 0) * 100) / 100;
    if (body.status !== undefined) out.status = String(body.status).toLowerCase() === STATUS_PAGO ? STATUS_PAGO : STATUS_PENDENTE;
    if (body.mes_ano !== undefined) {
      const ma = String(body.mes_ano || '').trim();
      if (ma && /^\d{4}-\d{2}$/.test(ma)) {
        const { ano, mes } = parseMesAno(ma);
        out.created_at = body.created_at !== undefined
          ? String(body.created_at || '').trim() || null
          : new Date(ano, mes - 1, 1, 12, 0, 0, 0).toISOString();
      }
    }
    if (body.parcelas !== undefined) {
      const ativo = exclusividade.parcelas;
      if (!ativo) {
        out.parcela_atual = null;
        out.parcela_total = null;
      } else {
        const par = parcelasDespesaFixaFromBody(body);
        if ('error' in par) return { error: par.error };
        out.parcela_atual = par.parcela_atual;
        out.parcela_total = par.parcela_total;
      }
    }
    if (body.conta_fixa !== undefined) {
      out.conta_fixa = exclusividade.contaFixa;
    }
    if (body.created_at !== undefined && out.created_at === undefined) {
      out.created_at = String(body.created_at || '').trim() || null;
    }
    if (Object.keys(out).length === 0) return { error: 'nada para atualizar' };
    return { tipo_registro: tipoRegistro, id: body.id, payload: out };
  }

  if (tipoRegistro === TIPO_REGISTRO_GASTO_VARIADO || tipoRegistro === TIPO_REGISTRO_RECEITA) {
    const out = {};
    if (body.descricao !== undefined) out.descricao = String(body.descricao).trim();
    if (body.valor !== undefined) out.valor = Math.round((Number(body.valor) || 0) * 100) / 100;
    if (body.categoria !== undefined) out.categoria = body.categoria ? canonicalFinanceiroCategoriaLabel(body.categoria) : null;
    if (body.data_lancamento !== undefined) out.data_lancamento = body.data_lancamento || null;
    if (body.created_at !== undefined) out.created_at = String(body.created_at || '').trim() || null;
    out.tipo = tipoRegistro === TIPO_REGISTRO_RECEITA ? 'receita' : 'despesa';
    if (tipoRegistro === TIPO_REGISTRO_GASTO_VARIADO && body.metodo_pagamento !== undefined) {
      out.metodo_pagamento = String(body.metodo_pagamento || 'debito_pix').trim() || 'debito_pix';
    }
    if (Object.keys(out).length === 0) return { error: 'nada para atualizar' };
    return { tipo_registro: tipoRegistro, id: body.id, payload: out };
  }

  if (tipoRegistro === TIPO_REGISTRO_POUPANCA) {
    const out = {};
    if (body.descricao !== undefined) out.descricao = String(body.descricao || 'Poupança').trim() || 'Poupança';
    if (body.valor !== undefined) out.valor = Math.round((Number(body.valor) || 0) * 100) / 100;
    if (body.data_lancamento !== undefined) out.data_lancamento = body.data_lancamento || null;
    if (body.created_at !== undefined) out.created_at = String(body.created_at || '').trim() || null;
    if (Object.keys(out).length === 0) return { error: 'nada para atualizar' };
    return { tipo_registro: tipoRegistro, id: body.id, payload: out };
  }

  if (tipoRegistro === TIPO_REGISTRO_COMPRA) {
    const out = {};
    if (body.descricao !== undefined) {
      out.descricao = String(body.descricao || '').trim();
      if (!out.descricao) return { error: 'descricao obrigatoria' };
    }
    if (body.valor !== undefined) out.valor = Math.round((Number(body.valor) || 0) * 100) / 100;
    if (body.metodo_pagamento !== undefined) {
      const metodo = normalizeCompraMetodoPagamento(body.metodo_pagamento);
      if (!metodo) return { error: 'metodo_pagamento invalido' };
      out.metodo_pagamento = metodo;
    }
    if (body.data_lancamento !== undefined) out.data_lancamento = body.data_lancamento || null;
    if (body.created_at !== undefined) out.created_at = String(body.created_at || '').trim() || null;
    if (Object.keys(out).length === 0) return { error: 'nada para atualizar' };
    return { tipo_registro: tipoRegistro, id: body.id, payload: out };
  }

  if (tipoRegistro === TIPO_REGISTRO_META_POUPANCA) {
    const out = {};
    if (body.nome_meta !== undefined || body.descricao !== undefined) {
      out.nome_meta = String(body.nome_meta || body.descricao || '').trim();
      if (!out.nome_meta) return { error: 'nome_meta obrigatorio' };
    }
    if (body.valor_meta !== undefined || body.valor !== undefined) {
      const v = Math.round((Number(body.valor_meta ?? body.valor) || 0) * 100) / 100;
      if (!(v > 0)) return { error: 'valor_meta deve ser maior que zero' };
      out.valor_meta = v;
    }
    if (body.data_inicio !== undefined) out.data_inicio = body.data_inicio || null;
    if (body.ativa !== undefined) out.ativa = Boolean(body.ativa);
    if (body.created_at !== undefined) out.created_at = String(body.created_at || '').trim() || null;
    if (Object.keys(out).length === 0) return { error: 'nada para atualizar' };
    return { tipo_registro: tipoRegistro, id: body.id, payload: out };
  }

  return { error: 'tipo_registro invalido' };
}
