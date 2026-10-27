-- Carnê: persistência de parcelas pagas + tipo de alerta "carne" (D-3 do próximo boleto).
begin;
create table if not exists public.tb_financeiro_carne_pago (
  user_id uuid not null references auth.users(id) on delete cascade,
  carne_id text not null check (char_length(trim(carne_id)) between 1 and 64),
  parcela_numero integer not null check (parcela_numero between 1 and 999),
  updated_at timestamptz not null default now(),
  primary key (user_id, carne_id, parcela_numero)
);
create index if not exists idx_financeiro_carne_pago_usuario
  on public.tb_financeiro_carne_pago(user_id, carne_id);
alter table public.tb_financeiro_carne_pago enable row level security;
revoke all on public.tb_financeiro_carne_pago from anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on public.tb_financeiro_carne_pago to service_role;
  end if;
end $$;

alter table public.tb_financeiro_alertas drop constraint if exists tb_financeiro_alertas_tipo_check;
alter table public.tb_financeiro_alertas add constraint tb_financeiro_alertas_tipo_check
  check (tipo in ('diario','fixas','mensal','mensagem','receitas','poupanca','simulador','geral','carne'));

alter table public.tb_financeiro_alertas drop constraint if exists financeiro_alertas_resumo_padrao_check;
alter table public.tb_financeiro_alertas add constraint financeiro_alertas_resumo_padrao_check
  check (horarios is null or (tipo in ('diario','fixas','receitas','poupanca','simulador','geral','carne') and mensagem = ''));
commit;
