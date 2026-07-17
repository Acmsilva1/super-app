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
} from '../features/financeiro/index.js';

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
  };
}

function buildDespesaFixaInsertPayloads(basePayload, mesAno) {
  const slots = buildReplicationSlotsFromStart(mesAno, replicationOptionsFromPayload(basePayload));
  return slots.map((slot) => ({
    descricao: basePayload.descricao,
    valor: basePayload.valor,
    status: basePayload.status || 'pendente',
    conta_fixa: slot.conta_fixa === true,
    parcela_atual: slot.parcela_atual,
    parcela_total: slot.parcela_total,
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
  }).filter((slot) => Number(slot.parcela_atual) > atual);
}

async function findFutureParcelaIds(row) {
  if (!isParcelaRow(row)) return [];
  const futureSlots = buildFutureParcelaSlotsFromRow(row);
  if (!futureSlots.length) return [];

  const { data, error } = await supabase
    .from(TABLE_DESPESAS_FIXAS)
    .select('id, descricao, parcela_atual, parcela_total, created_at')
    .eq('parcela_total', row.parcela_total);

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

async function cleanupFutureParcelas(row) {
  const ids = await findFutureParcelaIds(row);
  if (!ids.length) return;
  const { error } = await supabase.from(TABLE_DESPESAS_FIXAS).delete().in('id', ids);
  if (error) throw error;
}

export async function materializeDespesasFixasMes(mesAno) {
  if (!mesAno || !/^\d{4}-\d{2}$/.test(mesAno)) return;
  const { ano, mes } = parseMesAno(mesAno);
  const yearStart = new Date(ano, 0, 1).toISOString();
  const yearEnd = new Date(ano, 11, 31, 23, 59, 59, 999).toISOString();

  const { data: yearRows, error: yearErr } = await supabase
    .from(TABLE_DESPESAS_FIXAS)
    .select('*')
    .gte('created_at', yearStart)
    .lte('created_at', yearEnd);

  if (yearErr || !yearRows?.length) return;

  const series = seriesDefinitionsFromYearRows(yearRows);
  if (!series.length) return;

  const { start, end } = rangeMes(ano, mes);
  const { data: monthRows, error: monthErr } = await supabase
    .from(TABLE_DESPESAS_FIXAS)
    .select('*')
    .gte('created_at', start)
    .lte('created_at', end);

  if (monthErr) return;
  const existing = monthRows || [];

  const toInsert = [];
  for (const item of series) {
    const needed = slotsNeededForMonth(item, mesAno);
    for (const slot of needed) {
      const alreadyExists = existing.some((row) => rowMatchesReplicationSlot(row, slot, item.descricao));
      if (alreadyExists) continue;
      toInsert.push(buildInsertPayloadFromSlot(item, slot));
    }
  }

  if (!toInsert.length) return;
  await supabase.from(TABLE_DESPESAS_FIXAS).insert(toInsert);
}

export async function garantirDespesasFixasMes(mesAno) {
  await materializeDespesasFixasMes(mesAno);
}

async function garantirDespesasFixasAno(ano) {
  const year = Number(ano);
  if (!Number.isInteger(year) || year < 1900) return;
  await Promise.all(Array.from({ length: 12 }, (_, idx) => {
    const month = idx + 1;
    return materializeDespesasFixasMes(`${year}-${String(month).padStart(2, '0')}`);
  }));
}

export async function obterFinanceiroMes(query = {}) {
  const { ano, mes } = parseMesAno(query.mes_ano);
  const { start, end, mes_ano } = rangeMes(ano, mes);

  await garantirDespesasFixasAno(ano);

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

  const yearStart = new Date(ano, 0, 1, 0, 0, 0, 0).toISOString();
  const yearEnd = new Date(ano, 11, 31, 23, 59, 59, 999).toISOString();
  const { data: despesasFixasAnoRowsRaw, error: errFixasAno } = await supabase
    .from(TABLE_DESPESAS_FIXAS)
    .select('*')
    .gte('created_at', yearStart)
    .lte('created_at', yearEnd)
    .order('created_at', { ascending: false });
  if (errFixasAno) return { error: errFixasAno.message, status: 500 };

  let poupancaRowsRaw = [];
  let poupancaConfigured = true;
  const { data: poupaData, error: errPoupa } = await supabase
    .from(TABLE_POUPANCA)
    .select('*')
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

  let comprasRowsRaw = [];
  let comprasConfigured = true;
  const { data: comprasData, error: errCompras } = await supabase
    .from(TABLE_COMPRAS)
    .select('*')
    .order('created_at', { ascending: false });
  if (errCompras) {
    if (isMissingTableError(errCompras)) {
      comprasConfigured = false;
      comprasRowsRaw = [];
    } else {
      return { error: errCompras.message, status: 500 };
    }
  } else {
    comprasRowsRaw = comprasData || [];
  }

  const financasMes = filtrarFinancasPorMes(allFinancasRows || [], ano, mes);
  const { receitas, gastosVariados } = classificarFinancas(financasMes);
  const comprasMes = filtrarFinancasPorMes(comprasRowsRaw || [], ano, mes);

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
  const graficosAnuais = calcularGraficosAnuais({
    ano,
    rows: allFinancasRows || [],
    despesasFixasRows: despesasFixasAnoRowsRaw || [],
  });

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
    },
  };
}

