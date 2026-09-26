-- Rollback do reset do modulo Saude.
-- Nao restaura dados apagados; apenas remove o schema recriado por 20260926_reset_modulo_saude.sql.
-- tb_saude_tabela_nutricional nao e recriada pelo reset; drop aqui e no-op se ja foi removida.

begin;

drop table if exists public.tb_saude_agua_logs cascade;
drop table if exists public.tb_saude_agua_metas cascade;
drop table if exists public.tb_saude_perfil_medidas cascade;
drop table if exists public.tb_saude_dietas cascade;
drop table if exists public.tb_saude_perfis cascade;
drop table if exists public.tb_saude_tabela_nutricional cascade;

drop function if exists public.registrar_saude_perfil_medidas();

commit;
