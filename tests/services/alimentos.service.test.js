import { describe, expect, it } from 'vitest';
import { dietItemNutritionIssue, dietQuantity, enrichDietNutrition, foodUnitWeight, matchFoodForDietItem, nutritionForDietItem } from '../../features/saude/service/alimentosService.js';
import { renderDietFoodDetails, renderDietNutritionTotal } from '../../features/saude/dietNutritionView.js';

const food = { id: 1, item: 'Ovo inteiro', porcao: '2 un (~100 g)', peso_referencia_g: 100,
  kcal_100g: 143, proteina_100g: 12.6, carboidrato_100g: 0.7, gordura_100g: 9.5 };

describe('cálculo nutricional das dietas', () => {
  it('reconhece flexões, ordem, preposições e pontuação também no catálogo', () => {
    const chicken = { ...food, id: 2, item: 'Peito de frango grelhado' };
    for (const nome of ['PEITOS DE FRANGO GRELHADOS', 'Frango, peito grelhado', 'Peito-de-frango grelhado']) {
      expect(matchFoodForDietItem({ nome }, [chicken])).toBe(chicken);
    }
    const strawberries = { ...food, item: 'Morangos' };
    expect(matchFoodForDietItem({ nome: 'Morango' }, [strawberries])).toBe(strawberries);
    expect(matchFoodForDietItem({ nome: 'Frangos grelhados' }, [chicken])).toBe(chicken);
    expect(matchFoodForDietItem({ nome: 'Brócolis' }, [{ ...food, item: 'Brócolis' }])?.item).toBe('Brócolis');
  });
  it('mantém preparo, espécie, composição e ambiguidades na associação automática', () => {
    const chicken = { ...food, item: 'Peito de frango grelhado' };
    for (const nome of ['Peito de frango cru', 'Peito de peru grelhado', 'Peito de frango sem pele grelhado']) {
      expect(matchFoodForDietItem({ nome }, [chicken])).toBeNull();
    }
    expect(matchFoodForDietItem({ nome: 'Chá verde com açúcar' }, [{ ...food, item: 'Chá verde sem açúcar' }])).toBeNull();
    expect(matchFoodForDietItem({ nome: 'Frango sem pele com osso' }, [{ ...food, item: 'Frango com pele sem osso' }])).toBeNull();
    expect(matchFoodForDietItem({ nome: 'Arroz branco' }, [{ ...food, item: 'Arroz integral cozido' }])).toBeNull();
    expect(matchFoodForDietItem({ nome: 'Salada de tomate' }, [{ ...food, item: 'Tomate' }])).toBeNull();
    expect(matchFoodForDietItem({ nome: 'Whey protein' }, [food])).toBeNull();
    expect(matchFoodForDietItem({ nome: 'OVO INTEIRO' }, [food, { ...food, id: 2 }])).toBeNull();
    const duplicates = [chicken, { ...chicken, id: 2, item: 'Peitos de frango grelhados' }];
    expect(matchFoodForDietItem({ nome: 'Frango peito grelhado' }, duplicates)).toBeNull();
    expect(matchFoodForDietItem({ alimento_id: 2, nome: 'Frango peito grelhado' }, duplicates)).toBe(duplicates[1]);
  });
  it('normaliza unidades textuais e estruturadas sem escolher intervalos', () => {
    expect(dietQuantity({ quantidade_valor: '0,5', quantidade_unidade: 'KG' })).toEqual({ amount: 500, unit: 'g' });
    expect(dietQuantity({ quantidade: '0,2 L' })).toEqual({ amount: 200, unit: 'ml' });
    expect(dietQuantity({ quantidade: '100 gr.' })).toEqual({ amount: 100, unit: 'g' });
    expect(dietQuantity({ quantidade_valor: 2, quantidade_unidade: ' UNIDADES ' })).toEqual({ amount: 2, unit: 'un' });
    expect(dietQuantity({ quantidade_valor: 1, quantidade_unidade: 'Porção' })).toEqual({ amount: 1, unit: 'porcao' });
    for (const quantidade of ['25-30 g', '130–150 g', 'À vontade', 'Conforme a fase', '150 g ou 200 g']) {
      expect(dietQuantity({ quantidade })).toBeNull();
    }
    expect(dietQuantity({ quantidade_valor: 3, quantidade_unidade: 'colheres' })).toBeNull();
  });
  it('distingue a causa da pendência e não transforma nutrientes ausentes em zero', () => {
    const item = { nome: 'Ovo inteiro', quantidade: '100 g' };
    expect(dietItemNutritionIssue(item, [])).toBe('alimento_sem_vinculo');
    expect(dietItemNutritionIssue({ ...item, quantidade: 'À vontade' }, [food])).toBe('quantidade_indefinida');
    expect(dietItemNutritionIssue({ ...item, quantidade: '1 un' }, [{ ...food, porcao: '100 g' }])).toBe('peso_nao_cadastrado');
    for (const proteina_100g of [null, '', ' ', -1, undefined]) {
      const incomplete = { ...food, proteina_100g };
      expect(dietItemNutritionIssue(item, [incomplete])).toBe('nutrientes_incompletos');
      expect(nutritionForDietItem(item, [incomplete]).proteina).toBeNull();
    }
    expect(dietItemNutritionIssue(item, [{ ...food, proteina_100g: 0 }])).toBeNull();
    expect(renderDietFoodDetails({ ...item, quantidade: '25-30 g' }, [food])).toContain('Defina uma quantidade única');
    expect(renderDietFoodDetails(item, [{ ...food, proteina_100g: null }])).toContain('Complete as calorias');
  });
  it('normaliza automaticamente toda a semana sem gravar ou modificar a origem', () => {
    const chicken = { ...food, id: 2, item: 'Peito de frango grelhado' };
    const weekly = { semanal: true, semana: [{ refeicoes: [{ itens: [
      { nome: 'Frango, peito grelhado', quantidade_valor: '0,1', quantidade_unidade: 'KG' },
      { nome: 'OVOS INTEIROS', quantidade: '2 UN.' },
    ] }] }] };
    const original = structuredClone(weekly);
    const enriched = enrichDietNutrition(weekly, [food, chicken]);
    expect(enriched.semana[0].nutricao_total).toMatchObject({ completo: true, itens_pendentes: 0, kcal: 286 });
    expect(enriched.semana[0].refeicoes[0].itens.map(item => item.alimento_id)).toEqual([2, 1]);
    expect(enrichDietNutrition(enriched, [food, chicken])).toEqual(enriched);
    expect(weekly).toEqual(original);
  });
  it('vincula ovo e ovos ao ovo inteiro do Excel e calcula três unidades de 50 g', () => {
    const item = { nome: 'Ovos', quantidade_valor: 3, quantidade_unidade: 'un' };
    for (const nome of ['ovo', 'OVOS', 'Ovos inteiros']) expect(matchFoodForDietItem({ nome }, [food])).toBe(food);
    expect(nutritionForDietItem(item, [food])).toEqual({ kcal: 214.5, proteina: 18.9, carboidrato: 1.05, gordura: 14.25 });
    expect(renderDietFoodDetails(item, [food])).not.toContain('ainda não está vinculado');
  });
  it('adota batata cozida como referência e registra o preparo escolhido sem remover observações', () => {
    const potato = { id: 17, item: 'Batata inglesa cozida', kcal_100g: 87, proteina_100g: 1.9, carboidrato_100g: 20.1, gordura_100g: 0.1 };
    const item = { nome: 'Batata inglesa', quantidade_valor: 150, quantidade_unidade: 'g', observacao: 'Peso após cozimento, conforme PDF.' };
    expect(matchFoodForDietItem(item, [potato])).toBe(potato);
    expect(nutritionForDietItem(item, [potato])).toEqual({ kcal: 130.5, proteina: 2.85, carboidrato: 30.15, gordura: 0.15 });
    expect(matchFoodForDietItem({ ...item, observacao: '' }, [potato])).toBe(potato);
    const enriched = enrichDietNutrition({refeicoes:[{itens:[{ ...item, observacao: 'Cozida ou assada.' }]}]}, [potato]);
    expect(enriched.refeicoes[0].itens[0]).toMatchObject({nome:'Batata inglesa cozida',quantidade_valor:150});
    expect(enriched.refeicoes[0].itens[0].observacao).toContain('Cozida ou assada.');
    expect(enriched.refeicoes[0].itens[0].observacao).toContain('Referência nutricional adotada');
    for (const observacao of ['Assada.', 'Frita.', 'Purê de batata.']) {
      expect(matchFoodForDietItem({ ...item, observacao }, [potato])).toBeNull();
    }
    expect(matchFoodForDietItem({ ...item, alimento_id: 17, observacao: 'Assada.' }, [potato])).toBe(potato);
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
    expect(enriched.semana[0].refeicoes[0].itens[0].nome).toBe('Ovo inteiro');
    expect(enriched.semana[0].nutricao_total).toMatchObject({kcal:214.5,completo:true,itens_pendentes:0});
    expect(weekly.semana[0].refeicoes[0].itens[0].alimento_id).toBeUndefined();
    expect(weekly.semana[0].refeicoes[0].itens[0].nome).toBe('Ovos');
  });
  it('normaliza plurais e adota referências autorizadas preservando alternativas e quantidades', () => {
    const strawberry = { ...food, id: 30, item: 'Morango' };
    const diet = enrichDietNutrition({ refeicoes: [{ itens: [
      { nome: 'Morangos', quantidade: '100 g' },
      { nome: 'Mamão', quantidade: '150 g' },
      { nome: 'Frango grelhado', quantidade: '180 g' },
      { nome: 'Mamão ou morangos', quantidade: '150 g de mamão ou 200 g de morangos' },
    ] }] }, [strawberry, { ...food, id: 31, item: 'Mamão papaia' }, { ...food, id: 32, item: 'Peito de frango grelhado' }]);
    expect(diet.refeicoes[0].itens.map(i => i.nome)).toEqual(['Morango', 'Mamão papaia', 'Peito de frango grelhado', 'Mamão papaia']);
    expect(diet.refeicoes[0].itens.map(i => i.alimento_id)).toEqual([30, 31, 32, 31]);
    expect(diet.refeicoes[0].itens[1].observacao).toContain('"Mamão": Mamão papaia');
    expect(diet.refeicoes[0].itens[2].observacao).toContain('"Frango grelhado": Peito de frango grelhado');
    expect(diet.refeicoes[0].itens[3].observacao).toContain('Mamão ou morangos');
    expect(diet.refeicoes[0].itens[3].quantidade).toBe('150 g de mamão ou 200 g de morangos');
    expect(diet.nutricao_total.itens_pendentes).toBe(1);
    expect(enrichDietNutrition(diet, [strawberry,{ ...food,id:31,item:'Mamão papaia' },{...food,id:32,item:'Peito de frango grelhado'}])).toEqual(diet);
  });
  it('adota aveia e feijão do catálogo sem presumir quantidades de intervalos', () => {
    const oats = {...food,id:23,item:'Aveia em flocos crua'};
    const beans = {...food,id:27,item:'Feijão cozido'};
    const diet = enrichDietNutrition({refeicoes:[{itens:[{nome:'Aveia',quantidade:'30 g'},{nome:'Feijão',quantidade:'60-70 g'}]}]},[oats,beans]);
    expect(diet.refeicoes[0].itens.map(i=>i.nome)).toEqual(['Aveia em flocos crua','Feijão cozido']);
    expect(diet.refeicoes[0].itens[0].observacao).toContain('Referência nutricional adotada');
    expect(diet.nutricao_total.itens_pendentes).toBe(1);
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
