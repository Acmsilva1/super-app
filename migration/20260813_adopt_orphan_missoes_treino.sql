-- Adota missoes antigas (perfil_id nulo) no primeiro perfil existente.
-- Cria o perfil Oficial se a tabela de perfis estiver vazia.
-- Rode no SQL Editor do Supabase se o app ainda nao tiver feito o backfill automatico.

begin;

insert into public.tb_missoes_treino_perfis (nome, descricao, cor, icone)
select
  'Oficial',
  'Perfil principal — treinos salvos antes da divisão por perfil',
  '#00e5ff',
  'fa-dumbbell'
where not exists (select 1 from public.tb_missoes_treino_perfis);

update public.tb_missoes_treino m
set perfil_id = p.id
from (
  select id
  from public.tb_missoes_treino_perfis
  order by created_at asc
  limit 1
) p
where m.perfil_id is null;

commit;
