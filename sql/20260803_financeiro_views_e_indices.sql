-- =============================================================================
-- Fase 2: Views financeiras + índices compostos
-- Execute no SQL Editor do Supabase.
-- Rollback seguro: DROP VIEW IF EXISTS <nome> não afeta os dados das tabelas.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Índices compostos para suporte às views e às queries existentes
-- -----------------------------------------------------------------------------

-- tb_financas
create index if not exists idx_tb_financas_user_data
  on public.tb_financas (user_id, data_lancamento);

create index if not exists idx_tb_financas_user_tipo_data
  on public.tb_financas (user_id, tipo, data_lancamento);

create index if not exists idx_tb_financas_user_categoria_data
  on public.tb_financas (user_id, categoria, data_lancamento);

-- tb_despesas_fixas
create index if not exists idx_tb_despesas_fixas_user_created
  on public.tb_despesas_fixas (user_id, created_at);

create index if not exists idx_tb_despesas_fixas_user_serie_created
  on public.tb_despesas_fixas (user_id, serie_id, created_at)
  where serie_id is not null;

create index if not exists idx_tb_despesas_fixas_user_status_created
  on public.tb_despesas_fixas (user_id, status, created_at);

-- tb_poupanca
create index if not exists idx_tb_poupanca_user_data
  on public.tb_poupanca (user_id, data_lancamento);

-- tb_poupanca_metas
create index if not exists idx_tb_poupanca_metas_user_ativa
  on public.tb_poupanca_metas (user_id, ativa);

-- tb_compras
create index if not exists idx_tb_compras_user_data
  on public.tb_compras (user_id, data_lancamento);

-- -----------------------------------------------------------------------------
-- 2. vw_financeiro_resumo_mensal
-- Agrega receitas, despesas fixas e variadas por (user_id, mes_ano).
-- Substitui os cálculos de calcularDashboard no Node.
-- -----------------------------------------------------------------------------

drop view if exists public.vw_financeiro_resumo_mensal;

create view public.vw_financeiro_resumo_mensal
  with (security_invoker = true)
as
with financas_agrupadas as (
  select
    user_id,
    to_char(coalesce(data_lancamento::date, created_at::date), 'YYYY-MM') as mes_ano,
    round(sum(case when tipo = 'receita' then valor else 0 end)::numeric, 2) as receitas,
    round(sum(case when tipo = 'despesa' then valor else 0 end)::numeric, 2) as despesas_variadas
  from public.tb_financas
  group by user_id, to_char(coalesce(data_lancamento::date, created_at::date), 'YYYY-MM')
),
fixas_agrupadas as (
  select
    user_id,
    to_char(created_at, 'YYYY-MM') as mes_ano,
    round(sum(valor)::numeric, 2) as despesas_fixas,
    round(sum(case when status = 'pago'     then valor else 0 end)::numeric, 2) as fixas_pagas,
    round(sum(case when status = 'pendente' then valor else 0 end)::numeric, 2) as fixas_pendentes
  from public.tb_despesas_fixas
  group by user_id, to_char(created_at, 'YYYY-MM')
)
select
  coalesce(fa.user_id, fx.user_id) as user_id,
  coalesce(fa.mes_ano, fx.mes_ano) as mes_ano,
  coalesce(fa.receitas, 0) as receitas,
  coalesce(fa.despesas_variadas, 0) as despesas_variadas,
  coalesce(fx.despesas_fixas, 0) as despesas_fixas,
  round((coalesce(fa.receitas, 0) - coalesce(fa.despesas_variadas, 0) - coalesce(fx.despesas_fixas, 0))::numeric, 2) as saldo,
  coalesce(fx.fixas_pagas, 0) as fixas_pagas,
  coalesce(fx.fixas_pendentes, 0) as fixas_pendentes
from financas_agrupadas fa
full outer join fixas_agrupadas fx
  on fx.user_id = fa.user_id
 and fx.mes_ano = fa.mes_ano;

comment on view public.vw_financeiro_resumo_mensal is
  'Somatórios financeiros por usuário e mês. Substitui calcularDashboard no Node.js.';

