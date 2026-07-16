import { describe, expect, it } from 'vitest';

import {
  buildExportFileName,
  getExportPageRects,
  getGraphContentBounds,
  shouldSplitIntoTwoPages,
  MAX_SINGLE_PAGE_EDGE,
} from '../../features/fluxograma/service/exportPngService.js';

describe('exportPngService', () => {
  it('calcula bounds do grafo com nos e textos', () => {
    const bounds = getGraphContentBounds(
      [{ x: 10, y: 20, w: 100, h: 50 }],
      [{ x: 200, y: 5, w: 40, h: 20 }],
      (n) => n.w,
      (n) => n.h,
    );
    expect(bounds).toEqual({ minX: 10, minY: 5, maxX: 240, maxY: 70 });
  });

  it('retorna null quando nao ha conteudo', () => {
    expect(getGraphContentBounds([], [], (n) => n.w, (n) => n.h)).toBeNull();
  });

  it('decide split quando algum lado passa do limite', () => {
    expect(shouldSplitIntoTwoPages(1000, 1000)).toBe(false);
    expect(shouldSplitIntoTwoPages(MAX_SINGLE_PAGE_EDGE + 1, 800)).toBe(true);
    expect(shouldSplitIntoTwoPages(800, MAX_SINGLE_PAGE_EDGE + 1)).toBe(true);
  });

  it('divide em 2 paginas no eixo mais longo (altura)', () => {
    const h = MAX_SINGLE_PAGE_EDGE + 200;
    const rects = getExportPageRects(1000, h);
    expect(rects).toHaveLength(2);
    expect(rects[0]).toMatchObject({ page: 1, x: 0, y: 0, width: 1000 });
    expect(rects[1].page).toBe(2);
    expect(rects[0].height + rects[1].height).toBe(h);
  });

  it('divide em 2 paginas no eixo mais longo (largura)', () => {
    const w = MAX_SINGLE_PAGE_EDGE + 100;
    const rects = getExportPageRects(w, 900);
    expect(rects).toHaveLength(2);
    expect(rects[0].width + rects[1].width).toBe(w);
    expect(rects[0].height).toBe(900);
  });

  it('monta nome de arquivo com pagina', () => {
    expect(buildExportFileName('Meu Projeto', 1, 1)).toBe('Meu Projeto.png');
    expect(buildExportFileName('Meu Projeto', 2, 2)).toBe('Meu Projeto-pagina-2.png');
  });
});
