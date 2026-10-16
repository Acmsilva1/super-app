-- Seed manual das fontes André.pdf e Juliana.pdf. Não executar junto de migrations.
-- Requer schema atual de Saúde (refeicoes, perfil_id, meta_calorias, semanal/semana, alerta_ativo).
-- Cardápios base diários com rotação semanal apenas dos legumes, separados por perfil.
-- Preserva dietas existentes e edições ao reaplicar. Requer catálogo de alimentos preenchido.
-- Informar ambos os IDs abaixo se houver homônimos. Nunca deduzir IDs.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
create temporary table seed_diario_20261016_targets(perfil_id bigint primary key) on commit drop;
do $seed$
declare
  v_andre_id bigint := null;
  v_juliana_id bigint := null;
  v_owner uuid := null; -- Opcional: proprietário dos dois perfis.
  v_pairs integer;
  v_count integer;
  v_source constant text := 'seed-cardapio-diario-21-dias-20261016';
  v_plan jsonb;
  v_week jsonb;
  v_meals jsonb;
  v_meal jsonb;
  v_foods jsonb;
  v_day integer;
  v_profile_id bigint;
  v_titles constant text[] := array['Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado','Domingo'];
  v_required constant text[] := array['Abobrinha','Brócolis','Couve-flor','Chuchu','Ovo inteiro','Mamão papaia','Aveia em flocos crua','Morango','Peito de frango grelhado','Feijão cozido','Abacate','Batata inglesa cozida','Café sem açúcar'];
  v_pairs_vegetables constant jsonb := '[
    ["Brócolis","Abobrinha"],
    ["Couve-flor","Chuchu"],
    ["Brócolis","Couve-flor"],
    ["Abobrinha","Chuchu"],
    ["Brócolis","Chuchu"],
    ["Abobrinha","Couve-flor"],
    ["Brócolis","Abobrinha"]
  ]'::jsonb;
  v_plans jsonb := $cardapios$[
  {
    "pessoa": "andre",
    "titulo": "Cardápio diário - André - 21 dias",
    "objetivo": "Recomposição corporal",
    "refeicoes": [
      {
        "tipo": "cafe_da_manha",
        "titulo": "Café da manhã",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "3 unidades",
            "observacao": "",
            "calorias": null,
            "alimento_id": null,
            "quantidade_valor": 3,
            "quantidade_unidade": "un"
          },
          {
            "nome": "Mamão papaia",
            "quantidade": "150 g",
            "observacao": "Referência nutricional adotada para \"Mamão\": Mamão papaia. Quantidades e alternativas originais preservadas; ajuste no app se escolher outra opção.",
            "calorias": null,
            "alimento_id": null,
            "quantidade_valor": 150,
            "quantidade_unidade": "g"
          },
          {
            "nome": "Aveia em flocos crua",
            "quantidade": "30 g",
            "observacao": "Referência nutricional adotada para \"Aveia\": Aveia em flocos crua. Quantidades e alternativas originais preservadas; ajuste no app se escolher outra opção.",
            "calorias": null,
            "alimento_id": null,
            "quantidade_valor": 30,
            "quantidade_unidade": "g"
          }
        ]
      },
      {
        "tipo": "lanche_da_manha",
        "titulo": "Lanche da manhã",
        "itens": [
          {
            "nome": "Whey protein",
            "quantidade": "30 g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null,
            "quantidade_valor": 30,
            "quantidade_unidade": "g"
          },
          {
            "nome": "Morango",
            "quantidade": "100 g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null,
            "quantidade_valor": 100,
            "quantidade_unidade": "g"
          }
        ]
      },
      {
        "tipo": "almoco",
        "titulo": "Almoço",
        "itens": [
          {
            "nome": "Peito de frango grelhado",
            "quantidade": "180 g",
            "observacao": "Referência nutricional adotada para \"Frango grelhado\": Peito de frango grelhado. Quantidades e alternativas originais preservadas; ajuste no app se escolher outra opção.",
            "calorias": null,
            "alimento_id": null,
            "quantidade_valor": 180,
            "quantidade_unidade": "g"
          },
          {
            "nome": "Arroz branco",
            "quantidade": "Conforme a fase",
            "observacao": "Dias 1-7: 100 g cozido. Dias 8-14: 70 g. Dias 15-21: 60-70 g.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Feijão cozido",
            "quantidade": "70 g",
            "observacao": "Referência nutricional adotada para \"Feijão\": Feijão cozido. Quantidades e alternativas originais preservadas; ajuste no app se escolher outra opção.",
            "calorias": null,
            "alimento_id": null,
            "quantidade_valor": 70,
            "quantidade_unidade": "g"
          },
          {
            "nome": "Salada",
            "quantidade": "À vontade",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "lanche_da_tarde",
        "titulo": "Lanche da tarde",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "2 unidades",
            "observacao": "",
            "calorias": null,
            "alimento_id": null,
            "quantidade_valor": 2,
            "quantidade_unidade": "un"
          },
          {
            "nome": "Abacate",
            "quantidade": "80 g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null,
            "quantidade_valor": 80,
            "quantidade_unidade": "g"
          }
        ]
      },
      {
        "tipo": "jantar",
        "titulo": "Jantar",
        "itens": [
          {
            "nome": "Peito de frango grelhado",
            "quantidade": "180-200 g",
            "observacao": "Referência nutricional adotada para \"Carne bovina magra ou frango\": Peito de frango grelhado. Quantidades e alternativas originais preservadas; ajuste no app se escolher outra opção.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Batata inglesa cozida",
            "quantidade": "Conforme a fase",
            "observacao": "Dias 1-7: 150 g. Dias 8-14: 100 g. Dias 15-21: 80-100 g.\nReferência nutricional adotada para \"Batata inglesa\": Batata inglesa cozida. Quantidades e alternativas originais preservadas; ajuste no app se escolher outra opção.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Salada",
            "quantidade": "À vontade",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "ceia",
        "titulo": "Ceia",
        "itens": [
          {
            "nome": "Whey protein",
            "quantidade": "25-30 g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      }
    ],
    "observacoes": "Fonte: André.pdf. Plano diário de recomposição corporal - 21 dias. Cardápio base diário, com duas opções de legumes por dia em rotação semanal e ajuste manual das porções conforme a fase.\n\nAJUSTE DAS PORÇÕES AO LONGO DOS 21 DIAS\nDias 1-7: arroz 100 g cozido; batata 150 g. Manter o cardápio base.\nDias 8-14: arroz 70 g; batata 100 g. Manter proteínas, legumes e saladas.\nDias 15-21: arroz 60-70 g; batata 80-100 g. Manter 180-200 g de frango/carne nas principais.\n\nTROCAS SIMPLES\nProteínas: frango, patinho moído, coxão mole, ovos.\nCarboidratos: arroz branco, batata inglesa, mandioca, inhame - ajustar a porção.\nGorduras boas: abacate, gema do ovo, pequenas quantidades de azeite, se houver boa tolerância.\n\nLEGUMES: duas opções por dia, 100 g de cada (200 g por refeição). Mesma dupla no almoço e no jantar; combinações de segunda a domingo. Demais alimentos seguem o cardápio base."
  },
  {
    "pessoa": "juliana",
    "titulo": "Cardápio diário - Juliana - 21 dias",
    "objetivo": "Estratégia alimentar",
    "refeicoes": [
      {
        "tipo": "cafe_da_manha",
        "titulo": "Café da manhã",
        "itens": [
          {
            "nome": "Ovo inteiro",
            "quantidade": "2 unidades",
            "observacao": "Mexidos ou cozidos.",
            "calorias": null,
            "alimento_id": null,
            "quantidade_valor": 2,
            "quantidade_unidade": "un"
          },
          {
            "nome": "Mamão papaia",
            "quantidade": "150 g",
            "observacao": "Referência nutricional adotada para \"Mamão\": Mamão papaia. Quantidades e alternativas originais preservadas; ajuste no app se escolher outra opção.",
            "calorias": null,
            "alimento_id": null,
            "quantidade_valor": 150,
            "quantidade_unidade": "g"
          },
          {
            "nome": "Café sem açúcar",
            "quantidade": "Sem açúcar ou com adoçante",
            "observacao": "Referência nutricional adotada para \"Café\": Café sem açúcar. Quantidades e alternativas originais preservadas; ajuste no app se escolher outra opção.",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "lanche_da_manha",
        "titulo": "Lanche da manhã",
        "itens": [
          {
            "nome": "Morango",
            "quantidade": "150 g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null,
            "quantidade_valor": 150,
            "quantidade_unidade": "g"
          },
          {
            "nome": "Ovo inteiro",
            "quantidade": "1 unidade",
            "observacao": "Cozido.",
            "calorias": null,
            "alimento_id": null,
            "quantidade_valor": 1,
            "quantidade_unidade": "un"
          }
        ]
      },
      {
        "tipo": "almoco",
        "titulo": "Almoço",
        "itens": [
          {
            "nome": "Peito de frango grelhado",
            "quantidade": "130-150 g",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Batata inglesa cozida",
            "quantidade": "150 g",
            "observacao": "Cozida ou assada.\nReferência nutricional adotada para \"Batata inglesa\": Batata inglesa cozida. Quantidades e alternativas originais preservadas; ajuste no app se escolher outra opção.",
            "calorias": null,
            "alimento_id": null,
            "quantidade_valor": 150,
            "quantidade_unidade": "g"
          },
          {
            "nome": "Salada de folhas e tomate",
            "quantidade": "À vontade",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "lanche_da_tarde",
        "titulo": "Lanche da tarde",
        "itens": [
          {
            "nome": "Mamão papaia",
            "quantidade": "150 g de mamão ou 200 g de morangos",
            "observacao": "Referência nutricional adotada para \"Mamão ou morangos\": Mamão papaia. Quantidades e alternativas originais preservadas; ajuste no app se escolher outra opção.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Ovo inteiro",
            "quantidade": "2 unidades",
            "observacao": "Cozidos/mexidos.",
            "calorias": null,
            "alimento_id": null,
            "quantidade_valor": 2,
            "quantidade_unidade": "un"
          }
        ]
      },
      {
        "tipo": "jantar",
        "titulo": "Jantar",
        "itens": [
          {
            "nome": "Peito de frango grelhado",
            "quantidade": "130-150 g de frango ou omelete com 3 ovos",
            "observacao": "Referência nutricional adotada para \"Frango ou omelete\": Peito de frango grelhado. Quantidades e alternativas originais preservadas; ajuste no app se escolher outra opção.",
            "calorias": null,
            "alimento_id": null
          },
          {
            "nome": "Batata inglesa cozida",
            "quantidade": "100 g",
            "observacao": "Referência nutricional adotada para \"Batata inglesa\": Batata inglesa cozida. Quantidades e alternativas originais preservadas; ajuste no app se escolher outra opção.",
            "calorias": null,
            "alimento_id": null,
            "quantidade_valor": 100,
            "quantidade_unidade": "g"
          },
          {
            "nome": "Salada",
            "quantidade": "À vontade",
            "observacao": "",
            "calorias": null,
            "alimento_id": null
          }
        ]
      },
      {
        "tipo": "ceia",
        "titulo": "Ceia",
        "itens": []
      }
    ],
    "observacoes": "Fonte: Juliana.pdf. Estratégia alimentar - 21 dias. Cardápio base diário, com duas opções de legumes por dia em rotação semanal.\n\nHORÁRIOS DO CARDÁPIO\nCafé da manhã: 07h. Lanche da manhã: 10h. Almoço: 12h/13h. Lanche da tarde: 16h. Jantar: 19h/20h.\n\nTROCAS SIMPLES\nProteínas: frango e ovos. Sem carne vermelha.\nCarboidratos: arroz branco, batata inglesa, mandioca ou inhame, ajustando a porção.\nGorduras boas: abacate, gema do ovo e pequenas quantidades de azeite, se houver boa tolerância.\n\nLEGUMES: duas opções por dia, 100 g de cada (200 g por refeição). Mesma dupla no almoço e no jantar; combinações de segunda a domingo. Demais alimentos seguem o cardápio base."
  }
]$cardapios$::jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(v_source,0));
  if (v_andre_id is null) <> (v_juliana_id is null) then
    raise exception 'Preencha os dois IDs de perfil ou deixe ambos nulos.';
  end if;
  if v_andre_id is null then
    select count(*) into v_pairs
      from public.tb_saude_perfis a join public.tb_saude_perfis j on j.created_by=a.created_by
      where lower(trim(a.nome)) in ('andré','andre') and a.sexo='masculino'
        and lower(trim(j.nome))='juliana' and j.sexo='feminino'
        and (v_owner is null or a.created_by=v_owner);
    if v_pairs <> 1 then
      raise exception 'Esperado um único par André/Juliana da mesma conta; encontrados %. Informe os IDs reais e/ou created_by no início do seed.',v_pairs;
    end if;
    select a.id,j.id into v_andre_id,v_juliana_id
      from public.tb_saude_perfis a join public.tb_saude_perfis j on j.created_by=a.created_by
      where lower(trim(a.nome)) in ('andré','andre') and a.sexo='masculino'
        and lower(trim(j.nome))='juliana' and j.sexo='feminino'
        and (v_owner is null or a.created_by=v_owner);
  end if;
  perform id from public.tb_saude_perfis where id in (v_andre_id,v_juliana_id) for share;
  select count(*),max(a.created_by::text)::uuid into v_count,v_owner
    from public.tb_saude_perfis a join public.tb_saude_perfis j on j.created_by=a.created_by
    where a.id=v_andre_id and j.id=v_juliana_id and a.id<>j.id
      and lower(trim(a.nome)) in ('andré','andre') and a.sexo='masculino'
      and lower(trim(j.nome))='juliana' and j.sexo='feminino'
      and a.created_by is not null and (v_owner is null or a.created_by=v_owner);
  if v_count <> 1 then
    raise exception 'IDs incompatíveis: confirme nomes, sexos e o mesmo proprietário para André e Juliana.';
  end if;
  insert into seed_diario_20261016_targets values(v_andre_id),(v_juliana_id);
  if exists(select 1 from public.tb_saude_dietas d join seed_diario_20261016_targets t
    on d.slug='seed-cardapio-diario-20261016-perfil-' || t.perfil_id::text
    where d.perfil_id is distinct from t.perfil_id or d.created_by is distinct from v_owner
      or d.source_file is distinct from v_source) then
    raise exception 'Slug reservado pertence a outra dieta. Nenhuma dieta foi substituída.';
  end if;
  if to_regclass('public.tb_saude_alimentos') is null then
    raise exception 'Catálogo de alimentos ausente. Aplique primeiro o cadastro nutricional do app.';
  end if;
  if exists(select 1 from public.tb_saude_dietas d join seed_diario_20261016_targets t on t.perfil_id=d.perfil_id
    where d.source_file=v_source and d.slug='seed-cardapio-diario-20261016-perfil-' || t.perfil_id::text
      and not d.semanal) then
    raise exception 'Uma versão diária anterior deste seed já existe. A rotação não foi aplicada: o seed preserva registros existentes. Revise essas dietas antes de substituir.';
  end if;
  perform a.id from public.tb_saude_alimentos a
    where lower(trim(a.item)) in (select lower(n) from unnest(v_required) n) for share;
  if exists(select 1 from unnest(v_required) n where
    (select count(*) from public.tb_saude_alimentos a where lower(trim(a.item))=lower(n))<>1) then
    raise exception 'Catálogo deve conter um cadastro único de cada alimento necessário: %. Nenhuma dieta foi inserida.',array_to_string(v_required,', ');
  end if;
  -- IDs reais do ambiente: nunca usar source_order/posição da planilha como alimento_id.
  select jsonb_object_agg(n,jsonb_build_object('nome',a.item,'quantidade','100 g',
    'quantidade_valor',100,'quantidade_unidade','g','observacao','',
    'alimento_id',a.id,'calorias',null)) into v_foods
    from unnest(v_required) n join public.tb_saude_alimentos a on lower(trim(a.item))=lower(n);
  for v_plan in select value from jsonb_array_elements(v_plans) loop
    v_profile_id := case when v_plan->>'pessoa'='andre' then v_andre_id else v_juliana_id end;
    v_week := '[]'::jsonb;
    for v_day in 1..7 loop
      v_meals := '[]'::jsonb;
      for v_meal in select value from jsonb_array_elements(v_plan->'refeicoes') loop
        -- As referências escolhidas já estão nos nomes e observações do plano; não altera porções.
        v_meal := jsonb_set(v_meal,'{itens}',coalesce((
          select jsonb_agg(case when v_foods ? (item->>'nome') then item || jsonb_build_object(
            'nome',v_foods->(item->>'nome')->>'nome',
            'alimento_id',v_foods->(item->>'nome')->'alimento_id') else item end order by position)
          from jsonb_array_elements(v_meal->'itens') with ordinality as items(item,position)
        ),'[]'::jsonb));
        if v_meal->>'tipo' in ('almoco','jantar') then
          v_meal := jsonb_set(v_meal,'{itens}',(v_meal->'itens') || jsonb_build_array(
            v_foods->(v_pairs_vegetables->(v_day-1)->>0),
            v_foods->(v_pairs_vegetables->(v_day-1)->>1)));
        end if;
        v_meals := v_meals || jsonb_build_array(v_meal);
      end loop;
      v_week := v_week || jsonb_build_array(jsonb_build_object('titulo',v_titles[v_day],'refeicoes',v_meals));
    end loop;
    -- Semanal é necessário para o seletor e o bot variarem os legumes pelo dia local.
    -- Os 21 dias e ajustes por fase permanecem nas observações; sem avanço automático de fase.
    insert into public.tb_saude_dietas (
      slug,titulo,objetivo,duracao_dias,descricao,orientacoes_gerais,ritual_diario,
      dias,refeicoes,semanal,semana,observacoes,meta_calorias,perfil_id,source_file,created_by,alerta_ativo
    ) values (
      'seed-cardapio-diario-20261016-perfil-' || v_profile_id::text,
      v_plan->>'titulo',v_plan->>'objetivo',7,
      'Cardápio base diário para 21 dias, com rotação semanal de duas opções de legumes por dia.','','',
      (select jsonb_agg(jsonb_build_object('numero',ordinality,'titulo',value->>'titulo','jejum_horas',0,
        'quantidade_refeicoes',(select count(*) from jsonb_array_elements(value->'refeicoes') meal
          where jsonb_array_length(meal->'itens')>0),'carboidrato','','conteudo','') order by ordinality)
        from jsonb_array_elements(v_week) with ordinality),
      '[]'::jsonb,true,v_week,v_plan->>'observacoes',null,v_profile_id,v_source,v_owner,false
    ) on conflict (slug) do nothing;
  end loop;
end;
$seed$;
select d.id as dieta_id,p.id as perfil_id,p.nome,d.titulo,d.semanal,
  jsonb_array_length(d.semana) as dias_rotacao,d.alerta_ativo
from public.tb_saude_dietas d join seed_diario_20261016_targets t on t.perfil_id=d.perfil_id
join public.tb_saude_perfis p on p.id=t.perfil_id
where d.slug='seed-cardapio-diario-20261016-perfil-' || t.perfil_id::text order by p.nome;
commit;
