import { describe, expect, it } from 'vitest';

import {
  contarComprados,
  contarPendentes,
  normalizarCategoriaLista,
  ordenarPorCategoria,
  payloadInsert,
  toggleComprado,
} from '../../features/lista_compras/service/listaComprasService.js';

describe('listaComprasService', () => {
  it('normaliza payload de insert', () => {
    const out = payloadInsert('  Arroz  ', 0, ' kg ', true, 'Mercado');
    expect(out.item).toBe('Arroz');
    expect(out.quantidade).toBe(1);
    expect(out.unidade_medida).toBe('kg');
    expect(out.comprado).toBe(true);
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
    expect(normalizarCategoriaLista('Inexistente')).toBe('Mantimentos');
  });

  it('ordena por categoria e data', () => {
    const out = ordenarPorCategoria([
      { categoria: 'Outros', created_at: '2026-01-01' },
      { categoria: 'Mercado', created_at: '2026-01-02' },
    ]);
    expect(out[0].categoria).toBe('Mercado');
  });
});
