-- Não descarta check-ins reais sem exportação prévia.
begin;
do $$ begin
 if exists(select 1 from public.tb_saude_agua_checkins) then
   raise exception 'Exporte os check-ins em ml antes de reverter. Nenhum dado foi removido.';
 end if;
end $$;
drop function public.saude_record_water_ml(uuid,bigint,integer,text);
drop table public.tb_saude_agua_checkins;
alter table public.tb_saude_agua_metas drop column meta_ml;
alter table public.tb_saude_agua_metas alter column meta_doses drop default;
alter table public.tb_saude_agua_logs drop column meta_ml,drop column realizado_ml;
alter table public.tb_saude_agua_logs alter column meta_doses drop default;
alter table public.tb_saude_alertas_envios drop column perfil_id,drop column data_local;
notify pgrst,'reload schema';
commit;
