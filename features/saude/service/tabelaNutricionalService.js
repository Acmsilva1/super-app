export const ITENS_POR_PAGINA = 10;

export function normalizarTexto(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function filtrarTabelaNutricional(rows, filters = {}) {
  const busca = normalizarTexto(filters.busca);
  const categoria = String(filters.categoria || '').trim();
  const protocolo = String(filters.protocolo || '').trim();

  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (categoria && row.categoria !== categoria) return false;
    if (protocolo && row.protocolo !== protocolo) return false;
    if (!busca) return true;
    return normalizarTexto(`${row.item} ${row.porcao} ${row.categoria} ${row.protocolo}`).includes(busca);
  });
}

export function paginarTabelaNutricional(rows, page = 1, pageSize = ITENS_POR_PAGINA) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safePageSize = Math.max(1, Number(pageSize) || ITENS_POR_PAGINA);
  const totalPages = Math.max(1, Math.ceil(safeRows.length / safePageSize));
  const currentPage = Math.min(totalPages, Math.max(1, Number(page) || 1));
  const start = (currentPage - 1) * safePageSize;

  return {
    rows: safeRows.slice(start, start + safePageSize),
    currentPage,
    totalPages,
    totalItems: safeRows.length,
  };
}

export function opcoesTabelaNutricional(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return {
    categorias: [...new Set(safeRows.map((row) => row.categoria).filter(Boolean))],
    protocolos: [...new Set(safeRows.map((row) => row.protocolo).filter(Boolean))],
  };
}
