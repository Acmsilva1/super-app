-- RLS + permissoes por modulo para beta do SUPERAPP.
-- Rode este arquivo no SQL Editor do Supabase.
-- Owner/admin acessa todos os modulos; usuarios comuns autenticados acessam apenas Financeiro.
-- Dados financeiros ficam isolados por user_id. Dados atuais sao vinculados ao owner configurado abaixo.

begin;

-- 0) Configuracao do dono do app.
-- Este UUID precisa existir em auth.users.id.
create or replace function public.app_owner_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select 'f88a6351-317d-425b-afcd-9430c8a34f53'::uuid;
$$;

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.uid(), public.app_owner_user_id());
$$;

do $$
begin
  if public.app_owner_user_id()::text = '00000000-0000-0000-0000-000000000000' then
    raise exception 'Configure public.app_owner_user_id() com o UUID real do owner antes de executar.';
  end if;

  if not exists (select 1 from auth.users where id = public.app_owner_user_id()) then
    raise exception 'O UUID % nao existe em auth.users. Crie/login o usuario owner antes de executar.', public.app_owner_user_id();
  end if;
end $$;

-- 1) Catalogo de modulos e controle de acesso.
create table if not exists public.app_modules (
  app_id text primary key,
  label text not null,
  beta_default boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.app_modules (app_id, label, beta_default)
values
  ('financeiro', 'Financeiro', true),
  ('lista_compras', 'Lista de compras', false),
  ('fluxograma', 'Fluxograma', false),
  ('missoes_treino', 'Missoes de treino', false),
  ('calendario', 'Calendario', false),
  ('admin', 'Administracao', false)
on conflict (app_id) do update
  set label = excluded.label,
      beta_default = excluded.beta_default;

create table if not exists public.app_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'beta_financeiro',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_user_roles_role_check check (role in ('owner', 'admin', 'beta_financeiro', 'user'))
);

create table if not exists public.app_user_permissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  app_id text not null references public.app_modules(app_id) on delete cascade,
  can_access boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, app_id)
);

create table if not exists public.app_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_user_roles_touch_updated_at on public.app_user_roles;
create trigger app_user_roles_touch_updated_at
  before update on public.app_user_roles
  for each row execute function public.touch_updated_at();

drop trigger if exists app_user_permissions_touch_updated_at on public.app_user_permissions;
create trigger app_user_permissions_touch_updated_at
  before update on public.app_user_permissions
  for each row execute function public.touch_updated_at();

drop trigger if exists app_user_profiles_touch_updated_at on public.app_user_profiles;
create trigger app_user_profiles_touch_updated_at
  before update on public.app_user_profiles
  for each row execute function public.touch_updated_at();

-- 2) Funcoes de autorizacao usadas pelas policies.
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_user_roles r
    where r.user_id = auth.uid()
      and r.role in ('owner', 'admin')
  );
$$;

create or replace function public.can_access_app(target_app_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_admin()
    or exists (
      select 1
      from public.app_user_permissions p
      where p.user_id = auth.uid()
        and p.app_id = target_app_id
        and p.can_access = true
    );
$$;

revoke all on function public.app_owner_user_id() from public;
revoke all on function public.current_app_user_id() from public;
revoke all on function public.is_app_admin() from public;
revoke all on function public.can_access_app(text) from public;
grant execute on function public.app_owner_user_id() to authenticated, service_role;
grant execute on function public.current_app_user_id() to authenticated, service_role;
grant execute on function public.is_app_admin() to authenticated, service_role;
grant execute on function public.can_access_app(text) to authenticated, service_role;

-- 3) Usuarios existentes e novos usuarios.
insert into public.app_user_roles (user_id, role)
select id, 'beta_financeiro'
from auth.users
on conflict (user_id) do nothing;

insert into public.app_user_permissions (user_id, app_id, can_access)
select u.id, 'financeiro', true
from auth.users u
on conflict (user_id, app_id) do update
  set can_access = true;

insert into public.app_user_profiles (user_id, nome, email)
select
  u.id,
  nullif(coalesce(u.raw_user_meta_data ->> 'name', u.raw_user_meta_data ->> 'nome', split_part(u.email, '@', 1)), ''),
  u.email
from auth.users u
on conflict (user_id) do update
  set email = excluded.email;

insert into public.app_user_roles (user_id, role)
values (public.app_owner_user_id(), 'owner')
on conflict (user_id) do update
  set role = 'owner';

insert into public.app_user_permissions (user_id, app_id, can_access)
select public.app_owner_user_id(), app_id, true
from public.app_modules
on conflict (user_id, app_id) do update
  set can_access = true;

create or replace function public.handle_new_app_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_user_roles (user_id, role)
  values (new.id, 'beta_financeiro')
  on conflict (user_id) do nothing;

  insert into public.app_user_permissions (user_id, app_id, can_access)
  select new.id, app_id, true
  from public.app_modules
  where beta_default = true
  on conflict (user_id, app_id) do update
    set can_access = excluded.can_access;

  insert into public.app_user_profiles (user_id, nome, email)
  values (
    new.id,
    nullif(coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)), ''),
    new.email
  )
  on conflict (user_id) do update
    set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_app_permissions on auth.users;
create trigger on_auth_user_created_app_permissions
  after insert on auth.users
  for each row execute function public.handle_new_app_user();

