# Super App - Documentacao Unica

PWA pessoal com micro-apps de financas e produtividade. O projeto usa frontend vanilla, backend serverless em Node.js, Supabase PostgreSQL/Auth e deploy na Vercel.

Producao: `super-app-zeta-virid.vercel.app`

## 1. Visao Geral

### Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML, CSS, JavaScript vanilla, PWA |
| Graficos | ECharts 5 via CDN |
| Animacoes | Motion 11 via CDN |
| Icones/fontes | Font Awesome 6, Orbitron, Space Grotesk |
| Backend | Vercel Functions, Node.js ES Modules |
| Banco | Supabase PostgreSQL + Supabase Auth |
| Testes | Vitest, Supertest, script UX estatico |
| Deploy | Vercel |

### Estrutura

```text
super-app/
+-- index.html
+-- api/
+-- features/
+-- lib/
+-- migration/
+-- tests/
+-- docs/
|   +-- documentacao.md
+-- manifest.json
+-- sw.js
+-- vercel.json
```

### Micro-apps

| App ID | Modulo | API |
|---|---|---|
| `financeiro` | Dashboard, despesas, poupanca, analista | `/api/financeiro`, `/api/financeiro-analista` |
| `lista_compras` | Lista com prioridade e check | `/api/lista-compras` |
| `fluxograma` | Diagramas locais e em nuvem | `/api/fluxograma`, `/api/fluxograma-export` |
| `missoes_treino` | Perfis e treinos | `/api/missoes-treino` |
| `saude` | Tabela nutricional, dietas e perfis familiares | `/api/saude` |

### Fluxo Geral

```text
Login Supabase -> Bearer token -> /api/* -> requireUser()
  -> service de dominio -> Supabase com RLS -> JSON -> UI
```

## 2. Frontend

### Shell PWA

O frontend principal fica em `index.html`, com HTML, CSS e JavaScript vanilla no mesmo arquivo. Ele controla login, catalogo de apps, janelas dos micro-apps e chamadas autenticadas para `/api/*`.

| Arquivo | Papel |
|---|---|
| `index.html` | Shell PWA, UI principal e modulos inline |
| `manifest.json` | Manifesto PWA |
| `sw.js` | Service worker para cache estatico |
| `lib/financeiroAnualCache.js` | Cache client-side dos graficos anuais |

### Autenticacao na UI

- Login por email/senha via Supabase Auth.
- Cadastro de novo usuario.
- Recuperacao de senha por link.
- Injecao de `Authorization: Bearer <token>` nas chamadas para APIs protegidas.
- Catalogo filtrado por permissao: admin ve todos os apps; usuario comum ve os modulos liberados.

Config publica consumida pelo frontend: `GET /api/auth-config`.

### Carregamento de Modulos

| App ID | Carregamento | Arquivo |
|---|---|---|
| `financeiro` | Inline | `index.html` |
| `lista_compras` | Inline | `index.html` |
| `fluxograma` | Dynamic import | `features/fluxograma/index.js` |
| `missoes_treino` | Dynamic import | `features/missoes_treino/index.js` |
| `saude` | Dynamic import | `features/saude/index.js` |

Padrao de cleanup ao fechar janela:

```javascript
if (container._cleanup) container._cleanup();
```

### Financeiro

- Dashboard mensal com receitas, despesas fixas, despesas variadas e saldo.
- Graficos ECharts de categorias, status pago/pendente e historico anual.
- CRUD de lancamentos por `tipo_registro`.
- Despesas fixas possuem flag mensal `pendente_mes`: botao com X vermelho marca a conta como pendente do mes sem remover da lista, mantendo o valor nos totais de pendencias e exibindo selo vermelho `Pendente`.
- Headers de despesas fixas possuem padding responsivo para evitar titulo colado na borda em desktop e mobile.
- Aba Dados do Financeiro usa Motion para transicao leve entre filtros, entrada escalonada das linhas e micro feedback nos botoes de acao.
- Poupanca e metas.
- Analista financeiro via `/api/financeiro-analista`.
- Cache anual no navegador para reduzir chamadas repetidas.

