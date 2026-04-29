import { ItemLista, CATEGORIAS_LISTA } from '../model/itemLista.js';

export function payloadInsert(
  item,
  quantidade = 1,
  unidade_medida = null,
  comprado = false,
  categoria = CATEGORIAS_LISTA[0]
) {
  const payload = {
    item: (item || '').trim(),
    quantidade: Math.max(1, parseInt(quantidade, 10) || 1),
    comprado: Boolean(comprado),
    categoria: CATEGORIAS_LISTA.includes(categoria) ? categoria : CATEGORIAS_LISTA[0],
  };
  if (unidade_medida != null && String(unidade_medida).trim()) payload.unidade_medida = String(unidade_medida).trim();
  return payload;
}

export function payloadUpdate(
  item = undefined,
  quantidade = undefined,
  unidade_medida = undefined,
  comprado = undefined,
  categoria = undefined
) {
  const out = {};
  if (item !== undefined) out.item = String(item).trim();
  if (quantidade !== undefined) out.quantidade = Math.max(1, parseInt(quantidade, 10));
  if (unidade_medida !== undefined) out.unidade_medida = String(unidade_medida).trim() || null;
  if (comprado !== undefined) out.comprado = Boolean(comprado);
  if (categoria !== undefined) out.categoria = CATEGORIAS_LISTA.includes(categoria) ? categoria : CATEGORIAS_LISTA[0];
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

export function ordenarPorCategoria(rows) {
  return [...(rows || [])].sort((a, b) => {
    const ia = CATEGORIAS_LISTA.indexOf(a?.categoria || '');
    const ib = CATEGORIAS_LISTA.indexOf(b?.categoria || '');
    if (ia !== ib) return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    return (a?.created_at || '') < (b?.created_at || '') ? 1 : -1;
  });
}

export function parseRowsSupabase(rows) {
  return (rows || []).map((r) => ItemLista.fromRow(r));
}
