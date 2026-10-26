-- Requer 20261013_saude_agua_ml.sql. Impede registro de lembrete vencido inclusive na virada do dia.
begin;
set local lock_timeout='5s';
create or replace function public.saude_record_water_ml(p_owner uuid,p_profile bigint,p_amount integer,p_request text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_day date := (clock_timestamp() at time zone 'America/Sao_Paulo')::date;
 v_meta integer; v_total integer; v_old public.tb_saude_agua_checkins%rowtype; v_duplicate boolean:=false;
begin
 if coalesce(auth.role(),'') <> 'service_role' and auth.uid() is distinct from p_owner then raise exception 'water_forbidden'; end if;
 if p_owner is null or p_profile is null or p_profile<=0 then raise exception 'water_invalid'; end if;
 if (p_request like 'tg-water:agua:%' or p_request like 'wa-water:agua:%') and split_part(p_request,':',3)<>v_day::text then raise exception 'water_request_conflict'; end if;
 if p_amount not in (100,200,300,400,500,1000,2000) or p_amount is null or p_request is null or p_request !~ '^[A-Za-z0-9:_-]{8,160}$' then raise exception 'water_invalid'; end if;
 -- Serializa retries inclusive quando tentam trocar perfil ou quantidade.
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text || ':' || p_request,0));
 select created_by,perfil_id,request_id,data_local,quantidade_ml,created_at into v_old from public.tb_saude_agua_checkins where created_by=p_owner and request_id=p_request;
 if found then
   if v_old.perfil_id<>p_profile or v_old.quantidade_ml<>p_amount or v_old.data_local<>v_day then raise exception 'water_request_conflict'; end if;
   v_duplicate:=true;
 end if;
 select meta_ml into v_meta from public.tb_saude_agua_metas where created_by=p_owner and perfil_id=p_profile for update;
 if v_meta is null then raise exception 'water_goal_required'; end if;
 insert into public.tb_saude_agua_logs(created_by,perfil_id,data_local,meta_ml,realizado_ml)
   values(p_owner,p_profile,v_day,v_meta,0) on conflict(created_by,perfil_id,data_local) do nothing;
 if not v_duplicate then
   insert into public.tb_saude_agua_checkins(created_by,perfil_id,request_id,data_local,quantidade_ml) values(p_owner,p_profile,p_request,v_day,p_amount);
   update public.tb_saude_agua_logs set realizado_ml=realizado_ml+p_amount,meta_ml=v_meta
     where created_by=p_owner and perfil_id=p_profile and data_local=v_day returning realizado_ml into v_total;
 else
   select realizado_ml into v_total from public.tb_saude_agua_logs where created_by=p_owner and perfil_id=p_profile and data_local=v_day;
 end if;
 return jsonb_build_object('data',v_day,'meta_ml',v_meta,'realizado_ml',v_total,'duplicate',v_duplicate);
end; $$;
revoke all on function public.saude_record_water_ml(uuid,bigint,integer,text) from public,anon;
grant execute on function public.saude_record_water_ml(uuid,bigint,integer,text) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