### Lista de Compras

- Lista com checkbox de comprado.
- Prioridade e categorias.
- Toggle, reset e exclusao individual ou em massa.

Modelo: `features/lista_compras/model/itemLista.js`.

### Fluxograma

| Arquivo | Papel |
|---|---|
| `features/fluxograma/index.js` | Editor visual |
| `features/fluxograma/cloudSync.js` | Sincronizacao com Supabase |
| `features/fluxograma/model/flowchartModel.js` | Modelo de dados |
| `features/fluxograma/service/flowchartService.js` | Persistencia |
| `features/fluxograma/service/exportPngService.js` | Exportacao PNG server-side |

- Rascunho local em `localStorage`.
- Projetos salvos na nuvem via `/api/fluxograma`.
- Exportacao PNG via `/api/fluxograma-export`.

### Missoes de Treino

| Arquivo | Papel |
|---|---|
| `features/missoes_treino/index.js` | UI completa do modulo |
| `features/missoes_treino/mock.example.js` | Mock padrao versionado |
| `features/missoes_treino/mock.js` | Override local ignorado pelo Git |

```text
Abrir modulo -> perfis -> selecionar perfil -> treinos do perfil -> voltar para perfis
```

- Treinos sao fixos por perfil.
- Sem filtro obrigatorio por dia da semana.
- Sem carry-over automatico.
- Mock local ativo em `localhost`, `127.0.0.1` e `[::1]`.
- IDs vindos do Supabase sao normalizados na UI antes de editar ou excluir, evitando divergencia entre IDs numericos da API e atributos textuais do HTML.
- Ao criar uma missao, o exercicio ainda preenchido no formulario e adicionado automaticamente; se os campos estiverem invalidos, a UI mostra feedback em vez de ignorar o clique.
- A exclusao de perfil remove primeiro itens, chamas e missoes vinculadas, sem depender exclusivamente de cascata implicita no banco.
- Se a insercao dos itens falhar depois da criacao da missao, a API remove a missao incompleta para nao deixar registro orfao.

### Saude

| Arquivo | Papel |
|---|---|
| `features/saude/index.js` | UI da tabela nutricional, dietas e perfis |
| `features/saude/service/perfilSaudeService.js` | Calculo, classificacao e formatacao do IMC |
| `features/saude/service/tabelaNutricionalService.js` | Filtros e paginacao nutricional |
| `api/saude.js` | Contratos e persistencia do modulo |

O subtopico `Perfil` permite cadastrar varias pessoas da familia. Cada perfil possui nome, sexo, data de nascimento, peso e altura obrigatorios, alem de cintura, quadril, peito, braco e coxa opcionais.

O IMC e calculado automaticamente por `peso_kg / (altura_m * altura_m)`. Para menores de 20 anos, a interface exibe o valor, mas nao aplica a classificacao adulta, pois a referencia pediatrica depende de idade e sexo.

Na criacao do perfil, o banco grava o primeiro snapshot de medidas. Atualizacoes de peso, altura ou circunferencias geram automaticamente outro registro com `registrado_em`, formando a linha do tempo. Alteracoes somente em nome, sexo ou nascimento nao duplicam o historico de medidas.

O modo `OFFLINE_DEV=true` simula o CRUD e a linha do tempo em memoria. Esses dados sao descartados quando o servidor local e reiniciado.

## 3. Backend

### Visao Geral

| Area | Detalhe |
|---|---|
| Runtime | Node.js ES Modules em Vercel Functions |
| Handlers | `api/` |
| Dominio | `features/` |
| Utilitarios | `lib/` |
| Persistencia | Supabase via `lib/supabase.js` |
| Auth | `requireUser()` em `lib/auth.js` |

### Bibliotecas

