-- Rollback: remove os gatilhos de auditoria e o historico criado por esta migration.
begin;
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tb_saude_perfis', 'tb_saude_perfil_medidas', 'tb_saude_dietas',
    'tb_saude_agua_perfis', 'tb_saude_agua_metas', 'tb_saude_agua_logs',
    'tb_saude_alertas_agenda'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('drop trigger if exists capture_admin_activity on public.%I', table_name);
    end if;
  end loop;
end;
$$;
drop function if exists public.capture_saude_admin_activity();
drop table if exists public.tb_saude_admin_activity;
drop table if exists public.tb_saude_alertas_runs;
alter table public.tb_saude_alertas_envios drop column if exists last_error;
commit;
