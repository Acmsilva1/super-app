-- Auditoria estática: veja docs/auditoria-tabelas-supabase-20261011.md.
-- Executar primeiro sql/20261011_auditoria_tabelas_supabase.sql no projeto correto.
-- Exportar DDL + dados + permissões das cinco tabelas e duas views antes do DROP.
-- Somente public. Não remove tabelas atuais nem usa CASCADE.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Se alguma candidata tiver dados, o script bloqueia por padrão.
-- APENAS após exportar e conferir o backup, descomente a linha abaixo:
-- set local superapp.cleanup_backup_confirmed = 'on';

do $$
declare target text; relation regclass; has_rows boolean; consumer text;
begin
  foreach target in array array[
    'tb_compras', 'tb_financeiro_analise_runs', 'tb_financeiro_analises',
    'tb_financeiro_features_mensais', 'tb_financeiro_modelo_estado'
  ] loop
    relation := to_regclass(format('public.%I',target));
    if relation is null then continue; end if;
    if (select relkind from pg_class where oid=relation) <> 'r' then
      raise exception 'Limpeza cancelada: public.% não é uma tabela comum.', target;
    end if;
    execute format('lock table public.%I in access exclusive mode',target);
    select format('%I.%I',n.nspname,p.proname) into consumer
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname not in ('pg_catalog','information_schema')
        and p.prosrc ~ format('(^|[^a-zA-Z0-9_])%s([^a-zA-Z0-9_]|$)',target)
      order by n.nspname,p.proname limit 1;
    if consumer is not null then
      raise exception 'Limpeza cancelada: a função % ainda referencia public.%. Revise a dependência.',consumer,target;
    end if;
    execute format('select exists(select 1 from public.%I limit 1)',target) into has_rows;
    if has_rows and current_setting('superapp.cleanup_backup_confirmed',true) is distinct from 'on' then
      raise exception 'Limpeza cancelada: public.% contém dados. Exporte e confira o backup antes de habilitar cleanup_backup_confirmed.',target;
    end if;
  end loop;
  -- Funções que consultam as views também precisam ser revisadas antes da retirada.
  foreach target in array array['vw_financeiro_compras_mensal','vw_financeiro_ultimos_5_meses'] loop
    if to_regclass(format('public.%I',target)) is null then continue; end if;
    select format('%I.%I',n.nspname,p.proname) into consumer
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname not in ('pg_catalog','information_schema')
        and p.prosrc ~ format('(^|[^a-zA-Z0-9_])%s([^a-zA-Z0-9_]|$)',target)
      order by n.nspname,p.proname limit 1;
    if consumer is not null then
      raise exception 'Limpeza cancelada: a função % ainda referencia public.%. Revise a dependência.',consumer,target;
    end if;
  end loop;
end;
$$;

-- Views sem consumidor atual, retiradas junto com os respectivos módulos.
drop view if exists public.vw_financeiro_compras_mensal,
  public.vw_financeiro_ultimos_5_meses restrict;

-- Uma única instrução permite FKs entre as candidatas; dependências externas bloqueiam tudo.
drop table if exists public.tb_compras,
  public.tb_financeiro_analise_runs,
  public.tb_financeiro_analises,
  public.tb_financeiro_features_mensais,
  public.tb_financeiro_modelo_estado restrict;
notify pgrst, 'reload schema';
commit;
