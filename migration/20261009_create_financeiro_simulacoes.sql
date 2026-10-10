-- Cada linha é uma execução imutável. meta_id reúne as repetições da mesma meta.
-- Supabase: executar no SQL Editor antes de testar salvar/repetir no app.
-- Dependência: auth.users e roles authenticated/anon já existentes.
begin;
create table if not exists public.tb_financeiro_simulacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meta_id uuid not null,
  nome text not null check (char_length(trim(nome)) between 1 and 120),
  parametros jsonb not null check (jsonb_typeof(parametros) = 'object'),
  resultado jsonb not null check (jsonb_typeof(resultado) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists idx_financeiro_simulacoes_usuario_data on public.tb_financeiro_simulacoes(user_id, created_at desc);
alter table public.tb_financeiro_simulacoes enable row level security;
drop policy if exists financeiro_simulacoes_select on public.tb_financeiro_simulacoes;
create policy financeiro_simulacoes_select on public.tb_financeiro_simulacoes for select to authenticated using (user_id = auth.uid());
drop policy if exists financeiro_simulacoes_insert on public.tb_financeiro_simulacoes;
create policy financeiro_simulacoes_insert on public.tb_financeiro_simulacoes for insert to authenticated with check (user_id = auth.uid());
revoke all on public.tb_financeiro_simulacoes from anon, authenticated;
grant select, insert on public.tb_financeiro_simulacoes to authenticated;
-- Cliente Node privilegiado: acesso explícito, sem depender de grants padrão.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert on public.tb_financeiro_simulacoes to service_role;
  end if;
end $$;
commit;
