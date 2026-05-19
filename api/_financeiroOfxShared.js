import { supabase } from '../lib/supabase.js';
import {
  TABLE_FINANCAS,
  payloadInsertFinanceiro,
  parseOfxToLancamentos,
  annotateLancamentosExistencia,
  resumoImportacaoOfx,
} from '../features/financeiro/index.js';

const UID_CHUNK = 100;

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

/**
 * @param {object} req
 * @param {{ dry_run?: boolean }} options
 */
export async function processarImportacaoOfx(req, options = {}) {
  const body = getBody(req);
  const ofxText = String(body.ofx || '');
  const dryRun = options.dry_run ?? body.dry_run === true || body.dry_run === 'true';

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

  const lancamentos = annotateLancamentosExistencia(parsed.lancamentos, existingUids);
  const resumo = resumoImportacaoOfx(lancamentos, parsed.erros_parse, parsed.ignorados_credito || 0);

  if (dryRun) {
    return {
      status: 200,
      data: {
        dry_run: true,
        account_key: parsed.account_key,
        bank_profile: parsed.bank_profile,
        lancamentos,
        resumo,
        erros_parse: parsed.erros_parse,
        ignorados_credito: parsed.ignorados_credito || 0,
      },
    };
  }

  const inseridos = [];
  const ignorados_duplicado = [];
  const falhas = [];

  for (const row of lancamentos) {
    if (row.ja_existente) {
      ignorados_duplicado.push({ ofx_uid: row.ofx_uid, motivo: 'ja_existente' });
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
        ignorados_duplicado.push({ ofx_uid: row.ofx_uid, motivo: 'conflito_unicidade' });
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
        ignorados_duplicado: ignorados_duplicado.length,
        ignorados_credito: parsed.ignorados_credito || 0,
        falhas: falhas.length,
      },
      inseridos: inseridos.length,
      ignorados_duplicado,
      falhas,
      erros_parse: parsed.erros_parse,
    },
  };
}
