-- Reverte somente as três tabelas novas quando estiverem vazias.
-- Se já houver dados, exporte DDL + dados + permissões antes de qualquer remoção.
begin;
set local lock_timeout = '5s';
do $$ declare target text; has_rows boolean; begin
  foreach target in array array['tb_saude_treino_exercicios','tb_saude_treino_blocos','tb_saude_treinos'] loop
    if to_regclass(format('public.%I', target)) is null then continue; end if;
    execute format('lock table public.%I in access exclusive mode', target);
    execute format('select exists(select 1 from public.%I)', target) into has_rows;
    if has_rows then raise exception 'Rollback cancelado: public.% contém dados.', target; end if;
  end loop;
end; $$;
drop table if exists public.tb_saude_treino_exercicios, public.tb_saude_treino_blocos, public.tb_saude_treinos restrict;
notify pgrst, 'reload schema';
commit;
