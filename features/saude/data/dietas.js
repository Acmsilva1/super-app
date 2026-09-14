export const DIETAS_INICIAIS = [
  {
    id: 1,
    slug: 'detox-7-dias-perder-peso',
    titulo: 'Protocolo Detox 7D',
    objetivo: 'Perder peso',
    duracao_dias: 7,
    descricao: 'Protocolo de sete dias com alternância de jejuns de 12 e 16 horas, alimentação natural e redução progressiva de carboidratos.',
    orientacoes_gerais: `Jejum de 12 horas: exemplo, jantar às 20h e primeira refeição às 8h.
Jejum de 16 horas: exemplo, jantar às 20h e primeira refeição às 12h.
Durante o jejum são permitidos água, água com gás, chás sem açúcar, café sem açúcar e adoçante stévia.
Evitar farinhas, açúcar, embutidos, industrializados, refrigerantes, álcool e derivados de leite.
Folhas verdes à vontade, legumes até aproximadamente 200 g por refeição e bastante água ao longo do dia.`,
    ritual_diario: `Escolher até duas opções, sem obrigatoriedade:
1. Chás: chá verde com hortelã, oolong, cavalinha ou hibisco com chá verde, sem açúcar.
2. Shot antioxidante: cúrcuma, pimenta-preta, pimenta-caiena, vinagre de maçã, água e própolis verde.
3. Suco verde: uma folha verde, maçã com casca, limão ou maracujá, cúrcuma e 200 ml de água.
Nos dias de jejum de 16 horas, durante o jejum escolher apenas chá; shot e suco verde devem acompanhar as refeições.`,
    dias: [
      {
        numero: 1,
        titulo: 'Desinflamar',
        jejum_horas: 12,
        quantidade_refeicoes: 4,
        carboidrato: 'Café da manhã, almoço e lanche; jantar sem carboidrato.',
        conteudo: `1ª refeição — Quebra de jejum / Café da manhã
2 ovos mexidos ou Tabela 1; mamão papaia ou outra fruta da Tabela 3; folhas verdes à vontade.

2ª refeição — Almoço
120 g de peito de frango ou Tabela 1; batata-doce ou inhame (~70 g) ou Tabela 2; legumes low-carb até 200 g ou Tabela 5; 1 colher de chá de azeite ou Tabela 4.

3ª refeição — Lanche
1 fruta da Tabela 3; 1 ovo cozido ou castanhas das Tabelas 1 ou 4.

4ª refeição — Jantar
Sem carboidrato: 150 g de peixe ou Tabela 1; folhas e legumes low-carb ou Tabela 5.`
      },
      {
        numero: 2,
        titulo: 'Desinflamar',
        jejum_horas: 16,
        quantidade_refeicoes: 3,
        carboidrato: 'Almoço e lanche; jantar sem carboidrato.',
        conteudo: `1ª refeição — Quebra de jejum / Almoço
3 ovos; batata-doce ou mandioca (~90 g) ou Tabela 2; legumes low-carb até 200 g ou Tabela 5; azeite ou Tabela 4.

2ª refeição — Lanche
100 g de frango desfiado ou Tabela 1; 1 fruta ou Tabela 3.

3ª refeição — Jantar
Sem carboidrato: 150 g de peixe ou Tabela 1; salada e legumes low-carb ou Tabela 5; azeite ou Tabela 4.`
      },
      {
        numero: 3,
        titulo: 'Drenar e desinchar',
        jejum_horas: 12,
        quantidade_refeicoes: 4,
        carboidrato: 'Reduzido, com porção menor no almoço e lanche.',
        conteudo: `1ª refeição — Café da manhã
2 ovos mexidos ou Tabela 1; folhas verdes à vontade.

2ª refeição — Almoço
150 g de peixe ou Tabela 1; batata-doce (~50 g) ou Tabela 2; legumes low-carb até 200 g ou Tabela 5; azeite ou Tabela 4.

3ª refeição — Lanche
Fruta low-carb ou Tabela 3; 1 ovo cozido ou Tabela 1.

4ª refeição — Jantar
Sem carboidrato: 150 g de peixe; folhas e legumes low-carb.`
      },
      {
        numero: 4,
        titulo: 'Drenar e desinchar',
        jejum_horas: 16,
        quantidade_refeicoes: 3,
        carboidrato: 'Somente no almoço; demais refeições low-carb.',
        conteudo: `1ª refeição — Almoço
150 g de frango ou Tabela 1; batata-doce (~70 g) ou Tabela 2; legumes low-carb até 200 g ou Tabela 5; azeite ou Tabela 4.

2ª refeição — Lanche
Sem carboidrato: 100 g de frango ou 1 ovo; legumes low-carb.

3ª refeição — Jantar
Sem carboidrato: 150 g de peixe; folhas e legumes; azeite.`
      },
      {
        numero: 5,
        titulo: 'Ativação do metabolismo',
        jejum_horas: 12,
        quantidade_refeicoes: 4,
        carboidrato: 'Low-carb; energia baseada em proteína e gordura boa.',
        conteudo: `1ª refeição — Café da manhã
2 ovos mexidos; folhas verdes.

2ª refeição — Almoço
150 g de peixe; legumes low-carb até 200 g; azeite.

3ª refeição — Lanche
Castanhas ou amêndoas; chá verde ou chá de gengibre.

4ª refeição — Jantar
140 g de peixe; legumes low-carb.`
      },
      {
        numero: 6,
        titulo: 'Ativação do metabolismo',
        jejum_horas: 16,
        quantidade_refeicoes: 3,
        carboidrato: 'Low-carb; proteína magra e vegetais como base.',
        conteudo: `1ª refeição — Almoço
3 ovos; legumes low-carb até 200 g; azeite.

2ª refeição — Lanche
100 g de frango; folhas verdes.

3ª refeição — Jantar
150 g de peixe; folhas e legumes low-carb; azeite.`
      },
      {
        numero: 7,
        titulo: 'Ativação do metabolismo',
        jejum_horas: 12,
        quantidade_refeicoes: 4,
        carboidrato: 'Low-carb; fechamento leve da semana.',
        conteudo: `1ª refeição — Café da manhã
2 ovos mexidos; folhas verdes.

2ª refeição — Almoço
150 g de frango; legumes low-carb até 200 g; azeite.

3ª refeição — Lanche
Fruta low-carb; 1 ovo cozido.

4ª refeição — Jantar
150 g de peixe; folhas e legumes low-carb.`
      }
    ],
    observacoes: 'Conteúdo estruturado a partir do protocolo original fornecido; não acrescenta recomendações nutricionais externas.',
    source_file: 'protocolo_detox_7_dias_perder_peso.md'
  }
];
