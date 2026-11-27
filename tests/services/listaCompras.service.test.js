import { describe, expect, it } from 'vitest';

import {
  agruparPorOrdemCategorias,
  calcularReordenacao,
  contarComprados,
  contarPendentes,
  filtrarPorCategoria,
  normalizarCategoriaLista,
  ordenarPorPosicao,
  payloadInsert,
  proximaPosicao,
  toggleComprado,
} from '../../features/lista_compras/service/listaComprasService.js';

describe('listaComprasService', () => {
  it('normaliza payload de insert', () => {
    const out = payloadInsert('  Arroz  ', 0, ' kg ', true, 'Feira', 3);
    expect(out.item).toBe('Arroz');
    expect(out.quantidade).toBe(1);
    expect(out.unidade_medida).toBe('kg');
    expect(out.comprado).toBe(true);
    expect(out.categoria).toBe('Feira');
    expect(out.posicao).toBe(3);
  });

  it('toggle de comprado por id', () => {
    const out = toggleComprado([{ id: 1, comprado: false }], 1);
    expect(out).toEqual({ comprado: true });
  });

  it('contabiliza comprados e pendentes', () => {
    const rows = [{ comprado: true }, { comprado: false }, { comprado: false }];
    expect(contarComprados(rows)).toBe(1);
    expect(contarPendentes(rows)).toBe(2);
  });

  it('normaliza categoria com fallback seguro', () => {
    expect(normalizarCategoriaLista('Feira')).toBe('Feira');
    expect(normalizarCategoriaLista('Inexistente')).toBeNull();
    expect(normalizarCategoriaLista('')).toBeNull();
  });

  it('ordena por posicao e id', () => {
    const out = ordenarPorPosicao([
      { id: 2, posicao: 2 },
      { id: 1, posicao: 1 },
      { id: 3, posicao: 1 },
    ]);
    expect(out.map((row) => row.id)).toEqual([1, 3, 2]);
  });

  it('filtra por categoria e recalcula reordenacao', () => {
    const rows = [
      { id: 1, posicao: 1, categoria: 'Feira' },
      { id: 2, posicao: 2, categoria: 'Limpeza' },
      { id: 3, posicao: 5, categoria: 'Feira' },
    ];
    expect(filtrarPorCategoria(rows, 'Feira').map((row) => row.id)).toEqual([1, 3]);
    expect(calcularReordenacao(rows, [3, 1])).toEqual([
      { id: 3, posicao: 1 },
      { id: 1, posicao: 5 },
    ]);
    expect(proximaPosicao(rows)).toBe(6);
  });

  it('agrupa pela ordem das categorias do filtro preservando ordem relativa', () => {
    const rows = [
      { id: 1, posicao: 1, categoria: 'Feira' },
      { id: 2, posicao: 2, categoria: 'Limpeza' },
      { id: 3, posicao: 3, categoria: null },
      { id: 4, posicao: 4, categoria: 'Feira' },
      { id: 5, posicao: 5, categoria: 'Higiene' },
      { id: 6, posicao: 6, categoria: 'Gelados' },
    ];
    expect(agruparPorOrdemCategorias(rows).map((row) => row.id)).toEqual([2, 5, 1, 4, 6, 3]);
  });
});
