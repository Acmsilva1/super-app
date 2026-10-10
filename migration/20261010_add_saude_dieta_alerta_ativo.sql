-- Aplicar após 20261010_add_saude_dietas_semanais.sql.
-- Mantém alertas das dietas existentes; novas dietas começam desligadas.
begin;
alter table public.tb_saude_dietas add column if not exists alerta_ativo boolean not null default true;
alter table public.tb_saude_dietas alter column alerta_ativo set default false;
comment on column public.tb_saude_dietas.alerta_ativo is 'Seleciona esta dieta para envio pelo bot, respeitando a pausa geral do perfil';
notify pgrst, 'reload schema';
commit;
