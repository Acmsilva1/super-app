import { supabase } from '../lib/supabase.js';
import {
  TABLE_FINANCAS,
  payloadInsertFinanceiro,
  parseOfxToLancamentos,
  annotateLancamentosExistencia,
  resumoImportacaoOfx,
} from '../features/financeiro/index.js';

const UID_CHUNK = 100;
const VALUE_CHUNK = 100;

function getBody(req) {
  return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
}

function isUniqueViolation(error) {
  const code = String(error?.code || '');
  return code === '23505';
}

async function fetchExistingOfxUids(uids) {
  const existing = new Set();
  const list = [...new Set((uids || []).filter(Boolean))];
  for (let i = 0; i < list.length; i += UID_CHUNK) {
    const chunk = list.slice(i, i + UID_CHUNK);
    const { data, error } = await supabase
      .from(TABLE_FINANCAS)
      .select('ofx_uid')
      .in('ofx_uid', chunk);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      if (row?.ofx_uid) existing.add(String(row.ofx_uid));
    }
  }
  return existing;
}

function parseDuplicateDecisions(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const uid = String(k || '').trim();
    if (!uid) continue;
    out[uid] = v === true || v === 'true';
  }
  return out;
}

function moneyKey(v) {
  return (Math.round(Number(v || 0) * 100) / 100).toFixed(2);
}

function dupKey(date, value) {
  return `${String(date || '')}|${moneyKey(value)}`;
}

async function fetchExistingRowsByDateAndValue(lancamentos) {
  const dates = [...new Set((lancamentos || []).map((r) => String(r?.data_lancamento || '')).filter(Boolean))];
  const values = [...new Set((lancamentos || []).map((r) => moneyKey(r?.valor)).filter(Boolean))];
  if (!dates.length || !values.length) return [];

  const found = [];
  for (const date of dates) {
    for (let i = 0; i < values.length; i += VALUE_CHUNK) {
      const valueChunk = values.slice(i, i + VALUE_CHUNK).map((v) => Number(v));
      const { data, error } = await supabase
        .from(TABLE_FINANCAS)
        .select('id,descricao,valor,data_lancamento,tipo,ofx_uid,created_at')
        .eq('tipo', 'despesa')
        .eq('data_lancamento', date)
        .in('valor', valueChunk)
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      for (const row of data || []) found.push(row);
    }
  }
  return found;
}

function annotateBusinessDuplicates(lancamentos, existingRows) {
  const existingByKey = new Map();
  for (const row of existingRows || []) {
    const key = dupKey(row?.data_lancamento, row?.valor);
    if (!existingByKey.has(key)) existingByKey.set(key, []);
    existingByKey.get(key).push({
      id: row?.id ?? null,
      descricao: String(row?.descricao || ''),
      valor: Math.round(Number(row?.valor || 0) * 100) / 100,
      data_lancamento: String(row?.data_lancamento || ''),
      ofx_uid: row?.ofx_uid ? String(row.ofx_uid) : null,
      created_at: row?.created_at || null,
    });
  }

  return (lancamentos || []).map((row) => {
    const conflitos = existingByKey.get(dupKey(row?.data_lancamento, row?.valor)) || [];
    return {
      ...row,
      possivel_duplicado: conflitos.length > 0,
      possiveis_duplicados: conflitos,
    };
  });
}

/**
 * @param {object} req
 * @param {{ dry_run?: boolean }} options
 */
