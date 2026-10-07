-- Rollback do catalogo de alimentos; remove os dados e a tabela criados pela migration.
begin;
drop table if exists public.tb_saude_alimentos cascade;
commit;
