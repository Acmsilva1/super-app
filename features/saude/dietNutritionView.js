import { dietItemNutritionIssue, enrichDietNutrition, matchFoodForDietItem, nutritionForDietItem } from './service/alimentosService.js';

function escape(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
const number = (value) => value == null ? '—' : Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const line = (nutrition) => `${number(nutrition.kcal)} kcal · Proteína ${number(nutrition.proteina)} g · Carboidratos ${number(nutrition.carboidrato)} g · Gordura ${number(nutrition.gordura)} g`;
const highlightedLine = (nutrition) => `<strong>${escape(number(nutrition.kcal))} kcal</strong> · Proteína <strong>${escape(number(nutrition.proteina))} g</strong> · Carboidratos <strong>${escape(number(nutrition.carboidrato))} g</strong> · Gordura <strong>${escape(number(nutrition.gordura))} g</strong>`;

export function cleanDietDisplayNote(value) {
  return String(value ?? '')
    .replace(/Versão sem óleo:[^\n]*(?:\n\s*)?/gi, '')
    .replace(/As calorias são estimativas baseadas em ovos grandes[\s\S]*?Os totais calculados podem ficar abaixo de 1\.600 kcal, apesar da meta indicada\./gi,
      'Plano sem óleo, com 13 ovos por dia. Não é um plano nutricionalmente completo; requer avaliação de nutricionista. Os nutrientes são calculados pelo catálogo e podem variar conforme o preparo.')
    .replace(/Estimativas (?:transcritas do PDF|iniciais) \(não são valores por alimento\):\s*/gi, '')
    .replace(/^(?:Segunda-feira|Terça-feira|Quarta-feira|Quinta-feira|Sexta-feira|Sábado|Domingo): Café da manhã:[^\n]*(?:\n|$)/gm, '')
    .replace(/peso\s+ap[oó]s\s+cozimento\s*,?\s*conforme\s+pdf\s*\.?/gi, '')
    .replace(/\s*,?\s*conforme\s+(?:o\s+)?pdf\b/gi, '')
    .replace(/\b(?:do|no|ao|o)\s+pdf\b/gi, '')
    .replace(/\bpdf\b/gi, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ +([.,;:])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const NUTRITION_ISSUE_MESSAGES = {
  alimento_sem_vinculo: 'Este alimento ainda não está vinculado ao catálogo ou possui mais de uma correspondência. Edite o item e selecione um alimento ou use “Outros”.',
  quantidade_indefinida: 'Defina uma quantidade única em g, ml, unidades ou porções. Intervalos, alternativas e “à vontade” precisam de uma porção escolhida para o cálculo.',
  peso_nao_cadastrado: 'Cadastre o peso por unidade ou porção em Alimentos para calcular este item.',
  nutrientes_incompletos: 'Complete as calorias, proteínas, carboidratos e gorduras por 100 g/ml em Alimentos.',
};

export const DIET_NUTRITION_STYLES = `
  .diet-food-card { min-width: 0; width: 100%; display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: .8rem .9rem; border: 1px solid rgba(148,163,184,.18); border-radius: .85rem; background: rgba(15,23,42,.45); color: inherit; font: inherit; text-align: left; cursor: pointer; box-shadow: 0 8px 18px rgba(0,0,0,.16); transition: transform .15s ease, border-color .15s ease, background .15s ease; }
  .diet-food-card + .diet-food-card { margin-top: .45rem; }
  .diet-food-card:hover { transform: translateY(-1px); border-color: rgba(149,193,31,.42); background: rgba(22,34,56,.92); }
  .diet-food-card:focus-visible { outline: 2px solid #95c11f; outline-offset: 2px; }
  .diet-food-card__copy { display: grid; gap: .18rem; min-width: 0; }
  .diet-food-card__copy strong { font-size: .92rem; line-height: 1.3; overflow-wrap: anywhere; }
  .diet-food-card__copy span { color: #9fb0c3; font-size: .8rem; overflow-wrap: anywhere; }
  .diet-food-card > i { flex-shrink: 0; width: 1.7rem; height: 1.7rem; display: grid; place-items: center; border-radius: .5rem; background: rgba(149,193,31,.16); color: #95c11f; font-size: .75rem; }
  .diet-food-details { min-width: 0; width: 100%; border: 1px solid rgba(148,163,184,.18); border-radius: .75rem; background: rgba(15,23,42,.35); overflow: hidden; }
  .diet-food-details + .diet-food-details { margin-top: .45rem; }
  .diet-food-details summary { display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: .75rem .85rem; cursor: pointer; list-style: none; }
  .diet-food-details summary::-webkit-details-marker, .diet-food-details summary::marker { display: none; content: ''; }
  .diet-food-details summary > span { min-width: 0; overflow-wrap: anywhere; font-size: .9rem; line-height: 1.35; }
  .diet-food-details summary:focus-visible { outline: 2px solid #95c11f; outline-offset: -2px; }
  .diet-food-details summary > i { flex-shrink: 0; width: 1.6rem; height: 1.6rem; display: grid; place-items: center; border-radius: .45rem; background: rgba(148,163,184,.14); color: #95c11f; font-size: .72rem; transition: transform .15s ease, background .15s ease; }
  .diet-food-details[open] summary > i { transform: rotate(90deg); background: rgba(149,193,31,.18); }
  .diet-food-details__body, .diet-nutrition-total, .diet-food-preview-body { padding: .85rem; margin: 0; border: 0; border-top: 1px solid rgba(148,163,184,.16); border-radius: 0; background: rgba(3,7,18,.28); font-size: .8rem; line-height: 1.55; overflow-wrap: anywhere; }
  .diet-food-preview-body { border-top: 0; border-radius: .85rem; background: rgba(3,7,18,.22); }
  .diet-nutrition-total { margin: .85rem 0 0; border: 1px solid rgba(148,163,184,.2); border-radius: .85rem; background: linear-gradient(145deg, rgba(50,119,70,.16), rgba(15,23,42,.55)); }
  .diet-food-details__body p, .diet-nutrition-total p, .diet-food-preview-body p { margin: .3rem 0 0; }
  .diet-nutrition-total > strong { display: block; font-size: .86rem; }
  .diet-food-details .diet-food-details__body { background: rgba(3,7,18,.22); color: inherit; }
  .diet-food-details .diet-food-details__body p, .diet-food-preview-body p { color: inherit; font-size: .84rem; }
  .diet-food-details .diet-food-details__body strong, .diet-food-preview-body strong { color: inherit; font-weight: 750; }
  .diet-food-details__body small, .diet-food-preview-body small { color: #a7b6c9; }
`;

function dietFoodPreviewContent(item, foods = null) {
  const food = foods ? matchFoodForDietItem(item, foods) : item.alimento;
  const nutrition = nutritionForDietItem(item, food ? [food] : []);
  const issue = dietItemNutritionIssue(item, food ? [food] : []);
  const note = cleanDietDisplayNote(item.observacao);
  return `${issue ? `<p>${escape(NUTRITION_ISSUE_MESSAGES[issue])}</p>${nutrition.kcal != null ? `<p>Calorias manuais: ${escape(number(nutrition.kcal))} kcal</p>` : ''}` : `<p>${highlightedLine(nutrition)}</p>`}${note ? `<p>${escape(note)}</p>` : ''}`;
}

export function renderDietFoodPreviewBody(item, foods = null) {
  return `<div class="diet-food-preview-body">${dietFoodPreviewContent(item, foods)}</div>`;
}

export function renderDietFoodCard(item, { mealType = '', itemIndex = null, foods = null } = {}) {
  const food = foods ? matchFoodForDietItem(item, foods) : item.alimento;
  const nutrition = nutritionForDietItem(item, food ? [food] : []);
  const issue = dietItemNutritionIssue(item, food ? [food] : []);
  const summary = issue
    ? (NUTRITION_ISSUE_MESSAGES[issue] || 'Toque para ver detalhes')
    : `${number(nutrition.kcal)} kcal · P ${number(nutrition.proteina)} g · C ${number(nutrition.carboidrato)} g · G ${number(nutrition.gordura)} g`;
  const mealAttr = mealType ? ` data-meal-type="${escape(mealType)}"` : '';
  const indexAttr = itemIndex == null ? '' : ` data-item-index="${escape(itemIndex)}"`;
  return `<button type="button" class="diet-food-card" data-saude-action="preview-diet-food"${mealAttr}${indexAttr} aria-label="Ver detalhes de ${escape(item.nome)}"><span class="diet-food-card__copy"><strong>${escape(item.nome)}</strong><span>${escape(item.quantidade)} · ${escape(summary)}</span></span><i class="fas fa-chevron-right" aria-hidden="true"></i></button>`;
}

export function renderDietFoodDetails(item, foods = null) {
  return `<details class="diet-food-details"><summary><span><strong>${escape(item.nome)}</strong> — ${escape(item.quantidade)}</span><i class="fas fa-chevron-right" aria-hidden="true"></i></summary><div class="diet-food-details__body">
    ${dietFoodPreviewContent(item, foods)}
    </div></details>`;
}

export function renderDietNutritionTotal(diet, foods = null) {
  const total = foods ? enrichDietNutrition(diet, foods).nutricao_total : diet.nutricao_total;
  if (!total) return '';
  return `<div class="diet-nutrition-total"><strong>${total.completo ? 'Total planejado da dieta' : 'Total parcial da dieta'}</strong><p>${escape(line(total))}</p>${total.itens_pendentes ? `<p>${escape(total.itens_pendentes)} item(ns) precisam de vínculo ou quantidade calculável.</p>` : ''}${diet.meta_calorias ? `<p>Meta diária: ${escape(diet.meta_calorias)} kcal${total.completo ? ` · Diferença do plano: ${escape(number(total.kcal - Number(diet.meta_calorias)))} kcal` : ''}</p>` : ''}</div>`;
}