| Arquivo | Funcao |
|---|---|
| `lib/supabase.js` | Cria cliente Supabase |
| `lib/auth.js` | Valida token, role e permissao por app |
| `lib/financeiroAnualCache.js` | Cache client-side exportado para o navegador |
| `api/_financeiroShared.js` | Logica compartilhada do financeiro |

### Autorizacao

- Header obrigatorio: `Authorization: Bearer <access_token>`.
- Roles administrativas: `owner` e `admin`.
- Usuarios comuns dependem de `app_user_permissions`.
- Health checks com `?health=1` podem ser publicos nos endpoints que oferecem esse recurso.
- Em testes e dev offline, `NODE_ENV=test` ou `OFFLINE_DEV=true` ativam bypass controlado.

### Endpoints

| Endpoint | Metodos | Auth | Papel |
|---|---|---|---|
| `/api/apps` | GET | Sim | Lista apps disponiveis |
| `/api/statistics` | GET | Nao sensivel | Totais do catalogo |
| `/api/roadmap` | GET | Nao sensivel | Roadmap estatico |
| `/api/auth-config` | GET | Publico | Config publica Supabase |
| `/api/financeiro` | GET, POST, PATCH, DELETE | `financeiro` | Dashboard, CRUD financeiro e flag `pendente_mes` |
| `/api/financeiro-analista` | GET | `financeiro` | Analise historica e categorias |
| `/api/cron-treinar-modelo` | POST | `CRON_SECRET` | Job de treino financeiro |
| `/api/lista-compras` | GET, POST, PATCH, DELETE | `lista_compras` | CRUD da lista |
| `/api/fluxograma` | GET, POST, PATCH, DELETE | Admin | Projetos de fluxograma |
| `/api/fluxograma-export` | GET | Admin | Exportacao PNG |
| `/api/missoes-treino` | GET, POST, PATCH, DELETE | Admin | Perfis, missoes e itens |
| `/api/saude` | GET, POST, PATCH, DELETE | Admin | Tabela nutricional e dietas; `resource=perfis` aceita GET, POST e PATCH |

### Regras dos Perfis de Saude

- `GET /api/saude?resource=perfis` lista somente os perfis do usuario autenticado e inclui o historico de medidas.
- `POST /api/saude?resource=perfis` cria o perfil e o primeiro ponto da linha do tempo.
- `PATCH /api/saude?resource=perfis` atualiza o perfil; o trigger do banco registra novo snapshot apenas quando uma medida muda.
- A API valida data de nascimento, sexo e limites de peso, altura e circunferencias antes da gravacao.
- Mesmo em chamadas administrativas, a API filtra `created_by` explicitamente para impedir mistura de dados entre contas.

### Regras do Financeiro

- `GET /api/financeiro` sem `secao` preserva o contrato legado completo.
- `GET /api/financeiro?secao=data|summary|poupanca|compras` carrega somente a aba solicitada. O frontend usa esse contrato segmentado e guarda em memoria as secoes ja visitadas.
- A aba `data` executa duas consultas mensais, com colunas explicitas. `summary` consulta as views agregadas apenas quando o dashboard e aberto.
- Poupanca e compras usam paginacao de 50 registros e retornam `pagination.page`, `pagination.limit` e `pagination.has_more`.
- A materializacao de despesas fixas nao ocorre mais durante GET. Ela e acionada explicitamente por `POST` com `acao=materializar_despesas_fixas`.
- `POST/PATCH/DELETE` usam `tipo_registro` para escolher a tabela correta.
- Despesa fixa parcelada e conta fixa nao podem coexistir.
- Conta fixa e parcelas podem gerar registros futuros por serie.
- `pendente_mes=true` em despesa fixa sempre forca `status='pendente'`; alterar status para `pago` limpa a flag.
- `OFFLINE_DEV=true` retorna mock financeiro expandido e simula mutacoes com 700 ms de latencia, sem acessar o Supabase. Esse modo valida a interacao otimista, mas nao persiste alteracoes apos recarregar a pagina.
- O endpoint usa views agregadas do banco para reduzir calculo no Node.js.
- As consultas segmentadas mantem escopo por `user_id`/RLS e reduzem dados pessoais em transito usando selecao explicita de colunas, em linha com minimizacao da LGPD.

