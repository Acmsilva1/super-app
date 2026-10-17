export function normalizeFoodName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Equivalências explícitas do catálogo: não usar busca por trecho ou similaridade,
// que poderia associar ovos a claras, ou trocar espécies/preparos de um alimento.
const FOOD_NAME_ALIASES = Object.freeze({
  ovo: 'ovo inteiro',
  ovos: 'ovo inteiro',
  'ovos inteiros': 'ovo inteiro',
  morangos: 'morango',
  'batatas inglesas cozidas': 'batata inglesa cozida',
});

// Flexões conhecidas, sem remover sufixos indiscriminadamente (ex.: brócolis).
// A comparação mantém todos os qualificadores: cru/cozido, integral, sem/com etc.
const FOOD_WORD_FORMS = new Map([
  ['ovo', 'ovos'], ['inteiro', 'inteiros', 'inteira', 'inteiras'],
  ['clara', 'claras'], ['morango', 'morangos'], ['batata', 'batatas'],
  ['inglesa', 'inglesas'], ['doce', 'doces'], ['peito', 'peitos'],
  ['frango', 'frangos'], ['cozido', 'cozidos', 'cozida', 'cozidas'],
  ['grelhado', 'grelhados', 'grelhada', 'grelhadas'],
  ['cru', 'crus', 'crua', 'cruas'], ['assado', 'assados', 'assada', 'assadas'],
  ['frito', 'fritos', 'frita', 'fritas'], ['magro', 'magros', 'magra', 'magras'],
  ['banana', 'bananas'], ['maca', 'macas'], ['pera', 'peras'],
  ['laranja', 'laranjas'], ['tomate', 'tomates'], ['cenoura', 'cenouras'],
  ['abobora', 'aboboras'], ['abobrinha', 'abobrinhas'], ['chuchu', 'chuchus'],
  ['castanha', 'castanhas'], ['amendoa', 'amendoas'], ['noz', 'nozes'],
  ['semente', 'sementes'], ['folha', 'folhas'], ['cogumelo', 'cogumelos'],
].flatMap(([canonical, ...forms]) => [canonical, ...forms].map(form => [form, canonical])));

function foodNameKey(value) {
  const name = normalizeFoodName(value);
  // Preserva o alcance de com/sem e alternativas: "sem pele com osso"
  // não equivale a "com pele sem osso", apesar de conter as mesmas palavras.
  return (FOOD_NAME_ALIASES[name] || name).split(/\b(com|sem|ou|e|em)\b/)
    .map(part => part.trim().split(/\s+/)
      .filter(word => !['de', 'do', 'da', 'dos', 'das'].includes(word))
      .map(word => FOOD_WORD_FORMS.get(word) || word)
      .sort().join(' '))
    .join('|');
}

// Referências de composição escolhidas para os cardápios importados. A escolha
// é registrada em observacao; não altera a quantidade nem elimina alternativas.
const FOOD_REFERENCE_CHOICES = Object.freeze({
  mamao: 'Mamão papaia',
  'mamao ou morangos': 'Mamão papaia',
  'frango grelhado': 'Peito de frango grelhado',
  'carne bovina magra ou frango': 'Peito de frango grelhado',
  'frango ou omelete': 'Peito de frango grelhado',
  aveia: 'Aveia em flocos crua',
  feijao: 'Feijão cozido',
  cafe: 'Café sem açúcar',
  'batata inglesa': 'Batata inglesa cozida',
  'batatas inglesas': 'Batata inglesa cozida',
});

function foodReferenceForName(name) {
  const key = foodNameKey(name);
  return Object.entries(FOOD_REFERENCE_CHOICES).find(([alias]) => foodNameKey(alias) === key)?.[1];
}

export function dietFoodReferenceNote(item, food) {
  const originalName = typeof item?.nome === 'string' ? item.nome : '';
  const reference = foodReferenceForName(originalName);
  if (!reference || foodNameKey(food?.item ?? food?.alimento) !== foodNameKey(reference)) return '';
  return `Referência nutricional adotada para "${originalName}": ${reference}. Quantidades e alternativas originais preservadas; ajuste no app se escolher outra opção.`;
}

function catalogNameForDietItem(item, name) {
  if (FOOD_NAME_ALIASES[name]) return FOOD_NAME_ALIASES[name];
  if (foodNameKey(name) === foodNameKey('batata inglesa')) {
    const preparation = normalizeFoodName(item?.observacao);
    if (/\b(?:frit[ao]s?|pure)\b/.test(preparation)
      || (/\bassad[ao]s?\b/.test(preparation) && !/\b(?:apos cozimento|cozid[ao]s?)\b/.test(preparation))) return name;
  }
  const reference = foodReferenceForName(name);
  return reference ? normalizeFoodName(reference) : name;
}

