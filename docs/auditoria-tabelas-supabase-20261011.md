# Auditoria de tabelas — 11/10/2026

## Alcance e resultado

Análise estática do checkout atual: consumidores em APIs, bibliotecas, frontend, scripts e migrations, junto da captura parcial do schema enviada. O catálogo de produção, os dados e consumidores externos **não foram consultados**. Ausência de referência no repositório não comprova desuso por integrações externas.

Cinco tabelas são candidatas à remoção: não têm consumidores no código atual e já existem scripts anteriores retirando suas funcionalidades. A migration consolida essa limpeza com bloqueios de dependências e dados. A existência dessas tabelas no banco precisa ser verificada pelo SQL de auditoria.

| Candidata em `public` | Evidência |
| --- | --- |
| `tb_compras` | Modo antigo de Compras do Financeiro retirado por `migration/20260929_drop_financeiro_compras.sql`. A Lista de Compras independente usa `tb_lista_compras` e permanece ativa. |
| `tb_financeiro_analises` | Estrutura antiga de análise/ML retirada em `delete_analista.sql`; nenhum consumidor atual encontrado. |
| `tb_financeiro_features_mensais` | Mesma retirada do pipeline de ML; nenhum consumidor atual encontrado. |
| `tb_financeiro_analise_runs` | Histórico do pipeline retirado; nenhum consumidor atual encontrado. |
| `tb_financeiro_modelo_estado` | Estado do modelo retirado; nenhum consumidor atual encontrado. |

As views legadas `vw_financeiro_compras_mensal` e `vw_financeiro_ultimos_5_meses` também entram na limpeza. `api/cron-treinar-modelo.js` retorna HTTP 410 para o treinamento descontinuado. O endpoint `api/financeiro-analista.js` **continua ativo** e usa as estruturas financeiras atuais através de `lib/financeiroShared.js`; a análise atual não depende das quatro tabelas de ML acima.

O script antigo `delete_analista.sql` usa `CASCADE`. Para esta limpeza, utilize a nova migration, que usa `RESTRICT`.

## Estruturas preservadas

| Grupo | Motivo para manter |
| --- | --- |
| `tb_financas`, `tb_despesas_fixas`, `tb_poupanca`, `tb_poupanca_metas`, `tb_financeiro_simulacoes`, `tb_financeiro_alertas` | Financeiro atual, simulador e agendamento. |
| `tb_lista_compras`, `tb_fluxograma_projetos` | Aplicativos independentes ainda utilizados. |
| `tb_telegram_compras`, `tb_action_rate_limits` | Rascunhos/confirmação de lançamentos e limitação de ações via RPC. |
| Tabelas atuais de saúde, incluindo `tb_saude_perfil_medidas`, `tb_saude_alertas_envios` e `tb_saude_tabela_nutricional` | Consumidores em saúde, cron, alertas e CRUD nutricional. O inventário SQL lista os nomes encontrados. |
| `app_modules`, `app_user_profiles`, `app_user_roles`, `app_user_permissions`, `usuarios` | Cadastro e autorização; `handle_new_app_user()` utiliza tabelas que podem não ter consultas diretas na aplicação. |
| `tb_missoes_treino`, `tb_missoes_treino_itens`, `tb_missoes_treino_chamas`, `tb_missoes_treino_perfis`, `tb_missoes_treino_logs` | O frontend de treino ainda chama `/api/missoes-treino`. O backend correspondente não foi encontrado neste checkout; essa lacuna não comprova que os dados foram aposentados. |
| `bkp_views_dashboards_20261003` | Backup das definições usado por `migration/rollback/20261003_restore_views_dashboards_financeiro.sql`. Ausência de consumo em runtime é esperada. |

Não entram neste DROP estruturas com origem ou destino insuficientemente comprovados, como `system_analysis_logs`, `system_analysis_connections`, `tb_notes`, `neon_notes`, `tb_saude_familiar`, `tb_saude_agua_perfis`, `saldo_corrente` e seus movimentos. As referências históricas isoladas não bastam para autorizar sua remoção. Tabelas adicionais fora da captura/repositório também ficam preservadas.

## Aplicação pelo responsável do banco

1. Execute `sql/20261011_auditoria_tabelas_supabase.sql` no projeto correto. É somente leitura: mostra inventário, estimativas de linhas, FKs, dependências e funções que mencionam as candidatas. Estimativas de linhas não são contagens nem prova de desuso.
2. Confira consumidores externos, funções e dependências exibidas. Não contorne uma dependência com `CASCADE`: investigue-a antes.
3. Exporte e confira um backup restaurável do DDL, dados e permissões das candidatas e suas duas views. Preserve também políticas, índices, constraints, triggers e sequences associados. Um CSV isolado não permite restaurar o schema.
4. Execute `migration/20261011_drop_tabelas_financeiro_legadas.sql`. Se existir qualquer registro, o script bloqueia por padrão. Somente depois de conferir o backup, descomente a linha `set local superapp.cleanup_backup_confirmed = 'on';` dentro da transação.

A migration limita os objetos a `public`, aceita objetos já ausentes, bloqueia tipos inesperados e funções que mencionem as tabelas, usa `RESTRICT` para dependências catalogadas e executa tudo numa transação. Uma falha impede a confirmação da limpeza inteira; se o editor deixar a transação aberta após erro, execute `ROLLBACK` antes de tentar novamente. Há limites de espera por locks (5 segundos) e de execução por instrução (30 segundos).

A busca no corpo das funções é conservadora e pode bloquear uma referência em comentário. Ela não detecta nomes construídos por concatenação, consumidores externos ou queries em outras aplicações; por isso a consulta prévia ao catálogo e a revisão do responsável continuam necessárias.

## Restauração e validação

Não há rollback automático fiel sem o DDL real de produção. `migration/rollback/20261011_drop_tabelas_financeiro_legadas.sql` interrompe a execução com essa orientação: restaure o backup conferido, incluindo dados e permissões. Não recrie produção com `local_schema_init.sql`.

Os testes locais em PostgreSQL via PGlite verificam a auditoria somente leitura, remoção das candidatas vazias, preservação de tabelas atuais, repetição da migration, bloqueio de dados, confirmação explícita de backup, dependências externas, referências em funções e tipos inesperados. Isso não substitui a inspeção ou validação no Supabase real. Nenhuma alteração no banco de produção foi executada nesta tarefa.
