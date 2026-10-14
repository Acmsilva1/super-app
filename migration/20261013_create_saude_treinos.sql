-- Cadastro novo de treinos, independente do módulo legado.
-- Full body: bloco unico; ABC: blocos A/B/C com nomes editáveis;
-- Semanal: dia-0 (segunda) até dia-6 (domingo), com nomes fixos.
-- A API deverá criar treino + blocos em uma transação e operar em /api/saude.
-- Não adiciona séries, sessões, alertas ou Functions da Vercel.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$ begin
  if to_regclass('public.tb_saude_perfis') is null
    or to_regprocedure('public.is_app_admin()') is null
    or to_regprocedure('public.can_access_app(text)') is null
    or to_regprocedure('public.touch_updated_at()') is null then
    raise exception 'Dependências ausentes: perfis de Saúde, funções de autorização ou touch_updated_at.';
  end if;
end; $$;

create table if not exists public.tb_saude_treinos (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  perfil_id bigint not null,
  nome text not null check (char_length(trim(nome)) between 1 and 80),
  tipo text not null check (tipo in ('full_body', 'abc', 'semanal')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, created_by, tipo),
  foreign key (perfil_id, created_by) references public.tb_saude_perfis(id, created_by) on delete cascade
);
create index if not exists idx_saude_treinos_perfil on public.tb_saude_treinos(created_by, perfil_id, created_at desc);

create table if not exists public.tb_saude_treino_blocos (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  treino_id uuid not null,
  tipo text not null,
  chave text not null,
  nome text not null check (char_length(trim(nome)) between 1 and 80),
  ordem smallint not null check (ordem between 0 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, created_by),
  unique (treino_id, chave),
  unique (treino_id, ordem),
  foreign key (treino_id, created_by, tipo) references public.tb_saude_treinos(id, created_by, tipo) on delete cascade,
  constraint saude_treino_bloco_formato_check check (
    (tipo = 'full_body' and chave = 'unico' and ordem = 0 and nome = 'Exercícios')
    or (tipo = 'abc' and ((chave = 'A' and ordem = 0) or (chave = 'B' and ordem = 1) or (chave = 'C' and ordem = 2)))
    or (tipo = 'semanal' and chave = 'dia-' || ordem::text and nome =
      (array['Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado','Domingo'])[ordem + 1])
  )
);

create table if not exists public.tb_saude_treino_exercicios (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  bloco_id uuid not null,
  nome text not null check (char_length(trim(nome)) between 1 and 120),
  ordem integer not null check (ordem >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bloco_id, ordem),
  foreign key (bloco_id, created_by) references public.tb_saude_treino_blocos(id, created_by) on delete cascade
);

-- RLS por proprietário com o mesmo acesso a Saúde e administração do app.
-- O servidor deve resolver created_by pelo perfil, nunca pelo admin conectado.
do $$ declare target text; begin
  foreach target in array array['tb_saude_treinos','tb_saude_treino_blocos','tb_saude_treino_exercicios'] loop
    execute format('alter table public.%I enable row level security', target);
    execute format('alter table public.%I force row level security', target);
    execute format('revoke all on public.%I from public, anon', target);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', target);
    execute format('drop policy if exists treino_acesso on public.%I', target);
    execute format('create policy treino_acesso on public.%I for all to authenticated
      using (public.is_app_admin() or (public.can_access_app(''saude'') and created_by = auth.uid()))
      with check (public.is_app_admin() or (public.can_access_app(''saude'') and created_by = auth.uid()))', target);
    execute format('drop trigger if exists treino_touch_updated_at on public.%I', target);
    execute format('create trigger treino_touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', target);
  end loop;
end; $$;

comment on table public.tb_saude_treinos is 'Cadastro básico de treinos por perfil de Saúde. Sem séries.';
comment on table public.tb_saude_treino_blocos is 'Lista única, divisões ABC ou dias fixos da semana. ABC permite nomes próprios.';
comment on table public.tb_saude_treino_exercicios is 'Exercícios por bloco, com nome e ordem de apresentação.';
notify pgrst, 'reload schema';
commit;
