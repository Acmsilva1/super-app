-- Para reverter, restaure o backup prévio de DDL + dados + índices + policies
-- + permissões das cinco tabelas e de suas sequências.
-- Ordem de criação/carga: perfis, treinos, itens/chamas/logs; depois FKs,
-- policies, grants e valores das sequências conforme o backup original.
-- O DDL completo de produção não foi fornecido: as migrations históricas
-- não garantem uma restauração fiel e não devem substituir o backup.
do $$ begin
  raise exception 'Rollback manual: restaure o backup anterior de tb_missoes_treino_perfis, tb_missoes_treino, tb_missoes_treino_itens, tb_missoes_treino_chamas e tb_missoes_treino_logs. Nenhuma restauração automática foi executada.';
end; $$;
