-- Remove somente as cinco tabelas públicas do treino antigo.
-- Não cria a estrutura do novo modo treino nem altera os perfis de Saúde.
-- Apaga também todos os dados dessas tabelas, sem configuração adicional.
-- Para permitir restauração, exporte DDL + dados + índices + policies + permissões
-- das tabelas e de suas sequências antes de executar.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  target text;
  relation regclass;
  consumer text;
begin
  foreach target in array array[
    'tb_missoes_treino_perfis', 'tb_missoes_treino',
    'tb_missoes_treino_itens', 'tb_missoes_treino_chamas', 'tb_missoes_treino_logs'
  ] loop
    relation := to_regclass(format('public.%I', target));
    if relation is null then continue; end if;
    if (select relkind from pg_class where oid = relation) <> 'r' then
      raise exception 'Limpeza cancelada: public.% não é uma tabela comum.', target;
    end if;
    execute format('lock table public.%I in access exclusive mode', target);
    -- SQL dinâmico em funções pode não aparecer como dependência de DROP RESTRICT.
    select format('%I.%I', n.nspname, p.proname) into consumer
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname not in ('pg_catalog', 'information_schema')
      and p.prosrc ~ format('(^|[^a-zA-Z0-9_])%s([^a-zA-Z0-9_]|$)', target)
    order by n.nspname, p.proname limit 1;
    if consumer is not null then
      raise exception 'Limpeza cancelada: a função % referencia public.%. Revise a dependência.', consumer, target;
    end if;
  end loop;
end;
$$;

-- As FKs entre estas tabelas são removidas junto delas.
-- Views, FKs e outras dependências externas bloqueiam a transação inteira.
drop table if exists
  public.tb_missoes_treino_logs,
  public.tb_missoes_treino_chamas,
  public.tb_missoes_treino_itens,
  public.tb_missoes_treino,
  public.tb_missoes_treino_perfis
restrict;

notify pgrst, 'reload schema';
commit;
