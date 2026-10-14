-- Aplicar após 20261013_create_saude_treinos.sql.
-- Funções PostgreSQL: não adicionam Functions da Vercel.
begin;
set local lock_timeout='5s';

create or replace function public.saude_treino_payload(p_id uuid)
returns jsonb language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object('id',t.id,'nome',t.nome,'tipo',t.tipo,'updated_at',t.updated_at,
  'grupos',coalesce((select jsonb_agg(jsonb_build_object('id',b.chave,'nome',b.nome,
    'exercicios',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'nome',e.nome) order by e.ordem)
      from public.tb_saude_treino_exercicios e where e.bloco_id=b.id),'[]'::jsonb)) order by b.ordem)
    from public.tb_saude_treino_blocos b where b.treino_id=t.id),'[]'::jsonb))
 from public.tb_saude_treinos t where t.id=p_id;
$$;
revoke all on function public.saude_treino_payload(uuid) from public,anon,authenticated,service_role;

create or replace function public.saude_manage_treinos(
 p_owner uuid,p_profile bigint,p_action text,p_workout jsonb default null,p_expected timestamptz default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_id uuid; v_bloco uuid; v_existing jsonb; v_group jsonb; v_exercise jsonb;
 v_group_order integer; v_exercise_order integer; v_type text; v_keys text[];
begin
 if coalesce(auth.role(),'')<>'service_role'
   and not (coalesce(public.is_app_admin(),false) or (auth.uid() is not distinct from p_owner and coalesce(public.can_access_app('saude'),false))) then
   raise exception 'training_forbidden';
 end if;
 if p_owner is null or p_profile is null or not exists(
  select 1 from public.tb_saude_perfis where id=p_profile and created_by=p_owner
 ) then raise exception 'training_forbidden'; end if;
 if p_action not in ('list','save','delete') or p_action is null then raise exception 'training_invalid'; end if;
 if p_action='list' then
  return jsonb_build_object('rows',coalesce((select jsonb_agg(public.saude_treino_payload(id) order by created_at desc,id)
   from public.tb_saude_treinos where created_by=p_owner and perfil_id=p_profile),'[]'::jsonb));
 end if;
 v_id:=(p_workout->>'id')::uuid;
 if v_id is null then raise exception 'training_invalid'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text||':'||p_profile::text,0));
 perform 1 from public.tb_saude_treinos where id=v_id and created_by=p_owner and perfil_id=p_profile for update;
 if found then v_existing:=public.saude_treino_payload(v_id); end if;
 if p_action='delete' then
  if v_existing is null then raise exception 'training_not_found'; end if;
  if p_expected is null or p_expected<>(v_existing->>'updated_at')::timestamptz then raise exception 'training_conflict'; end if;
  delete from public.tb_saude_treinos where id=v_id and created_by=p_owner and perfil_id=p_profile;
  return jsonb_build_object('id',v_id);
 end if;
 v_type:=p_workout->>'tipo';
 v_keys:=case v_type when 'full_body' then array['unico'] when 'abc' then array['A','B','C']
   when 'semanal' then array['dia-0','dia-1','dia-2','dia-3','dia-4','dia-5','dia-6'] end;
 if v_keys is null or jsonb_typeof(p_workout->'grupos') is distinct from 'array'
   or char_length(trim(coalesce(p_workout->>'nome',''))) not between 1 and 80 then raise exception 'training_invalid'; end if;
 if jsonb_array_length(p_workout->'grupos')<>array_length(v_keys,1) then raise exception 'training_invalid'; end if;
 -- Valida toda a estrutura antes de substituir os blocos; falhas revertem tudo.
 v_group_order:=0;
 for v_group in select value from jsonb_array_elements(p_workout->'grupos') loop
  if (v_group->>'id') is distinct from v_keys[v_group_order+1]
    or jsonb_typeof(v_group->'exercicios') is distinct from 'array' then raise exception 'training_invalid'; end if;
  if jsonb_array_length(v_group->'exercicios')>200 then raise exception 'training_invalid'; end if;
  v_group_order:=v_group_order+1;
 end loop;
 if v_existing is not null then
  if p_expected is null then
   -- Retry de criação com o mesmo UUID e conteúdo não duplica o cadastro.
   if (v_existing-'updated_at')=(p_workout-'updated_at') then return jsonb_build_object('row',v_existing); end if;
   raise exception 'training_conflict';
  end if;
  if p_expected<>(v_existing->>'updated_at')::timestamptz then raise exception 'training_conflict'; end if;
  delete from public.tb_saude_treino_blocos where treino_id=v_id and created_by=p_owner;
  update public.tb_saude_treinos set nome=trim(p_workout->>'nome'),tipo=v_type
    where id=v_id and created_by=p_owner and perfil_id=p_profile;
 else
  if p_expected is not null then raise exception 'training_not_found'; end if;
  insert into public.tb_saude_treinos(id,created_by,perfil_id,nome,tipo)
   values(v_id,p_owner,p_profile,trim(p_workout->>'nome'),v_type);
 end if;
 v_group_order:=0;
 for v_group in select value from jsonb_array_elements(p_workout->'grupos') loop
  insert into public.tb_saude_treino_blocos(created_by,treino_id,tipo,chave,nome,ordem)
    values(p_owner,v_id,v_type,v_group->>'id',trim(v_group->>'nome'),v_group_order) returning id into v_bloco;
  v_exercise_order:=0;
  for v_exercise in select value from jsonb_array_elements(v_group->'exercicios') loop
   insert into public.tb_saude_treino_exercicios(id,created_by,bloco_id,nome,ordem)
    values((v_exercise->>'id')::uuid,p_owner,v_bloco,trim(v_exercise->>'nome'),v_exercise_order);
   v_exercise_order:=v_exercise_order+1;
  end loop;
  v_group_order:=v_group_order+1;
 end loop;
 return jsonb_build_object('row',public.saude_treino_payload(v_id));
end; $$;
revoke all on function public.saude_manage_treinos(uuid,bigint,text,jsonb,timestamptz) from public,anon;
grant execute on function public.saude_manage_treinos(uuid,bigint,text,jsonb,timestamptz) to authenticated,service_role;
notify pgrst,'reload schema';
commit;