function parseQuantity(value) {
  const normalized = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const match = normalized.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|gr|gramas?|ml|mililitros?|l|litros?|unidades?|un|und|porcoes?|porcao)\.?$/i);
  if (!match) return null;
  const amount = Number(match[1].replace(',', '.'));
  const unit = match[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (unit === 'kg') return { amount: amount * 1000, unit: 'g' };
  if (unit === 'g' || unit === 'gr' || unit.startsWith('gram')) return { amount, unit: 'g' };
  if (unit === 'l' || unit.startsWith('litro')) return { amount: amount * 1000, unit: 'ml' };
  if (unit === 'ml' || unit.startsWith('mililitro')) return { amount, unit: 'ml' };
  if (unit === 'un' || unit === 'und' || unit.startsWith('unidade')) return { amount, unit: 'un' };
  return { amount, unit: 'porcao' };
}

export function dietQuantity(item) {
  if (item?.quantidade_valor != null || item?.quantidade_unidade != null) {
    const amount = Number(String(item.quantidade_valor).replace(',', '.'));
    return Number.isFinite(amount) && amount > 0
      ? parseQuantity(`${amount} ${String(item.quantidade_unidade)}`) : null;
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
  if (!name) return null;
  const exact = foods.filter((food) => normalizeFoodName(food.item ?? food.alimento) === name);
  if (exact.length) return exact.length === 1 ? exact[0] : null;
  const key = foodNameKey(name);
  const equivalent = foods.filter((food) => foodNameKey(food.item ?? food.alimento) === key);
  if (equivalent.length) return equivalent.length === 1 ? equivalent[0] : null;
  const canonical = catalogNameForDietItem(item, name);
  if (canonical === name) return null;
  const matches = foods.filter((food) => foodNameKey(food.item ?? food.alimento) === foodNameKey(canonical));
  // Não escolher arbitrariamente entre dois registros equivalentes do catálogo.
  return matches.length === 1 ? matches[0] : null;
}

function foodNutrients(food) {
  return Object.fromEntries([
    ['kcal', food?.kcal_100g ?? food?.kcal_100],
    ['proteina', food?.proteina_100g ?? food?.proteina_100],
    ['carboidrato', food?.carboidrato_100g ?? food?.carboidrato_100],
    ['gordura', food?.gordura_100g ?? food?.gordura_100],
  ].map(([key, value]) => [key, value == null || String(value).trim() === '' ? NaN : Number(value)]));
}

const validNutrients = nutrients => Object.values(nutrients).every(value => Number.isFinite(value) && value >= 0);

export function dietItemNutritionIssue(item, foods = []) {
  const food = matchFoodForDietItem(item, foods);
  if (!food) return 'alimento_sem_vinculo';
  if (!dietQuantity(item)) return 'quantidade_indefinida';
  if (quantityWeight(item, food) === null) return 'peso_nao_cadastrado';
  return validNutrients(foodNutrients(food)) ? null : 'nutrientes_incompletos';
}

export function nutritionForDietItem(item, foods = []) {
  const food = matchFoodForDietItem(item, foods);
  const weight = food ? quantityWeight(item, food) : null;
  const manualCalories = item?.calorias === null || item?.calorias === undefined || item?.calorias === ''
    ? null
    : Number(item.calorias);
  if (food && weight !== null) {
    const per100 = foodNutrients(food);
    if (validNutrients(per100)) {
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
  if (diet.semanal) return { ...diet, semana: (diet.semana || []).map(day => enrichDietNutrition({ ...day, semanal: false }, foods)), refeicoes: [] };
  const refeicoes = (diet.refeicoes || []).map((meal) => ({ ...meal, itens: (meal.itens || []).map((item) => {
    const food = matchFoodForDietItem(item, foods);
    const referenceNote = dietFoodReferenceNote(item, food);
    const observation = String(item.observacao || '');
    return { ...item, nome: food?.item ?? (typeof food?.alimento === 'string' ? food.alimento : null) ?? item.nome,
      ...(referenceNote && !observation.includes(referenceNote) ? { observacao: [observation, referenceNote].filter(Boolean).join('\n') } : {}),
      alimento_id: food?.id ?? item.alimento_id ?? null,
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
