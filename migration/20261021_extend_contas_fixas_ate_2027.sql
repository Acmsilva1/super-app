-- Estende contas fixas com serie_id ATE dez/2027, somente para a FRENTE.
-- NAO recria historico: parte do mes seguinte ao ultimo mes ja existente da serie.
-- Piso de seguranca: nunca gera mes < 2026-01.
-- Idempotente.
--
-- ATENCAO: a versao anterior gerava desde o primeiro mes da serie (podia ir a 2017).
-- Se ja rodou a versao ruim, execute antes:
--   migration/20261021_rollback_extend_contas_fixas.sql
--
-- Preview:
--   with last_m as (
--     select
--       serie_id,
--       max(date_trunc('month', created_at at time zone 'America/Sao_Paulo')::date) as ultimo_mes
--     from public.tb_despesas_fixas
--     where conta_fixa is true
--       and serie_id is not null and btrim(serie_id) <> ''
--       and (parcela_atual is null or parcela_total is null)
--     group by serie_id
--   )
--   select serie_id, ultimo_mes,
--          (ultimo_mes + interval '1 month')::date as gera_de,
--          date '2027-12-01' as gera_ate
--   from last_m
--   where ultimo_mes < date '2027-12-01';

begin;

with templates as (
  select distinct on (serie_id)
    serie_id,
    user_id,
    descricao,
    valor,
    created_at as template_created_at
  from public.tb_despesas_fixas
  where conta_fixa is true
    and serie_id is not null
    and btrim(serie_id) <> ''
    and (parcela_atual is null or parcela_total is null)
  order by serie_id, created_at desc
),
last_month as (
  select
    serie_id,
    max(date_trunc('month', created_at at time zone 'America/Sao_Paulo')::date) as ultimo_mes
  from public.tb_despesas_fixas
  where conta_fixa is true
    and serie_id is not null
    and btrim(serie_id) <> ''
    and (parcela_atual is null or parcela_total is null)
  group by serie_id
),
series as (
  select
    t.serie_id,
    t.user_id,
    t.descricao,
    t.valor,
    t.template_created_at,
    greatest(
      (l.ultimo_mes + interval '1 month')::date,
      date '2026-01-01'
    ) as from_month
  from templates t
  join last_month l on l.serie_id = t.serie_id
  where l.ultimo_mes < date '2027-12-01'
),
slots as (
  select
    series.user_id,
    series.serie_id,
    series.descricao,
    series.valor,
    series.template_created_at,
    gs::date as mes_inicio
  from series
  cross join lateral generate_series(
    series.from_month,
    date '2027-12-01',
    interval '1 month'
  ) as gs
  where series.from_month <= date '2027-12-01'
),
existing as (
  select
    serie_id,
    date_trunc('month', created_at at time zone 'America/Sao_Paulo')::date as mes
  from public.tb_despesas_fixas
  where conta_fixa is true
    and serie_id is not null
    and btrim(serie_id) <> ''
)
insert into public.tb_despesas_fixas (
  user_id,
  descricao,
  valor,
  status,
  pendente_mes,
  conta_fixa,
  parcela_atual,
  parcela_total,
  serie_id,
  created_at
)
select
  s.user_id,
  s.descricao,
  s.valor,
  'pendente',
  false,
  true,
  null,
  null,
  s.serie_id,
  (
    make_timestamp(
      extract(year from s.mes_inicio)::int,
      extract(month from s.mes_inicio)::int,
      least(
        greatest(1, extract(day from (s.template_created_at at time zone 'America/Sao_Paulo'))::int),
        extract(day from (s.mes_inicio + interval '1 month - 1 day'))::int
      ),
      extract(hour from (s.template_created_at at time zone 'America/Sao_Paulo'))::int,
      extract(minute from (s.template_created_at at time zone 'America/Sao_Paulo'))::int,
      extract(second from (s.template_created_at at time zone 'America/Sao_Paulo'))
    ) at time zone 'America/Sao_Paulo'
  )
from slots s
where s.mes_inicio >= date '2026-01-01'
  and s.mes_inicio <= date '2027-12-01'
  and not exists (
    select 1
    from existing e
    where e.serie_id = s.serie_id
      and e.mes = s.mes_inicio
  );

commit;
