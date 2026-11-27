import { ItemLista, CATEGORIAS_LISTA, CATEGORIA_FILTRO_TODOS } from '../model/itemLista.js';

export function normalizarCategoriaLista(categoria, fallback = null) {
  if (categoria == null || String(categoria).trim() === '') return fallback;
  return CATEGORIAS_LISTA.includes(categoria) ? categoria : fallback;
}

export function payloadInsert(
  item,
  quantidade = 1,
  unidade_medida = null,
  comprado = false,
  categoria = null,
  posicao = 0
) {
  const payload = {
    item: (item || '').trim(),
    quantidade: Math.max(1, parseInt(quantidade, 10) || 1),
    comprado: Boolean(comprado),
    categoria: normalizarCategoriaLista(categoria, null),
    posicao: Number.isFinite(Number(posicao)) ? Math.max(0, Math.trunc(Number(posicao))) : 0,
  };
  if (unidade_medida != null && String(unidade_medida).trim()) payload.unidade_medida = String(unidade_medida).trim();
  return payload;
}

export function payloadUpdate(
  item = undefined,
  quantidade = undefined,
  unidade_medida = undefined,
  comprado = undefined,
  categoria = undefined,
  posicao = undefined
) {
  const out = {};
  if (item !== undefined) out.item = String(item).trim();
  if (quantidade !== undefined) out.quantidade = Math.max(1, parseInt(quantidade, 10));
  if (unidade_medida !== undefined) out.unidade_medida = String(unidade_medida).trim() || null;
  if (comprado !== undefined) out.comprado = Boolean(comprado);
  if (categoria !== undefined) {
    out.categoria = categoria == null || String(categoria).trim() === ''
      ? null
      : normalizarCategoriaLista(categoria, null);
  }
  if (posicao !== undefined) out.posicao = Math.max(0, Math.trunc(Number(posicao)) || 0);
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

export function ordenarPorPosicao(rows) {
  return [...(rows || [])].sort((a, b) => {
    const pa = Number(a?.posicao);
    const pb = Number(b?.posicao);
    const aPos = Number.isFinite(pa) ? pa : Number.MAX_SAFE_INTEGER;
    const bPos = Number.isFinite(pb) ? pb : Number.MAX_SAFE_INTEGER;
    if (aPos !== bPos) return aPos - bPos;
    return (Number(a?.id) || 0) - (Number(b?.id) || 0);
  });
}

/** @deprecated use ordenarPorPosicao */
export function ordenarPorCategoria(rows) {
  return ordenarPorPosicao(rows);
}

export function filtrarPorCategoria(rows, filtro = CATEGORIA_FILTRO_TODOS) {
  if (!filtro || filtro === CATEGORIA_FILTRO_TODOS) return [...(rows || [])];
  return (rows || []).filter((row) => row?.categoria === filtro);
}

/**
 * Agrupa itens pela ordem das categorias do filtro, preservando a ordem
 * relativa dentro de cada categoria. Sem categoria fica no final.
 */
export function agruparPorOrdemCategorias(rows, categorias = CATEGORIAS_LISTA) {
  const ordem = Array.isArray(categorias) && categorias.length ? categorias : CATEGORIAS_LISTA;
  const sorted = ordenarPorPosicao(rows);
  const buckets = new Map(ordem.map((nome) => [nome, []]));
  const semCategoria = [];
  for (const row of sorted) {
    const categoria = row?.categoria;
    if (categoria && buckets.has(categoria)) buckets.get(categoria).push(row);
    else semCategoria.push(row);
  }
  return [...ordem.flatMap((nome) => buckets.get(nome) || []), ...semCategoria];
}

/**
 * Recalcula posições dos itens reordenados, reaproveitando os slots numéricos
 * que esses itens já ocupavam — assim a ordem dos demais permanece estável.
 */
export function calcularReordenacao(rows, orderedIds) {
  const byId = new Map((rows || []).map((row) => [String(row.id), row]));
  const moved = orderedIds
    .map((id) => byId.get(String(id)))
    .filter(Boolean);
  if (moved.length < 2) return [];
  const slots = moved
    .map((row) => Number(row.posicao))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  while (slots.length < moved.length) {
    const last = slots.length ? slots[slots.length - 1] : 0;
    slots.push(last + 1);
  }
  return moved.map((row, index) => ({
    id: row.id,
    posicao: slots[index],
  }));
}

export function proximaPosicao(rows) {
  const max = (rows || []).reduce((acc, row) => {
    const value = Number(row?.posicao);
    return Number.isFinite(value) ? Math.max(acc, value) : acc;
  }, 0);
  return max + 1;
}

export function parseRowsSupabase(rows) {
  return (rows || []).map((r) => ItemLista.fromRow(r));
}
