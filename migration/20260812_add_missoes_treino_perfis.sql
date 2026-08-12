-- Perfis personalizados para o modulo missoes_treino.
-- Rode este arquivo no SQL Editor do Supabase.

begin;

create table if not exists public.tb_missoes_treino_perfis (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid,
  nome text not null,
  descricao text,
  cor text not null default '#00e5ff',
  icone text not null default 'fa-dumbbell'
);

alter table public.tb_missoes_treino
  add column if not exists perfil_id bigint references public.tb_missoes_treino_perfis(id) on delete cascade;

create index if not exists idx_missoes_treino_perfil_id
  on public.tb_missoes_treino (perfil_id);

create index if not exists idx_missoes_treino_perfil_data
  on public.tb_missoes_treino (perfil_id, data_referencia);

drop trigger if exists tb_missoes_treino_perfis_touch_updated_at on public.tb_missoes_treino_perfis;
create trigger tb_missoes_treino_perfis_touch_updated_at
  before update on public.tb_missoes_treino_perfis
  for each row execute function public.touch_updated_at();

alter table public.tb_missoes_treino_perfis enable row level security;
alter table public.tb_missoes_treino_perfis force row level security;
revoke all on public.tb_missoes_treino_perfis from anon;
grant select, insert, update, delete on public.tb_missoes_treino_perfis to authenticated;

drop policy if exists tb_missoes_treino_perfis_admin_only on public.tb_missoes_treino_perfis;
create policy tb_missoes_treino_perfis_admin_only
  on public.tb_missoes_treino_perfis
  for all
  to authenticated
  using (public.is_app_admin())
  with check (public.is_app_admin());

comment on table public.tb_missoes_treino_perfis is
  'Perfis de treino personalizados do modulo missoes_treino';
comment on column public.tb_missoes_treino.perfil_id is
  'Perfil dono da missao de treino';

commit;
