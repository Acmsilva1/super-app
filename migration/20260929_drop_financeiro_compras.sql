-- Operacao destrutiva: gere backup de public.tb_compras antes de aplicar
-- caso os registros existentes precisem ser preservados.
begin;

drop view if exists public.vw_financeiro_compras_mensal;
drop table if exists public.tb_compras;

commit;
