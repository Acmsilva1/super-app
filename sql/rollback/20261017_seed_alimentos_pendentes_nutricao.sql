-- Opcional e manual: remove somente cadastros deste seed sem edições ou vínculos.
-- Não executar automaticamente junto do seed.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
lock table public.tb_saude_alimentos in share row exclusive mode;

do $check$
begin
  if exists (
    select 1 from public.tb_saude_alimentos
    where source_file='seed-alimentos-pendentes-nutricao-20261017'
      and updated_at is distinct from created_at
  ) then
    raise exception 'Um alimento deste seed foi editado. Rollback interrompido para preservar alterações.';
  end if;
  if to_regclass('public.tb_saude_dietas') is not null then
    -- Impede novas gravações de dieta entre a checagem e a remoção.
    lock table public.tb_saude_dietas in share row exclusive mode;
    if exists (
      select 1 from public.tb_saude_dietas d
      cross join lateral jsonb_path_query(to_jsonb(d),'$.**.alimento_id') ref(value)
      join public.tb_saude_alimentos a on ref.value #>> '{}' = a.id::text
      where a.source_file='seed-alimentos-pendentes-nutricao-20261017'
    ) then
      raise exception 'Um alimento deste seed está vinculado a dieta. Rollback interrompido.';
    end if;
  end if;
end;
$check$;

delete from public.tb_saude_alimentos
where source_file='seed-alimentos-pendentes-nutricao-20261017'
returning id,item;
-- Não recua sequências: outros cadastros podem tê-las utilizado.
commit;
