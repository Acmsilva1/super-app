-- Remove somente dietas desta origem; preencha os IDs se necessário.
begin;
set local lock_timeout = '5s';
do $rollback$
declare
  v_perfis bigint[] := array[]::bigint[]; -- ex.: array[1,2]
  v_source constant text := 'seed-cardapio-diario-andre-juliana-20261127';
  v_count integer;
begin
  if cardinality(v_perfis) = 0 then
    select array_agg(distinct perfil_id) into v_perfis
      from public.tb_saude_dietas
     where source_file = v_source;
  end if;
  if v_perfis is null or cardinality(v_perfis) = 0 then
    raise notice 'Nenhuma dieta desta origem para remover.';
    return;
  end if;
  if exists (
    select 1 from public.tb_saude_alertas_agenda a
    join public.tb_saude_dietas d on d.id = a.dieta_id
    where d.source_file = v_source and d.perfil_id = any(v_perfis)
  ) then
    raise exception 'Há agendas vinculadas a estas dietas. Desvincule antes do rollback.';
  end if;
  delete from public.tb_saude_dietas
   where source_file = v_source
     and perfil_id = any(v_perfis)
     and slug like 'seed-cardapio-diario-20261127-perfil-%';
  get diagnostics v_count = row_count;
  raise notice 'Dietas removidas: %', v_count;
end;
$rollback$;
commit;
