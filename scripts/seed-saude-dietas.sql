-- Seed idempotente: primeira dieta do modulo Saude.
-- Execute depois de migration/20260914_create_saude_dietas.sql.

begin;

insert into public.tb_saude_dietas (
  slug, titulo, objetivo, duracao_dias, descricao, orientacoes_gerais,
  ritual_diario, dias, observacoes, source_file
)
values (
  'detox-7-dias-perder-peso',
  'Protocolo Detox 7D',
  'Perder peso',
  7,
  'Protocolo de sete dias com alternancia de jejuns de 12 e 16 horas, alimentacao natural e reducao progressiva de carboidratos.',
  $orientacoes$Jejum de 12 horas: exemplo, jantar as 20h e primeira refeicao as 8h.
Jejum de 16 horas: exemplo, jantar as 20h e primeira refeicao as 12h.
Durante o jejum sao permitidos agua, agua com gas, chas sem acucar, cafe sem acucar e adocante stevia.
Evitar farinhas, acucar, embutidos, industrializados, refrigerantes, alcool e derivados de leite.
Folhas verdes a vontade, legumes ate aproximadamente 200 g por refeicao e bastante agua ao longo do dia.$orientacoes$,
  $ritual$Escolher ate duas opcoes, sem obrigatoriedade:
1. Chas: cha verde com hortela, oolong, cavalinha ou hibisco com cha verde, sem acucar.
2. Shot antioxidante: 1 colher de cha de curcuma, pimenta-preta, pimenta-caiena, 1 colher de sobremesa de vinagre de maca, meio copo de agua e 20 gotas de propolis verde.
3. Suco verde: 1 folha de couve, espinafre ou rucula; 1 maca com casca; suco de 1 limao ou 1 maracuja; curcuma e 200 ml de agua.
Nos dias de jejum de 16 horas, durante o jejum escolher apenas cha; shot e suco verde devem acompanhar as refeicoes.$ritual$,
  $dias$[
    {"numero":1,"titulo":"Desinflamar","jejum_horas":12,"quantidade_refeicoes":4,"carboidrato":"Cafe da manha, almoco e lanche; jantar sem carboidrato.","conteudo":"1a refeicao - Cafe da manha\n2 ovos mexidos ou Tabela 1; mamao papaia ou outra fruta da Tabela 3; folhas verdes a vontade.\n\n2a refeicao - Almoco\n120 g de peito de frango; batata-doce ou inhame (~70 g); legumes low-carb ate 200 g; 1 colher de cha de azeite.\n\n3a refeicao - Lanche\n1 fruta; 1 ovo cozido ou castanhas.\n\n4a refeicao - Jantar\nSem carboidrato: 150 g de peixe; folhas e legumes low-carb."},
    {"numero":2,"titulo":"Desinflamar","jejum_horas":16,"quantidade_refeicoes":3,"carboidrato":"Almoco e lanche; jantar sem carboidrato.","conteudo":"1a refeicao - Almoco\n3 ovos; batata-doce ou mandioca (~90 g); legumes low-carb ate 200 g; azeite.\n\n2a refeicao - Lanche\n100 g de frango desfiado; 1 fruta.\n\n3a refeicao - Jantar\nSem carboidrato: 150 g de peixe; salada e legumes low-carb; azeite."},
    {"numero":3,"titulo":"Drenar e desinchar","jejum_horas":12,"quantidade_refeicoes":4,"carboidrato":"Reduzido, com porcao menor no almoco e lanche.","conteudo":"1a refeicao - Cafe da manha\n2 ovos mexidos; folhas verdes.\n\n2a refeicao - Almoco\n150 g de peixe; batata-doce (~50 g); legumes low-carb ate 200 g; azeite.\n\n3a refeicao - Lanche\nFruta low-carb; 1 ovo cozido.\n\n4a refeicao - Jantar\nSem carboidrato: 150 g de peixe; folhas e legumes low-carb."},
    {"numero":4,"titulo":"Drenar e desinchar","jejum_horas":16,"quantidade_refeicoes":3,"carboidrato":"Somente no almoco; demais refeicoes low-carb.","conteudo":"1a refeicao - Almoco\n150 g de frango; batata-doce (~70 g); legumes low-carb ate 200 g; azeite.\n\n2a refeicao - Lanche\nSem carboidrato: 100 g de frango ou 1 ovo; legumes low-carb.\n\n3a refeicao - Jantar\nSem carboidrato: 150 g de peixe; folhas e legumes; azeite."},
    {"numero":5,"titulo":"Ativacao do metabolismo","jejum_horas":12,"quantidade_refeicoes":4,"carboidrato":"Low-carb; energia baseada em proteina e gordura boa.","conteudo":"1a refeicao - Cafe da manha\n2 ovos mexidos; folhas verdes.\n\n2a refeicao - Almoco\n150 g de peixe; legumes low-carb ate 200 g; azeite.\n\n3a refeicao - Lanche\nCastanhas ou amendoas; cha verde ou cha de gengibre.\n\n4a refeicao - Jantar\n140 g de peixe; legumes low-carb."},
    {"numero":6,"titulo":"Ativacao do metabolismo","jejum_horas":16,"quantidade_refeicoes":3,"carboidrato":"Low-carb; proteina magra e vegetais como base.","conteudo":"1a refeicao - Almoco\n3 ovos; legumes low-carb ate 200 g; azeite.\n\n2a refeicao - Lanche\n100 g de frango; folhas verdes.\n\n3a refeicao - Jantar\n150 g de peixe; folhas e legumes low-carb; azeite."},
    {"numero":7,"titulo":"Ativacao do metabolismo","jejum_horas":12,"quantidade_refeicoes":4,"carboidrato":"Low-carb; fechamento leve da semana.","conteudo":"1a refeicao - Cafe da manha\n2 ovos mexidos; folhas verdes.\n\n2a refeicao - Almoco\n150 g de frango; legumes low-carb ate 200 g; azeite.\n\n3a refeicao - Lanche\nFruta low-carb; 1 ovo cozido.\n\n4a refeicao - Jantar\n150 g de peixe; folhas e legumes low-carb."}
  ]$dias$::jsonb,
  'Conteudo estruturado a partir do protocolo original fornecido; nao acrescenta recomendacoes nutricionais externas.',
  'protocolo_detox_7_dias_perder_peso.md'
)
on conflict (slug) do update set
  titulo = excluded.titulo,
  objetivo = excluded.objetivo,
  duracao_dias = excluded.duracao_dias,
  descricao = excluded.descricao,
  orientacoes_gerais = excluded.orientacoes_gerais,
  ritual_diario = excluded.ritual_diario,
  dias = excluded.dias,
  observacoes = excluded.observacoes,
  source_file = excluded.source_file,
  updated_at = now();

commit;
