# Super App — Documentação

PWA pessoal com micro-apps de finanças e produtividade. Frontend monolítico + backend serverless + Supabase.

**Produção:** [super-app-zeta-virid.vercel.app](https://super-app-zeta-virid.vercel.app)

## Documentação dividida em 3 partes

| Documento | Conteúdo |
|---|---|
| [**backend.md**](./backend.md) | Endpoints `/api/*`, auth, services, deploy, testes |
| [**frontend.md**](./frontend.md) | Shell PWA (`index.html`), módulos, fluxos de UI |
| [**db.md**](./db.md) | Tabelas, views, migrations, RLS, ordem de execução |

## Visão rápida

### Stack
- **Frontend:** HTML/CSS/JS vanilla, ECharts, PWA
- **Backend:** Vercel Functions (Node ESM)
- **Banco:** Supabase PostgreSQL + Auth
- **Deploy:** Vercel (`vercel.json`)

### Micro-apps
| ID | Módulo | API |
|---|---|---|
| `financeiro` | Dashboard, despesas, poupança, analista | `/api/financeiro`, `/api/financeiro-analista` |
| `lista_compras` | Lista com prioridade e check | `/api/lista-compras` |
| `fluxograma` | Diagramas (local + nuvem) | `/api/fluxograma`, `/api/fluxograma-export` |
| `missoes_treino` | Perfis + treinos diários | `/api/missoes-treino` |

### Estrutura do repositório
```text
super-app/
├── index.html          # Shell PWA + financeiro + lista inline
├── api/                # Vercel Functions
├── features/           # Domínio por módulo
├── lib/                # supabase.js, auth.js, cache
├── migration/          # Migrations versionadas
├── sql/                # Scripts auxiliares e views
├── tests/              # Vitest + Supertest
├── docs/               # Esta documentação
├── manifest.json
├── sw.js
└── vercel.json
```

### Fluxo de dados
```text
Login Supabase → Bearer /api/* → requireUser + roles → service → Supabase (RLS) → JSON → UI
```

## Como rodar

```bash
npm install
# Definir SUPABASE_URL e SUPABASE_ANON_KEY
npm run dev    # local com /api/*
npm test       # 94 testes
```

## Segurança (LGPD)

- Dados financeiros e pessoais isolados por `user_id` via RLS
- Token Bearer obrigatório em todas as APIs (exceto health checks)
- `.env` e credenciais nunca versionados

## Checkpoints recentes

| Data | Resumo |
|---|---|
| 2026-07-18 | Auth Supabase, RLS, permissões por usuário |
| 2026-08-03 | Views financeiras PostgreSQL (commit `ee651bf`) |
| 2026-08-12 | Perfis personalizados em missões de treino; docs divididas em backend/frontend/db |

Validação local (2026-08-12): `npm test` — 94/94 aprovados.
