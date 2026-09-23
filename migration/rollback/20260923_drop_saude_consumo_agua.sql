-- Rollback da migration 20260923_create_saude_consumo_agua.sql.
-- Remove somente as estruturas do controle de consumo de agua.

begin;
drop table if exists public.tb_saude_agua_logs;
drop table if exists public.tb_saude_agua_metas;
commit;
