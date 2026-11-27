-- Seed manual do cardápio diário André/Juliana (27/11/2026).
-- Requer catálogo com os alimentos listados em v_required (inclui seed de iogurte/carne/legumes).
-- Preserva dietas existentes. Idempotente por slug. Não cria perfis.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create temporary table seed_diario_20261127_targets(perfil_id bigint primary key) on commit drop;
do $seed$
declare
  v_andre_id bigint := null;
  v_juliana_id bigint := null;
  v_owner uuid := null;
  v_pairs integer;
  v_count integer;
  v_source constant text := 'seed-cardapio-diario-andre-juliana-20261127';
  v_plan jsonb;
  v_profile_id bigint;
  v_meals jsonb;
  v_food_map jsonb;
  v_required constant text[] := array[
    'Mamão papaia','Banana','Aveia em flocos crua','Iogurte light','Maçã com casca',
    'Peito de frango grelhado','Arroz branco','Feijão cozido','Legumes','Ovo inteiro',
    'Carne bovina patinho grelhado','Batata-doce cozida','Brócolis','Cenoura'
  ];
  v_plans jsonb := $cardapios$[
  {
    "pessoa": "andre",
    "titulo": "Cardápio diário atual - André",
    "objetivo": "Plano alimentar diário",
    "refeicoes": [
      {
        "tipo": "cafe_da_manha",
        "titulo": "Café da manhã",
        "itens": [
          {"nome":"Mamão papaia","quantidade":"100 g","observacao":"Referência nutricional adotada para \"Mamão\": Mamão papaia.","calorias":null,"alimento_id":null,"quantidade_valor":100,"quantidade_unidade":"g"},
          {"nome":"Banana","quantidade":"80 g","observacao":"","calorias":null,"alimento_id":null,"quantidade_valor":80,"quantidade_unidade":"g"},
          {"nome":"Aveia em flocos crua","quantidade":"30 g","observacao":"Referência nutricional adotada para \"Aveia\": Aveia em flocos crua.","calorias":null,"alimento_id":null,"quantidade_valor":30,"quantidade_unidade":"g"},
          {"nome":"Iogurte light","quantidade":"170 ml","observacao":"","calorias":null,"alimento_id":null,"quantidade_valor":170,"quantidade_unidade":"ml"}
        ]
      },
      {
        "tipo": "lanche_da_manha",
        "titulo": "Lanche da manhã",
        "itens": [
          {"nome":"Maçã com casca","quantidade":"130 g","observacao":"Quantidade não informada no cardápio; adotada a porção de referência do catálogo (1 maçã ≈ 130 g). Ajuste no app se necessário.","calorias":null,"alimento_id":null,"quantidade_valor":130,"quantidade_unidade":"g"}
        ]
      },
      {
        "tipo": "almoco",
        "titulo": "Almoço",
        "itens": [
          {"nome":"Peito de frango grelhado","quantidade":"130 g","observacao":"Referência nutricional adotada para \"Frango\": Peito de frango grelhado.","calorias":null,"alimento_id":null,"quantidade_valor":130,"quantidade_unidade":"g"},
          {"nome":"Arroz branco","quantidade":"100 g","observacao":"Referência nutricional adotada para \"Arroz\": Arroz branco.","calorias":null,"alimento_id":null,"quantidade_valor":100,"quantidade_unidade":"g"},
          {"nome":"Feijão cozido","quantidade":"100 g","observacao":"Referência nutricional adotada para \"Feijão\": Feijão cozido.","calorias":null,"alimento_id":null,"quantidade_valor":100,"quantidade_unidade":"g"},
          {"nome":"Legumes","quantidade":"100 g","observacao":"","calorias":null,"alimento_id":null,"quantidade_valor":100,"quantidade_unidade":"g"}
        ]
      },
      {
        "tipo": "lanche_da_tarde",
        "titulo": "Lanche da tarde",
        "itens": [
          {"nome":"Ovo inteiro","quantidade":"2 unidades","observacao":"","calorias":null,"alimento_id":null,"quantidade_valor":2,"quantidade_unidade":"un"}
        ]
      },
      {
        "tipo": "jantar",
        "titulo": "Jantar",
        "itens": [
          {"nome":"Carne bovina patinho grelhado","quantidade":"120 g","observacao":"Referência nutricional adotada para \"Carne de boi\": Carne bovina patinho grelhado.","calorias":null,"alimento_id":null,"quantidade_valor":120,"quantidade_unidade":"g"},
          {"nome":"Batata-doce cozida","quantidade":"150 g","observacao":"Referência nutricional adotada para \"Batata doce\": Batata-doce cozida.","calorias":null,"alimento_id":null,"quantidade_valor":150,"quantidade_unidade":"g"},
          {"nome":"Brócolis","quantidade":"75 g","observacao":"","calorias":null,"alimento_id":null,"quantidade_valor":75,"quantidade_unidade":"g"},
          {"nome":"Cenoura","quantidade":"75 g","observacao":"","calorias":null,"alimento_id":null,"quantidade_valor":75,"quantidade_unidade":"g"}
        ]
      },
      {
        "tipo": "ceia",
        "titulo": "Ceia",
        "itens": [
          {"nome":"Iogurte light","quantidade":"170 ml","observacao":"","calorias":null,"alimento_id":null,"quantidade_valor":170,"quantidade_unidade":"ml"}
        ]
      }
    ],
    "observacoes": "Fonte: cardápio informado em 27/11/2026. Plano diário único (mesmo cardápio todos os dias). Maçã do lanche sem peso informado: usada porção de 130 g do catálogo."
  },
  {
    "pessoa": "juliana",
    "titulo": "Cardápio diário atual - Juliana",
    "objetivo": "Plano alimentar diário",
    "refeicoes": [
      {
        "tipo": "cafe_da_manha",
        "titulo": "Café da manhã",
        "itens": [
          {"nome":"Mamão papaia","quantidade":"100 g","observacao":"Referência nutricional adotada para \"Mamão\": Mamão papaia.","calorias":null,"alimento_id":null,"quantidade_valor":100,"quantidade_unidade":"g"},
          {"nome":"Banana","quantidade":"80 g","observacao":"","calorias":null,"alimento_id":null,"quantidade_valor":80,"quantidade_unidade":"g"},
          {"nome":"Aveia em flocos crua","quantidade":"30 g","observacao":"Referência nutricional adotada para \"Aveia\": Aveia em flocos crua.","calorias":null,"alimento_id":null,"quantidade_valor":30,"quantidade_unidade":"g"},
          {"nome":"Iogurte light","quantidade":"170 ml","observacao":"","calorias":null,"alimento_id":null,"quantidade_valor":170,"quantidade_unidade":"ml"}
        ]
      },
      {
        "tipo": "lanche_da_manha",
        "titulo": "Lanche da manhã",
        "itens": [
          {"nome":"Maçã com casca","quantidade":"130 g","observacao":"Quantidade não informada no cardápio; adotada a porção de referência do catálogo (1 maçã ≈ 130 g). Ajuste no app se necessário.","calorias":null,"alimento_id":null,"quantidade_valor":130,"quantidade_unidade":"g"}
        ]
      },
      {
        "tipo": "almoco",
        "titulo": "Almoço",
        "itens": [
          {"nome":"Peito de frango grelhado","quantidade":"130 g","observacao":"Referência nutricional adotada para \"Frango\": Peito de frango grelhado.","calorias":null,"alimento_id":null,"quantidade_valor":130,"quantidade_unidade":"g"},
          {"nome":"Arroz branco","quantidade":"100 g","observacao":"Referência nutricional adotada para \"Arroz\": Arroz branco.","calorias":null,"alimento_id":null,"quantidade_valor":100,"quantidade_unidade":"g"},
          {"nome":"Feijão cozido","quantidade":"100 g","observacao":"Referência nutricional adotada para \"Feijão\": Feijão cozido.","calorias":null,"alimento_id":null,"quantidade_valor":100,"quantidade_unidade":"g"},
          {"nome":"Legumes","quantidade":"100 g","observacao":"","calorias":null,"alimento_id":null,"quantidade_valor":100,"quantidade_unidade":"g"}
        ]
      },
      {
        "tipo": "lanche_da_tarde",
        "titulo": "Lanche da tarde",
        "itens": [
          {"nome":"Ovo inteiro","quantidade":"2 unidades","observacao":"","calorias":null,"alimento_id":null,"quantidade_valor":2,"quantidade_unidade":"un"},
          {"nome":"Iogurte light","quantidade":"170 ml","observacao":"","calorias":null,"alimento_id":null,"quantidade_valor":170,"quantidade_unidade":"ml"}
        ]
      },
      {
        "tipo": "jantar",
        "titulo": "Jantar",
        "itens": [
          {"nome":"Carne bovina patinho grelhado","quantidade":"120 g","observacao":"Referência nutricional adotada para \"Carne de boi\": Carne bovina patinho grelhado.","calorias":null,"alimento_id":null,"quantidade_valor":120,"quantidade_unidade":"g"},
          {"nome":"Batata-doce cozida","quantidade":"150 g","observacao":"Referência nutricional adotada para \"Batata doce\": Batata-doce cozida.","calorias":null,"alimento_id":null,"quantidade_valor":150,"quantidade_unidade":"g"},
          {"nome":"Brócolis","quantidade":"75 g","observacao":"","calorias":null,"alimento_id":null,"quantidade_valor":75,"quantidade_unidade":"g"},
          {"nome":"Cenoura","quantidade":"75 g","observacao":"","calorias":null,"alimento_id":null,"quantidade_valor":75,"quantidade_unidade":"g"}
        ]
      },
      {
        "tipo": "ceia",
        "titulo": "Ceia",
        "itens": []
      }
    ],
    "observacoes": "Fonte: cardápio informado em 27/11/2026. Plano diário único (mesmo cardápio todos os dias). Sem ceia. Maçã do lanche sem peso informado: usada porção de 130 g do catálogo."
  }
]$cardapios$::jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_source, 0));
  if (v_andre_id is null) <> (v_juliana_id is null) then
    raise exception 'Preencha os dois IDs de perfil ou deixe ambos nulos.';
  end if;
  if v_andre_id is null then
    select count(*) into v_pairs
      from public.tb_saude_perfis a
      join public.tb_saude_perfis j on j.created_by = a.created_by
     where lower(trim(a.nome)) in ('andré', 'andre') and a.sexo = 'masculino'
       and lower(trim(j.nome)) = 'juliana' and j.sexo = 'feminino'
       and (v_owner is null or a.created_by = v_owner);
    if v_pairs <> 1 then
      raise exception 'Esperado um único par André/Juliana da mesma conta; encontrados %. Informe os IDs reais.', v_pairs;
    end if;
    select a.id, j.id into v_andre_id, v_juliana_id
      from public.tb_saude_perfis a
      join public.tb_saude_perfis j on j.created_by = a.created_by
     where lower(trim(a.nome)) in ('andré', 'andre') and a.sexo = 'masculino'
       and lower(trim(j.nome)) = 'juliana' and j.sexo = 'feminino'
       and (v_owner is null or a.created_by = v_owner);
  end if;
  perform id from public.tb_saude_perfis where id in (v_andre_id, v_juliana_id) for share;
  select count(*), max(a.created_by::text)::uuid into v_count, v_owner
    from public.tb_saude_perfis a
    join public.tb_saude_perfis j on j.created_by = a.created_by
   where a.id = v_andre_id and j.id = v_juliana_id and a.id <> j.id
     and lower(trim(a.nome)) in ('andré', 'andre') and a.sexo = 'masculino'
     and lower(trim(j.nome)) = 'juliana' and j.sexo = 'feminino'
     and a.created_by is not null and (v_owner is null or a.created_by = v_owner);
  if v_count <> 1 then
    raise exception 'IDs incompatíveis: confirme nomes, sexos e o mesmo proprietário.';
  end if;
  insert into seed_diario_20261127_targets values (v_andre_id), (v_juliana_id);
  if to_regclass('public.tb_saude_alimentos') is null then
    raise exception 'Catálogo de alimentos ausente.';
  end if;
  if exists (
    select 1 from unnest(v_required) n
    where (select count(*) from public.tb_saude_alimentos a where lower(trim(a.item)) = lower(n)) <> 1
  ) then
    raise exception 'Catálogo deve conter um cadastro único de cada alimento necessário: %.', array_to_string(v_required, ', ');
  end if;
  select jsonb_object_agg(lower(trim(a.item)), a.id) into v_food_map
    from public.tb_saude_alimentos a
   where lower(trim(a.item)) in (select lower(n) from unnest(v_required) n);
  for v_plan in select value from jsonb_array_elements(v_plans) loop
    v_profile_id := case when v_plan->>'pessoa' = 'andre' then v_andre_id else v_juliana_id end;
    v_meals := coalesce((
      select jsonb_agg(
        jsonb_set(meal, '{itens}', coalesce((
          select jsonb_agg(
            item || jsonb_build_object('alimento_id', v_food_map->lower(trim(item->>'nome')))
            order by position
          )
          from jsonb_array_elements(meal->'itens') with ordinality as items(item, position)
        ), '[]'::jsonb))
        order by position
      )
      from jsonb_array_elements(v_plan->'refeicoes') with ordinality as meals(meal, position)
    ), '[]'::jsonb);
    insert into public.tb_saude_dietas (
      slug, titulo, objetivo, duracao_dias, descricao, orientacoes_gerais, ritual_diario,
      dias, refeicoes, semanal, semana, observacoes, meta_calorias, perfil_id, source_file, created_by, alerta_ativo
    ) values (
      'seed-cardapio-diario-20261127-perfil-' || v_profile_id::text,
      v_plan->>'titulo', v_plan->>'objetivo', 1,
      'Cardápio diário informado em 27/11/2026.', '', '',
      jsonb_build_array(jsonb_build_object(
        'numero', 1, 'titulo', 'Plano alimentar', 'jejum_horas', 0,
        'quantidade_refeicoes', (
          select count(*) from jsonb_array_elements(v_meals) meal
          where jsonb_array_length(meal->'itens') > 0
        ),
        'carboidrato', '', 'conteudo', ''
      )),
      v_meals, false, '[]'::jsonb, v_plan->>'observacoes', null, v_profile_id, v_source, v_owner, false
    ) on conflict (slug) do nothing;
  end loop;
end;
$seed$;
select d.id as dieta_id, p.id as perfil_id, p.nome, d.titulo, d.semanal, d.alerta_ativo, d.source_file
from public.tb_saude_dietas d
join seed_diario_20261127_targets t on t.perfil_id = d.perfil_id
join public.tb_saude_perfis p on p.id = t.perfil_id
where d.slug = 'seed-cardapio-diario-20261127-perfil-' || t.perfil_id::text
order by p.nome;
commit;
