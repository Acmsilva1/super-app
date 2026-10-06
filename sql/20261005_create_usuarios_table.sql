-- Configuração simples e segura para a tabela public.usuarios no Supabase

-- 1. Garante que a tabela existe com a estrutura correta
create table if not exists public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  email text not null,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Índices para busca rápida
create index if not exists idx_usuarios_username on public.usuarios (username);
create index if not exists idx_usuarios_email on public.usuarios (email);

-- 3. Permissões de Leitura e Escrita
alter table public.usuarios enable row level security;

grant select on public.usuarios to anon, authenticated;
grant insert, update, delete on public.usuarios to authenticated, service_role;

-- 4. Políticas de Acesso (RLS)
drop policy if exists usuarios_read_anon_and_auth on public.usuarios;
create policy usuarios_read_anon_and_auth
  on public.usuarios
  for select
  using (true);

drop policy if exists usuarios_admin_or_own_write on public.usuarios;
create policy usuarios_admin_or_own_write
  on public.usuarios
  for all
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
