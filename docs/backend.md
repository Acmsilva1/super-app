# Super App — Backend

Documentação dos endpoints serverless, bibliotecas compartilhadas, regras de domínio e autenticação.

## Visão geral

- **Runtime:** Node.js ES Modules em Vercel Functions
- **Pasta:** `api/` (handlers HTTP) + `features/` (services/models) + `lib/` (utilitários)
- **Persistência:** Supabase via `lib/supabase.js`
- **Auth:** Bearer token Supabase + roles em `app_user_roles` / `app_user_permissions`

Fluxo:

```text
Cliente (index.html) → GET/POST/PATCH/DELETE /api/*
  → requireUser() → service de domínio → Supabase → JSON
```

## Bibliotecas (`lib/`)

| Arquivo | Função |
|---|---|
| `supabase.js` | Cliente Supabase (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) |
| `auth.js` | `requireUser(req, { appId?, adminOnly? })` — valida JWT, role e permissão por módulo |
| `financeiroAnualCache.js` | Cache em memória de gráficos anuais por `(userId, ano)` |

### Autenticação (`lib/auth.js`)

- Header obrigatório: `Authorization: Bearer <access_token>`
- Roles admin: `owner` ou `admin` em `app_user_roles`
- Usuário comum: acesso via `app_user_permissions` (`app_id`, `can_access`)
- Bypass em testes: `NODE_ENV=test` ou `OFFLINE_DEV=true`
- Health checks (`?health=1`) são públicos nos endpoints que expõem

### Variáveis de ambiente

| Variável | Obrigatória | Uso |
|---|---|---|
| `SUPABASE_URL` | Sim | Cliente Supabase |
| `SUPABASE_ANON_KEY` | Sim | Cliente Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Cron/ops | Jobs administrativos |
| `CRON_SECRET` | Cron | Proteção de endpoints agendados |

## Catálogo de endpoints

### Shell e metadados

#### `GET /api/apps`
Lista micro-apps ativos no shell.

- Auth: `requireUser`
- Admin/owner: todos os apps de `APPS`
- Usuário comum: apenas `financeiro`

#### `GET /api/statistics`
Totais derivados do catálogo (`totalApps`, `activeApps`, etc.).

#### `GET /api/roadmap`
Roadmap estático da aplicação.

#### `GET /api/auth-config`
Configuração pública de auth para o frontend (URL Supabase, anon key).

---

### Financeiro

#### `/api/financeiro`
Métodos: `GET`, `POST`, `PATCH`, `DELETE`

- Auth: `requireUser({ appId: 'financeiro' })`
- Health: `GET ?health=1` (público)

Consolida:
- `tb_financas` — receitas e gastos variados
- `tb_despesas_fixas` — contas fixas e parcelas
- `tb_poupanca` / `tb_poupanca_metas` — poupança
- `tb_compras` — compras isoladas

`GET` retorna dashboard, gráficos, tabelas e bloco de poupança (views PostgreSQL quando disponíveis).

`POST/PATCH/DELETE` usam `tipo_registro` para rotear à tabela correta.

**Regra de replicação de despesas fixas:** cópia automática para o mês seguinte só no último dia do mês de origem; antes disso, entrada manual apenas.

Service principal: `features/financeiro/service/financeiroService.js`

Shared: `api/_financeiroShared.js` — `obterFinanceiroMes()`

#### `GET /api/financeiro-analista`
Análise histórica anual, risco (TLC), padrões e categorias acumuladas.

- Auth: `requireUser({ appId: 'financeiro' })`
- Reutiliza `_financeiroShared.js` com `bi=1`

#### `POST /api/cron-treinar-modelo`
Job agendado para treino de modelo financeiro (protegido por `CRON_SECRET`).

---

### Lista de compras

#### `/api/lista-compras`
Métodos: `GET`, `POST`, `PATCH`, `DELETE`

- Auth: `requireUser({ appId: 'lista_compras' })`
- Health: `GET ?health=1`

Recursos:
- Toggle item comprado (`PATCH` + `toggle`)
- Reset global (`PATCH` + `reset_checks`)
- Exclusão individual ou em massa (`DELETE` com `id` ou `delete_all`)

