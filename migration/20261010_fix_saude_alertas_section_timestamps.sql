-- Aplicar após as migrations de horários de dieta e janela de água.
begin;
alter table public.tb_saude_alertas_agenda add column if not exists agua_updated_at timestamptz;
alter table public.tb_saude_alertas_agenda add column if not exists dieta_updated_at timestamptz;
update public.tb_saude_alertas_agenda set agua_updated_at = coalesce(agua_updated_at, updated_at),
 dieta_updated_at = coalesce(dieta_updated_at, updated_at)
 where agua_updated_at is null or dieta_updated_at is null;
alter table public.tb_saude_alertas_agenda alter column agua_updated_at set default now(),
 alter column agua_updated_at set not null, alter column dieta_updated_at set default now(),
 alter column dieta_updated_at set not null;

create or replace function public.saude_alert_schedule_touch_sections()
returns trigger language plpgsql set search_path = public as $$
begin
 if row(new.agua_ativo,new.agua_intervalo_horas,new.agua_inicio,new.agua_fim)
    is distinct from row(old.agua_ativo,old.agua_intervalo_horas,old.agua_inicio,old.agua_fim) then
   new.agua_updated_at := clock_timestamp();
 else new.agua_updated_at := old.agua_updated_at;
 end if;
 if row(new.dieta_ativa,new.dieta_id,new.dieta_horarios)
    is distinct from row(old.dieta_ativa,old.dieta_id,old.dieta_horarios) then
   new.dieta_updated_at := clock_timestamp();
 else new.dieta_updated_at := old.dieta_updated_at;
 end if;
 new.updated_at := greatest(new.agua_updated_at,new.dieta_updated_at);
 return new;
end;
$$;
drop trigger if exists saude_alert_schedule_touch_sections on public.tb_saude_alertas_agenda;
create trigger saude_alert_schedule_touch_sections before update on public.tb_saude_alertas_agenda
 for each row execute function public.saude_alert_schedule_touch_sections();
notify pgrst, 'reload schema';
commit;
