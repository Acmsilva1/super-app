-- Executar no SQL Editor do Supabase; não altera dietas nem alimentos existentes.
-- Base: 100 g da parte comestível CRUA, conforme solicitado pelo usuário.
-- Cenoura: TACO/NEPA-UNICAMP, 4ª ed., 2011, alimento 110, p. 32.
-- https://nepa.unicamp.br/wp-content/uploads/sites/27/2023/10/taco_4_edicao_ampliada_e_revisada.pdf
-- Abóbora jacaré: ESTIMATIVA por referência GENÉRICA de abóbora crua.
-- Não é composição específica da variedade jacaré; é uma base padrão aproximada.
-- TABNUT/EPM-UNIFESP, alimento 11422:
-- https://tabnut.dis.epm.br/alimento/11422/abobora-cru
-- Mantém os nomes Cenoura/Abóbora usados pelo cardápio semanal para que
-- a API e o scheduler reconheçam os itens sem exigir novo seed das dietas.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Serializa a escolha de source_order, inclusive com cadastros simultâneos.
lock table public.tb_saude_alimentos in share row exclusive mode;

create temporary table seed_alimentos_20261011_input (
  item text primary key, kcal numeric, proteina numeric,
  carboidrato numeric, gordura numeric, observacoes text, fonte text
) on commit drop;

insert into seed_alimentos_20261011_input values
('Cenoura', 34, 1.3, 7.7, 0.2,
 'Cenoura crua. Base padrão por 100 g solicitada pelo usuário; aplicação aos pesos cozidos do cardápio produz totais aproximados. Nome mantido para associação ao cardápio semanal.',
 'TACO/NEPA-UNICAMP, 4ª edição (2011), alimento 110, p. 32; https://nepa.unicamp.br/wp-content/uploads/sites/27/2023/10/taco_4_edicao_ampliada_e_revisada.pdf'),
('Abóbora', 26, 1.00, 6.50, 0.10,
 'Variedade informada: jacaré. ESTIMATIVA: referência genérica de abóbora crua (Cucurbita spp.); não é análise específica da variedade jacaré. Base padrão por 100 g solicitada pelo usuário; aplicação aos pesos cozidos do cardápio produz totais aproximados. Nome mantido para associação ao cardápio semanal.',
 'ESTIMATIVA para jacaré: TABNUT/EPM-UNIFESP, abóbora crua genérica, alimento 11422; https://tabnut.dis.epm.br/alimento/11422/abobora-cru');

-- Não substituir silenciosamente um cadastro anterior com outro preparo.
do $check$
begin
  if exists (
    select 1 from public.tb_saude_alimentos a
    join seed_alimentos_20261011_input s on lower(trim(a.item)) = lower(s.item)
    where a.source_file <> 'seed-cenoura-abobora-jacare-20261011'
      or row(a.kcal_100g,a.proteina_100g,a.carboidrato_100g,a.gordura_100g,
             a.peso_referencia_g,a.porcao_equivalente,a.observacoes,a.fonte_nutricional)
         is distinct from row(s.kcal,s.proteina,s.carboidrato,s.gordura,
                              100::numeric,'100 g (cru)'::text,s.observacoes,s.fonte)
  ) then
    raise exception 'Cenoura ou Abóbora já possui cadastro diferente. Nenhum registro foi alterado; confira a referência existente antes de aplicar o seed.';
  end if;
end;
$check$;

with missing as (
  select s.* from seed_alimentos_20261011_input s
  where not exists (select 1 from public.tb_saude_alimentos a
                    where lower(trim(a.item)) = lower(s.item))
), ranked as (
  select m.*, row_number() over(order by item) as n from missing m
)
insert into public.tb_saude_alimentos (
  source_order,categoria,item,porcao_equivalente,peso_referencia_g,
  kcal_100g,proteina_100g,carboidrato_100g,gordura_100g,
  observacoes,fonte_nutricional,source_file
)
select (coalesce((select max(source_order) from public.tb_saude_alimentos),0)+n)::integer,
       'Legumes',item,'100 g (cru)',100,kcal,proteina,carboidrato,gordura,
       observacoes,fonte,'seed-cenoura-abobora-jacare-20261011'
from ranked;

-- Mantém a sequência usada pelo cadastro da API acima dos valores inseridos.
do $sequence$
begin
  if to_regclass('public.tb_saude_alimentos_source_order_seq') is not null then
    perform setval('public.tb_saude_alimentos_source_order_seq',
      greatest((select max(source_order)+1 from public.tb_saude_alimentos),
               (select last_value from public.tb_saude_alimentos_source_order_seq)),false);
  end if;
end;
$sequence$;

select id,item,kcal_100g,proteina_100g,carboidrato_100g,gordura_100g,
       observacoes,fonte_nutricional
from public.tb_saude_alimentos
where source_file = 'seed-cenoura-abobora-jacare-20261011'
order by item;
commit;