### Desempenho do Financeiro

Benchmark local em `OFFLINE_DEV=true`, 30 requisicoes sequenciais por rota, em 2026-09-11:

| Cenario | Media | P95 | Payload |
|---|---:|---:|---:|
| Contrato legado completo | 35,55 ms | 39,13 ms | 8.263 bytes |
| Abertura inicial em `data` | 21,02 ms | 29,66 ms | 3.321 bytes |
| `summary` sob demanda | 20,47 ms | 28,77 ms | 1.743 bytes |
| `poupanca` sob demanda | 16,82 ms | 31,83 ms | 551 bytes |
| `compras` sob demanda | 19,28 ms | 33,32 ms | 957 bytes |

A abertura inicial reduziu o payload em 59,8%, a media local em 40,9% e a quantidade de consultas simuladas de ate 10 para 2. Os tempos sao de mock local e nao representam a latencia do Supabase real; medicao integrada depende de autorizacao explicita.

Alteracoes de `status` e `pendente_mes` em despesas fixas usam interface otimista: a linha muda imediatamente entre as listas, totais e termometro sao recalculados localmente e Motion anima as linhas. O PATCH ocorre em segundo plano, sem recarregar o modulo; falhas restauram o estado anterior e exibem o erro. Operacoes concorrentes no mesmo registro sao bloqueadas ate a resposta.

O mesmo modelo otimista cobre criacao, edicao, exclusao, realocacao entre tipos, metas de poupanca e materializacao de despesas fixas. A UI altera primeiro o cache em memoria e preserva aba/scroll; a resposta do servidor reconcilia IDs e dados oficiais sem tela de loading. Cada escrita possui limite de confirmacao de 2 minutos.

Operacoes ainda pendentes ou com falha sao registradas no `localStorage` por usuario usando apenas metadados saneados (`id` da operacao, tipo, secao, rotulo, horario e status). Descricao, valor e payload financeiro nao sao persistidos, evitando ampliar exposicao LGPD. Se o app fechar antes da confirmacao, o timer e restaurado na proxima abertura; ao vencer, o app mostra alerta persistente e oferece sincronizar ou voltar ao Financeiro para repetir a acao. Como o payload nao e persistido, nenhuma escrita financeira e repetida silenciosamente apos reinicio.

Durante uma mutacao, a UI exibe `Sincronizando com o banco...` sem bloquear a tela. A confirmacao troca o aviso para sucesso; falha ou timeout exibe erro e mantem o fluxo de recuperacao. Isso permite verificar visualmente que a mudanca local ocorreu antes da resposta do backend.

### Analista Financeiro

`GET /api/financeiro-analista` reutiliza `obterFinanceiroMes()` com `bi=1` e consulta `vw_financeiro_categoria_anual` para ranking anual de categorias. Se a view ainda nao existir, o endpoint mantem resposta com fallback vazio para nao quebrar ambiente antigo.

## 4. Banco De Dados

### Provedor e Schema

| Item | Valor |
|---|---|
| Provedor | Supabase PostgreSQL |
| Schema principal | `public` |
| Schema dev opcional | `superapp` em seeds |
| Auth | Supabase Auth (`auth.users`) |
| Isolamento | RLS por `user_id` |

### Controle de Acesso

| Tabela | Funcao |
|---|---|
| `app_modules` | Catalogo de modulos |
| `app_user_roles` | Role por usuario |
| `app_user_permissions` | Permissao por usuario e app |
| `app_user_profiles` | Perfil basico do usuario |

Funcoes relevantes:

- `app_owner_user_id()`
- `current_app_user_id()`
- `is_app_admin()`
- `can_access_app(target_app_id text)`
- `touch_updated_at()`