Service: `features/lista_compras/service/listaComprasService.js`

---

### Fluxograma

#### `/api/fluxograma`
Métodos: `GET`, `POST`, `PATCH`, `DELETE`

- Auth: `requireUser({ appId: 'fluxograma', adminOnly: true })`
- Tabela: `tb_fluxograma_projetos`

Recursos:
- Lista de projetos do usuário
- Busca por `id`
- Persistência de campo `dados` (JSON do diagrama)

Service: `features/fluxograma/service/flowchartService.js`

#### `GET /api/fluxograma-export`
Exportação PNG do diagrama (usa `pngjs`).

Service: `features/fluxograma/service/exportPngService.js`

---

### Missões de treino

#### `/api/missoes-treino`
Métodos: `GET`, `POST`, `PATCH`, `DELETE`

- Auth: `requireUser({ appId: 'missoes_treino', adminOnly: true })`
- Health: `GET ?health=1`
- Fuso: `America/Sao_Paulo`

**Perfis** (`tb_missoes_treino_perfis`):

| Método | Payload / Query |
|---|---|
| `GET` | `?resource=profiles` |
| `POST` | `{ resource: 'profile', nome, descricao?, cor?, icone? }` |
| `PATCH` | `{ resource: 'profile', profile_id, ... }` |
| `DELETE` | `{ resource: 'profile', profile_id }` |

**Treinos** (escopo por `profile_id`):

| Método | Payload / Query |
|---|---|
| `GET` | `?profile_id=<id>&date=YYYY-MM-DD?` |
| `POST` | `{ profile_id, title?, date?, items[] }` |
| `PATCH` | `{ mission_id, ... }` ou toggle item `{ id, completed }` |
| `DELETE` | `{ mission_id }` ou `{ id }` (item) |

Regras:
- Toda missão exige `perfil_id`
- Treinos são **fixos no perfil** — listagem devolve todos, sem filtro de data/dia da semana
- Sem carry-over e sem seed de semana
- Missões antigas com `perfil_id` nulo são adotadas no primeiro perfil (cria `Oficial` se não houver nenhum)
- Conclusão de item imutável (`completed: false` → 409)

Handler: `api/missoes-treino.js`

---

## Módulos legados (`features/`)

| Pasta | Status | Observação |
|---|---|---|
| `financeiro/` | Ativo | Endpoint consolidado `/api/financeiro` |
| `despesas_fixas/` | Legado interno | Usado por compatibilidade no financeiro |
| `financas/` | Legado | Referências antigas |
| `lista_compras/` | Ativo | |
| `fluxograma/` | Ativo | Rascunho local + sync nuvem |
| `missoes_treino/` | Ativo | UI em `index.js` (ver doc frontend) |
| `neonkeep/` | Placeholder | |

## Deploy e execução local

- Config: `vercel.json` — `outputDirectory: "."`, headers PWA
- Build: `npm run build` (no-op)
- Dev: `npm run dev` (`scripts/dev.js` — Express local simulando `/api/*`)
- Testes: `npm test` (Vitest + Supertest)

## Testes por módulo

| Arquivo | Cobertura |
|---|---|
| `tests/api/catalogo.api.test.js` | `/api/apps`, statistics, roadmap |
| `tests/api/financeiro.api.test.js` | CRUD financeiro |
| `tests/api/financeiro.carga.test.js` | Carga/volume |
| `tests/api/lista-compras.api.test.js` | Lista de compras |
| `tests/api/fluxograma.api.test.js` | Fluxograma |
| `tests/api/fluxograma-export.api.test.js` | Export PNG |
| `tests/api/missoes-treino.api.test.js` | Perfis e treinos |
| `tests/api/disponibilidade.api.test.js` | Health checks |

## Checkpoints recentes

| Data | Assunto |
|---|---|
| 2026-07-18 | Auth Supabase + RLS + permissões por usuário |
| 2026-08-03 | Views financeiras PostgreSQL + índices |
| 2026-08-12 | Perfis personalizados em missões de treino |