export async function criarRegistroFinanceiro(req) {
  const body = getBody(req);
  const parsed = payloadInsertFinanceiro(body);
  if (parsed.error) return { status: 400, data: { error: parsed.error } };
  const table = tableForTipoRegistro(parsed.tipo_registro);
  const payload = { ...parsed.payload };

  if (parsed.tipo_registro === TIPO_REGISTRO_DESPESA_FIXA && body.mes_ano && /^\d{4}-\d{2}$/.test(String(body.mes_ano))) {
    const mesAno = String(body.mes_ano);
    const insertPayloads = buildDespesaFixaInsertPayloads(payload, mesAno);
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
      const insertPayloads = buildDespesaFixaInsertPayloads({ ...insertParsed.payload }, mesAno);
      const { data: insertedRows, error: insertErr } = await supabase
        .from(table)
        .insert(insertPayloads)
        .select();
      if (insertErr) return { status: 500, data: { error: insertErr.message } };
      const rows = Array.isArray(insertedRows) ? insertedRows : (insertedRows ? [insertedRows] : []);
      insertedRow = rows.find((item) => String(item?.created_at || '').slice(0, 7) === mesAno) || rows[0] || null;
    } else {
      const { data: inserted, error: insertErr } = await supabase.from(table).insert(insertParsed.payload).select().single();
      if (insertErr) return { status: 500, data: { error: insertErr.message } };
      insertedRow = rowOrFirst(inserted);
    }

    const { error: deleteErr } = await supabase.from(originalTable).delete().eq('id', parsed.id);
    if (deleteErr) return { status: 500, data: { error: deleteErr.message } };

    return { status: 200, data: { ...(insertedRow || {}), tipo_registro: parsed.tipo_registro, realocado: true } };
  }

  let existingRow = null;
  if (parsed.tipo_registro === TIPO_REGISTRO_DESPESA_FIXA) {
    const { data: currentRow, error: currentErr } = await supabase.from(table).select('*').eq('id', parsed.id).single();
    if (currentErr) return { status: 500, data: { error: currentErr.message } };
    existingRow = rowOrFirst(currentRow);
  }

  const { data, error } = await supabase.from(table).update(parsed.payload).eq('id', parsed.id).select().single();
  if (error) return { status: 500, data: { error: error.message } };

  const turningParcelasOff = parsed.tipo_registro === TIPO_REGISTRO_DESPESA_FIXA
    && body.parcelas !== undefined
    && !(body.parcelas === true || body.parcelas === 'true');

  if (turningParcelasOff && existingRow && isParcelaRow(existingRow)) {
    try {
      await cleanupFutureParcelas(existingRow);
    } catch (cleanupErr) {
      return { status: 500, data: { error: cleanupErr.message } };
    }
  }

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
    const { data: inFin, error: errFin } = await supabase.from(TABLE_FINANCAS).select('id, tipo_gasto, tipo').eq('id', id).limit(1);
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
    if (!tipoRegistro) {
      const { data: inCompra, error: errCompra } = await supabase.from(TABLE_COMPRAS).select('id').eq('id', id).limit(1);
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
    const { data: currentRow, error: currentErr } = await supabase.from(table).select('*').eq('id', id).single();
    if (currentErr) return { status: 500, data: { error: currentErr.message } };
    currentDespesaFixa = rowOrFirst(currentRow);
  }

  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) return { status: 500, data: { error: error.message } };

  if (currentDespesaFixa && isParcelaRow(currentDespesaFixa)) {
    try {
      await cleanupFutureParcelas(currentDespesaFixa);
    } catch (cleanupErr) {
      return { status: 500, data: { error: cleanupErr.message } };
    }
  }

  return { status: 200, data: { ok: true } };
}
