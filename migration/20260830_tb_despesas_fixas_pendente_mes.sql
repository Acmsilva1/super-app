begin;

alter table public.tb_despesas_fixas
  add column if not exists pendente_mes boolean not null default false;

update public.tb_despesas_fixas
set status = 'pendente'
where pendente_mes = true
  and lower(coalesce(status, '')) <> 'pendente';

alter table public.tb_despesas_fixas
  drop constraint if exists tb_despesas_fixas_pendente_mes_status_check;

alter table public.tb_despesas_fixas
  add constraint tb_despesas_fixas_pendente_mes_status_check
  check (pendente_mes = false or lower(coalesce(status, '')) = 'pendente');

create index if not exists idx_tb_despesas_fixas_user_pendente_mes_created_at
  on public.tb_despesas_fixas (user_id, pendente_mes, created_at desc);

comment on column public.tb_despesas_fixas.pendente_mes is
  'Flag mensal para manter historico de conta fixa nao paga no mes, sempre com status pendente.';

commit;