### Tabelas Financeiras

| Tabela | Descricao |
|---|---|
| `tb_financas` | Receitas e gastos variados |
| `tb_despesas_fixas` | Contas fixas, parcelas e flag mensal `pendente_mes` |
| `tb_poupanca` | Depositos e resgates |
| `tb_poupanca_metas` | Metas de poupanca |
| `tb_compras` | Compras isoladas |
| `tb_financeiro_analises` | Analises persistidas |
| `tb_financeiro_features_mensais` | Features mensais para ML |
| `tb_financeiro_analise_runs` | Execucoes de analise |
| `tb_financeiro_modelo_estado` | Estado do modelo |

### Views Financeiras

Arquivo principal: `migration/20260830_financeiro_views_agregadas.sql`.

| View | Papel |
|---|---|
| `vw_financeiro_resumo_mensal` | Receitas, despesas fixas, despesas variadas, saldo e status das fixas |
| `vw_financeiro_categoria_mensal` | Ranking mensal por categoria |
| `vw_financeiro_categoria_anual` | Ranking anual por categoria para o analista |
| `vw_financeiro_historico_anual` | Historico anual por mes |
| `vw_financeiro_poupanca_resumo` | Total acumulado, meta ativa, progresso e status |
| `vw_financeiro_compras_mensal` | Total, quantidade e ticket medio de compras por mes |

As views usam `security_invoker = true` para respeitar RLS das tabelas base.

### Outras Tabelas

| Tabela | Modulo |
|---|---|
| `tb_lista_compras` | Lista de compras |
| `tb_fluxograma_projetos` | Fluxograma |
| `tb_missoes_treino_perfis` | Perfis de treino |
| `tb_missoes_treino` | Missoes de treino |
| `tb_missoes_treino_itens` | Itens das missoes |
| `tb_missoes_treino_chamas` | Historico/estado mensal de conclusao |
| `tb_saude_tabela_nutricional` | Itens e porcoes equivalentes |
| `tb_saude_dietas` | Planos alimentares estruturados por dia |
| `tb_saude_perfis` | Dados atuais dos perfis familiares |
| `tb_saude_perfil_medidas` | Snapshots com IMC e timestamp da linha do tempo |

### RLS e LGPD

- Tabelas financeiras: acesso por `user_id = auth.uid()` ou admin.
- Lista de compras: acesso por usuario.
- Fluxograma e missoes de treino: acesso admin-only no desenho atual.
- Perfis de saude: acesso restrito a `created_by = auth.uid()` nas tabelas de perfis e medidas; a API repete o filtro por usuario.
- `anon` nao deve ter acesso direto as tabelas de dados.
- `.env`, tokens, service role e credenciais nao devem ser versionados.
- `SUPABASE_SERVICE_ROLE_KEY` nunca deve ir para frontend, bundle ou arquivo publico.

### Tabelas Removidas ou Legado

| Tabela | Status |
|---|---|
| `tb_notes` | Removida |
| `tb_calendario` | Legado citado em RLS |
| `tb_saldo_conta_corrente` | Removida |

## 5. Versionamento

### Politica de Documentacao

- A documentacao humana oficial fica somente em `docs/documentacao.md`.
- Arquivos antigos `docs/backend.md`, `docs/frontend.md` e `docs/db.md` foram consolidados neste documento.
- Mudancas tecnicas relevantes devem atualizar este arquivo na mesma interacao.
- Checkpoints devem registrar data, resumo e commit/hash quando houver repo Git valido.

### Migrations

