export function normalizeFoodName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseQuantity(value) {
  const normalized = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const match = normalized.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|gramas?|ml|mililitros?|unidades?|un|und|porcoes?|porcao)$/i);
  if (!match) return null;
  const amount = Number(match[1].replace(',', '.'));
  const unit = match[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (unit === 'kg') return { amount: amount * 1000, unit: 'g' };
  if (unit === 'g' || unit.startsWith('gram')) return { amount, unit: 'g' };
  if (unit === 'ml' || unit.startsWith('mililitro')) return { amount, unit: 'ml' };
  if (unit === 'un' || unit === 'und' || unit.startsWith('unidade')) return { amount, unit: 'un' };
  return { amount, unit: 'porcao' };
}

export function dietQuantity(item) {
  if (item?.quantidade_valor != null || item?.quantidade_unidade != null) {
    const amount = Number(String(item.quantidade_valor).replace(',', '.'));
    const unit = String(item.quantidade_unidade);
    return Number.isFinite(amount) && amount > 0 && ['g', 'ml', 'un', 'porcao'].includes(unit) ? { amount, unit } : null;
  }
  return parseQuantity(item?.quantidade);
}

export function foodUnitWeight(food) {
  const explicit = Number(food?.peso_unidade_g);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const serving = String(food?.porcao_equivalente ?? food?.porcao ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const units = serving.match(/(\d+(?:[.,]\d+)?)\s*(?:unidades?|un|und)\b/i);
  const count = units ? Number(units[1].replace(',', '.')) : null;
  const referenceWeight = portionWeight(food);
  return count > 0 && referenceWeight ? referenceWeight / count : null;
}

function portionWeight(food) {
  const value = Number(food?.peso_referencia_g ?? food?.peso_g ?? food?.peso_usado_g);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function quantityWeight(item, food) {
  const referenceWeight = portionWeight(food);
  const requested = dietQuantity(item);
  if (!requested) return null;
  if (requested.unit === 'g' || requested.unit === 'ml') return requested.amount;
  if (requested.unit === 'porcao') return referenceWeight ? requested.amount * referenceWeight : null;
  const unitWeight = foodUnitWeight(food);
  return unitWeight ? requested.amount * unitWeight : null;
}

export function matchFoodForDietItem(item, foods = []) {
  const id = Number(item?.alimento_id ?? item?.food_id);
  if (Number.isSafeInteger(id) && id > 0) {
    const byId = foods.find((food) => Number(food.id) === id);
    if (byId) return byId;
  }
  const name = normalizeFoodName(item?.nome ?? item?.alimento);
  return name ? foods.find((food) => normalizeFoodName(food.item ?? food.alimento) === name) || null : null;
}

export function nutritionForDietItem(item, foods = []) {
  const food = matchFoodForDietItem(item, foods);
  const weight = food ? quantityWeight(item, food) : null;
  const manualCalories = item?.calorias === null || item?.calorias === undefined || item?.calorias === ''
    ? null
    : Number(item.calorias);
  if (food && weight !== null) {
    const per100 = {
      kcal: Number(food.kcal_100g ?? food.kcal_100),
      proteina: Number(food.proteina_100g ?? food.proteina_100),
      carboidrato: Number(food.carboidrato_100g ?? food.carboidrato_100),
      gordura: Number(food.gordura_100g ?? food.gordura_100),
    };
    if (Object.values(per100).every(Number.isFinite)) {
      const nutrition = Object.fromEntries(Object.entries(per100).map(([key, value]) => [key, Math.round((value * weight / 100) * 100) / 100]));
      return nutrition;
    }
  }

  return {
    kcal: Number.isFinite(manualCalories) && manualCalories >= 0 ? manualCalories : null,
    proteina: null,
    carboidrato: null,
    gordura: null,
  };
}

export function enrichDietNutrition(diet, foods = []) {
  const refeicoes = (diet.refeicoes || []).map((meal) => ({ ...meal, itens: (meal.itens || []).map((item) => {
    const food = matchFoodForDietItem(item, foods);
    return { ...item, alimento_id: food?.id ?? item.alimento_id ?? null,
      alimento: food || null, nutricao: nutritionForDietItem(item, foods) };
  }) }));
  const items = refeicoes.flatMap((meal) => meal.itens);
  const totals = { kcal: 0, proteina: 0, carboidrato: 0, gordura: 0, itens_pendentes: 0, completo: items.length > 0 };
  for (const item of items) {
    if (Object.values(item.nutricao).some((value) => value === null)) totals.itens_pendentes++;
    for (const key of ['kcal', 'proteina', 'carboidrato', 'gordura']) totals[key] += item.nutricao[key] ?? 0;
  }
  for (const key of ['kcal', 'proteina', 'carboidrato', 'gordura']) totals[key] = Math.round(totals[key] * 100) / 100;
  totals.completo = totals.completo && totals.itens_pendentes === 0;
  return { ...diet, refeicoes, nutricao_total: totals };
}
