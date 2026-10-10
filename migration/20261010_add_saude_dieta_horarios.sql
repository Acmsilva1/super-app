-- Aplicar após 20261005_saude_alertas_supabase.sql.
begin;
alter table public.tb_saude_alertas_agenda add column if not exists dieta_horarios jsonb not null
 default '[{"tipo":"cafe_da_manha","horario":"07:00"},{"tipo":"almoco","horario":"11:00"},{"tipo":"lanche_da_tarde","horario":"15:00"},{"tipo":"jantar","horario":"19:00"}]'::jsonb;
create or replace function public.saude_dieta_horarios_valid(p_times jsonb)
returns boolean language plpgsql immutable as $$
declare v_entry jsonb; v_keys text[] := array[]::text[]; v_key text;
begin
 if jsonb_typeof(p_times) is distinct from 'array' then return false; end if;
 if jsonb_array_length(p_times) > 12 then return false; end if;
 for v_entry in select value from jsonb_array_elements(p_times) loop
  if jsonb_typeof(v_entry) is distinct from 'object'
   or coalesce(v_entry->>'tipo','') not in ('cafe_da_manha','lanche_da_manha','almoco','lanche_da_tarde','jantar','ceia')
   or coalesce(v_entry->>'horario','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
  v_key := (v_entry->>'tipo') || ':' || (v_entry->>'horario');
  if v_key = any(v_keys) then return false; end if;
  v_keys := array_append(v_keys,v_key);
 end loop;
 return true;
end;
$$;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='tb_saude_agenda_dieta_horarios_check' and conrelid='public.tb_saude_alertas_agenda'::regclass) then
  alter table public.tb_saude_alertas_agenda add constraint tb_saude_agenda_dieta_horarios_check
   check(public.saude_dieta_horarios_valid(dieta_horarios) and (not dieta_ativa or jsonb_array_length(dieta_horarios)>0));
 end if;
end $$;
notify pgrst, 'reload schema';
commit;