export async function processarImportacaoOfx(req, options = {}) {
  const body = getBody(req);
  const ofxText = String(body.ofx || '');
  const dryRun = options.dry_run ?? body.dry_run === true || body.dry_run === 'true';
  const duplicateDecisions = parseDuplicateDecisions(body.duplicate_decisions);

  if (!ofxText.trim()) {
    return { status: 400, data: { error: 'Campo ofx obrigatorio' } };
  }

  const parsed = parseOfxToLancamentos(ofxText);
  if (parsed.erros_parse.some((e) => e.indice === -1) && parsed.lancamentos.length === 0) {
    const msg = parsed.erros_parse[0]?.motivo || 'Falha ao ler arquivo OFX';
    return { status: 400, data: { error: msg } };
  }

  let existingUids;
  try {
    existingUids = await fetchExistingOfxUids(parsed.lancamentos.map((r) => r.ofx_uid));
  } catch (err) {
    return { status: 500, data: { error: err.message || 'Erro ao consultar duplicados' } };
  }

  let existingBusinessRows;
  try {
    existingBusinessRows = await fetchExistingRowsByDateAndValue(parsed.lancamentos);
  } catch (err) {
    return { status: 500, data: { error: err.message || 'Erro ao consultar possíveis duplicados' } };
  }

  const lancamentosBase = annotateLancamentosExistencia(parsed.lancamentos, existingUids);
  const lancamentos = annotateBusinessDuplicates(lancamentosBase, existingBusinessRows);
  const resumo = resumoImportacaoOfx(lancamentos, parsed.erros_parse, parsed.ignorados_credito || 0);
  const totalPossiveisDuplicados = lancamentos.filter((r) => r.possivel_duplicado && !r.ja_existente).length;

  if (dryRun) {
    return {
      status: 200,
      data: {
        dry_run: true,
        account_key: parsed.account_key,
        bank_profile: parsed.bank_profile,
        lancamentos,
        total_possiveis_duplicados: totalPossiveisDuplicados,
        resumo,
        erros_parse: parsed.erros_parse,
        ignorados_credito: parsed.ignorados_credito || 0,
      },
    };
  }

  const inseridos = [];
  const ignorados_duplicado = [];
  const ignorados_duplicado_regra = [];
  const falhas = [];

  for (const row of lancamentos) {
    if (row.ja_existente) {
      ignorados_duplicado.push({ ofx_uid: row.ofx_uid, motivo: 'ja_existente', data_lancamento: row.data_lancamento, valor: row.valor });
      continue;
    }

    if (row.possivel_duplicado && duplicateDecisions[row.ofx_uid] !== true) {
      ignorados_duplicado_regra.push({
        ofx_uid: row.ofx_uid,
        motivo: 'possivel_duplicado_nao_confirmado',
        data_lancamento: row.data_lancamento,
        valor: row.valor,
        descricao: row.descricao,
      });
      continue;
    }

    const insertBody = {
      tipo_registro: row.tipo_registro,
      descricao: row.descricao,
      valor: row.valor,
      categoria: row.categoria,
      data_lancamento: row.data_lancamento,
      ofx_uid: row.ofx_uid,
    };

    const built = payloadInsertFinanceiro(insertBody);
    if (built.error) {
      falhas.push({ ofx_uid: row.ofx_uid, error: built.error });
      continue;
    }

    const { data, error } = await supabase
      .from(TABLE_FINANCAS)
      .insert(built.payload)
      .select()
      .single();

    if (error) {
      if (isUniqueViolation(error)) {
        ignorados_duplicado.push({ ofx_uid: row.ofx_uid, motivo: 'conflito_unicidade', data_lancamento: row.data_lancamento, valor: row.valor });
        continue;
      }
      falhas.push({ ofx_uid: row.ofx_uid, error: error.message });
      continue;
    }

    inseridos.push({ ...(data || {}), tipo_registro: built.tipo_registro });
  }

  return {
    status: 200,
    data: {
      dry_run: false,
      account_key: parsed.account_key,
      bank_profile: parsed.bank_profile,
      resumo: {
        ...resumo,
        inseridos: inseridos.length,
        ignorados_duplicado: ignorados_duplicado.length + ignorados_duplicado_regra.length,
        ignorados_duplicado_tecnico: ignorados_duplicado.length,
        ignorados_duplicado_regra: ignorados_duplicado_regra.length,
        ignorados_credito: parsed.ignorados_credito || 0,
        falhas: falhas.length,
      },
      inseridos: inseridos.length,
      ignorados_duplicado,
      ignorados_duplicado_regra,
      falhas,
      erros_parse: parsed.erros_parse,
    },
  };
}
