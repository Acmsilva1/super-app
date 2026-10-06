-- Rollback: finaliza registros em andamento como falha antes de restringir os estados.
begin;
update public.tb_saude_alertas_runs
set status = 'failed', error_code = coalesce(error_code, 'rollback_during_run')
where status = 'running';
alter table public.tb_saude_alertas_runs
  drop constraint if exists tb_saude_alertas_runs_status_check;
alter table public.tb_saude_alertas_runs
  add constraint tb_saude_alertas_runs_status_check
  check (status in ('processed', 'skipped', 'failed'));
alter table public.tb_saude_alertas_runs drop column if exists alerts_sent;
commit;