| Arquivo | Assunto |
|---|---|
| `20260418_remove_notes_module.sql` | Remove modulo notes |
| `20260422_create_tb_poupanca.sql` | Cria poupanca |
| `20260422_create_tb_poupanca_metas.sql` | Cria metas de poupanca |
| `20260505_remove_saude_familiar.sql` | Remove saude familiar |
| `20260510_tb_despesas_fixas_parcelas.sql` | Parcelas em despesas fixas |
| `20260519_tb_despesas_fixas_conta_fixa.sql` | Flag de conta fixa |
| `20260521_add_compras_variadas_columns.sql` | Colunas de compras variadas |
| `20260531_create_tb_saldo_conta_corrente.sql` | Saldo de conta corrente legado |
| `20260531_create_tb_saldo_conta_corrente_movimentos.sql` | Movimentos de saldo legado |
| `20260601_drop_tb_saldo_conta_corrente.sql` | Remove saldo de conta corrente |
| `20260710_create_tb_compras.sql` | Cria compras isoladas |
| `20260718_enable_rls_user_permissions.sql` | RLS, roles e permissoes |
| `20260812_add_missoes_treino_perfis.sql` | Perfis de treino |
| `20260813_adopt_orphan_missoes_treino.sql` | Backfill de missoes sem perfil |
| `20260830_financeiro_views_agregadas.sql` | Views agregadas financeiras |
| `20260830_tb_despesas_fixas_pendente_mes.sql` | Flag mensal de pendencia em despesas fixas |
| `20260913_create_saude_module.sql` | Modulo Saude, tabela nutricional, permissoes e RLS |
| `20260914_create_saude_dietas.sql` | Dietas estruturadas e RLS |
| `20260914_create_saude_perfis.sql` | Perfis familiares, IMC, historico automatico e RLS por usuario |

### Scripts

| Script | Uso |
|---|---|
| `npm run dev` | Servidor local com Express simulando `/api/*` |
| `npm test` | UX estatico + Vitest |
| `npm run test:ux` | Analise estatica de UX |
| `npm run build` | Build no-op atual |
| `npm run doc:validate` | Validacao externa de documentacao |
| `npm run doc:sync` | Sincronizacao externa de documentacao |
| `npm run doc:push` | Publicacao externa de documentacao |
| `npm run doc:watch` | Watch externo de documentacao |

### Variaveis de Ambiente

| Variavel | Uso |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | Chave publica anon |
| `SUPABASE_SERVICE_ROLE_KEY` | Operacoes administrativas/cron; nunca no frontend |
| `SUPABASE_SCHEMA` | Schema opcional |
| `CRON_SECRET` | Protecao de cron |
| `OFFLINE_DEV` | Modo local offline |

### Git e Arquivos Ignorados

O `.gitignore` cobre:

- `node_modules/`, `dist/`, `build/`, `.vercel/`
- `.env`, `.env.local`, `.env.*`, `api/.env.local`
- logs e arquivos de sistema
- scripts locais da mensageria Telegram
- `.mensageria/`
- `features/missoes_treino/mock.js`
- `scratch/`

### Testes e Qualidade

Suites principais:

| Arquivo | Cobertura |
|---|---|
| `tests/api/catalogo.api.test.js` | Catalogo, statistics e roadmap |
| `tests/api/financeiro.api.test.js` | CRUD financeiro |
| `tests/api/financeiro-analista.api.test.js` | Analista financeiro e categoria anual |
| `tests/api/financeiro.carga.test.js` | Carga do financeiro |
| `tests/api/lista-compras.api.test.js` | Lista de compras |
| `tests/api/fluxograma.api.test.js` | Fluxograma |
| `tests/api/fluxograma-export.api.test.js` | Export PNG |
| `tests/api/missoes-treino.api.test.js` | Perfis e treinos |
| `tests/api/disponibilidade.api.test.js` | Health checks |
| `tests/api/saude.api.test.js` | CRUD de Saude, perfis, IMC e linha do tempo |
| `tests/database/saudeSql.test.js` | Migrations, triggers e RLS de Saude |
| `tests/ui/saudeUi.test.js` | Estrutura responsiva do modulo Saude |
| `tests/services/perfilSaude.service.test.js` | Calculo e classificacao do IMC |
| `tests/services/missoesTreinoUi.test.js` | IDs numericos/textuais e criacao direta de missao |
| `tests/services/*.test.js` | Services e regras de dominio |

