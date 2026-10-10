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
        calorias: item?.calorias === '' || item?.calorias == null ? null : Number(item.calorias),
        alimento_id: Number.isSafeInteger(Number(item?.alimento_id)) && Number(item.alimento_id) > 0 ? Number(item.alimento_id) : null,
        ...(item?.quantidade_valor != null ? { quantidade_valor: Number(item.quantidade_valor), quantidade_unidade: String(item.quantidade_unidade || '') } : {}),
        ...(item?.alimento ? { alimento: item.alimento } : {}),
        ...(item?.nutricao ? { nutricao: item.nutricao } : {}),
      }))
      : [];
    return { ...meal, itens };
  });
}

export function countDietItems(value) {
  return normalizeDietMeals(value).reduce((total, meal) => total + meal.itens.length, 0);
}

export const DIET_WEEK = Object.freeze(['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo']);

export function dietDayIndex(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error('Data local inválida.');
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

export function dietForDate(diet, date) {
  if (!diet?.semanal) return diet;
  const index = dietDayIndex(date);
  return { ...diet, semanal: false, refeicoes: normalizeDietMeals(diet.semana?.[index]?.refeicoes), dia_semana: DIET_WEEK[index], nutricao_total: diet.semana?.[index]?.nutricao_total };
}

export function todayDietDate(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
