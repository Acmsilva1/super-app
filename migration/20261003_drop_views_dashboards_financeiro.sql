-- Remove as views do modulo Dashboards do Financeiro, sem consumidor no app desde 2026-10-03.
-- Nao apaga dados: views nao armazenam registros. As tabelas tb_financas, tb_despesas_fixas,
-- tb_poupanca e tb_poupanca_metas (incluindo a coluna categoria) permanecem intactas.
--
-- As definicoes nao estao versionadas no repositorio; antes do DROP elas sao copiadas para
-- public.bkp_views_dashboards_20261003, usada pelo rollback
-- migration/rollback/20261003_restore_views_dashboards_financeiro.sql.
--
-- DROP sem CASCADE: se algum objeto depender dessas views, a transacao inteira falha e nada muda.
begin;

create table if not exists public.bkp_views_dashboards_20261003 (
  view_name text primary key,
  definition text not null,
  reloptions text[],
  saved_at timestamptz not null default now()
);

alter table public.bkp_views_dashboards_20261003 enable row level security;
alter table public.bkp_views_dashboards_20261003 force row level security;
revoke all on public.bkp_views_dashboards_20261003 from anon, authenticated;

insert into public.bkp_views_dashboards_20261003 (view_name, definition, reloptions)
select c.relname, pg_get_viewdef(c.oid, true), c.reloptions
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'v'
  and c.relname in (
    'vw_financeiro_categoria_mensal',
    'vw_financeiro_categoria_anual',
    'vw_financeiro_historico_anual'
  )
on conflict (view_name) do update
  set definition = excluded.definition,
      reloptions = excluded.reloptions,
      saved_at = now();

drop view if exists public.vw_financeiro_categoria_mensal;
drop view if exists public.vw_financeiro_categoria_anual;
drop view if exists public.vw_financeiro_historico_anual;

commit;
