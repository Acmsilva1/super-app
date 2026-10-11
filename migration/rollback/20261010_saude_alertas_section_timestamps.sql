-- Reverter o código junto com esta migration; volta ao controle de data compartilhado.
begin;
drop trigger if exists saude_alert_schedule_touch_sections on public.tb_saude_alertas_agenda;
drop function if exists public.saude_alert_schedule_touch_sections();
alter table public.tb_saude_alertas_agenda drop column if exists agua_updated_at,
 drop column if exists dieta_updated_at;
notify pgrst, 'reload schema';
commit;
