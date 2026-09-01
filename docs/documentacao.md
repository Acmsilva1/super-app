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

### Regras do Financeiro

- `GET /api/financeiro` retorna dashboard, graficos, tabelas, poupanca, compras, risco e padroes.
- `POST/PATCH/DELETE` usam `tipo_registro` para escolher a tabela correta.
- Despesa fixa parcelada e conta fixa nao podem coexistir.
- Conta fixa e parcelas podem gerar registros futuros por serie.
- `pendente_mes=true` em despesa fixa sempre forca `status='pendente'`; alterar status para `pago` limpa a flag.
- `OFFLINE_DEV=true` retorna mock financeiro expandido com receitas, gastos variados, despesas fixas pagas/pendentes, compras e um item com `pendente_mes=true` para preview visual.
- O endpoint usa views agregadas do banco para reduzir calculo no Node.js.

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
A migration `20260830_financeiro_views_agregadas.sql` remove as views existentes antes de recria-las para evitar erro do PostgreSQL `42P16` ao mudar tipos expostos, como `numeric` para `numeric(12,2)`.

### Outras Tabelas

| Tabela | Modulo |
|---|---|
| `tb_lista_compras` | Lista de compras |
| `tb_fluxograma_projetos` | Fluxograma |
| `tb_missoes_treino_perfis` | Perfis de treino |
| `tb_missoes_treino` | Missoes de treino |
| `tb_missoes_treino_itens` | Itens das missoes |
| `tb_missoes_treino_chamas` | Historico/estado mensal de conclusao |

### RLS e LGPD

- Tabelas financeiras: acesso por `user_id = auth.uid()` ou admin.
- Lista de compras: acesso por usuario.
- Fluxograma e missoes de treino: acesso admin-only no desenho atual.
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
| 2026-08-31 | Ajuste da migration de views agregadas para dropar views antes de recriar e evitar erro `42P16` no Supabase; checkpoint base `0f0e5f5` |

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
- Corrigir encoding mojibake herdado em arquivos antigos e alguns textos existentes.
- Avaliar avisos do `npm run test:ux`: atualmente sao warnings, sem bloqueio critico.
- Rodar SAST/secret scanning antes de qualquer deploy relevante: Gitleaks e, quando aplicavel, Opengrep.
