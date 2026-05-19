/**
 * Literais comuns em MEMO/NAME de extratos OFX (Brasil).
 * Perfil padrão do app: Santander (Money 2000+). Demais bancos usam generic_br como reforço.
 */

export const OFX_PROFILE_SANTANDER = 'santander';
export const OFX_PROFILE_GENERIC_BR = 'generic_br';

/** @type {Record<string, { orgHints: string[], debitMemo: string[], pixEnviadoMemo: string[], pixRecebidoMemo: string[], excludeMemo: string[] }>} */
export const OFX_BANK_LABELS = {
  [OFX_PROFILE_SANTANDER]: {
    orgHints: [
      'SANTANDER',
      'BANESPA',
      '033',
      'BANKID>033',
      'FID>033',
    ],
    debitMemo: [
      'COMPRA CARTAO',
      'COMPRA CART',
      'COMPRA NO DEBITO',
      'COMPRA DEBITO',
      'COMPRA ELO',
      'COMPRA VISA',
      'COMPRA MASTERCARD',
      'COMPRA MC',
      'DEBITO AUTOMATICO',
      'DEB AUTOMATICO',
      'DEB AUT',
      'DEBITO EM CONTA',
      'DEB EM CONTA',
      'PAGAMENTO BOLETO',
      'PGTO BOLETO',
      'PAG BOLETO',
      'PAG TIT',
      'PAGAMENTO TITULO',
      'PAG TITULO',
      'SAQUE',
      'SAQ ATM',
      'SAQ TAA',
      'SAQ CHQ',
      'SAQUE ATM',
      'PIX SAQUE',
      'PIX TROCO',
      'TARIFA',
      'TAR ',
      'CUSTO',
      'MANUTENCAO CONTA',
      'ANUIDADE',
      'IOF',
      'Juros',
      'JUROS',
      'ENCARGOS',
      'TED ENV',
      'TED ENVIAD',
      'TRANSF ENV',
      'TRANSFERENCIA ENV',
      'DOC ENV',
      'DOC ENVIAD',
      'PAGAMENTO',
      'PGTO ',
      'DEBITO',
      'DEB ',
      'COMPRA',
      'POS ',
      'E-COMMERCE',
      'ECOMMERCE',
    ],
    pixEnviadoMemo: [
      'PIX ENVIAD',
      'PIX ENV',
      'ENVIO PIX',
      'ENV PIX',
      'PIX - ENV',
      'PIX-ENV',
      'TRANSF PIX ENV',
      'TRANSFERENCIA PIX ENV',
      'PIX TRANSF ENV',
      'PIX PAGAMENTO',
      'PIX PAG',
      'PIX PARA',
      'PIX OUT',
    ],
    pixRecebidoMemo: [
      'PIX RECEB',
      'PIX REC',
      'PIX CRED',
      'CRED PIX',
      'PIX RECEBIDO',
      'RECEB PIX',
      'PIX - RECEB',
      'PIX-RECEB',
      'TRANSF PIX RECEB',
      'PIX TRANSF RECEB',
      'PIX DE ',
      'PIX DEVOLVIDO',
    ],
    excludeMemo: [
      'SALARIO',
      'SALÁRIO',
      'PROVENTOS',
      'FOLHA PAG',
      'CREDITO SALARIO',
      'DEPOSITO',
      'DEP DIN',
      'DEP CHQ',
      'DEPOSITO DIN',
      'RESGATE',
      'RENDIMENTO',
      'REND PAGO',
      'DIVIDENDO',
      'ESTORNO CRED',
      'EST CRED',
      'CREDITO',
      'CRED ',
      'RECEBIMENTO',
      'TRANSFERENCIA RECEB',
      'TED RECEB',
      'DOC RECEB',
      'PIX RECEB',
      'DEVOLUCAO PIX',
      'ESTORNO PIX',
    ],
  },
  [OFX_PROFILE_GENERIC_BR]: {
    orgHints: [],
    debitMemo: [
      'COMPRA',
      'DEBITO',
      'DEB ',
      'PAGAMENTO',
      'PGTO',
      'SAQUE',
      'TARIFA',
      'ANUIDADE',
      'BOLETO',
      'TITULO',
      'TED ENV',
      'DOC ENV',
      'TRANSF ENV',
    ],
    pixEnviadoMemo: [
      'PIX ENVIAD',
      'ENVIO PIX',
      'PIX ENV',
      'PIX PAG',
    ],
    pixRecebidoMemo: [
      'PIX RECEB',
      'PIX CRED',
      'CRED PIX',
      'PIX RECEBIDO',
      'RECEB PIX',
    ],
    excludeMemo: [
      'SALARIO',
      'PROVENTOS',
      'DEPOSITO',
      'RESGATE',
      'RENDIMENTO',
      'CREDITO',
      'ESTORNO',
    ],
  },
};

/** @param {string} text */
export function normalizeOfxText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** @param {string} memo @param {string[]} terms */
export function memoMatchesAny(memo, terms) {
  const n = normalizeOfxText(memo);
  if (!n) return false;
  return terms.some((t) => n.includes(normalizeOfxText(t)));
}

/** @param {string} ofxText @returns {string} */
export function detectOfxBankProfile(ofxText) {
  const head = normalizeOfxText(String(ofxText || '').slice(0, 16000));
  const santander = OFX_BANK_LABELS[OFX_PROFILE_SANTANDER];
  if (santander.orgHints.some((h) => head.includes(normalizeOfxText(h)))) {
    return OFX_PROFILE_SANTANDER;
  }
  return OFX_PROFILE_GENERIC_BR;
}

/**
 * Mescla perfil detectado com genérico BR (Santander = principal + fallback).
 * @param {string} [profile]
 */
export function getOfxLabelSet(profile = OFX_PROFILE_SANTANDER) {
  const primary = OFX_BANK_LABELS[profile] || OFX_BANK_LABELS[OFX_PROFILE_SANTANDER];
  const generic = OFX_BANK_LABELS[OFX_PROFILE_GENERIC_BR];
  const merge = (a, b) => [...new Set([...(a || []), ...(b || [])])];
  return {
    profile: profile in OFX_BANK_LABELS ? profile : OFX_PROFILE_SANTANDER,
    debitMemo: merge(primary.debitMemo, generic.debitMemo),
    pixEnviadoMemo: merge(primary.pixEnviadoMemo, generic.pixEnviadoMemo),
    pixRecebidoMemo: merge(primary.pixRecebidoMemo, generic.pixRecebidoMemo),
    excludeMemo: merge(primary.excludeMemo, generic.excludeMemo),
  };
}
