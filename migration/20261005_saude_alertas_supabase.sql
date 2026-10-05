-- Supabase: agendas e registro de entrega. Executar apenas após revisão.
begin;
create table if not exists public.tb_saude_alertas_agenda (
  perfil_id bigint primary key references public.tb_saude_perfis(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  agua_ativo boolean not null default true,
  agua_intervalo_horas smallint not null default 3 check (agua_intervalo_horas between 1 and 12),
  dieta_ativa boolean not null default true,
  dieta_id bigint references public.tb_saude_dietas(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tb_saude_alertas_agenda_owner_idx on public.tb_saude_alertas_agenda(created_by, perfil_id);
alter table public.tb_saude_alertas_agenda enable row level security;
revoke all on public.tb_saude_alertas_agenda from anon;
grant select, insert, update on public.tb_saude_alertas_agenda to authenticated;
grant all on public.tb_saude_alertas_agenda to service_role;
drop policy if exists saude_alertas_own_select on public.tb_saude_alertas_agenda;
create policy saude_alertas_own_select on public.tb_saude_alertas_agenda for select to authenticated
  using (created_by = (select auth.uid()));
drop policy if exists saude_alertas_own_insert on public.tb_saude_alertas_agenda;
create policy saude_alertas_own_insert on public.tb_saude_alertas_agenda for insert to authenticated
  with check (created_by = (select auth.uid())
    and exists (select 1 from public.tb_saude_perfis p where p.id = tb_saude_alertas_agenda.perfil_id and p.created_by = (select auth.uid()))
    and (dieta_id is null or exists (select 1 from public.tb_saude_dietas d where d.id = tb_saude_alertas_agenda.dieta_id
      and d.perfil_id = tb_saude_alertas_agenda.perfil_id and d.created_by = (select auth.uid()))));
drop policy if exists saude_alertas_own_update on public.tb_saude_alertas_agenda;
create policy saude_alertas_own_update on public.tb_saude_alertas_agenda for update to authenticated
  using (created_by = (select auth.uid())) with check (created_by = (select auth.uid())
    and exists (select 1 from public.tb_saude_perfis p where p.id = tb_saude_alertas_agenda.perfil_id and p.created_by = (select auth.uid()))
    and (dieta_id is null or exists (select 1 from public.tb_saude_dietas d where d.id = tb_saude_alertas_agenda.dieta_id
      and d.perfil_id = tb_saude_alertas_agenda.perfil_id and d.created_by = (select auth.uid()))));
create table if not exists public.tb_saude_alertas_envios (
  created_by uuid not null references auth.users(id) on delete cascade,
  dedupe_key text not null check (length(dedupe_key) between 1 and 160),
  status text not null default 'sending' check (status in ('sending','sent','uncertain')),
  telegram_message_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (created_by, dedupe_key)
);
alter table public.tb_saude_alertas_envios enable row level security;
revoke all on public.tb_saude_alertas_envios from anon, authenticated;
grant all on public.tb_saude_alertas_envios to service_role;
commit;
