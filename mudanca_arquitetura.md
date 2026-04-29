# Mudança de arquitetura — pastas por *features* + camadas na API

Este documento define o **alvo de organização** alinhado ao padrão usado em projetos como *command-center-web*: **feature slices** no frontend e na API, com **rotas → controllers → services → repositories** dentro de cada feature, e código partilhado em `shared` / `core`.

## Referência de pastas (alvo)

```
super-app-1/
  features/<dominio>/     # na raiz — model/, service/, index.js (domínio de negócio)
  index.html                # shell estático + import dinâmico de ./features/...
  api/                        # serverless / handlers Node
    *.js                      # entradas (ex.: lista-compras.js, saude.js)
    _financeiroShared.js      # utilitários partilhados entre handlers
```

**Regras:**

- Domínios de negócio na raiz em **`features/<dominio>/`** (`model/`, `service/`, `index.js`), consumidos pelo `index.html` e pelas funções serverless em `api/`. Evolução opcional: espelhar em `api/features/<dominio>/` **só no ambiente local** se quiser camadas HTTP explícitas; em **Vercel** as rotas serverless mantêm-se em `api/*.js` (sem alterar paths de deploy neste momento).
- `_financeiroShared.js` e similares na raiz de `api/` — candidatos futuros a `api/shared/`.

## Situação atual neste repositório

A pasta de domínio na raiz do projeto foi renomeada de **`modulos/`** para **`features/`** (código partilhado entre `index.html` e imports em `api/`). Próximo passo opcional: mover apenas o que as serverless usam para `api/features/<nome>/` mantendo o bundle estático coerente.

## Etapas do processo (checklist)

1. **Inventário** — Listar `features/*` na raiz e ficheiros em `api/` que importam domínios.
2. **Opcional local** — Extrair handlers para `api/features/<nome>/` mantendo reexports finos em `api/*.js` compatíveis com Vercel.
3. **Partilhados** — Consolidar `_financeiroShared.js` em `api/shared/` quando houver mais de um consumidor.
4. **Documentação** — Manter `README.md` e `doc/documentacao.md` alinhados com os paths `features/`.

**Ordem sugerida:** um domínio piloto (ex.: `financeiro`) antes de refactor global.

## Critério de conclusão

- Imports no `index.html` e em `api/` apontam para `features/<domínio>/` (sem pasta `modulos/` obsoleta).
- Deploy Vercel continua funcional sem mudança de contratos de URL, salvo decisão explícita de migração.

## Ambiente local (dev)

| Alvo | Notas |
|--------|--------|
| UI | Abrir `index.html` via servidor estático ou fluxo que já usas; **não** há `vite` de dev neste repo por defeito. |
| APIs | Testar handlers em `api/*.js` com o runtime Node/Vercel local conforme documentação do projeto. |
