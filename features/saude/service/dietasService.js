export const DIET_MEALS = Object.freeze([
  Object.freeze({ tipo: 'cafe_da_manha', titulo: 'Café da manhã' }),
  Object.freeze({ tipo: 'lanche_da_manha', titulo: 'Lanche da manhã' }),
  Object.freeze({ tipo: 'almoco', titulo: 'Almoço' }),
  Object.freeze({ tipo: 'lanche_da_tarde', titulo: 'Lanche da tarde' }),
  Object.freeze({ tipo: 'jantar', titulo: 'Jantar' }),
  Object.freeze({ tipo: 'ceia', titulo: 'Ceia' }),
]);

export function createEmptyDietMeals() {
  return DIET_MEALS.map((meal) => ({ ...meal, itens: [] }));
}

export function normalizeDietMeals(value) {
  const source = Array.isArray(value) ? value : [];
  return DIET_MEALS.map((meal) => {
    const current = source.find((entry) => entry?.tipo === meal.tipo);
    const itens = Array.isArray(current?.itens)
      ? current.itens.map((item) => ({
        nome: String(item?.nome || ''),
        quantidade: String(item?.quantidade || ''),
        observacao: String(item?.observacao || ''),
      }))
      : [];
    return { ...meal, itens };
  });
}

export function countDietItems(value) {
  return normalizeDietMeals(value).reduce((total, meal) => total + meal.itens.length, 0);
}
