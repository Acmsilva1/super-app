-- Rollback da migration 20260923_create_missoes_treino_logs.sql.
-- ATENCAO: executar este arquivo remove permanentemente todo o historico de check-ins.

begin;
drop table if exists public.tb_missoes_treino_logs;
commit;
