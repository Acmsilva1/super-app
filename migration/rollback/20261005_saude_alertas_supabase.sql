-- Destrutivo: remove configurações e histórico. Não executar automaticamente.
begin;
drop table if exists public.tb_saude_alertas_envios;
drop table if exists public.tb_saude_alertas_agenda;
commit;
