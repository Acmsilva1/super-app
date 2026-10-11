-- DROP de estruturas cujo DDL real não foi fornecido não admite rollback fiel genérico.
-- Restaure o backup prévio de DDL + dados + permissões das cinco tabelas e duas views.
-- Não use local_schema_init.sql: é um contrato local e difere do schema de produção.
-- Este arquivo interrompe a execução para não simular uma restauração incompleta.
do $$ begin
  raise exception 'Rollback exige restaurar o backup anterior de tb_compras, tb_financeiro_analises, tb_financeiro_features_mensais, tb_financeiro_analise_runs, tb_financeiro_modelo_estado e suas duas views. Nenhuma restauração automática foi executada.';
end; $$;
