-- Aplicar depois de 20261007_integrate_saude_dieta_alimentos.sql.
-- Preserva dietas existentes e as políticas de acesso da tabela.
begin;
alter table public.tb_saude_dietas add column if not exists semanal boolean not null default false;
alter table public.tb_saude_dietas add column if not exists semana jsonb not null default '[]'::jsonb;
create or replace function public.saude_diet_week_valid(p_weekly boolean, p_week jsonb, p_duration integer)
returns boolean language plpgsql immutable as $$
declare v_day jsonb; v_index integer := 0;
  v_titles text[] := array['Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado','Domingo'];
begin
  if jsonb_typeof(p_week) is distinct from 'array' then return false; end if;
  if not p_weekly then return jsonb_array_length(p_week) = 0; end if;
  if p_duration <> 7 or jsonb_array_length(p_week) <> 7 then return false; end if;
  for v_day in select value from jsonb_array_elements(p_week) loop
    v_index := v_index + 1;
    if jsonb_typeof(v_day) is distinct from 'object' or v_day->>'titulo' is distinct from v_titles[v_index]
      or jsonb_typeof(v_day->'refeicoes') is distinct from 'array' then return false; end if;
  end loop;
  return true;
end;
$$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tb_saude_dietas_week_check' and conrelid = 'public.tb_saude_dietas'::regclass) then
    alter table public.tb_saude_dietas add constraint tb_saude_dietas_week_check
      check (public.saude_diet_week_valid(semanal, semana, duracao_dias));
  end if;
end $$;
comment on column public.tb_saude_dietas.semana is 'Sete dias em ordem de segunda a domingo, com refeições independentes';
create or replace function public.save_saude_dieta_with_food(
  p_id bigint, p_actor uuid, p_admin boolean, p_diet jsonb, p_food jsonb, p_meal text, p_index integer
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_diet public.tb_saude_dietas%rowtype;
  v_food public.tb_saude_alimentos%rowtype;
  v_profile_owner uuid;
  v_meals jsonb := p_diet->'refeicoes';
  v_meal_index integer;
  v_week jsonb := coalesce(p_diet->'semana', '[]'::jsonb);
  v_weekly boolean := coalesce((p_diet->>'semanal')::boolean, false);
  v_day integer := (p_diet->>'dia_edicao')::integer;
begin
  if p_actor is null or p_admin is distinct from true then
    raise exception 'Cadastro no catalogo restrito ao administrador' using errcode = '42501';
  end if;
  -- O papel service_role e a API autenticada sao os unicos chamadores autorizados.
  if p_id is not null then
    select * into v_diet from public.tb_saude_dietas where id = p_id for update;
    if not found then raise exception 'Dieta nao encontrada' using errcode = 'P0002'; end if;
  end if;
  select created_by into v_profile_owner from public.tb_saude_perfis
    where id = (p_diet->>'perfil_id')::bigint for key share;
  if not found or (p_id is null and v_profile_owner is distinct from p_actor) then
    raise exception 'Perfil indisponivel' using errcode = '42501';
  end if;
  select ordinality::integer - 1 into v_meal_index
    from jsonb_array_elements(v_meals) with ordinality as m(value, ordinality)
    where value->>'tipo' = p_meal;
  if v_meal_index is null or p_index is null or p_index < 0
    or p_index >= jsonb_array_length(v_meals->v_meal_index->'itens') then
    raise exception 'Destino do alimento invalido' using errcode = '22023';
  end if;
  if v_weekly and (v_day is null or v_day < 0 or v_day > 6 or jsonb_array_length(v_week) <> 7) then
    raise exception 'Dia semanal invalido' using errcode = '22023';
  end if;
  -- Serializa o cadastro por nome para reutilizar alimentos em lancamentos simultaneos.
  perform pg_advisory_xact_lock(hashtextextended(lower(trim(p_food->>'item')), 0));
  select * into v_food from public.tb_saude_alimentos
    where lower(trim(item)) = lower(trim(p_food->>'item'));
  if not found then
    insert into public.tb_saude_alimentos (
      categoria, item, porcao_equivalente, peso_referencia_g, peso_unidade_g,
      kcal_100g, proteina_100g, carboidrato_100g, gordura_100g, observacoes, fonte_nutricional
    ) values (
      p_food->>'categoria', p_food->>'item', p_food->>'porcao', (p_food->>'peso_referencia_g')::numeric, nullif(p_food->>'peso_unidade_g', '')::numeric,
      (p_food->>'kcal_100g')::numeric, (p_food->>'proteina_100g')::numeric,
      (p_food->>'carboidrato_100g')::numeric, (p_food->>'gordura_100g')::numeric,
      p_food->>'observacoes', coalesce(p_food->>'fonte_nutricional', 'Cadastro manual')
    ) returning * into v_food;
  end if;
  v_meals := jsonb_set(v_meals, array[v_meal_index::text, 'itens', p_index::text],
    (v_meals->v_meal_index->'itens'->p_index) || jsonb_build_object('nome', v_food.item, 'alimento_id', v_food.id, 'calorias', null));
  if v_weekly then
    v_week := jsonb_set(v_week, array[v_day::text, 'refeicoes'], v_meals);
    v_meals := '[]'::jsonb;
  end if;
  if p_id is null then
    insert into public.tb_saude_dietas (
      slug, titulo, objetivo, duracao_dias, descricao, orientacoes_gerais, ritual_diario,
      dias, refeicoes, semanal, semana, observacoes, meta_calorias, perfil_id, source_file, created_by
    ) values (
      p_diet->>'slug', p_diet->>'titulo', p_diet->>'objetivo', (p_diet->>'duracao_dias')::smallint,
      p_diet->>'descricao', p_diet->>'orientacoes_gerais', p_diet->>'ritual_diario',
      p_diet->'dias', v_meals, v_weekly, v_week, p_diet->>'observacoes', (p_diet->>'meta_calorias')::integer,
      (p_diet->>'perfil_id')::bigint, 'Cadastro manual', p_actor
    ) returning * into v_diet;
  else
    update public.tb_saude_dietas set
      titulo = p_diet->>'titulo', objetivo = p_diet->>'objetivo', duracao_dias = (p_diet->>'duracao_dias')::smallint,
      descricao = p_diet->>'descricao', orientacoes_gerais = p_diet->>'orientacoes_gerais', ritual_diario = p_diet->>'ritual_diario',
      dias = p_diet->'dias', refeicoes = v_meals, semanal = v_weekly, semana = v_week, observacoes = p_diet->>'observacoes',
      meta_calorias = (p_diet->>'meta_calorias')::integer, perfil_id = (p_diet->>'perfil_id')::bigint
    where id = p_id returning * into v_diet;
  end if;
  return jsonb_build_object('row', to_jsonb(v_diet), 'food', to_jsonb(v_food));
end;
$$;
revoke all on function public.save_saude_dieta_with_food(bigint, uuid, boolean, jsonb, jsonb, text, integer) from public, anon, authenticated;
grant execute on function public.save_saude_dieta_with_food(bigint, uuid, boolean, jsonb, jsonb, text, integer) to service_role;


notify pgrst, 'reload schema';
commit;
