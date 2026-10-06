-- Permite distinguir execucoes do cron ainda em andamento de chamadas finalizadas.
begin;
alter table public.tb_saude_alertas_runs
  drop constraint if exists tb_saude_alertas_runs_status_check;
alter table public.tb_saude_alertas_runs
  add constraint tb_saude_alertas_runs_status_check
  check (status in ('running', 'processed', 'skipped', 'failed'));
alter table public.tb_saude_alertas_runs
  add column if not exists alerts_sent integer not null default 0 check (alerts_sent >= 0);
commit;
