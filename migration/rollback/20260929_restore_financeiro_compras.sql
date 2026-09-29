-- Rollback estrutural da migration 20260929_drop_financeiro_compras.sql.
-- Os dados removidos pelo DROP TABLE somente podem ser recuperados de backup.
begin;

create table if not exists public.tb_compras (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null default public.current_app_user_id()
    references auth.users(id) on delete cascade,
  descricao text not null,
  valor numeric(12,2) not null default 0,
  categoria text,
  metodo_pagamento text not null default 'a_vista',
  data_lancamento date not null default current_date
);

create index if not exists idx_tb_compras_user_id
  on public.tb_compras (user_id);
create index if not exists idx_tb_compras_user_data_lancamento
  on public.tb_compras (user_id, data_lancamento desc);
create index if not exists idx_tb_compras_user_created_at
  on public.tb_compras (user_id, created_at desc);

alter table public.tb_compras enable row level security;
alter table public.tb_compras force row level security;

drop policy if exists tb_compras_select_own_financeiro_or_admin on public.tb_compras;
drop policy if exists tb_compras_insert_own_financeiro_or_admin on public.tb_compras;
drop policy if exists tb_compras_update_own_financeiro_or_admin on public.tb_compras;
drop policy if exists tb_compras_delete_own_financeiro_or_admin on public.tb_compras;

create policy tb_compras_select_own_financeiro_or_admin
  on public.tb_compras for select to authenticated
  using (public.is_app_admin() or (public.can_access_app('financeiro') and user_id = auth.uid()));
create policy tb_compras_insert_own_financeiro_or_admin
  on public.tb_compras for insert to authenticated
  with check (public.is_app_admin() or (public.can_access_app('financeiro') and user_id = auth.uid()));
create policy tb_compras_update_own_financeiro_or_admin
  on public.tb_compras for update to authenticated
  using (public.is_app_admin() or (public.can_access_app('financeiro') and user_id = auth.uid()))
  with check (public.is_app_admin() or (public.can_access_app('financeiro') and user_id = auth.uid()));
create policy tb_compras_delete_own_financeiro_or_admin
  on public.tb_compras for delete to authenticated
  using (public.is_app_admin() or (public.can_access_app('financeiro') and user_id = auth.uid()));

revoke all on public.tb_compras from anon;
grant select, insert, update, delete on public.tb_compras to authenticated;

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

revoke all on public.vw_financeiro_compras_mensal from anon;
grant select on public.vw_financeiro_compras_mensal to authenticated, service_role;

commit;
