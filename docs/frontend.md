# Super App — Frontend

Documentação do shell PWA, autenticação na UI, carregamento de módulos e comportamento de cada micro-app.

## Visão geral

- **Shell monolítico:** `index.html` (~11k linhas — HTML, CSS e JS vanilla)
- **PWA:** `manifest.json`, `sw.js`, ícones `icon-*.png`
- **Gráficos:** ECharts 5 (CDN)
- **Animações:** Motion 11 (CDN)
- **Fontes:** Orbitron + Space Grotesk; ícones Font Awesome 6

Produção: `super-app-zeta-virid.vercel.app`

## Arquitetura do shell

```text
index.html
  ├── Auth Supabase (login, cadastro, recovery)
  ├── Grid de apps (GET /api/apps)
  ├── Janelas modais por micro-app
  └── import() dinâmico de features/
```

### Classe principal

O shell expõe métodos internos para:
- Renderizar catálogo de apps após login
- Abrir/fechar janela de micro-app (`openAppWindow`)
- Carregar conteúdo via `loadAppContent(appId, container)`
- Injetar Bearer token em todas as chamadas `fetch('/api/*')`

### Service Worker (`sw.js`)

Cache de assets estáticos para uso offline parcial. Headers configurados em `vercel.json` para `sw.js` e `manifest.json`.

## Autenticação (UI)

Fluxos implementados no shell:
1. **Login** — email/senha via Supabase Auth
2. **Cadastro** — criação de conta
3. **Recovery** — link de redefinição de senha (detecta hash na URL)

Após login:
- Token armazenado na sessão Supabase
- Todas as requisições API incluem `Authorization: Bearer ...`
- Catálogo filtrado por role (admin vê todos; beta vê só Financeiro)

Config pública: `GET /api/auth-config`

## Carregamento de micro-apps

| App ID | Carregamento | Arquivo |
|---|---|---|
| `financeiro` | Inline no shell | Lógica embutida em `index.html` |
| `lista_compras` | Inline no shell | Lógica embutida em `index.html` |
| `fluxograma` | Dynamic import | `features/fluxograma/index.js` + `cloudSync.js` |

Padrão de cleanup ao fechar janela:
```javascript
if (container._cleanup) container._cleanup();
```

---

## Módulo: Financeiro

Implementado diretamente no `index.html`.

Funcionalidades:
- Dashboard mensal (receitas, despesas fixas/variadas, saldo)
- Gráficos ECharts (pizza, barras, histórico anual)
- CRUD de lançamentos com `tipo_registro`
- Poupança e metas
- Analista financeiro (`GET /api/financeiro-analista`)
- Cache client-side: `lib/financeiroAnualCache.js`

---

## Módulo: Lista de compras

Implementado no `index.html`.

Funcionalidades:
- Lista com checkbox de comprado
- Prioridade e categorias
- Toggle, reset e exclusão em massa via API

Modelo: `features/lista_compras/model/itemLista.js`

---

## Módulo: Fluxograma

Arquivos:
| Arquivo | Papel |
|---|---|
| `features/fluxograma/index.js` | Editor visual (nós, conexões) |
| `features/fluxograma/cloudSync.js` | Sync com Supabase |
| `features/fluxograma/model/flowchartModel.js` | Modelo de dados |
| `features/fluxograma/service/flowchartService.js` | Regras de persistência |
| `features/fluxograma/service/exportPngService.js` | Export PNG server-side |

Comportamento:
- Rascunho em `localStorage` enquanto edita
- Projetos salvos na nuvem via `/api/fluxograma`
- Export PNG via `/api/fluxograma-export`

---

## Estilo e UX

- Tema escuro com gradientes aurora (`--primary`, `--accent`)
- Layout responsivo mobile-first (`viewport-fit=cover`)
- Janelas modais estilo desktop para cada app
- Análise UX automatizada: `npm run test:ux`

## Scripts de desenvolvimento

```bash
npm install
npm run dev          # servidor local com /api/*
npm test             # testes unitários + API
npm run test:ux      # validação de componentes no index.html
```

Variáveis locais (`.env` — não commitar):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

## Testes frontend

| Arquivo | Cobertura |
|---|---|
| `scripts/ux-component-analyst.cjs` | Análise estática do shell |
