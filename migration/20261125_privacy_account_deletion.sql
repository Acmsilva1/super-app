-- Aplicar somente após revisar FKs e executar restauração isolada. Não apaga dados ao instalar.
-- A operação inteira é transacional; uma FK bloqueante reverte toda a exclusão.
create or replace function public.delete_superapp_account_data(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  item text;
  owner_column text;
begin
  if p_user_id is null then raise exception 'invalid_account'; end if;
  -- Somente tabelas do Super App. Nunca apagar auth.users de um projeto compartilhado.
  foreach item in array array[
    'tb_saude_treino_exercicios:created_by', 'tb_saude_treino_blocos:created_by', 'tb_saude_treinos:created_by',
    'tb_saude_agua_checkins:created_by', 'tb_saude_agua_logs:created_by', 'tb_saude_agua_metas:created_by',
    'tb_saude_alertas_envios:created_by', 'tb_saude_alertas_agenda:created_by',
    'tb_saude_perfil_medidas:created_by', 'tb_saude_dietas:created_by', 'tb_saude_agua_perfis:created_by', 'tb_saude_perfis:created_by',
    'tb_financeiro_carne_pago:user_id', 'tb_financeiro_alertas:user_id', 'tb_financeiro_simulacoes:user_id',
    'tb_financeiro_analises:user_id', 'tb_financeiro_features_mensais:user_id', 'tb_financeiro_analise_runs:user_id', 'tb_financeiro_modelo_estado:user_id',
    'tb_financas:user_id', 'tb_despesas_fixas:user_id', 'tb_poupanca_metas:user_id', 'tb_poupanca:user_id', 'tb_compras:user_id',
    'tb_fluxograma_projetos:user_id', 'tb_telegram_compras:owner_id', 'superapp_webauthn_credentials:user_id',
    'app_user_permissions:user_id', 'app_user_roles:user_id', 'app_user_profiles:user_id'
  ] loop
    owner_column := split_part(item, ':', 2);
    item := split_part(item, ':', 1);
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = item and column_name = owner_column) then
      execute format('delete from public.%I where %I = $1', item, owner_column) using p_user_id;
    end if;
  end loop;
end;
$$;
revoke all on function public.delete_superapp_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_superapp_account_data(uuid) to service_role;
