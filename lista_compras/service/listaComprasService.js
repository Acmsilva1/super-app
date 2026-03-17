import { ItemLista, PRIORIDADE_BAIXA } from '../model/itemLista.js';

export function payloadInsert(
  item,
  quantidade = 1,
  unidade_medida = null,
  comprado = false,
  prioridade = PRIORIDADE_BAIXA
) {
  const payload = {
    item: (item || '').trim(),
    quantidade: Math.max(1, parseInt(quantidade, 10) || 1),
    comprado: Boolean(comprado),
    prioridade: Math.max(1, Math.min(3, parseInt(prioridade, 10) || PRIORIDADE_BAIXA)),
  };
  if (unidade_medida != null && String(unidade_medida).trim()) payload.unidade_medida = String(unidade_medida).trim();
  return payload;
}

export function payloadUpdate(
  item = undefined,
  quantidade = undefined,
  unidade_medida = undefined,
  comprado = undefined,
  prioridade = undefined
) {
  const out = {};
  if (item !== undefined) out.item = String(item).trim();
  if (quantidade !== undefined) out.quantidade = Math.max(1, parseInt(quantidade, 10));
  if (unidade_medida !== undefined) out.unidade_medida = String(unidade_medida).trim() || null;
  if (comprado !== undefined) out.comprado = Boolean(comprado);
  if (prioridade !== undefined) out.prioridade = Math.max(1, Math.min(3, parseInt(prioridade, 10)));
  return out;
}

export function toggleComprado(rows, idItem) {
  const item = (rows || []).find((r) => String(r?.id) === String(idItem));
  if (!item) return null;
  return { comprado: !Boolean(item?.comprado ?? false) };
}

export function resetChecksPayload() {
  return { comprado: false };
}

export function contarComprados(rows) {
  return (rows || []).filter((r) => r?.comprado).length;
}

export function contarPendentes(rows) {
  return (rows || []).filter((r) => !r?.comprado).length;
}

export function ordenarPorPrioridade(rows, prioridadePrimeiro = true) {
  return [...(rows || [])].sort((a, b) => {
    const pa = a?.prioridade ?? 1;
    const pb = b?.prioridade ?? 1;
    return prioridadePrimeiro ? pb - pa : pa - pb;
  });
}

export function parseRowsSupabase(rows) {
  return (rows || []).map((r) => ItemLista.fromRow(r));
}
