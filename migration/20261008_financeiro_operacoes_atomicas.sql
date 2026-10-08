begin;

-- Invoker + filtro explicito: RLS continua aplicavel mesmo quando a API usa um cliente autenticado.
create or replace function public.financeiro_realocar_registro(
  p_user_id uuid, p_source_table text, p_source_id text, p_target_table text, p_rows jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  source_row jsonb;
  item jsonb;
  inserted_row jsonb;
  result jsonb := '[]'::jsonb;
  columns_sql text;
  values_sql text;
  deleted_count integer;
begin
  if p_user_id is null or (auth.role() is distinct from 'service_role' and auth.uid() is distinct from p_user_id) then
    raise exception 'financeiro_forbidden' using errcode = '42501';
  end if;
  if p_source_table not in ('tb_financas','tb_despesas_fixas','tb_poupanca','tb_poupanca_metas')
    or p_target_table not in ('tb_financas','tb_despesas_fixas','tb_poupanca','tb_poupanca_metas')
    or p_source_table = p_target_table or p_source_table is null or p_target_table is null
    or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'financeiro_invalid_operation' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rows) not between 1 and 1200 then
    raise exception 'financeiro_invalid_rows' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  execute format('select to_jsonb(t) from public.%I t where id::text = $1 and user_id = $2 for update', p_source_table)
    into source_row using p_source_id, p_user_id;
  if source_row is null then raise exception 'financeiro_source_not_found' using errcode = 'P0002'; end if;
  if p_target_table = 'tb_poupanca_metas' then
    update public.tb_poupanca_metas set ativa = false where user_id = p_user_id and ativa;
  end if;
  for item in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'financeiro_invalid_row' using errcode = '22023'; end if;
    item := (item - 'id' - 'user_id') || jsonb_build_object('user_id',p_user_id);
    -- Somente colunas reais, sem identificador gerado; valores sao parametros, nunca SQL concatenado.
    select string_agg(format('%I', a.attname), ',' order by a.attnum),
           string_agg(format('r.%I', a.attname), ',' order by a.attnum)
      into columns_sql, values_sql
      from pg_attribute a
      where a.attrelid = to_regclass(format('public.%I',p_target_table))
        and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
        and a.attidentity = '' and item ? a.attname and a.attname <> 'id';
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r returning to_jsonb(%I.*)',
      p_target_table,columns_sql,values_sql,p_target_table,p_target_table) into inserted_row using item;
    result := result || jsonb_build_array(inserted_row);
  end loop;
  execute format('delete from public.%I where id::text = $1 and user_id = $2',p_source_table) using p_source_id,p_user_id;
  get diagnostics deleted_count = row_count;
  if deleted_count <> 1 then raise exception 'financeiro_source_not_found' using errcode = 'P0002'; end if;
  return result;
end;
$$;

create or replace function public.financeiro_criar_meta(p_user_id uuid,p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare result jsonb;
begin
  if p_user_id is null or (auth.role() is distinct from 'service_role' and auth.uid() is distinct from p_user_id) then
    raise exception 'financeiro_forbidden' using errcode = '42501';
  end if;
  if jsonb_typeof(p_payload) is distinct from 'object' or nullif(trim(p_payload->>'nome_meta'),'') is null
    or coalesce((p_payload->>'valor_meta')::numeric,0) <= 0 then
    raise exception 'financeiro_invalid_meta' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,0));
  update public.tb_poupanca_metas set ativa = false where user_id = p_user_id and ativa;
  insert into public.tb_poupanca_metas(user_id,nome_meta,valor_meta,data_inicio,ativa)
    values(p_user_id,trim(p_payload->>'nome_meta'),(p_payload->>'valor_meta')::numeric,
      coalesce((p_payload->>'data_inicio')::date,current_date),true)
    returning to_jsonb(tb_poupanca_metas.*) into result;
  return result;
end;
$$;
revoke all on function public.financeiro_realocar_registro(uuid,text,text,text,jsonb) from public,anon;
revoke all on function public.financeiro_criar_meta(uuid,jsonb) from public,anon;
grant execute on function public.financeiro_realocar_registro(uuid,text,text,text,jsonb) to authenticated,service_role;
grant execute on function public.financeiro_criar_meta(uuid,jsonb) to authenticated,service_role;
commit;
