-- Remove o perfil automatico legado "Oficial" somente quando ele estiver vazio.
-- Perfis personalizados e perfis que ainda possuem missoes nao sao alterados.

begin;

delete from public.tb_missoes_treino_perfis as p
where lower(trim(p.nome)) = 'oficial'
  and p.cor = '#00e5ff'
  and p.icone = 'fa-dumbbell'
  and p.descricao in (
    'Perfil principal — treinos salvos antes da divisão por perfil',
    'Perfil principal â€” treinos salvos antes da divisÃ£o por perfil'
  )
  and not exists (
    select 1
    from public.tb_missoes_treino as m
    where m.perfil_id = p.id
  );

commit;

-- Rollback manual, se realmente necessario:
-- insert into public.tb_missoes_treino_perfis (nome, descricao, cor, icone)
-- values ('Oficial', 'Perfil principal — treinos salvos antes da divisão por perfil', '#00e5ff', 'fa-dumbbell');
