-- Aplicação manual no SQL Editor, após criar tb_saude_alimentos.
-- Somente catálogo: não altera dietas, quantidades, perfis nem agendas.
-- Referências consultadas em 17/10/2026; valores por 100 g comestíveis.
-- TACO/NEPA-UNICAMP, 4a ed. (2011), alimentos 3, 79 e 157:
-- https://nepa.unicamp.br/wp-content/uploads/sites/27/2023/10/taco_4_edicao_ampliada_e_revisada.pdf
-- USDA SR27 (2014), NDB 14066, página 199 do PDF:
-- https://www.ars.usda.gov/ARSUserFiles/80400525/Data/SR27/reports/sr27fg14.pdf#page=199
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table public.tb_saude_alimentos in share row exclusive mode;

-- Normaliza acentos, caixa, pontuação e espaços, sem depender de unaccent.
create or replace function pg_temp.seed_food_key(value text)
returns text language sql immutable strict as $$
  select trim(regexp_replace(translate(lower(value),
    'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]+', ' ', 'g'));
$$;

create temporary table seed_nutricao_20261017_input (
  item text primary key, categoria text not null, kcal numeric not null,
  proteina numeric not null, carboidrato numeric not null, gordura numeric not null,
  observacoes text not null, fonte text not null
) on commit drop;

insert into seed_nutricao_20261017_input values
('Arroz branco', 'Carboidratos complexos', 128, 2.5, 28.1, 0.2,
 'REFERÊNCIA OFICIAL: arroz branco tipo 1 COZIDO, sem adição de ingredientes. Nome do cardápio preservado; não aplicar estes valores ao arroz cru.',
 'TACO/NEPA-UNICAMP, 4a ed., 2011, alimento 3, p. 26; https://nepa.unicamp.br/wp-content/uploads/sites/27/2023/10/taco_4_edicao_ampliada_e_revisada.pdf#page=29'),
('Whey protein', 'Proteínas', 352, 78.13, 6.25, 1.56,
 'REFERÊNCIA GENÉRICA OFICIAL: pó proteico à base de whey, sem diluição. ESTIMATIVA para o produto consumido: marca, sabor e tipo não informados. Substituir pela tabela do rótulo quando disponível; não representa toda marca de whey.',
 'USDA National Nutrient Database, SR27, 2014, NDB 14066 (Beverages, Protein powder whey based); https://www.ars.usda.gov/ARSUserFiles/80400525/Data/SR27/reports/sr27fg14.pdf#page=199'),
('Salada', 'Legumes', 14.5, 1.4, 2.75, 0.15,
 'ESTIMATIVA DE RECEITA: 50 g de alface lisa crua + 50 g de tomate com semente cru, sem óleo ou molho, por 100 g. Composição real não informada; ajustar se diferente. Não define o peso de uma porção à vontade.',
 'ESTIMATIVA calculada: média 50/50 dos alimentos 79 e 157 da TACO/NEPA-UNICAMP, 4a ed., 2011; https://nepa.unicamp.br/wp-content/uploads/sites/27/2023/10/taco_4_edicao_ampliada_e_revisada.pdf'),
('Salada de folhas e tomate', 'Legumes', 14.5, 1.4, 2.75, 0.15,
 'ESTIMATIVA DE RECEITA: 50 g de alface lisa crua + 50 g de tomate com semente cru, sem óleo ou molho, por 100 g. Tipo de folha e proporção reais não informados; ajustar se diferentes. Não define o peso de uma porção à vontade.',
 'ESTIMATIVA calculada: média 50/50 dos alimentos 79 e 157 da TACO/NEPA-UNICAMP, 4a ed., 2011; https://nepa.unicamp.br/wp-content/uploads/sites/27/2023/10/taco_4_edicao_ampliada_e_revisada.pdf');

-- Existente, inclusive de outra origem, sempre prevalece. Ambiguidade exige revisão.
do $check$
begin
  if exists (
    select s.item from seed_nutricao_20261017_input s
    join public.tb_saude_alimentos a on pg_temp.seed_food_key(a.item) = pg_temp.seed_food_key(s.item)
    group by s.item having count(*) > 1
  ) then
    raise exception 'Há alimentos duplicados após normalização. Revise o catálogo antes de aplicar o seed.';
  end if;
end;
$check$;

with missing as (
  select s.item,s.categoria,s.kcal,s.proteina,s.carboidrato,s.gordura,s.observacoes,s.fonte
  from seed_nutricao_20261017_input s
  where not exists (
    select 1 from public.tb_saude_alimentos a
    where pg_temp.seed_food_key(a.item) = pg_temp.seed_food_key(s.item)
  )
), ranked as (
  select m.*,row_number() over(order by item) as n from missing m
)
insert into public.tb_saude_alimentos (
  source_order,categoria,item,porcao_equivalente,peso_referencia_g,
  kcal_100g,proteina_100g,carboidrato_100g,gordura_100g,
  observacoes,fonte_nutricional,source_file
)
select (coalesce((select max(source_order) from public.tb_saude_alimentos),0)+n)::integer,
  categoria,item,'100 g',100,kcal,proteina,carboidrato,gordura,
  observacoes,fonte,'seed-alimentos-pendentes-nutricao-20261017'
from ranked;

do $sequence$
begin
  if to_regclass('public.tb_saude_alimentos_source_order_seq') is not null then
    perform setval('public.tb_saude_alimentos_source_order_seq',
      greatest((select max(source_order)+1 from public.tb_saude_alimentos),
        (select last_value from public.tb_saude_alimentos_source_order_seq)),false);
  end if;
end;
$sequence$;

-- Exibe também os preexistentes preservados e sua fonte efetiva.
select s.item as item_solicitado,a.id,a.item,a.kcal_100g,a.proteina_100g,
  a.carboidrato_100g,a.gordura_100g,a.observacoes,a.fonte_nutricional,
  case when a.source_file='seed-alimentos-pendentes-nutricao-20261017'
    then 'cadastro deste seed (inclui reaplicações)' else 'preexistente preservado' end as resultado
from seed_nutricao_20261017_input s
join public.tb_saude_alimentos a on pg_temp.seed_food_key(a.item) = pg_temp.seed_food_key(s.item)
order by s.item;
commit;
