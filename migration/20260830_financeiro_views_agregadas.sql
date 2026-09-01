-- Views agregadas do modulo financeiro.
-- Objetivo: manter somatorios e rankings no PostgreSQL, reduzindo calculo repetido nas APIs.

begin;

drop view if exists public.vw_financeiro_historico_anual;
drop view if exists public.vw_financeiro_resumo_mensal;
drop view if exists public.vw_financeiro_categoria_anual;
drop view if exists public.vw_financeiro_categoria_mensal;
drop view if exists public.vw_financeiro_poupanca_resumo;
drop view if exists public.vw_financeiro_compras_mensal;

create index if not exists idx_tb_financas_user_data_lancamento
  on public.tb_financas (user_id, data_lancamento desc);

create index if not exists idx_tb_financas_user_created_at
  on public.tb_financas (user_id, created_at desc);

create index if not exists idx_tb_despesas_fixas_user_created_at
  on public.tb_despesas_fixas (user_id, created_at desc);

create index if not exists idx_tb_poupanca_user_data_lancamento
  on public.tb_poupanca (user_id, data_lancamento desc);

create index if not exists idx_tb_poupanca_user_created_at
  on public.tb_poupanca (user_id, created_at desc);

create index if not exists idx_tb_poupanca_metas_user_ativa_created_at
  on public.tb_poupanca_metas (user_id, ativa, created_at desc);

create index if not exists idx_tb_compras_user_data_lancamento
  on public.tb_compras (user_id, data_lancamento desc);

create index if not exists idx_tb_compras_user_created_at
  on public.tb_compras (user_id, created_at desc);

