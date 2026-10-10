-- Agenda personalizada do bot existente, com horários em Brasília.
begin;
create table if not exists public.tb_financeiro_alertas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null check (char_length(trim(nome)) between 1 and 120),
  tipo text not null check (tipo in ('diario','fixas','mensal','mensagem')),
  mensagem text not null default '' check (char_length(mensagem) <= 1500),
  cron text not null check (char_length(cron) between 9 and 120),
  timezone text not null default 'America/Sao_Paulo' check (timezone = 'America/Sao_Paulo'),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (tipo <> 'mensagem' or char_length(trim(mensagem)) > 0)
);
create index if not exists idx_financeiro_alertas_usuario on public.tb_financeiro_alertas(user_id, ativo);
create or replace function public.financeiro_alertas_limite() returns trigger
language plpgsql set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.user_id::text)::bigint);
  if (select count(*) from public.tb_financeiro_alertas where user_id=new.user_id) >= 50 then
    raise exception 'Limite de 50 alertas por conta' using errcode='23514';
  end if;
  return new;
end $$;
drop trigger if exists financeiro_alertas_limite on public.tb_financeiro_alertas;
create trigger financeiro_alertas_limite before insert on public.tb_financeiro_alertas
for each row execute function public.financeiro_alertas_limite();
alter table public.tb_financeiro_alertas enable row level security;
-- A API é a autoridade: valida cron e vínculo ao único chat do bot.
-- Clientes autenticados não escrevem diretamente na agenda.
revoke all on public.tb_financeiro_alertas from anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on public.tb_financeiro_alertas to service_role;
  end if;
end $$;
-- Preservar os três horários anteriores para o proprietário usado pelo projeto.
insert into public.tb_financeiro_alertas(id,user_id,nome,tipo,cron)
select defaults.id::uuid, users.id, defaults.nome, defaults.tipo, defaults.cron
from auth.users users cross join (values
  ('b937a201-0000-4000-8000-000000000001','Débito/Pix do dia · 13h','diario','0 13 * * *'),
  ('b937a201-0000-4000-8000-000000000002','Débito/Pix do dia · 20h','diario','0 20 * * *'),
  ('b937a201-0000-4000-8000-000000000003','Despesas fixas do mês · 21h','fixas','0 21 * * *')
) as defaults(id,nome,tipo,cron)
where users.id='f88a6351-317d-425b-afcd-9430c8a34f53'::uuid
and not exists (select 1 from public.tb_financeiro_alertas existing where existing.id=defaults.id::uuid)
on conflict (id) do nothing;
commit;