revoke all on public.vw_financeiro_resumo_mensal from anon;
grant select on public.vw_financeiro_resumo_mensal to authenticated;

-- -----------------------------------------------------------------------------
-- 3. vw_financeiro_categoria_mensal
-- Agrupa gastos variados por (user_id, mes_ano, categoria) com ranking.
-- Substitui calcularGraficos no Node.
-- -----------------------------------------------------------------------------

drop view if exists public.vw_financeiro_categoria_mensal;

create view public.vw_financeiro_categoria_mensal
  with (security_invoker = true)
as
select
  f.user_id,
  to_char(coalesce(f.data_lancamento::date, f.created_at::date), 'YYYY-MM') as mes_ano,
  coalesce(nullif(trim(f.categoria), ''), 'Sem categoria')                   as categoria,
  round(sum(f.valor)::numeric, 2)                                             as valor_total,
  count(*)::int                                                               as quantidade_lancamentos,
  round(avg(f.valor)::numeric, 2)                                             as media_lancamento,
  rank() over (
    partition by
      f.user_id,
      to_char(coalesce(f.data_lancamento::date, f.created_at::date), 'YYYY-MM')
    order by sum(f.valor) desc
  )::int                                                                      as ranking_maior,
  rank() over (
    partition by
      f.user_id,
      to_char(coalesce(f.data_lancamento::date, f.created_at::date), 'YYYY-MM')
    order by sum(f.valor) asc
  )::int                                                                      as ranking_menor
from public.tb_financas f
where f.tipo = 'despesa'
group by
  f.user_id,
  to_char(coalesce(f.data_lancamento::date, f.created_at::date), 'YYYY-MM'),
  coalesce(nullif(trim(f.categoria), ''), 'Sem categoria');

comment on view public.vw_financeiro_categoria_mensal is
  'Gastos variados agrupados por categoria/mês com ranking. Substitui calcularGraficos no Node.js.';

revoke all on public.vw_financeiro_categoria_mensal from anon;
grant select on public.vw_financeiro_categoria_mensal to authenticated;

-- -----------------------------------------------------------------------------
-- 4. vw_financeiro_historico_anual
-- 12 meses do ano para o analista financeiro, com percentual comprometido e rankings.
-- Substitui calcularGraficosAnuais + loops do financeiro-analista.js.
-- -----------------------------------------------------------------------------

drop view if exists public.vw_financeiro_historico_anual;

create view public.vw_financeiro_historico_anual
  with (security_invoker = true)
as
with meses_financas as (
  select
    f.user_id,
    extract(year from coalesce(f.data_lancamento::date, f.created_at::date))::int    as ano,
    to_char(coalesce(f.data_lancamento::date, f.created_at::date), 'YYYY-MM')        as mes_ano,
    round(sum(case when f.tipo = 'receita'  then f.valor else 0 end)::numeric, 2)   as receitas,
    round(sum(case when f.tipo = 'despesa'  then f.valor else 0 end)::numeric, 2)   as despesas_variadas
  from public.tb_financas f
  group by
    f.user_id,
    extract(year from coalesce(f.data_lancamento::date, f.created_at::date)),
    to_char(coalesce(f.data_lancamento::date, f.created_at::date), 'YYYY-MM')
),
meses_fixas as (
  select
    df.user_id,
    to_char(df.created_at, 'YYYY-MM') as mes_ano,
    round(sum(df.valor)::numeric, 2)  as despesas_fixas
  from public.tb_despesas_fixas df
  group by df.user_id, to_char(df.created_at, 'YYYY-MM')
),
combined as (
  select
    mf.user_id,
    mf.ano,
    mf.mes_ano,
    mf.receitas,
    mf.despesas_variadas,
    coalesce(fx.despesas_fixas, 0)                                                              as despesas_fixas,
    round((mf.despesas_variadas + coalesce(fx.despesas_fixas, 0))::numeric, 2)                 as despesas_totais,
    round((mf.receitas - mf.despesas_variadas - coalesce(fx.despesas_fixas, 0))::numeric, 2)   as saldo,
    case
      when mf.receitas > 0
      then round(((mf.despesas_variadas + coalesce(fx.despesas_fixas, 0)) / mf.receitas * 100)::numeric, 1)
      else 0
    end                                                                                         as percentual_comprometido
  from meses_financas mf
  left join meses_fixas fx
    on fx.user_id = mf.user_id
   and fx.mes_ano = mf.mes_ano
)
select
  user_id,
  ano,
  mes_ano,
  receitas,
  despesas_fixas,
  despesas_variadas,
  despesas_totais,
  saldo,
  percentual_comprometido,
  rank() over (partition by user_id, ano order by saldo desc)         ::int as ranking_melhor_saldo,
  rank() over (partition by user_id, ano order by saldo asc)          ::int as ranking_pior_saldo,
  rank() over (partition by user_id, ano order by despesas_fixas desc)::int as ranking_maior_fixa,
  rank() over (partition by user_id, ano order by despesas_variadas desc)::int as ranking_maior_variada
