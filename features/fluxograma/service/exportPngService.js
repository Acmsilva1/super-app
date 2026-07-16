/* Export PNG helpers — bounds, page split (max 2 pages) */

export const EXPORT_PADDING = 48;
/** Limite de um lado (px) para um único PNG; acima disso o Node divide em 2 páginas. */
export const MAX_SINGLE_PAGE_EDGE = 2400;
/** Teto do canvas de export no browser (evita OOM / limite do canvas). */
export const MAX_EXPORT_CANVAS_EDGE = 8192;

/**
 * @param {Array<{x:number,y:number,w?:number,h?:number}>} nodes
 * @param {Array<{x:number,y:number,w?:number,h?:number}>} texts
 * @param {(n: object) => number} getW
 * @param {(n: object) => number} getH
 */
export function getGraphContentBounds(nodes, texts, getW, getH) {
    const listN = Array.isArray(nodes) ? nodes : [];
    const listT = Array.isArray(texts) ? texts : [];
    if (!listN.length && !listT.length) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const n of listN) {
        const nw = getW(n);
        const nh = getH(n);
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + nw);
        maxY = Math.max(maxY, n.y + nh);
    }
    for (const t of listT) {
        minX = Math.min(minX, t.x);
        minY = Math.min(minY, t.y);
        maxX = Math.max(maxX, t.x + (Number(t.w) || 0));
        maxY = Math.max(maxY, t.y + (Number(t.h) || 0));
    }

    return { minX, minY, maxX, maxY };
}

export function shouldSplitIntoTwoPages(width, height, maxEdge = MAX_SINGLE_PAGE_EDGE) {
    const w = Math.max(0, Math.floor(Number(width) || 0));
    const h = Math.max(0, Math.floor(Number(height) || 0));
    return w > maxEdge || h > maxEdge;
}

/**
 * Retorna 1 ou 2 retângulos de recorte em coordenadas da imagem.
 * Preferência: corta no eixo mais longo (altura → cima/baixo; largura → esquerda/direita).
 * @returns {Array<{ page: number, x: number, y: number, width: number, height: number }>}
 */
export function getExportPageRects(width, height, maxEdge = MAX_SINGLE_PAGE_EDGE) {
    const w = Math.max(1, Math.floor(Number(width) || 1));
    const h = Math.max(1, Math.floor(Number(height) || 1));

    if (!shouldSplitIntoTwoPages(w, h, maxEdge)) {
        return [{ page: 1, x: 0, y: 0, width: w, height: h }];
    }

    if (h >= w) {
        const mid = Math.ceil(h / 2);
        return [
            { page: 1, x: 0, y: 0, width: w, height: mid },
            { page: 2, x: 0, y: mid, width: w, height: h - mid },
        ];
    }

    const mid = Math.ceil(w / 2);
    return [
        { page: 1, x: 0, y: 0, width: mid, height: h },
        { page: 2, x: mid, y: 0, width: w - mid, height: h },
    ];
}

export function buildExportFileName(baseName, page, totalPages) {
    const safe = String(baseName || "fluxograma").replace(/[\\/:*?"<>|]/g, "_").trim() || "fluxograma";
    if (totalPages <= 1) return `${safe}.png`;
    return `${safe}-pagina-${page}.png`;
}
