-- Rever janelas personalizadas antes de voltar ao código com janela fixa.
begin;
alter table public.tb_saude_alertas_agenda drop constraint if exists tb_saude_agenda_agua_janela_check;
alter table public.tb_saude_alertas_agenda drop column if exists agua_inicio;
alter table public.tb_saude_alertas_agenda drop column if exists agua_fim;
notify pgrst, 'reload schema';
commit;