create or replace view public.vw_financeiro_resumo_mensal
with (security_invoker = true)
as
with movimentos as (
  select
    user_id,
    to_char(coalesce(data_lancamento, (created_at at time zone 'America/Sao_Paulo')::date), 'YYYY-MM') as mes_ano,
    sum(case when lower(coalesce(tipo, '')) = 'receita' then valor else 0 end)::numeric(12,2) as receitas,
    sum(case when lower(coalesce(tipo, '')) = 'receita' then 0 else valor end)::numeric(12,2) as despesas_variadas,
    0::numeric(12,2) as despesas_fixas,
    0::numeric(12,2) as fixas_pagas,
    0::numeric(12,2) as fixas_pendentes
  from public.tb_financas
  group by user_id, to_char(coalesce(data_lancamento, (created_at at time zone 'America/Sao_Paulo')::date), 'YYYY-MM')

  union all

  select
    user_id,
    to_char(created_at at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes_ano,
    0::numeric(12,2) as receitas,
    0::numeric(12,2) as despesas_variadas,
    sum(valor)::numeric(12,2) as despesas_fixas,
    sum(case when lower(coalesce(status, '')) = 'pago' then valor else 0 end)::numeric(12,2) as fixas_pagas,
    sum(case when lower(coalesce(status, '')) = 'pago' then 0 else valor end)::numeric(12,2) as fixas_pendentes
  from public.tb_despesas_fixas
  group by user_id, to_char(created_at at time zone 'America/Sao_Paulo', 'YYYY-MM')
)
select
  user_id,
  mes_ano,
  sum(receitas)::numeric(12,2) as receitas,
  sum(despesas_variadas)::numeric(12,2) as despesas_variadas,
  sum(despesas_fixas)::numeric(12,2) as despesas_fixas,
  (sum(receitas) - sum(despesas_variadas) - sum(despesas_fixas))::numeric(12,2) as saldo,
  sum(fixas_pagas)::numeric(12,2) as fixas_pagas,
  sum(fixas_pendentes)::numeric(12,2) as fixas_pendentes
from movimentos
group by user_id, mes_ano;

create or replace view public.vw_financeiro_categoria_mensal
with (security_invoker = true)
as
with base as (
  select
    user_id,
    to_char(coalesce(data_lancamento, (created_at at time zone 'America/Sao_Paulo')::date), 'YYYY-MM') as mes_ano,
    coalesce(nullif(trim(categoria), ''), 'Sem categoria') as categoria,
    valor
  from public.tb_financas
  where lower(coalesce(tipo, '')) <> 'receita'
),
agregado as (
  select
    user_id,
    mes_ano,
    categoria,
    sum(valor)::numeric(12,2) as valor_total,
    count(*)::integer as quantidade_lancamentos,
    avg(valor)::numeric(12,2) as media_lancamento
  from base
  group by user_id, mes_ano, categoria
)
select
  *,
  row_number() over (partition by user_id, mes_ano order by valor_total desc, categoria asc)::integer as ranking_maior,
  row_number() over (partition by user_id, mes_ano order by valor_total asc, categoria asc)::integer as ranking_menor
from agregado;

create or replace view public.vw_financeiro_categoria_anual
with (security_invoker = true)
as
with base as (
  select
    user_id,
    extract(year from coalesce(data_lancamento, (created_at at time zone 'America/Sao_Paulo')::date))::integer as ano,
    coalesce(nullif(trim(categoria), ''), 'Sem categoria') as categoria,
    valor
  from public.tb_financas
  where lower(coalesce(tipo, '')) <> 'receita'
),
agregado as (
  select
    user_id,
    ano,
    categoria,
    sum(valor)::numeric(12,2) as valor_total,
    count(*)::integer as quantidade_lancamentos,
    avg(valor)::numeric(12,2) as media_lancamento
  from base
  group by user_id, ano, categoria
)
select
  *,
  row_number() over (partition by user_id, ano order by valor_total desc, categoria asc)::integer as ranking_maior,
  row_number() over (partition by user_id, ano order by valor_total asc, categoria asc)::integer as ranking_menor
from agregado;

create or replace view public.vw_financeiro_historico_anual
with (security_invoker = true)
as
select
  user_id,
  extract(year from to_date(mes_ano || '-01', 'YYYY-MM-DD'))::integer as ano,
  mes_ano,
  receitas,
  despesas_fixas,
  despesas_variadas,
  (despesas_fixas + despesas_variadas)::numeric(12,2) as despesas_totais,
  saldo
from public.vw_financeiro_resumo_mensal;

create or replace view public.vw_financeiro_poupanca_resumo
with (security_invoker = true)
as
with total as (
  select
    user_id,
    coalesce(sum(valor), 0)::numeric(12,2) as total_acumulado
  from public.tb_poupanca
  group by user_id
),
meta as (
  select distinct on (m.user_id)
    m.user_id,
    id as meta_id,
    nome_meta,
    valor_meta,
    data_inicio,
    case
      when valor_meta > 0 then least(coalesce(total.total_acumulado, 0) / valor_meta, 1)
      else 0
    end::numeric(12,4) as progresso,
    case
      when valor_meta > 0 and coalesce(total.total_acumulado, 0) >= valor_meta then 'concluida'
      else 'em_execucao'
    end as status_meta
  from public.tb_poupanca_metas m
  left join total on total.user_id = m.user_id
  where m.ativa = true
  order by m.user_id, m.created_at desc
)
select
  coalesce(total.user_id, meta.user_id) as user_id,
  coalesce(total.total_acumulado, 0)::numeric(12,2) as total_acumulado,
  meta.meta_id,
  meta.nome_meta,
  meta.valor_meta,
  meta.data_inicio,
  coalesce(meta.progresso, 0)::numeric(12,4) as progresso,
  coalesce(meta.status_meta, 'sem_meta') as status_meta
from total
full join meta on meta.user_id = total.user_id;

create or replace view public.vw_financeiro_compras_mensal
with (security_invoker = true)
as
select
  user_id,
  to_char(coalesce(data_lancamento, (created_at at time zone 'America/Sao_Paulo')::date), 'YYYY-MM') as mes_ano,
  sum(valor)::numeric(12,2) as valor_total,
  count(*)::integer as quantidade_compras,
  avg(valor)::numeric(12,2) as ticket_medio
from public.tb_compras
group by user_id, to_char(coalesce(data_lancamento, (created_at at time zone 'America/Sao_Paulo')::date), 'YYYY-MM');

revoke all on public.vw_financeiro_resumo_mensal from anon;
revoke all on public.vw_financeiro_categoria_mensal from anon;
revoke all on public.vw_financeiro_categoria_anual from anon;
revoke all on public.vw_financeiro_historico_anual from anon;
revoke all on public.vw_financeiro_poupanca_resumo from anon;
revoke all on public.vw_financeiro_compras_mensal from anon;

grant select on public.vw_financeiro_resumo_mensal to authenticated, service_role;
grant select on public.vw_financeiro_categoria_mensal to authenticated, service_role;
grant select on public.vw_financeiro_categoria_anual to authenticated, service_role;
grant select on public.vw_financeiro_historico_anual to authenticated, service_role;
grant select on public.vw_financeiro_poupanca_resumo to authenticated, service_role;
grant select on public.vw_financeiro_compras_mensal to authenticated, service_role;

commit;
