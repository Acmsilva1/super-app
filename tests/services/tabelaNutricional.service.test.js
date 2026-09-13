import { describe, expect, it } from 'vitest';

import { TABELAS_NUTRICIONAIS } from '../../features/saude/data/tabelasNutricionais.js';
import {
  filtrarTabelaNutricional,
  opcoesTabelaNutricional,
  paginarTabelaNutricional,
} from '../../features/saude/service/tabelaNutricionalService.js';

describe('tabelaNutricionalService', () => {
  it('preserva os 115 itens importados do Excel', () => {
    expect(TABELAS_NUTRICIONAIS).toHaveLength(115);
    expect(opcoesTabelaNutricional(TABELAS_NUTRICIONAIS)).toEqual({
      categorias: ['Proteínas', 'Carboidratos', 'Frutas', 'Gorduras Boas', 'Legumes e Folhas'],
      protocolos: ['Perder Peso', 'Manutenção'],
    });
  });

  it('filtra sem diferenciar acentos ou caixa', () => {
    const result = filtrarTabelaNutricional(TABELAS_NUTRICIONAIS, {
      busca: 'proteinas',
      protocolo: 'Manutenção',
    });

    expect(result).toHaveLength(12);
    expect(result.every((row) => row.categoria === 'Proteínas')).toBe(true);
  });

  it('pagina dez itens e limita páginas fora do intervalo', () => {
    const first = paginarTabelaNutricional(TABELAS_NUTRICIONAIS, 1);
    const last = paginarTabelaNutricional(TABELAS_NUTRICIONAIS, 99);

    expect(first.rows).toHaveLength(10);
    expect(first.totalPages).toBe(12);
    expect(last.currentPage).toBe(12);
    expect(last.rows).toHaveLength(5);
  });
});
