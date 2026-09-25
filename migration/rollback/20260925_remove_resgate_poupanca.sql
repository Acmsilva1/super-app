begin;

drop function if exists public.resgatar_poupanca(uuid, numeric, text, date);

alter table public.tb_poupanca
  drop constraint if exists tb_poupanca_resgate_motivo_check;

alter table public.tb_poupanca
  drop column if exists motivo_resgate;

commit;
