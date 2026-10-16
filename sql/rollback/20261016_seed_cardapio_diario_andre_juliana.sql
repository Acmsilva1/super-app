-- Reversão opcional do seed: preencher os DOIS perfil_id retornados pela execução.
-- Só remove dietas deste seed que ainda não foram editadas nem ligadas a agendas.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $rollback$
declare
  v_perfis bigint[] := array[]::bigint[]; -- Exemplo: array[ID_ANDRE, ID_JULIANA].
  v_source constant text := 'seed-cardapio-diario-21-dias-20261016';
  v_linked boolean;
begin
  if cardinality(v_perfis) <> 2 or v_perfis[1] is null or v_perfis[2] is null or v_perfis[1]=v_perfis[2] then
    raise exception 'Informe os dois perfil_id reais retornados pelo seed para executar a reversão.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_source,0));
  perform id from public.tb_saude_dietas
    where perfil_id=any(v_perfis) and source_file=v_source
      and slug='seed-cardapio-diario-20261016-perfil-' || perfil_id::text for update;
  if exists(select 1 from public.tb_saude_dietas
    where perfil_id=any(v_perfis) and source_file=v_source
      and slug='seed-cardapio-diario-20261016-perfil-' || perfil_id::text
      and updated_at is distinct from created_at) then
    raise exception 'Uma dieta do seed foi editada. Reversão automática cancelada para preservar as alterações.';
  end if;
  if to_regclass('public.tb_saude_alertas_agenda') is not null then
    execute 'select exists(select 1 from public.tb_saude_alertas_agenda a join public.tb_saude_dietas d on d.id=a.dieta_id
      where d.perfil_id=any($1) and d.source_file=$2
        and d.slug=''seed-cardapio-diario-20261016-perfil-'' || d.perfil_id::text)'
      into v_linked using v_perfis,v_source;
    if v_linked then
      raise exception 'Uma dieta do seed está ligada a uma agenda. Reversão automática cancelada.';
    end if;
  end if;
  delete from public.tb_saude_dietas
    where perfil_id=any(v_perfis) and source_file=v_source
      and slug='seed-cardapio-diario-20261016-perfil-' || perfil_id::text;
end;
$rollback$;
commit;
