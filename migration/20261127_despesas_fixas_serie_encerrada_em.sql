-- Marca o mês em que a série de conta fixa foi encerrada (delete / desligar).
-- Impede rematerialização automática nos meses >= serie_encerrada_em.

begin;

alter table public.tb_despesas_fixas
  add column if not exists serie_encerrada_em date null;

comment on column public.tb_despesas_fixas.serie_encerrada_em is
  '1o dia do mes em que a serie de conta fixa foi encerrada; meses >= este valor nao sao rematerializados.';

create index if not exists idx_tb_despesas_fixas_serie_encerrada
  on public.tb_despesas_fixas (serie_id, serie_encerrada_em)
  where serie_id is not null;

commit;
