import { DespesaFixa, STATUS_PENDENTE } from '../model/despesaFixa.js';

export function payloadInsert(descricao, valor, status = STATUS_PENDENTE) {
  return {
    descricao: (descricao || '').trim(),
    valor: Math.round(Number(valor) * 100) / 100,
    status: status === 'pago' || status === 'pendente' ? status : STATUS_PENDENTE,
  };
}

export function payloadUpdate(descricao = undefined, valor = undefined, status = undefined) {
  const out = {};
  if (descricao !== undefined) out.descricao = String(descricao).trim();
  if (valor !== undefined) out.valor = Math.round(Number(valor) * 100) / 100;
  if (status !== undefined) out.status = status === 'pago' || status === 'pendente' ? status : STATUS_PENDENTE;
  return out;
}

export function calcularSoma(rows) {
  return (rows || []).reduce((acc, r) => acc + Number(r?.valor ?? 0), 0);
}

export function parseRowsSupabase(rows) {
  return (rows || []).map((r) => DespesaFixa.fromRow(r));
}
