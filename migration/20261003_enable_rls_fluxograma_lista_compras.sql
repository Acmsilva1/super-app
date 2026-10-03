-- Libera Lista de Compras e Fluxograma por permissao individual com isolamento por usuario.
-- Requer migration/20260718_enable_rls_user_permissions.sql aplicada.
-- Execute apos migration/20261003_restrict_admin_to_andre.sql para garantir o admin exclusivo do owner.
-- Registros sem proprietario sao atribuidos ao owner do Super App.
-- Atualiza o nome de exibicao da conta informada pelo administrador.

begin;

do $$
begin
  if to_regclass('public.tb_lista_compras') is null then
    raise exception 'Tabela public.tb_lista_compras nao existe.';
  end if;
  if to_regclass('public.tb_fluxograma_projetos') is null then
    raise exception 'Tabela public.tb_fluxograma_projetos nao existe.';
  end if;
  if not exists (select 1 from auth.users where id = public.app_owner_user_id()) then
    raise exception 'O owner configurado em public.app_owner_user_id() nao existe em auth.users.';
  end if;
end $$;

alter table public.tb_lista_compras add column if not exists user_id uuid;
alter table public.tb_fluxograma_projetos add column if not exists user_id uuid;

-- Preserva proprietarios existentes e atribui registros legados sem user_id ao owner.
update public.tb_lista_compras
set user_id = public.app_owner_user_id()
where user_id is null;
update public.tb_fluxograma_projetos
set user_id = public.app_owner_user_id()
where user_id is null;

-- Garante FK para auth.users sem duplicar FK existente nessa coluna.
do $$
declare
  target record;
  column_number smallint;
begin
  for target in
    select * from (values
      ('tb_lista_compras', 'tb_lista_compras_user_id_auth_users_fkey'),
      ('tb_fluxograma_projetos', 'tb_fluxograma_projetos_user_id_auth_users_fkey')
    ) as tables(table_name, constraint_name)
  loop
    select attnum into column_number
    from pg_attribute
    where attrelid = to_regclass(format('public.%I', target.table_name))
      and attname = 'user_id'
      and not attisdropped;

    if not exists (
      select 1
      from pg_constraint c
      where c.conrelid = to_regclass(format('public.%I', target.table_name))
        and c.contype = 'f'
        and c.confrelid = 'auth.users'::regclass
        and c.conkey = array[column_number]::smallint[]
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (user_id) references auth.users(id) on delete cascade',
        target.table_name,
        target.constraint_name
      );
    end if;
  end loop;
end $$;

alter table public.tb_lista_compras
  alter column user_id set default public.current_app_user_id(),
  alter column user_id set not null;
alter table public.tb_fluxograma_projetos
  alter column user_id set default public.current_app_user_id(),
  alter column user_id set not null;

create index if not exists idx_tb_lista_compras_user_id
  on public.tb_lista_compras(user_id);
create index if not exists idx_tb_fluxograma_projetos_user_id
  on public.tb_fluxograma_projetos(user_id);

-- Remove politicas antigas dessas tabelas para evitar regras permissivas em OR com as novas.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('tb_lista_compras', 'tb_fluxograma_projetos')
  loop
    execute format('drop policy %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end $$;

alter table public.tb_lista_compras enable row level security;
alter table public.tb_lista_compras force row level security;
alter table public.tb_fluxograma_projetos enable row level security;
alter table public.tb_fluxograma_projetos force row level security;

revoke all on public.tb_lista_compras from anon, public;
revoke all on public.tb_fluxograma_projetos from anon, public;
grant select, insert, update, delete on public.tb_lista_compras to authenticated;
grant select, insert, update, delete on public.tb_fluxograma_projetos to authenticated;

create policy tb_lista_compras_select_permitted_owner_or_admin
  on public.tb_lista_compras for select to authenticated
  using (public.is_app_admin() or (public.can_access_app('lista_compras') and user_id = auth.uid()));
create policy tb_lista_compras_insert_permitted_owner_or_admin
  on public.tb_lista_compras for insert to authenticated
  with check (public.is_app_admin() or (public.can_access_app('lista_compras') and user_id = auth.uid()));
create policy tb_lista_compras_update_permitted_owner_or_admin
  on public.tb_lista_compras for update to authenticated
  using (public.is_app_admin() or (public.can_access_app('lista_compras') and user_id = auth.uid()))
  with check (public.is_app_admin() or (public.can_access_app('lista_compras') and user_id = auth.uid()));
create policy tb_lista_compras_delete_permitted_owner_or_admin
  on public.tb_lista_compras for delete to authenticated
  using (public.is_app_admin() or (public.can_access_app('lista_compras') and user_id = auth.uid()));

create policy tb_fluxograma_projetos_select_permitted_owner_or_admin
  on public.tb_fluxograma_projetos for select to authenticated
  using (public.is_app_admin() or (public.can_access_app('fluxograma') and user_id = auth.uid()));
create policy tb_fluxograma_projetos_insert_permitted_owner_or_admin
  on public.tb_fluxograma_projetos for insert to authenticated
  with check (public.is_app_admin() or (public.can_access_app('fluxograma') and user_id = auth.uid()));
create policy tb_fluxograma_projetos_update_permitted_owner_or_admin
  on public.tb_fluxograma_projetos for update to authenticated
  using (public.is_app_admin() or (public.can_access_app('fluxograma') and user_id = auth.uid()))
  with check (public.is_app_admin() or (public.can_access_app('fluxograma') and user_id = auth.uid()));
create policy tb_fluxograma_projetos_delete_permitted_owner_or_admin
  on public.tb_fluxograma_projetos for delete to authenticated
  using (public.is_app_admin() or (public.can_access_app('fluxograma') and user_id = auth.uid()));

-- Atualiza apenas o nome de exibicao, sem alterar email, senha ou identidade da conta.
do $$
declare
  affected_rows integer;
begin
  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('name', 'Jobson Cabral Sant''Ana')
  where lower(email) = lower('julianacrv35@gmail.com');

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'Esperava atualizar exatamente 1 conta para julianacrv35@gmail.com; contas atualizadas: %.', affected_rows;
  end if;
end $$;

commit;
