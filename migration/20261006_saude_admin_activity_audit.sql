-- Registro imutavel de criacoes, alteracoes e exclusoes nos dados pessoais de Saude.
-- Captura retroativa: somente eventos ocorridos apos esta migration.
begin;

create table if not exists public.tb_saude_admin_activity (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null,
  owner_user_id uuid not null,
  table_name text not null,
  entity_id text,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  occurred_at timestamptz not null default clock_timestamp(),
  old_data jsonb,
  new_data jsonb
);

create index if not exists tb_saude_admin_activity_owner_time_idx
  on public.tb_saude_admin_activity (owner_user_id, occurred_at desc, id desc);

alter table public.tb_saude_alertas_envios add column if not exists last_error text;
create table if not exists public.tb_saude_alertas_runs (
  id bigint generated always as identity primary key,
  status text not null check (status in ('running', 'processed', 'skipped', 'failed')),
  error_code text,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists tb_saude_alertas_runs_created_idx
  on public.tb_saude_alertas_runs (created_at desc, id desc);
alter table public.tb_saude_alertas_runs enable row level security;
revoke all on public.tb_saude_alertas_runs from anon, authenticated;
grant all on public.tb_saude_alertas_runs to service_role;
grant usage, select on sequence public.tb_saude_alertas_runs_id_seq,
  public.tb_saude_admin_activity_id_seq to service_role;

alter table public.tb_saude_admin_activity enable row level security;
revoke all on public.tb_saude_admin_activity from anon, authenticated;
grant all on public.tb_saude_admin_activity to service_role;

create or replace function public.capture_saude_admin_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_row jsonb;
  new_row jsonb;
  owner_id uuid;
  row_id text;
begin
  old_row := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_row := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;

  if tg_op = 'UPDATE' and old_row is not distinct from new_row then
    return new;
  end if;

  owner_id := coalesce(
    nullif(new_row ->> 'created_by', '')::uuid,
    nullif(old_row ->> 'created_by', '')::uuid
  );
  if owner_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  row_id := coalesce(new_row ->> 'id', old_row ->> 'id', new_row ->> 'perfil_id', old_row ->> 'perfil_id', owner_id::text);
  insert into public.tb_saude_admin_activity (
    actor_user_id, owner_user_id, table_name, entity_id, operation, old_data, new_data
  ) values (
    owner_id, owner_id, tg_table_name, row_id, tg_op, old_row, new_row
  );
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.capture_saude_admin_activity() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tb_saude_perfis',
    'tb_saude_perfil_medidas',
    'tb_saude_dietas',
    'tb_saude_agua_perfis',
    'tb_saude_agua_metas',
    'tb_saude_agua_logs',
    'tb_saude_alertas_agenda'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('drop trigger if exists capture_admin_activity on public.%I', table_name);
      execute format(
        'create trigger capture_admin_activity after insert or update or delete on public.%I for each row execute function public.capture_saude_admin_activity()',
        table_name
      );
    end if;
  end loop;
end;
$$;

comment on table public.tb_saude_admin_activity is
  'Historico restrito ao servidor de criacoes, alteracoes e exclusoes de dados do modulo Saude.';
comment on table public.tb_saude_alertas_runs is
  'Execucoes autenticadas do agendador de alertas, sem payload de saude ou segredos.';
commit;
