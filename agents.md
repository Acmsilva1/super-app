# Agentes (Cursor / automação) — Super App (shell estático + APIs)

## Contexto

Aplicação **estática** centrada em `index.html` + catálogo de mini-apps. Domínios de negócio na pasta **`features/<dominio>/`** (model, service, `index.js`), importados pelo browser (dynamic `import()`) e pelas funções em **`api/*.js`** (serverless / compatível Vercel). Documentação em `doc/documentacao.md` e `README.md`.

## Limites (Vercel vs local)

- **Deploy:** manter contratos de paths `api/*.js` e `features/...` coerentes com o que o `index.html` importa.
- **Local:** testar APIs com o mesmo runtime que em produção; não assumir Vite dev embutido.

## Não fazer sem decisão explícita

- Não mover serverless para subpastas que o hosting não roteie.
- Não renomear `features/` de volta para `modulos/` — imports quebrados no `index.html` e na API.

## Checkpoint

- [ ] Após alterar um domínio, `grep` por imports antigos (`modulos/`) — deve retornar zero resultados em ficheiros do projeto (excluir `node_modules`).
- [ ] `index.html` e `api/*` resolvem `./features/<dominio>/...` corretamente.
- [ ] `README` / `doc/documentacao.md` mencionam `features/` e não `modulos/`.
- [ ] Smoke manual dos fluxos que importam `features/financeiro`, `lista_compras`, etc.
