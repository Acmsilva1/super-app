-- Aplicação manual no SQL Editor, após tb_saude_alimentos.
-- Somente catálogo: não altera dietas, perfis nem agendas.
-- Referências consultadas em 27/11/2026; valores por 100 g/ml comestíveis.
-- Iogurte light ≈ iogurte natural desnatado TACO nº 449.
-- Carne de boi ≈ patinho sem gordura grelhado TACO nº 377.
-- Legumes: média simples de abobrinha/brócolis/chuchu/couve-flor cozidos (TACO).
-- PDF TACO 4ª ed.: https://nepa.unicamp.br/wp-content/uploads/sites/27/2023/10/taco_4_edicao_ampliada_e_revisada.pdf
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table public.tb_saude_alimentos in share row exclusive mode;

create or replace function pg_temp.seed_food_key(value text)
returns text language sql immutable strict as $$
  select trim(regexp_replace(translate(lower(value),
    'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'), '[^a-z0-9]+', ' ', 'g'));
$$;

create temporary table seed_nutricao_20261127_input (
  item text primary key, categoria text not null, kcal numeric not null,
  proteina numeric not null, carboidrato numeric not null, gordura numeric not null,
  porcao text not null, observacoes text not null, fonte text not null
) on commit drop;

insert into seed_nutricao_20261127_input values
('Iogurte light', 'Leite e derivados', 41, 3.8, 5.8, 0.3, '100 ml',
 'REFERÊNCIA OFICIAL: iogurte natural desnatado (TACO 449). Nome do cardápio: Iogurte light. Densidade aproximada 1 g/ml; 170 ml ≈ 170 g. Marca/sabor não informados — ajustar pelo rótulo se diferente.',
 'TACO/NEPA-UNICAMP, 4a ed., 2011, alimento 449 (iogurte natural desnatado); https://nepa.unicamp.br/wp-content/uploads/sites/27/2023/10/taco_4_edicao_ampliada_e_revisada.pdf'),
('Carne bovina patinho grelhado', 'Proteínas', 219, 35.9, 0, 7.3, '100 g',
 'REFERÊNCIA OFICIAL: carne bovina, patinho, sem gordura, grelhado (TACO 377). Nome do cardápio: Carne de boi. Corte/preparo específicos podem variar.',
 'TACO/NEPA-UNICAMP, 4a ed., 2011, alimento 377; https://nepa.unicamp.br/wp-content/uploads/sites/27/2023/10/taco_4_edicao_ampliada_e_revisada.pdf'),
('Legumes', 'Legumes', 20, 1.2, 4.0, 0.3, '100 g',
 'ESTIMATIVA: média simples de abobrinha italiana, brócolis, chuchu e couve-flor cozidos (TACO). Composição real depende da mistura usada no prato; ajustar no app se necessário.',
 'ESTIMATIVA calculada: TACO/NEPA-UNICAMP, 4a ed., 2011 (abobrinha italiana cozida, brócolis cozido, chuchu cozido, couve-flor cozida); https://nepa.unicamp.br/wp-content/uploads/sites/27/2023/10/taco_4_edicao_ampliada_e_revisada.pdf');

do $check$
begin
  if exists (
    select s.item from seed_nutricao_20261127_input s
    join public.tb_saude_alimentos a on pg_temp.seed_food_key(a.item) = pg_temp.seed_food_key(s.item)
    group by s.item having count(*) > 1
  ) then
    raise exception 'Há alimentos duplicados após normalização. Revise o catálogo antes de aplicar o seed.';
  end if;
end;
$check$;

with missing as (
  select s.* from seed_nutricao_20261127_input s
  where not exists (
    select 1 from public.tb_saude_alimentos a
    where pg_temp.seed_food_key(a.item) = pg_temp.seed_food_key(s.item)
  )
), ranked as (
  select m.*, row_number() over(order by item) as n from missing m
)
insert into public.tb_saude_alimentos (
  source_order, categoria, item, porcao_equivalente, peso_referencia_g,
  kcal_100g, proteina_100g, carboidrato_100g, gordura_100g,
  observacoes, fonte_nutricional, source_file
)
select (coalesce((select max(source_order) from public.tb_saude_alimentos), 0) + n)::integer,
  categoria, item, porcao, 100, kcal, proteina, carboidrato, gordura,
  observacoes, fonte, 'seed-alimentos-iogurte-carne-legumes-20261127'
from ranked;

do $sequence$
begin
  if to_regclass('public.tb_saude_alimentos_source_order_seq') is not null then
    perform setval('public.tb_saude_alimentos_source_order_seq',
      greatest((select max(source_order)+1 from public.tb_saude_alimentos),
        (select last_value from public.tb_saude_alimentos_source_order_seq)), false);
  end if;
end;
$sequence$;

select s.item as item_solicitado, a.id, a.item, a.kcal_100g, a.proteina_100g,
  a.carboidrato_100g, a.gordura_100g, a.fonte_nutricional,
  case when a.source_file = 'seed-alimentos-iogurte-carne-legumes-20261127'
    then 'cadastro deste seed' else 'preexistente preservado' end as resultado
from seed_nutricao_20261127_input s
join public.tb_saude_alimentos a on pg_temp.seed_food_key(a.item) = pg_temp.seed_food_key(s.item)
order by s.item;
commit;
