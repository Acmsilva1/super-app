import { createHash } from 'node:crypto';

import {
  TIPO_REGISTRO_GASTO_VARIADO,
  TIPO_REGISTRO_RECEITA,
} from '../model/financeiro.js';

const MAX_OFX_BYTES = 4 * 1024 * 1024;
const DEFAULT_CATEGORIA = 'Outros';

const DEBIT_TYPES = new Set([
  'DEBIT', 'DEBITMEMO', 'PAYMENT', 'WITHDRAWAL', 'ATM', 'POS', 'CHECK', 'FEE', 'SRVCHG',
  'DIRECTDEBIT', 'REPEATPMT', 'OTHER',
]);
const CREDIT_TYPES = new Set([
  'CREDIT', 'CREDITMEMO', 'DEP', 'DEPOSIT', 'INT', 'DIV', 'DIRECTDEP', 'XFER',
]);

/** @param {string} ofxText */
export function assertOfxSize(ofxText) {
  const len = Buffer.byteLength(String(ofxText || ''), 'utf8');
  if (len > MAX_OFX_BYTES) {
    return { error: `Arquivo OFX excede o limite de ${MAX_OFX_BYTES} bytes` };
  }
  return { ok: true };
}

/**
 * @param {string} accountKey
 * @param {string} fitid
 * @returns {string|null}
 */
export function buildOfxUid(accountKey, fitid) {
  const f = String(fitid || '').trim();
  if (!f) return null;
  const acct = String(accountKey || 'default').trim() || 'default';
  const raw = `${acct}|${f}`;
  if (raw.length <= 200) return raw;
  return createHash('sha256').update(raw).digest('hex');
}

function readTag(block, tag) {
  const re = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i');
  const m = String(block || '').match(re);
  return m ? m[1].trim() : '';
}

/** @param {string} ofxText */
function extractAccountKey(ofxText) {
  const bankFrom = ofxText.match(/<BANKACCTFROM>([\s\S]*?)<\/BANKACCTFROM>/i);
  const ccFrom = ofxText.match(/<CCACCTFROM>([\s\S]*?)<\/CCACCTFROM>/i);
  const chunk = bankFrom?.[1] || ccFrom?.[1] || ofxText.slice(0, 8000);
  const bankId = readTag(chunk, 'BANKID') || readTag(chunk, 'ORG');
  const acctId = readTag(chunk, 'ACCTID');
  if (acctId) return `${bankId || 'bank'}:${acctId}`;
  return 'default';
}

/** @param {string} dt */
export function parseOfxDate(dt) {
  const digits = String(dt || '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  if (!/^\d{4}$/.test(y) || !/^\d{2}$/.test(m) || !/^\d{2}$/.test(d)) return null;
  return `${y}-${m}-${d}`;
}

/**
 * @param {number} amount
 * @param {string} trnType
 * @returns {'receita'|'despesa'}
 */
export function inferTipoFromOfx(amount, trnType) {
  const tt = String(trnType || '').toUpperCase().trim();
  if (CREDIT_TYPES.has(tt)) return 'receita';
  if (DEBIT_TYPES.has(tt)) return 'despesa';
  if (amount > 0) return 'receita';
  if (amount < 0) return 'despesa';
  return 'despesa';
}

/** @param {string} ofxText */
function extractStmtTrnBlocks(ofxText) {
  const blocks = [];
  const re = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let m;
  while ((m = re.exec(ofxText)) !== null) {
    blocks.push(m[1]);
  }
  if (blocks.length > 0) return blocks;

  const openRe = /<STMTTRN>([\s\S]*?)(?=<STMTTRN>|<\/BANKTRANLIST>|<\/CCSTMTRS>|<\/STMTRS>|$)/gi;
  while ((m = openRe.exec(ofxText)) !== null) {
    if (m[1] && readTag(m[1], 'FITID')) blocks.push(m[1]);
  }
  return blocks;
}

/**
 * @param {string} ofxText
 * @returns {{ lancamentos: object[], erros_parse: { indice: number, motivo: string }[], account_key: string }}
 */
export function parseOfxToLancamentos(ofxText) {
  const text = String(ofxText || '');
  const sizeCheck = assertOfxSize(text);
  if (sizeCheck.error) {
    return { lancamentos: [], erros_parse: [{ indice: -1, motivo: sizeCheck.error }], account_key: 'default' };
  }
  if (!text.includes('STMTTRN') && !text.includes('stmttrn')) {
    return { lancamentos: [], erros_parse: [{ indice: -1, motivo: 'Nenhuma transação STMTTRN encontrada no arquivo' }], account_key: 'default' };
  }

  const accountKey = extractAccountKey(text);
  const blocks = extractStmtTrnBlocks(text);
  const lancamentos = [];
  const erros_parse = [];

  blocks.forEach((block, indice) => {
    const fitid = readTag(block, 'FITID');
    const ofx_uid = buildOfxUid(accountKey, fitid);
    if (!ofx_uid) {
      erros_parse.push({ indice, motivo: 'FITID ausente — transação ignorada' });
      return;
    }

    const dt =
      parseOfxDate(readTag(block, 'DTPOSTED'))
      || parseOfxDate(readTag(block, 'DTUSER'))
      || parseOfxDate(readTag(block, 'DTAVAIL'));
    if (!dt) {
      erros_parse.push({ indice, motivo: 'Data inválida ou ausente' });
      return;
    }

    const amountRaw = readTag(block, 'TRNAMT');
    const amount = Number(String(amountRaw).replace(',', '.'));
    if (!Number.isFinite(amount) || amount === 0) {
      erros_parse.push({ indice, motivo: 'Valor TRNAMT inválido' });
      return;
    }

    const trnType = readTag(block, 'TRNTYPE');
    const tipo = inferTipoFromOfx(amount, trnType);
    const tipo_registro = tipo === 'receita' ? TIPO_REGISTRO_RECEITA : TIPO_REGISTRO_GASTO_VARIADO;
    const descricao = (readTag(block, 'MEMO') || readTag(block, 'NAME') || `Transação ${fitid}`).trim();

    lancamentos.push({
      ofx_uid,
      fitid,
      tipo_registro,
      tipo,
      descricao: descricao.slice(0, 500),
      valor: Math.round(Math.abs(amount) * 100) / 100,
      data_lancamento: dt,
      categoria: DEFAULT_CATEGORIA,
    });
  });

  const seen = new Set();
  const deduped = [];
  for (const row of lancamentos) {
    if (seen.has(row.ofx_uid)) continue;
    seen.add(row.ofx_uid);
    deduped.push(row);
  }

  return { lancamentos: deduped, erros_parse, account_key: accountKey };
}

/**
 * @param {object[]} lancamentos
 * @param {Set<string>} existingUids
 */
export function annotateLancamentosExistencia(lancamentos, existingUids) {
  return (lancamentos || []).map((row) => ({
    ...row,
    ja_existente: existingUids.has(row.ofx_uid),
  }));
}

/**
 * @param {object[]} annotated
 * @param {{ indice: number, motivo: string }[]} erros_parse
 */
export function resumoImportacaoOfx(annotated, erros_parse = []) {
  const total = annotated.length;
  const ja_existentes = annotated.filter((r) => r.ja_existente).length;
  const novos = total - ja_existentes;
  return { total, novos, ja_existentes, erros_parse: erros_parse.length };
}
