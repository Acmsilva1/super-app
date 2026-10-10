-- Rever horários personalizados antes de retornar ao código dos horários fixos.
begin;
alter table public.tb_saude_alertas_agenda drop constraint if exists tb_saude_agenda_dieta_horarios_check;
alter table public.tb_saude_alertas_agenda drop column if exists dieta_horarios;
drop function if exists public.saude_dieta_horarios_valid(jsonb);
notify pgrst, 'reload schema';
commit;
