import { describe, expect, it } from 'vitest';
import { dietQuantity, enrichDietNutrition, foodUnitWeight, matchFoodForDietItem, nutritionForDietItem } from '../../features/saude/service/alimentosService.js';
import { renderDietFoodDetails, renderDietNutritionTotal } from '../../features/saude/dietNutritionView.js';

const food = { id: 1, item: 'Ovo inteiro', porcao: '2 un (~100 g)', peso_referencia_g: 100,
  kcal_100g: 143, proteina_100g: 12.6, carboidrato_100g: 0.7, gordura_100g: 9.5 };

describe('cálculo nutricional das dietas', () => {
  it('vincula ovo e ovos ao ovo inteiro do Excel e calcula três unidades de 50 g', () => {
    const item = { nome: 'Ovos', quantidade_valor: 3, quantidade_unidade: 'un' };
    for (const nome of ['ovo', 'OVOS', 'Ovos inteiros']) expect(matchFoodForDietItem({ nome }, [food])).toBe(food);
    expect(nutritionForDietItem(item, [food])).toEqual({ kcal: 214.5, proteina: 18.9, carboidrato: 1.05, gordura: 14.25 });
    expect(renderDietFoodDetails(item, [food])).not.toContain('ainda não está vinculado');
  });
  it('resolve batata inglesa do seed somente quando o cozimento está informado', () => {
    const potato = { id: 17, item: 'Batata inglesa cozida', kcal_100g: 87, proteina_100g: 1.9, carboidrato_100g: 20.1, gordura_100g: 0.1 };
    const item = { nome: 'Batata inglesa', quantidade_valor: 150, quantidade_unidade: 'g', observacao: 'Peso após cozimento, conforme PDF.' };
    expect(matchFoodForDietItem(item, [potato])).toBe(potato);
    expect(nutritionForDietItem(item, [potato])).toEqual({ kcal: 130.5, proteina: 2.85, carboidrato: 30.15, gordura: 0.15 });
    expect(matchFoodForDietItem({ ...item, observacao: '' }, [potato])).toBeNull();
  });
  it('preserva ID e nome exato e bloqueia equivalências ambíguas ou não comprovadas', () => {
    const exact = { ...food, id: 2, item: 'Ovos' };
    const white = { ...food, id: 3, item: 'Clara de ovo' };
    expect(matchFoodForDietItem({ nome: 'Ovos', alimento_id: 3 }, [food,exact,white])).toBe(white);
    expect(matchFoodForDietItem({ nome: 'Ovos' }, [food,exact])).toBe(exact);
    expect(matchFoodForDietItem({ nome: 'Ovos' }, [white])).toBeNull();
    expect(matchFoodForDietItem({ nome: 'Ovos' }, [food,{ ...food,id:4 }])).toBeNull();
    expect(matchFoodForDietItem({ nome: 'Ovo de codorna' }, [food])).toBeNull();
    expect(matchFoodForDietItem({ nome: 'Óleo' }, [{id:50,item:'Óleo de coco'}])).toBeNull();
    expect(matchFoodForDietItem({ nome: 'Abóbora' }, [{id:21,item:'Abóbora cabotiá cozida'}])).toBeNull();
  });
  it('aplica os aliases também aos dias de dietas semanais já salvas', () => {
    const weekly = {semanal:true,semana:[{titulo:'Segunda-feira',refeicoes:[{tipo:'cafe_da_manha',itens:[{nome:'Ovos',quantidade:'3 unidades'}]}]}]};
    const enriched = enrichDietNutrition(weekly,[food]);
    expect(enriched.semana[0].refeicoes[0].itens[0].alimento_id).toBe(1);
    expect(enriched.semana[0].nutricao_total).toMatchObject({kcal:214.5,completo:true,itens_pendentes:0});
    expect(weekly.semana[0].refeicoes[0].itens[0].alimento_id).toBeUndefined();
  });
  it('calcula gramas e usa o catálogo em vez de calorias manuais antigas', () => {
    expect(nutritionForDietItem({ alimento_id: 1, quantidade_valor: 50, quantidade_unidade: 'g', calorias: 999 }, [food]))
      .toEqual({ kcal: 71.5, proteina: 6.3, carboidrato: 0.35, gordura: 4.75 });
  });
  it('converte unidades pelo peso de cada unidade', () => {
    expect(foodUnitWeight(food)).toBe(50);
    expect(nutritionForDietItem({ alimento_id: 1, quantidade_valor: 2, quantidade_unidade: 'un' }, [food]).kcal).toBe(143);
    expect(foodUnitWeight({ ...food, porcao: '10 g (2 un)', peso_referencia_g: 10 })).toBe(5);
  });
  it('usa o peso por unidade cadastrado e preserva pendência quando ele é desconhecido', () => {
    const gramsOnly = { ...food, porcao: '100 g' };
    const item = { alimento_id: 1, quantidade_valor: 2, quantidade_unidade: 'un' };
    expect(nutritionForDietItem(item, [gramsOnly]).proteina).toBeNull();
    expect(nutritionForDietItem(item, [{ ...gramsOnly, peso_unidade_g: 25 }]).kcal).toBe(71.5);
  });
  it('mantém compatibilidade com quantidades antigas e não interpreta intervalos ou negativos', () => {
    expect(dietQuantity({ quantidade: '0,5 kg' })).toEqual({ amount: 500, unit: 'g' });
    expect(dietQuantity({ quantidade: '-100 g' })).toBeNull();
    expect(dietQuantity({ quantidade: '100 g ou 200 g' })).toBeNull();
    expect(dietQuantity({ quantidade_valor: 0, quantidade_unidade: 'g', quantidade: '100 g' })).toBeNull();
  });
  it('resolve alimentos antigos por nome e soma todos os macronutrientes', () => {
    const diet = enrichDietNutrition({ refeicoes: [{ tipo: 'almoco', itens: [{ nome: 'OVO INTEIRO', quantidade: '100 g' }, { alimento_id: 1, quantidade: '1 unidade' }] }] }, [food]);
    expect(diet.refeicoes[0].itens[0].alimento_id).toBe(1);
    expect(diet.nutricao_total).toEqual({ kcal: 214.5, proteina: 18.9, carboidrato: 1.05, gordura: 14.25, itens_pendentes: 0, completo: true });
  });
  it('marca totais parciais quando um alimento não está mapeado', () => {
    const diet = enrichDietNutrition({ refeicoes: [{ itens: [{ nome: 'Ovo inteiro', quantidade: '100 g' }, { nome: 'Desconhecido', quantidade: '20 g' }] }] }, [food]);
    expect(diet.nutricao_total).toMatchObject({ kcal: 143, completo: false, itens_pendentes: 1 });
  });
  it('renderiza a seta e os valores com os nomes escapados', () => {
    const escapedFood = { ...food, item: '<img src=x onerror=alert(1)>', fonte_nutricional: '<script>origem</script>' };
    const html = renderDietFoodDetails({ nome: escapedFood.item, alimento_id: 1, quantidade: '100 g' }, [escapedFood]);
    expect(html).toContain('<details');
    expect(html).toContain('fa-chevron-right');
    expect(html).toContain('143 kcal');
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script>');
  });
  it('mostra a soma parcial sem apresentá-la como uma meta atingida', () => {
    const html = renderDietNutritionTotal({ meta_calorias: 2000, refeicoes: [{ itens: [{ nome: 'Desconhecido', quantidade: '20 g' }] }] }, [food]);
    expect(html).toContain('Total parcial');
    expect(html).toContain('precisam de vínculo');
    expect(html).not.toContain('Diferença do plano');
  });
});