### Checkpoints

| Data | Resumo |
|---|---|
| 2026-07-18 | Auth Supabase, RLS, roles e permissoes por usuario |
| 2026-08-03 | Views financeiras PostgreSQL e indices |
| 2026-08-12 | Perfis personalizados em missoes de treino |
| 2026-08-13 | Fix de missoes sem `perfil_id` e listagem de treinos sem dia no titulo |
| 2026-08-30 | Consolidacao da documentacao em arquivo unico; checkpoint sem hash porque o workspace local nao esta em repo Git valido |
| 2026-08-30 | Flag `pendente_mes` em despesas fixas com selo vermelho, PATCH e migration; checkpoint sem hash porque o workspace local nao esta em repo Git valido |
| 2026-08-30 | Mock financeiro expandido para preview local da UI; checkpoint sem hash porque o workspace local nao esta em repo Git valido |
| 2026-08-30 | Ajuste de respiro nos headers de despesas fixas no desktop e mobile; checkpoint sem hash porque o workspace local nao esta em repo Git valido |
| 2026-08-30 | Motion aplicado na aba Dados do Financeiro para troca de filtros, rows e botoes de acao; checkpoint sem hash porque o workspace local nao esta em repo Git valido |
| 2026-09-11 | Financeiro segmentado por aba, paginacao de historicos, materializacao explicita, descarte completo de graficos e benchmark local; checkpoint sem hash porque o workspace nao e um repositorio Git valido |
| 2026-09-11 | Atualizacao otimista de status e pendencia mensal, com Motion, rollback em falha e sem reset da tela; checkpoint sem hash porque o workspace nao e um repositorio Git valido |
| 2026-09-11 | Cache otimista para todas as mutacoes financeiras, timeout persistente de 2 minutos e alerta restaurado na reabertura sem armazenar payload financeiro; checkpoint sem hash porque o workspace nao e um repositorio Git valido |
| 2026-09-11 | Mutacoes simuladas no modo offline corrigem `fetch failed` no preview local e indicador visual diferencia sincronizacao e confirmacao; checkpoint sem hash porque o workspace nao e um repositorio Git valido |
| 2026-09-11 | `.gitignore` reforcado para excluir relatorios de cobertura, caches, temporarios, configuracoes locais de IDE/agentes e arquivos comuns de credenciais; assets da aplicacao permanecem versionaveis |
| 2026-09-14 | Subtopico Perfil em Saude com perfis familiares, calculo automatico de IMC, snapshots de medidas, linha do tempo, RLS por usuario e QA visual desktop/mobile; workspace atual sem `.git` |
| 2026-09-14 | CRUD de Missoes de Treino corrigido para IDs do Supabase, criacao direta com exercicio preenchido, limpeza de dependencias na exclusao e rollback de missao incompleta |

## 6. Como Rodar

```bash
npm install
npm run dev
npm test
npm run build
```

Para rodar com Supabase real, configure as variaveis de ambiente localmente ou na Vercel. Para dev offline, use `OFFLINE_DEV=true` quando o fluxo permitir mock local.

## 7. Pendencias Tecnicas

- Aplicar `migration/20260830_financeiro_views_agregadas.sql` no Supabase real antes de depender da nova view anual em producao.
- Aplicar `migration/20260830_tb_despesas_fixas_pendente_mes.sql` no Supabase real antes de usar a flag mensal de pendencias.
- Aplicar `migration/20260914_create_saude_perfis.sql` no Supabase real antes de usar os perfis de Saude fora do modo offline. A migration `20260913_create_saude_module.sql` e pre-requisito.
- Corrigir encoding mojibake herdado em arquivos antigos e alguns textos existentes.
- Avaliar avisos do `npm run test:ux`: atualmente sao warnings, sem bloqueio critico.
- Rodar SAST/secret scanning antes de qualquer deploy relevante: Gitleaks e, quando aplicavel, Opengrep.
