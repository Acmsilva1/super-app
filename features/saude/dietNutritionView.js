import { enrichDietNutrition, foodUnitWeight, matchFoodForDietItem, nutritionForDietItem } from './service/alimentosService.js';

function escape(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
const number = (value) => value == null ? '—' : Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const line = (nutrition) => `${number(nutrition.kcal)} kcal · Proteína ${number(nutrition.proteina)} g · Carboidratos ${number(nutrition.carboidrato)} g · Gordura ${number(nutrition.gordura)} g`;

export const DIET_NUTRITION_STYLES = `
  .diet-food-details { min-width: 0; width: 100%; }
  .diet-food-details summary { display: flex; align-items: center; justify-content: space-between; gap: .65rem; cursor: pointer; list-style: none; }
  .diet-food-details summary::-webkit-details-marker { display: none; }
  .diet-food-details summary > span { min-width: 0; overflow-wrap: anywhere; }
  .diet-food-details summary:focus-visible { outline: 2px solid #95c11f; outline-offset: 3px; border-radius: .3rem; }
  .diet-food-details summary > i { flex-shrink: 0; transition: transform .15s; }
  .diet-food-details[open] summary > i { transform: rotate(90deg); }
  .diet-food-details__body, .diet-nutrition-total { padding: .7rem; margin: .6rem 0; border: 1px solid rgba(148,163,184,.25); border-radius: .65rem; background: rgba(3,7,18,.3); font-size: .78rem; line-height: 1.6; overflow-wrap: anywhere; }
  .diet-food-details__body p, .diet-nutrition-total p { margin: .25rem 0; }
  .diet-food-details__body small { color: #a7b6c9; }
`;

export function renderDietFoodDetails(item, foods = null) {
  const food = foods ? matchFoodForDietItem(item, foods) : item.alimento;
  const nutrition = nutritionForDietItem(item, food ? [food] : []);
  const unitWeight = food ? foodUnitWeight(food) : null;
  const per100 = food ? { kcal: food.kcal_100g, proteina: food.proteina_100g, carboidrato: food.carboidrato_100g, gordura: food.gordura_100g } : null;
  return `<details class="diet-food-details"><summary><span><strong>${escape(item.nome)}</strong> — ${escape(item.quantidade)}</span><i class="fas fa-chevron-right" aria-hidden="true"></i></summary><div class="diet-food-details__body">
    ${food ? `<p><strong>Na quantidade da dieta:</strong><br>${escape(line(nutrition))}</p><p><strong>Por 100 g/ml:</strong><br>${escape(line(per100))}</p><p>Porção de referência: ${escape(food.porcao ?? food.porcao_equivalente)}${food.peso_referencia_g ? ` (${escape(food.peso_referencia_g)} g/ml)` : ''}</p>${nutrition.proteina == null ? '<p>Informe a quantidade em g, ml ou porções para calcular este item.</p>' : ''}<small>Fonte: ${escape(food.fonte_nutricional || 'Cadastro manual')}</small>${food.observacoes ? `<p>${escape(food.observacoes)}</p>` : ''}` : `<p>Este alimento ainda não está vinculado ao catálogo. Edite o item e selecione um alimento ou use “Outros”.</p>${nutrition.kcal != null ? `<p>Calorias manuais: ${escape(number(nutrition.kcal))} kcal</p>` : ''}`}
    ${unitWeight ? `<p>Peso por unidade: ${escape(number(unitWeight))} g/ml.</p>` : ''}${item.observacao ? `<p>${escape(item.observacao)}</p>` : ''}
    </div></details>`;
}

export function renderDietNutritionTotal(diet, foods = null) {
  const total = foods ? enrichDietNutrition(diet, foods).nutricao_total : diet.nutricao_total;
  if (!total) return '';
  return `<div class="diet-nutrition-total"><strong>${total.completo ? 'Total planejado da dieta' : 'Total parcial da dieta'}</strong><p>${escape(line(total))}</p>${total.itens_pendentes ? `<p>${escape(total.itens_pendentes)} item(ns) precisam de vínculo ou quantidade calculável.</p>` : ''}${diet.meta_calorias ? `<p>Meta diária: ${escape(diet.meta_calorias)} kcal${total.completo ? ` · Diferença do plano: ${escape(number(total.kcal - Number(diet.meta_calorias)))} kcal` : ''}</p>` : ''}</div>`;
}
