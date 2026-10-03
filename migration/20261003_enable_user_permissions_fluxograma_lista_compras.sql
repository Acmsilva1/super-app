-- Permite conceder Lista de Compras e Fluxograma individualmente.
-- Antes de executar: confirme que 20261003_restrict_admin_to_andre.sql foi aplicada.
-- Usuarios sem user_id existentes sao atribuidos ao proprietario do Super App.
begin;

do $$
begin
  if to_regclass('public.tb_lista_compras') is null then
    raise exception 'Tabela public.tb_lista_compras nao encontrada.';
  end if;
  if to_regclass('public.tb_fluxograma_projetos') is null then
    raise exception 'Tabela public.tb_fluxograma_projetos nao encontrada.';
  end if;
  if to_regclass('public.app_user_permissions') is null then
    raise exception 'Tabela public.app_user_permissions nao encontrada.';
  end if;
  if to_regprocedure('public.is_app_admin()') is null then
    raise exception 'Funcao public.is_app_admin() ausente. Aplique primeiro 20261003_restrict_admin_to_andre.sql.';
  end if;
end;
$$;

alter table public.tb_lista_compras add column if not exists user_id uuid;
alter table public.tb_fluxograma_projetos add column if not exists user_id uuid;

update public.tb_lista_compras
set user_id = 'f88a6351-317d-425b-afcd-9430c8a34f53'::uuid
where user_id is null;
update public.tb_fluxograma_projetos
set user_id = 'f88a6351-317d-425b-afcd-9430c8a34f53'::uuid
where user_id is null;

do $$
declare
  t text;
  r record;
begin
  foreach t in array array['tb_lista_compras', 'tb_fluxograma_projetos'] loop
    if not exists (
      select 1 from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.conrelid = format('public.%I', t)::regclass
        and c.contype = 'f' and a.attname = 'user_id'
    ) then
      execute format('alter table public.%I add constraint %I foreign key (user_id) references auth.users(id) on delete cascade', t, t || '_user_id_fkey');
    end if;
    execute format('alter table public.%I alter column user_id set not null', t);
    execute format('create index if not exists %I on public.%I (user_id)', 'idx_' || t || '_user_id', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    -- Policies permissivas combinam com OR; remover policies anteriores impede bypass.
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_app_admin() or (user_id = auth.uid() and exists (select 1 from public.app_user_permissions p where p.user_id = auth.uid() and p.app_id = %L and p.can_access)))', t || '_select_granted_users', t, case t when 'tb_lista_compras' then 'lista_compras' else 'fluxograma' end);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_app_admin() or (user_id = auth.uid() and exists (select 1 from public.app_user_permissions p where p.user_id = auth.uid() and p.app_id = %L and p.can_access)))', t || '_insert_granted_users', t, case t when 'tb_lista_compras' then 'lista_compras' else 'fluxograma' end);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_app_admin() or (user_id = auth.uid() and exists (select 1 from public.app_user_permissions p where p.user_id = auth.uid() and p.app_id = %L and p.can_access))) with check (public.is_app_admin() or (user_id = auth.uid() and exists (select 1 from public.app_user_permissions p where p.user_id = auth.uid() and p.app_id = %L and p.can_access)))', t || '_update_granted_users', t, case t when 'tb_lista_compras' then 'lista_compras' else 'fluxograma' end, case t when 'tb_lista_compras' then 'lista_compras' else 'fluxograma' end);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_app_admin() or (user_id = auth.uid() and exists (select 1 from public.app_user_permissions p where p.user_id = auth.uid() and p.app_id = %L and p.can_access)))', t || '_delete_granted_users', t, case t when 'tb_lista_compras' then 'lista_compras' else 'fluxograma' end);
  end loop;
end;
$$;

commit;
