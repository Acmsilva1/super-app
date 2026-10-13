-- Restaura as dietas anteriores a uma execução específica da recriação.
-- Preencha v_run com o run_id retornado pelo script principal.
-- Bloqueia a restauração se as dietas tiverem sido editadas depois.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $restore$
declare
  v_run uuid := null;
  v_backup public.tb_saude_dietas_seed_backup%rowtype;
begin
  if v_run is null then raise exception 'Informe o run_id do backup que deseja restaurar.'; end if;
  if not exists(select 1 from public.tb_saude_dietas_seed_backup where run_id=v_run) then
    raise exception 'Backup não encontrado.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('seed-cardapio-7-dias-1600-kcal-20261011',0));
  perform d.id from public.tb_saude_dietas d
    join public.tb_saude_dietas_seed_backup b on b.dieta_id=d.id
    where b.run_id=v_run for update of d;
  if exists (
    select 1 from public.tb_saude_dietas_seed_backup b
    left join public.tb_saude_dietas d on d.id=b.dieta_id
    where b.run_id=v_run and (d.id is null or to_jsonb(d) is distinct from b.replacement)
  ) then raise exception 'Dieta editada ou removida após a recriação. Nenhum registro foi restaurado.'; end if;
  for v_backup in select backup_id,run_id,saved_at,dieta_id,perfil_id,created_by,dieta,agendas,replacement from public.tb_saude_dietas_seed_backup where run_id=v_run loop
    delete from public.tb_saude_dietas where id=v_backup.dieta_id;
    insert into public.tb_saude_dietas
      select (jsonb_populate_record(null::public.tb_saude_dietas,v_backup.dieta)).*;
    update public.tb_saude_alertas_agenda a set dieta_id=v_backup.dieta_id
      from jsonb_array_elements(v_backup.agendas) saved
      where a.perfil_id=(saved.value->>'perfil_id')::bigint
        and a.created_by=(saved.value->>'created_by')::uuid and a.dieta_id is null;
  end loop;
end;
$restore$;
commit;
