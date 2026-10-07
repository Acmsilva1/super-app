import { enrichDietNutrition, matchFoodForDietItem, nutritionForDietItem } from './service/alimentosService.js';

function escape(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
const number = (value) => value == null ? '—' : Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const line = (nutrition) => `${number(nutrition.kcal)} kcal · Proteína ${number(nutrition.proteina)} g · Carboidratos ${number(nutrition.carboidrato)} g · Gordura ${number(nutrition.gordura)} g`;
const highlightedLine = (nutrition) => `<strong>${escape(number(nutrition.kcal))} kcal</strong> · Proteína <strong>${escape(number(nutrition.proteina))} g</strong> · Carboidratos <strong>${escape(number(nutrition.carboidrato))} g</strong> · Gordura <strong>${escape(number(nutrition.gordura))} g</strong>`;

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
  .diet-food-details .diet-food-details__body { background: var(--bk-surface, #0f172a); color: var(--bk-ink, #e5eef5); border-color: var(--bk-line, #475569); }
  .diet-food-details .diet-food-details__body p { color: inherit; font-size: .9rem; }
  .diet-food-details .diet-food-details__body strong { color: inherit; font-weight: 750; }
  .diet-food-details__body small { color: #a7b6c9; }
`;

export function renderDietFoodDetails(item, foods = null) {
  const food = foods ? matchFoodForDietItem(item, foods) : item.alimento;
  const nutrition = nutritionForDietItem(item, food ? [food] : []);
  return `<details class="diet-food-details"><summary><span><strong>${escape(item.nome)}</strong> — ${escape(item.quantidade)}</span><i class="fas fa-chevron-right" aria-hidden="true"></i></summary><div class="diet-food-details__body">
    ${food ? (nutrition.proteina != null ? `<p>${highlightedLine(nutrition)}</p>` : '<p>Ajuste a quantidade do item. Para usar unidades, cadastre o peso por unidade em Alimentos.</p>') : `<p>Este alimento ainda não está vinculado ao catálogo. Edite o item e selecione um alimento ou use “Outros”.</p>${nutrition.kcal != null ? `<p>Calorias manuais: ${escape(number(nutrition.kcal))} kcal</p>` : ''}`}
    ${item.observacao ? `<p>${escape(item.observacao)}</p>` : ''}
    </div></details>`;
}

export function renderDietNutritionTotal(diet, foods = null) {
  const total = foods ? enrichDietNutrition(diet, foods).nutricao_total : diet.nutricao_total;
  if (!total) return '';
  return `<div class="diet-nutrition-total"><strong>${total.completo ? 'Total planejado da dieta' : 'Total parcial da dieta'}</strong><p>${escape(line(total))}</p>${total.itens_pendentes ? `<p>${escape(total.itens_pendentes)} item(ns) precisam de vínculo ou quantidade calculável.</p>` : ''}${diet.meta_calorias ? `<p>Meta diária: ${escape(diet.meta_calorias)} kcal${total.completo ? ` · Diferença do plano: ${escape(number(total.kcal - Number(diet.meta_calorias)))} kcal` : ''}</p>` : ''}</div>`;
}
