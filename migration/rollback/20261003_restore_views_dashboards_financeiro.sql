-- Rollback da migration 20261003_drop_views_dashboards_financeiro.sql.
-- Recria as views a partir das definicoes salvas em public.bkp_views_dashboards_20261003
-- e reaplica o padrao de permissao do projeto (sem anon; select para authenticated e service_role).
begin;

do $$
declare
  v record;
begin
  if to_regclass('public.bkp_views_dashboards_20261003') is null then
    raise exception 'Tabela public.bkp_views_dashboards_20261003 nao encontrada; rollback impossivel.';
  end if;

  for v in select view_name, definition, reloptions from public.bkp_views_dashboards_20261003 loop
    execute format(
      'create or replace view public.%I%s as %s',
      v.view_name,
      case
        when v.reloptions is null or cardinality(v.reloptions) = 0 then ''
        else format(' with (%s)', array_to_string(v.reloptions, ', '))
      end,
      rtrim(v.definition, E'; \n')
    );
    execute format('revoke all on public.%I from anon', v.view_name);
    execute format('grant select on public.%I to authenticated, service_role', v.view_name);
  end loop;
end
$$;

commit;
