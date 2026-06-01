import { supabase } from '../lib/supabase.js';
import {
  TABLE_DESPESAS_FIXAS,
  TABLE_FINANCAS,
  TABLE_POUPANCA_METAS,
  TABLE_POUPANCA,
  TABLE_SALDO_CONTA_CORRENTE,
  TABLE_SALDO_CONTA_CORRENTE_MOVIMENTOS,
  TIPO_REGISTRO_DESPESA_FIXA,
  TIPO_REGISTRO_GASTO_VARIADO,
  TIPO_REGISTRO_META_POUPANCA,
  TIPO_REGISTRO_SALDO_CONTA_CORRENTE,
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
  isSaldoContaCorrenteAffectingRow,
  saldoContaCorrenteDeltaFromRow,
  saldoContaCorrenteValueFromBody,
  saldoContaCorrenteSignedValueFromRow,
  buildSaldoContaCorrenteMovementRow,
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
  return code === '42P01' || message.includes('does not exist') || message.includes('não existe');
}

function normalizeDate(dateLike) {
  const s = String(dateLike || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function serializeSaldoContaCorrenteRow(row) {
  const signedValor = saldoContaCorrenteSignedValueFromRow(row);
  return {
    definido: true,
    id: Number(row?.id || 1) || 1,
    valor: Math.abs(signedValor),
    negativo: signedValor < 0,
    updated_at: String(row?.updated_at || ''),
    created_at: String(row?.created_at || ''),
    saldo_anterior: Number(row?.saldo_anterior ?? 0),
    delta: Number(row?.delta ?? 0),
    tipo_movimento: String(row?.tipo_movimento || ''),
    origem_tipo: String(row?.origem_tipo || ''),
    origem_id: String(row?.origem_id || ''),
    descricao: String(row?.descricao || ''),
    signed_valor: signedValor,
  };
}

async function fetchSaldoContaCorrenteMovimentoLatest() {
  const { data, error } = await supabase
    .from(TABLE_SALDO_CONTA_CORRENTE_MOVIMENTOS)
    .select('*')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1);
  if (error) {
    if (isMissingTableError(error)) return { configurada: false, data: null };
    throw error;
  }
  return { configurada: true, data: rowOrFirst(data) };
}

async function fetchSaldoContaCorrenteSnapshot() {
  const { data, error } = await supabase
    .from(TABLE_SALDO_CONTA_CORRENTE)
    .select('*')
    .eq('id', 1)
    .limit(1);
  if (error) {
    if (isMissingTableError(error)) return { configurada: false, data: null };
    throw error;
  }
  return { configurada: true, data: rowOrFirst(data) };
}

async function fetchSaldoContaCorrente() {
  const snapshot = await fetchSaldoContaCorrenteSnapshot();
  if (snapshot.data) return snapshot;
  const latestMovement = await fetchSaldoContaCorrenteMovimentoLatest();
  if (latestMovement.data) return latestMovement;
  return snapshot.configurada ? snapshot : latestMovement;
}

async function persistSaldoContaCorrenteSnapshot(nextSigned) {
  const timestamp = new Date().toISOString();
  const rowPayload = {
    id: 1,
    valor: Math.abs(nextSigned),
    negativo: nextSigned < 0,
    updated_at: timestamp,
    created_at: timestamp,
  };
  const { error } = await supabase
    .from(TABLE_SALDO_CONTA_CORRENTE)
    .upsert(rowPayload, { onConflict: 'id' });
  if (error) return { error: error.message, status: 500 };
  return { ok: true };
}

async function appendSaldoContaCorrenteMovement({
  currentRow = {},
  nextSigned = 0,
  tipoMovimento = 'manual',
  origemTipo = null,
  origemId = null,
  descricao = null,
} = {}) {
  const movementPayload = buildSaldoContaCorrenteMovementRow({
    currentRow,
    nextSigned,
    tipoMovimento,
    origemTipo,
    origemId,
    descricao,
  });
  const { data, error } = await supabase
    .from(TABLE_SALDO_CONTA_CORRENTE_MOVIMENTOS)
    .insert(movementPayload)
    .select()
    .single();
  if (error) {
    if (isMissingTableError(error)) return { configurada: false, data: null };
    return { error: error.message, status: 500 };
  }
  return { configurada: true, data: rowOrFirst(data) };
}

async function saveSaldoContaCorrentePayload(payload = {}) {
  const signed = saldoContaCorrenteValueFromBody(payload);
  if (signed === null) return { error: 'valor obrigatorio', status: 400 };
  const current = await fetchSaldoContaCorrente();
  const currentSigned = saldoContaCorrenteSignedValueFromRow(current.data || {});
  const nextSigned = Math.round(signed * 100) / 100;
  if (currentSigned === nextSigned && current.data) {
    return { data: serializeSaldoContaCorrenteRow(current.data) };
  }
  const history = await appendSaldoContaCorrenteMovement({
    currentRow: current.data || {},
    nextSigned,
    tipoMovimento: 'manual',
    origemTipo: 'saldo_conta_corrente',
    origemId: payload.id || 1,
    descricao: 'Saldo manual atualizado',
  });
  if (history.error) return { error: history.error, status: history.status || 500 };
  const snapshot = await persistSaldoContaCorrenteSnapshot(nextSigned);
  if (snapshot.error) return { error: snapshot.error, status: snapshot.status || 500 };
  return { data: serializeSaldoContaCorrenteRow(history.data || { ...current.data, ...payload, saldo_atual: nextSigned }) };
}

async function applySaldoContaCorrenteDelta(delta, meta = {}) {
  const signedDelta = Math.round(Number(delta || 0) * 100) / 100;
  if (!signedDelta) return { ok: true };
  const current = await fetchSaldoContaCorrente();
  if (!current.configurada && !current.data) return { ok: true };
  const currentValue = saldoContaCorrenteSignedValueFromRow(current.data || {});
  const nextSigned = Math.round((currentValue + signedDelta) * 100) / 100;
  const history = await appendSaldoContaCorrenteMovement({
    currentRow: current.data || {},
    nextSigned,
    tipoMovimento: meta.tipo_movimento || 'automatica',
    origemTipo: meta.origem_tipo || null,
    origemId: meta.origem_id || null,
    descricao: meta.descricao || null,
  });
  if (history.error) return { error: history.error, status: history.status || 500 };
  const snapshot = await persistSaldoContaCorrenteSnapshot(nextSigned);
  if (snapshot.error) return { error: snapshot.error, status: snapshot.status || 500 };
  return { ok: true };
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

export async function obterFinanceiroMes(query = {}) {
  const { ano, mes } = parseMesAno(query.mes_ano);
  const { start, end, mes_ano } = rangeMes(ano, mes);

  await garantirDespesasFixasMes(mes_ano);

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

  let saldoContaCorrente = { configurada: true, definido: false, id: 1, valor: 0, negativo: false, updated_at: '', signed_valor: 0 };
  try {
    const saldo = await fetchSaldoContaCorrente();
    saldoContaCorrente.configurada = saldo.configurada;
    if (saldo.data) {
      saldoContaCorrente = serializeSaldoContaCorrenteRow(saldo.data);
      saldoContaCorrente.configurada = saldo.configurada;
    } else {
      saldoContaCorrente = {
        configurada: saldo.configurada,
        definido: false,
        id: 1,
        valor: 0,
        negativo: false,
        updated_at: '',
        signed_valor: 0,
      };
    }
  } catch (saldoErr) {
    return { error: saldoErr.message, status: 500 };
  }

  const financasMes = filtrarFinancasPorMes(allFinancasRows || [], ano, mes);
  const { receitas, gastosVariados } = classificarFinancas(financasMes);

  const receitasTabela = montarTabelaFinanceiroRows(receitas, TIPO_REGISTRO_RECEITA);
  const gastosVariadosTabela = montarTabelaFinanceiroRows(gastosVariados, TIPO_REGISTRO_GASTO_VARIADO)
    .map((r) => ({ ...r, tipo_registro: resolveTipoRegistroFinanceiro(r, TIPO_REGISTRO_GASTO_VARIADO) }));
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
      saldo_conta_corrente: saldoContaCorrente,
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
    const mesAno = String(body.mes_ano);
    const insertPayloads = buildDespesaFixaInsertPayloads(payload, mesAno);
    const { data, error } = await supabase
      .from(table)
      .insert(insertPayloads)
      .select();
    if (error) return { status: 500, data: { error: error.message } };
    const rows = Array.isArray(data) ? data : (data ? [data] : []);
    const row = rows.find((item) => String(item?.created_at || '').slice(0, 7) === mesAno) || rows[0] || null;
    for (const insertedRow of rows) {
      const balanceDelta = saldoContaCorrenteDeltaFromRow({
        tipo_registro: insertedRow?.tipo_registro || parsed.tipo_registro,
        status: insertedRow?.status || payload.status,
        tipo: insertedRow?.tipo,
        metodo_pagamento: insertedRow?.metodo_pagamento || payload.metodo_pagamento,
        valor: insertedRow?.valor ?? payload.valor,
      });
      if (balanceDelta) {
        await applySaldoContaCorrenteDelta(balanceDelta, {
          tipo_movimento: 'insercao',
          origem_tipo: parsed.tipo_registro,
          origem_id: insertedRow?.id || null,
          descricao: insertedRow?.descricao || payload.descricao || null,
        });
      }
    }
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

  if (parsed.tipo_registro === TIPO_REGISTRO_SALDO_CONTA_CORRENTE) {
    const saved = await saveSaldoContaCorrentePayload(parsed.payload);
    if (saved.error) return { status: saved.status || 500, data: { error: saved.error } };
    return { status: 201, data: { ...(saved.data || {}), tipo_registro: parsed.tipo_registro } };
  }

  const { data, error } = await supabase.from(table).insert(payload).select().single();
  if (error) return { status: 500, data: { error: error.message } };
  const row = rowOrFirst(data);
  if (table === TABLE_FINANCAS || table === TABLE_DESPESAS_FIXAS) {
    const balanceDelta = saldoContaCorrenteDeltaFromRow({
      tipo_registro: row?.tipo_registro || parsed.tipo_registro,
      status: row?.status || payload.status,
      tipo: row?.tipo,
      metodo_pagamento: row?.metodo_pagamento || payload.metodo_pagamento,
      valor: row?.valor ?? payload.valor,
    });
    if (balanceDelta) {
      await applySaldoContaCorrenteDelta(balanceDelta, {
        tipo_movimento: 'insercao',
        origem_tipo: parsed.tipo_registro,
        origem_id: row?.id || null,
        descricao: row?.descricao || payload.descricao || null,
      });
    }
  }
  return { status: 201, data: { ...(row || {}), tipo_registro: parsed.tipo_registro } };
}

export async function atualizarRegistroFinanceiro(req) {
  const body = getBody(req);
  const parsed = payloadUpdateFinanceiro(body);
  if (parsed.error) return { status: 400, data: { error: parsed.error } };

  if (parsed.tipo_registro === TIPO_REGISTRO_SALDO_CONTA_CORRENTE) {
    const saved = await saveSaldoContaCorrentePayload(parsed.payload);
    if (saved.error) return { status: saved.status || 500, data: { error: saved.error } };
    return { status: 200, data: { ...(saved.data || {}), tipo_registro: parsed.tipo_registro } };
  }

  const table = parsed.tipo_registro === TIPO_REGISTRO_DESPESA_FIXA
    ? TABLE_DESPESAS_FIXAS
    : parsed.tipo_registro === TIPO_REGISTRO_POUPANCA
      ? TABLE_POUPANCA
      : parsed.tipo_registro === TIPO_REGISTRO_META_POUPANCA
        ? TABLE_POUPANCA_METAS
      : TABLE_FINANCAS;
  let previousRow = null;
  if (table === TABLE_FINANCAS || table === TABLE_DESPESAS_FIXAS) {
    const { data: prevData, error: prevErr } = await supabase
      .from(table)
      .select('*')
      .eq('id', parsed.id)
      .limit(1);
    if (prevErr) return { status: 500, data: { error: prevErr.message } };
    previousRow = rowOrFirst(prevData);
  }
  const { data, error } = await supabase.from(table).update(parsed.payload).eq('id', parsed.id).select().single();
  if (error) return { status: 500, data: { error: error.message } };
  const row = rowOrFirst(data);
  if (table === TABLE_FINANCAS || table === TABLE_DESPESAS_FIXAS) {
    const previousDelta = saldoContaCorrenteDeltaFromRow({
      tipo_registro: previousRow?.tipo_registro,
      status: previousRow?.status,
      tipo: previousRow?.tipo,
      metodo_pagamento: previousRow?.metodo_pagamento,
      valor: previousRow?.valor,
    });
    const nextDelta = saldoContaCorrenteDeltaFromRow({
      tipo_registro: row?.tipo_registro,
      status: row?.status,
      tipo: row?.tipo,
      metodo_pagamento: row?.metodo_pagamento,
      valor: row?.valor,
    });
    const balanceDelta = Math.round((nextDelta - previousDelta) * 100) / 100;
    if (balanceDelta) {
      await applySaldoContaCorrenteDelta(balanceDelta, {
        tipo_movimento: 'atualizacao',
        origem_tipo: parsed.tipo_registro,
        origem_id: row?.id || parsed.id || null,
        descricao: row?.descricao || previousRow?.descricao || null,
      });
    }
  }
  return { status: 200, data: { ...(row || {}), tipo_registro: parsed.tipo_registro } };
}

export async function removerRegistroFinanceiro(req) {
  const body = getBody(req);
  let tipoRegistro = String(body.tipo_registro || req.query?.tipo_registro || '').trim();
  if (!tipoRegistro) tipoRegistro = inferTipoRegistro({ ...req.query, ...body });
  const id = body.id ?? req.query?.id;
  if (!id) return { status: 400, data: { error: 'id obrigatorio' } };

  if (tipoRegistro === TIPO_REGISTRO_SALDO_CONTA_CORRENTE) {
    return { status: 400, data: { error: 'saldo_conta_corrente nao pode ser excluido' } };
  }

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
    if (!tipoRegistro) return { status: 404, data: { error: 'registro nao encontrado para exclusao' } };
  }

  if (![
    TIPO_REGISTRO_DESPESA_FIXA,
    TIPO_REGISTRO_GASTO_VARIADO,
    TIPO_REGISTRO_RECEITA,
    TIPO_REGISTRO_POUPANCA,
    TIPO_REGISTRO_META_POUPANCA,
    TIPO_REGISTRO_SALDO_CONTA_CORRENTE,
  ].includes(tipoRegistro)) {
    return { status: 400, data: { error: 'tipo_registro invalido' } };
  }
  const table = tipoRegistro === TIPO_REGISTRO_DESPESA_FIXA
    ? TABLE_DESPESAS_FIXAS
    : tipoRegistro === TIPO_REGISTRO_POUPANCA
      ? TABLE_POUPANCA
      : tipoRegistro === TIPO_REGISTRO_META_POUPANCA
        ? TABLE_POUPANCA_METAS
      : TABLE_FINANCAS;
  let previousRow = null;
  if (table === TABLE_FINANCAS || table === TABLE_DESPESAS_FIXAS) {
    const { data: prevData, error: prevErr } = await supabase
      .from(table)
      .select('*')
      .eq('id', id)
      .limit(1);
    if (prevErr) return { status: 500, data: { error: prevErr.message } };
    previousRow = rowOrFirst(prevData);
  }
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) return { status: 500, data: { error: error.message } };
  if ((table === TABLE_FINANCAS || table === TABLE_DESPESAS_FIXAS) && previousRow) {
    const balanceDelta = Math.round((0 - saldoContaCorrenteDeltaFromRow({
      tipo_registro: previousRow?.tipo_registro,
      status: previousRow?.status,
      tipo: previousRow?.tipo,
      metodo_pagamento: previousRow.metodo_pagamento,
      valor: previousRow.valor,
    })) * 100) / 100;
    if (balanceDelta) {
      await applySaldoContaCorrenteDelta(balanceDelta, {
        tipo_movimento: 'exclusao',
        origem_tipo: tipoRegistro,
        origem_id: id,
        descricao: previousRow?.descricao || null,
      });
    }
  }
  return { status: 200, data: { ok: true } };
}
