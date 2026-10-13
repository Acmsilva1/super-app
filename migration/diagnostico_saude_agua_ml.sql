-- Diagnóstico somente leitura. Não registra consumo nem altera o banco.
-- Execute no SQL Editor do Supabase e compartilhe os resultados.
select
  to_regprocedure('public.saude_record_water_ml(uuid,bigint,integer,text)') is not null as funcao_instalada,
  to_regclass('public.tb_saude_agua_checkins') is not null as checkins_instalados;

select table_name, column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('tb_saude_agua_metas', 'tb_saude_agua_logs', 'tb_saude_agua_checkins')
  and column_name in ('meta_ml', 'realizado_ml', 'meta_doses', 'realizado_doses', 'quantidade_ml')
order by table_name, column_name;

select c.relname as tabela, k.conname as restricao, pg_get_constraintdef(k.oid) as definicao
from pg_constraint k
join pg_class c on c.oid = k.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('tb_saude_agua_metas', 'tb_saude_agua_logs', 'tb_saude_agua_checkins')
order by c.relname, k.conname;

select pg_get_functiondef(p.oid) as funcao_em_producao,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as servidor_pode_executar
from pg_proc p
where p.oid = to_regprocedure('public.saude_record_water_ml(uuid,bigint,integer,text)');