from combined;

comment on view public.vw_financeiro_historico_anual is
  'Histórico mensal anual com rankings. Substitui calcularGraficosAnuais e loops do financeiro-analista.js.';

revoke all on public.vw_financeiro_historico_anual from anon;
grant select on public.vw_financeiro_historico_anual to authenticated;

-- -----------------------------------------------------------------------------
-- 5. vw_financeiro_poupanca_resumo
-- Consolida total acumulado, meta ativa e progresso por usuário.
-- -----------------------------------------------------------------------------

drop view if exists public.vw_financeiro_poupanca_resumo;

create view public.vw_financeiro_poupanca_resumo
  with (security_invoker = true)
as
with total_poupanca as (
  select
    user_id,
    round(sum(valor)::numeric, 2) as total_acumulado
  from public.tb_poupanca
  group by user_id
),
meta_ativa as (
  select distinct on (user_id)
    user_id,
    id                as meta_id,
    nome_meta,
    valor_meta,
    data_inicio
  from public.tb_poupanca_metas
  where ativa = true
  order by user_id, created_at desc
)
select
  coalesce(t.user_id, m.user_id) as user_id,
  coalesce(t.total_acumulado, 0) as total_acumulado,
  m.meta_id,
  m.nome_meta,
  m.valor_meta,
  m.data_inicio,
  case
    when m.valor_meta is null or m.valor_meta <= 0 then 0
    else least(round((coalesce(t.total_acumulado, 0) / m.valor_meta)::numeric, 4), 1)
  end as progresso,
  case
    when m.valor_meta is null or m.valor_meta <= 0                                   then 'sem_meta'
    when coalesce(t.total_acumulado, 0) >= m.valor_meta                              then 'alvo'
    when coalesce(t.total_acumulado, 0) >= m.valor_meta * 0.7                        then 'alerta'
    else                                                                                   'progresso'
  end as status_meta
from total_poupanca t
full outer join meta_ativa m
  on m.user_id = t.user_id;

comment on view public.vw_financeiro_poupanca_resumo is
  'Consolidação de poupança por usuário: total acumulado, meta ativa e progresso.';

revoke all on public.vw_financeiro_poupanca_resumo from anon;
grant select on public.vw_financeiro_poupanca_resumo to authenticated;

-- -----------------------------------------------------------------------------
-- 6. vw_financeiro_compras_mensal
-- Agrega compras por (user_id, mes_ano).
-- -----------------------------------------------------------------------------

drop view if exists public.vw_financeiro_compras_mensal;

create view public.vw_financeiro_compras_mensal
  with (security_invoker = true)
as
select
  user_id,
  to_char(coalesce(data_lancamento::date, created_at::date), 'YYYY-MM') as mes_ano,
  round(sum(valor)::numeric, 2)                                          as valor_total,
  count(*)::int                                                          as quantidade_compras,
  round(avg(valor)::numeric, 2)                                          as ticket_medio
from public.tb_compras
group by
  user_id,
  to_char(coalesce(data_lancamento::date, created_at::date), 'YYYY-MM');

comment on view public.vw_financeiro_compras_mensal is
  'Compras agregadas por usuário e mês. Substitui cálculo de comprasTotal no Node.js.';

revoke all on public.vw_financeiro_compras_mensal from anon;
grant select on public.vw_financeiro_compras_mensal to authenticated;

commit;