-- 4) Policies das tabelas de controle.
alter table public.app_modules enable row level security;
alter table public.app_user_roles enable row level security;
alter table public.app_user_permissions enable row level security;
alter table public.app_user_profiles enable row level security;

alter table public.app_modules force row level security;
alter table public.app_user_roles force row level security;
alter table public.app_user_permissions force row level security;
alter table public.app_user_profiles force row level security;

revoke all on public.app_modules from anon;
revoke all on public.app_user_roles from anon;
revoke all on public.app_user_permissions from anon;
revoke all on public.app_user_profiles from anon;
grant select on public.app_modules to authenticated;
grant select on public.app_user_roles to authenticated;
grant select on public.app_user_permissions to authenticated;
grant select on public.app_user_profiles to authenticated;
grant insert, update, delete on public.app_modules to authenticated;
grant insert, update, delete on public.app_user_roles to authenticated;
grant insert, update, delete on public.app_user_permissions to authenticated;
grant insert, update, delete on public.app_user_profiles to authenticated;

do $$
declare
  p record;
  tables text[] := array['app_modules', 'app_user_roles', 'app_user_permissions', 'app_user_profiles'];
  t text;
begin
  foreach t in array tables loop
    for p in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

create policy app_modules_read_authenticated
  on public.app_modules
  for select
  to authenticated
  using (true);

create policy app_modules_admin_write
  on public.app_modules
  for all
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

create policy app_user_roles_select_own_or_admin
  on public.app_user_roles
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_app_admin());

create policy app_user_roles_admin_write
  on public.app_user_roles
  for all
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

create policy app_user_permissions_select_own_or_admin
  on public.app_user_permissions
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_app_admin());

create policy app_user_permissions_admin_write
  on public.app_user_permissions
  for all
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

create policy app_user_profiles_select_own_or_admin
  on public.app_user_profiles
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_app_admin());

create policy app_user_profiles_insert_own_or_admin
  on public.app_user_profiles
  for insert
  to authenticated
  with check (user_id = auth.uid() or public.is_app_admin());

create policy app_user_profiles_update_own_or_admin
  on public.app_user_profiles
  for update
  to authenticated
  using (user_id = auth.uid() or public.is_app_admin())
  with check (user_id = auth.uid() or public.is_app_admin());

-- 5) Financeiro: user_id obrigatorio, RLS por dono do dado e permissao do modulo.
do $$
declare
  p record;
  t text;
  finance_tables text[] := array[
    'tb_financas',
    'tb_despesas_fixas',
    'tb_poupanca',
    'tb_poupanca_metas',
    'tb_compras',
    'tb_financeiro_analises',
    'tb_financeiro_features_mensais',
    'tb_financeiro_analise_runs',
    'tb_financeiro_modelo_estado'
  ];
begin
  foreach t in array finance_tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tabela public.% nao existe, pulando.', t;
      continue;
    end if;

    execute format('alter table public.%I add column if not exists user_id uuid references auth.users(id) on delete cascade', t);
    execute format('alter table public.%I alter column user_id set default public.current_app_user_id()', t);
    execute format('update public.%I set user_id = public.app_owner_user_id() where user_id is null', t);
    execute format('alter table public.%I alter column user_id set not null', t);
    execute format('create index if not exists %I on public.%I (user_id)', 'idx_' || t || '_user_id', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    for p in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_app_admin() or (public.can_access_app(''financeiro'') and user_id = auth.uid()))',
      t || '_select_own_financeiro_or_admin', t
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_app_admin() or (public.can_access_app(''financeiro'') and user_id = auth.uid()))',
      t || '_insert_own_financeiro_or_admin', t
    );

    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_app_admin() or (public.can_access_app(''financeiro'') and user_id = auth.uid())) with check (public.is_app_admin() or (public.can_access_app(''financeiro'') and user_id = auth.uid()))',
      t || '_update_own_financeiro_or_admin', t
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_app_admin() or (public.can_access_app(''financeiro'') and user_id = auth.uid()))',
      t || '_delete_own_financeiro_or_admin', t
    );
  end loop;
end $$;

-- 6) Demais modulos: RLS ativo e acesso somente para owner/admin.
do $$
declare
  p record;
  t text;
  locked_tables text[] := array[
    'tb_lista_compras',
    'tb_fluxograma_projetos',
    'tb_missoes_treino',
    'tb_missoes_treino_itens',
    'tb_missoes_treino_chamas',
    'tb_calendario',
    'system_analysis_logs'
  ];
begin
  foreach t in array locked_tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tabela public.% nao existe, pulando.', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);

    for p in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;

    execute format(
      'create policy %I on public.%I for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin())',
      t || '_admin_only', t
    );
  end loop;
end $$;

-- 7) Sequences usadas por tabelas com bigserial/identity.
grant usage, select on all sequences in schema public to authenticated;
revoke all on all sequences in schema public from anon;

-- 8) View financeira: tenta fazer a view obedecer RLS das tabelas base.
do $$
begin
  if to_regclass('public.vw_financeiro_ultimos_5_meses') is not null then
    begin
      alter view public.vw_financeiro_ultimos_5_meses set (security_invoker = true);
    exception when others then
      raise notice 'Nao foi possivel aplicar security_invoker na view vw_financeiro_ultimos_5_meses: %', sqlerrm;
    end;

    revoke all on public.vw_financeiro_ultimos_5_meses from anon;
    grant select on public.vw_financeiro_ultimos_5_meses to authenticated;
  end if;
end $$;

commit;