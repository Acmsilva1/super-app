-- Rollback da migration 20260718_enable_rls_user_permissions.sql.
-- Objetivo: voltar o banco para modo sem RLS nas tabelas do SUPERAPP, sem apagar dados de negocio.
-- Mantem colunas user_id nas tabelas financeiras para preservar rastreabilidade.

begin;

-- 1) Remove policies e desativa RLS nas tabelas de negocio.
do $$
declare
  p record;
  t text;
  target_tables text[] := array[
    'tb_financas',
    'tb_despesas_fixas',
    'tb_poupanca',
    'tb_poupanca_metas',
    'tb_compras',
    'tb_financeiro_analises',
    'tb_financeiro_features_mensais',
    'tb_financeiro_analise_runs',
    'tb_financeiro_modelo_estado',
    'tb_lista_compras',
    'tb_fluxograma_projetos',
    'tb_missoes_treino',
    'tb_missoes_treino_itens',
    'tb_missoes_treino_chamas',
    'tb_calendario',
    'system_analysis_logs'
  ];
begin
  foreach t in array target_tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tabela public.% nao existe, pulando.', t;
      continue;
    end if;

    for p in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;

    execute format('alter table public.%I no force row level security', t);
    execute format('alter table public.%I disable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to anon, authenticated', t);
  end loop;
end $$;

-- 2) Remove policies das tabelas de controle e desativa RLS nelas.
do $$
declare
  p record;
  t text;
  control_tables text[] := array[
    'app_user_profiles',
    'app_user_permissions',
    'app_user_roles',
    'app_modules'
  ];
begin
  foreach t in array control_tables loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    for p in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = t
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;

    execute format('alter table public.%I no force row level security', t);
    execute format('alter table public.%I disable row level security', t);
  end loop;
end $$;

-- 3) Remove triggers e funcoes criadas para autorizacao/perfil.
drop trigger if exists on_auth_user_created_app_permissions on auth.users;
drop trigger if exists app_user_profiles_touch_updated_at on public.app_user_profiles;
drop trigger if exists app_user_roles_touch_updated_at on public.app_user_roles;
drop trigger if exists app_user_permissions_touch_updated_at on public.app_user_permissions;

drop function if exists public.handle_new_app_user();
drop function if exists public.can_access_app(text);
drop function if exists public.is_app_admin();
drop function if exists public.current_app_user_id();
drop function if exists public.app_owner_user_id();
drop function if exists public.touch_updated_at();

-- 4) Remove tabelas de controle. Nao remove dados financeiros nem colunas user_id.
drop table if exists public.app_user_profiles;
drop table if exists public.app_user_permissions;
drop table if exists public.app_user_roles;
drop table if exists public.app_modules;

-- 5) Reabre sequences para o comportamento antigo.
grant usage, select on all sequences in schema public to anon, authenticated;

-- 6) View financeira volta a acesso anon/authenticated, se existir.
do $$
begin
  if to_regclass('public.vw_financeiro_ultimos_5_meses') is not null then
    grant select on public.vw_financeiro_ultimos_5_meses to anon, authenticated;
  end if;
end $$;

commit;