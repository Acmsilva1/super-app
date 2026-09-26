import { describe, expect, it } from 'vitest';

import { countDietItems, createEmptyDietMeals, DIET_MEALS, normalizeDietMeals } from '../../features/saude/service/dietasService.js';

describe('dietasService', () => {
  it('cria as seis refeições padrão na ordem esperada', () => {
    const meals = createEmptyDietMeals();
    expect(meals).toHaveLength(6);
    expect(meals.map((meal) => meal.tipo)).toEqual(DIET_MEALS.map((meal) => meal.tipo));
    expect(meals.every((meal) => meal.itens.length === 0)).toBe(true);
  });

  it('normaliza itens por refeição e conta o total', () => {
    const meals = normalizeDietMeals([
      { tipo: 'almoco', itens: [{ nome: 'Frango', quantidade: '120 g', observacao: null }] },
      { tipo: 'ceia', itens: [{ nome: 'Chá', quantidade: '1 xícara', observacao: 'Sem açúcar' }] },
    ]);
    expect(meals.find((meal) => meal.tipo === 'almoco').itens[0]).toEqual({ nome: 'Frango', quantidade: '120 g', observacao: '' });
    expect(countDietItems(meals)).toBe(2);
  });
});
