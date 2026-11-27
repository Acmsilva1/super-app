begin;

drop index if exists public.idx_tb_despesas_fixas_serie_encerrada;

alter table public.tb_despesas_fixas
  drop column if exists serie_encerrada_em;

commit;
