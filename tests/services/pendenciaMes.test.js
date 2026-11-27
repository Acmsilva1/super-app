import { describe, expect, it } from 'vitest';

import {
  formatMesNome,
  getMesAnoProximo,
  buildPendenciaMesDescricao,
  parsePendenciaMesDescricao,
  stripPendenciaMesPrefix,
} from '../../features/financeiro/pendenciaMes.js';

describe('pendenciaMes helpers', () => {
  it('nomeia o mês em português', () => {
    expect(formatMesNome('2026-11')).toBe('Novembro');
    expect(formatMesNome('2026-12')).toBe('Dezembro');
    expect(formatMesNome('2027-01')).toBe('Janeiro');
  });

  it('avança o mês cruzando o ano', () => {
    expect(getMesAnoProximo('2026-11')).toBe('2026-12');
    expect(getMesAnoProximo('2026-12')).toBe('2027-01');
  });

  it('monta descrição com tag de pendência do mês de origem', () => {
    expect(buildPendenciaMesDescricao('financiamento casa', '2026-11')).toBe(
      '[Pendência de Novembro] financiamento casa'
    );
  });

  it('não empilha prefixo ao replicar de novo', () => {
    const once = buildPendenciaMesDescricao('financiamento casa', '2026-11');
    expect(buildPendenciaMesDescricao(once, '2026-12')).toBe(
      '[Pendência de Dezembro] financiamento casa'
    );
  });

  it('parseia título limpo e tag verde', () => {
    expect(parsePendenciaMesDescricao('[Pendência de Novembro] financiamento casa')).toEqual({
      isPendencia: true,
      mesNome: 'Novembro',
      titulo: 'financiamento casa',
    });
    expect(parsePendenciaMesDescricao('financiamento casa')).toEqual({
      isPendencia: false,
      mesNome: '',
      titulo: 'financiamento casa',
    });
  });

  it('strip remove só o prefixo', () => {
    expect(stripPendenciaMesPrefix('[Pendência de Novembro] financiamento casa')).toBe('financiamento casa');
    expect(stripPendenciaMesPrefix('sem prefixo')).toBe('sem prefixo');
  });
});
