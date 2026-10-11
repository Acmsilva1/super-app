-- SOMENTE LEITURA: executar no SQL Editor do projeto Supabase pretendido.
-- Não lê conteúdo financeiro/pessoal. Estatísticas não comprovam desuso.
begin transaction read only;

-- Inventário real, inclusive tabelas que não aparecem na captura enviada.
select n.nspname as schema,c.relname as tabela,c.relkind as tipo,
  c.reltuples::bigint as linhas_estimadas,c.relrowsecurity as rls,
  case
    when c.relname in ('tb_compras','tb_financeiro_analises','tb_financeiro_features_mensais','tb_financeiro_analise_runs','tb_financeiro_modelo_estado')
      then 'Candidata: sem consumidor no código atual; validar dependências e backup'
    when c.relname='bkp_views_dashboards_20261003' then 'Preservar: backup utilizado pelo rollback de dashboards'
    when c.relname in ('app_modules','app_user_profiles','app_user_roles','app_user_permissions','usuarios') then 'Preservar: autenticação, permissões ou cadastro'
    when c.relname in ('tb_missoes_treino','tb_missoes_treino_itens','tb_missoes_treino_chamas','tb_missoes_treino_perfis','tb_missoes_treino_logs')
      then 'Preservar: módulo de treino ainda referenciado pelo frontend; backend ausente neste checkout'
    when c.relname in ('tb_financas','tb_despesas_fixas','tb_poupanca','tb_poupanca_metas','tb_financeiro_simulacoes','tb_financeiro_alertas','tb_lista_compras','tb_fluxograma_projetos','tb_telegram_compras','tb_action_rate_limits',
      'tb_saude_alimentos','tb_saude_tabela_nutricional','tb_saude_perfis','tb_saude_perfil_medidas','tb_saude_dietas','tb_saude_agua_metas','tb_saude_agua_logs','tb_saude_alertas_agenda','tb_saude_alertas_envios','tb_saude_admin_activity','tb_saude_alertas_runs')
      then 'Preservar: consumidor atual direto ou via RPC'
    else 'Não classificada: manter até auditoria específica'
  end as analise_codigo
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p','f') order by c.relname;

-- FKs: origens e destinos das candidatas (sem dados de registros).
select con.conrelid::regclass::text as origem,con.confrelid::regclass::text as destino,con.conname,
  pg_get_constraintdef(con.oid) as definicao
from pg_constraint con
where con.contype='f' and (con.conrelid in (select oid from pg_class where relnamespace='public'::regnamespace and relname in ('tb_compras','tb_financeiro_analises','tb_financeiro_features_mensais','tb_financeiro_analise_runs','tb_financeiro_modelo_estado'))
  or con.confrelid in (select oid from pg_class where relnamespace='public'::regnamespace and relname in ('tb_compras','tb_financeiro_analises','tb_financeiro_features_mensais','tb_financeiro_analise_runs','tb_financeiro_modelo_estado')))
order by origem,destino;

-- Dependentes catalogados, incluindo views, constraints e defaults.
select c.relname as candidata,pg_describe_object(d.classid,d.objid,d.objsubid) as dependente,d.deptype
from pg_depend d join pg_class c on d.refclassid='pg_class'::regclass and d.refobjid=c.oid
where c.relnamespace='public'::regnamespace and c.relname in ('tb_compras','tb_financeiro_analises','tb_financeiro_features_mensais','tb_financeiro_analise_runs','tb_financeiro_modelo_estado')
order by candidata,dependente;

-- PL/pgSQL e SQL dinâmico podem referenciar tabelas sem pg_depend.
select target.tabela,n.nspname as schema_funcao,p.proname as funcao
from unnest(array['tb_compras','tb_financeiro_analises','tb_financeiro_features_mensais','tb_financeiro_analise_runs','tb_financeiro_modelo_estado','vw_financeiro_compras_mensal','vw_financeiro_ultimos_5_meses']) target(tabela)
join pg_proc p on p.prosrc ~ format('(^|[^a-zA-Z0-9_])%s([^a-zA-Z0-9_]|$)',target.tabela)
join pg_namespace n on n.oid=p.pronamespace
where n.nspname not in ('pg_catalog','information_schema') order by target.tabela,n.nspname,p.proname;
commit;
