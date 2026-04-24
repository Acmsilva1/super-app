# Documentacao do Projeto - Super App

## 1. Visao geral
O Super App e uma aplicacao web em formato PWA com frontend principal em um unico arquivo HTML e backend em funcoes serverless Node.js.

- Frontend: `index.html`
- Backend HTTP: pasta `api/`
- Regras de dominio: pasta `modulos/`
- Persistencia: Supabase
- Deploy: Vercel (configurado em `vercel.json`)

## 2. Stack tecnica
- Node.js (ES Modules)
- Vercel Functions
- Supabase (`@supabase/supabase-js`)
- HTML/CSS/JS vanilla no frontend

Dependencias declaradas em `package.json`:
- `@supabase/supabase-js`

## 3. Estrutura do repositorio
```text
super-app-1/
|-- index.html
|-- api/
|-- modulos/
|-- lib/
|-- sql/
|-- docs/
|-- vercel.json
|-- manifest.json
|-- sw.js
|-- package.json
```

### 3.1 Principais pastas
- `api/`: endpoints serverless (CRUD e consultas)
- `modulos/`: models/services por dominio
- `lib/`: utilitarios compartilhados (cliente Supabase)
- `sql/`: scripts de banco de dados
- `docs/`: reservado para documentos auxiliares (atualmente vazio)

## 4. Arquitetura
O frontend consome os endpoints de `api/`, que por sua vez usam o cliente Supabase de `lib/supabase.js` e funcoes de dominio em `modulos/`.

Fluxo resumido:
1. Usuario interage no `index.html`
2. Frontend chama `/api/*`
3. Endpoint valida e processa payload
4. Regras de dominio montam payloads/normalizacoes
5. Supabase persiste e retorna dados
6. Frontend atualiza a interface

## 5. Modulos de dominio
Pastas encontradas em `modulos/`:
- `financeiro`
- `financas`
- `despesas_fixas`
- `lista_compras`
- `saude`
- `fluxograma`
- `missoes_treino`
- `neonkeep` (placeholder)

Observacao: o endpoint consolidado atual para financas e `/api/financeiro`, mas ainda existem modulos legados (`financas` e `despesas_fixas`) utilizados por compatibilidade interna.

## 6. Endpoints da API
Arquivos existentes em `api/`:
- `apps.js`
- `financeiro.js`
- `fluxograma.js`
- `lista-compras.js`
- `missoes-treino.js`
- `roadmap.js`
- `saude.js`
- `statistics.js`
- `_financeiroShared.js` (shared interno)

### 6.1 Catalogo e shell
#### `GET /api/apps`
Retorna lista de aplicativos ativos no shell.

#### `GET /api/statistics`
Retorna totais derivados do catalogo (`totalApps`, `activeApps`, etc.).

#### `GET /api/roadmap`
Retorna roadmap estatico da aplicacao.

### 6.2 Financeiro
#### `/api/financeiro`
Metodos suportados: `GET`, `POST`, `PATCH`, `DELETE`

Comportamento:
- Consolida registros de:
  - `tb_financas`
  - `tb_despesas_fixas`
  - `tb_poupanca`
  - `tb_poupanca_metas`
- `GET` retorna dashboard, graficos, tabelas e bloco de poupanca
- `POST/PATCH/DELETE` suportam `tipo_registro` para rotear operacao na tabela correta

### 6.3 Lista de compras
#### `/api/lista-compras`
Metodos suportados: `GET`, `POST`, `PATCH`, `DELETE`

Recursos relevantes:
- Toggle de item comprado (`PATCH` com `toggle`)
- Reset global de checks (`PATCH` com `reset_checks`)
- Exclusao individual ou em massa (`DELETE` com `id` ou `delete_all`)

### 6.4 Saude
#### `/api/saude`
Metodos suportados: `GET`, `POST`, `PATCH`, `DELETE`

Recursos relevantes:
- Resumo por membro em `GET` com query `membro`
- CRUD completo de registros de saude familiar

### 6.5 Fluxograma
#### `/api/fluxograma`
Metodos suportados: `GET`, `POST`, `PATCH`, `DELETE`

Recursos relevantes:
- Lista de projetos
- Busca por `id`
- Persistencia de `dados` do diagrama

### 6.6 Missoes de treino
#### `/api/missoes-treino`
Metodos suportados: `GET`, `POST`, `PATCH`, `DELETE`

Recursos relevantes:
- Missao diaria com itens
- Progresso mensal
- Radar de distribuicao (forca/cardio/core/mobilidade/resistencia)
- Controle de "chamas" por dia
- Regras de imutabilidade para conclusao diaria (nao permite desfazer)

## 7. Banco de dados e tabelas
Tabelas identificadas no codigo:
- `tb_financas`
- `tb_despesas_fixas`
- `tb_poupanca`
- `tb_poupanca_metas`
- `tb_lista_compras`
- `tb_saude_familiar`
- `tb_fluxograma_projetos`
- `tb_missoes_treino`
- `tb_missoes_treino_itens`
- `tb_missoes_treino_chamas`

## 8. Variaveis de ambiente
Configuracao minima obrigatoria (ver `lib/supabase.js`):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Sem essas variaveis, a API falha ao inicializar.

## 9. Scripts SQL disponiveis
Arquivos presentes em `sql/`:
- `20260418_remove_notes_module.sql`
- `20260422_create_tb_poupanca.sql`
- `20260422_create_tb_poupanca_metas.sql`

## 10. Deploy
Arquivo `vercel.json`:
- `buildCommand`: `npm run build`
- `outputDirectory`: `.`
- `framework`: `null`
- Headers customizados para `manifest.json`, `sw.js` e icones

Script de build em `package.json`:
- `npm run build` -> `echo Build complete`

## 11. Como rodar localmente
1. Instalar dependencias:
```bash
npm install
```
2. Definir variaveis de ambiente:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
3. Executar via ambiente Vercel local (recomendado para funcoes `api/`) ou servidor estatico + funcoes simuladas.

## 12. Estado atual e observacoes
- O `README.md` existente descreve alguns componentes que nao aparecem mais no estado atual do repositorio (por exemplo, workflows em `.github/workflows/` e endpoint de calendario).
- Esta documentacao foi escrita com base no codigo efetivamente presente em `2026-04-24`.
- A pasta `docs/` segue disponivel para anexos, diagramas e RFCs futuros.

## 13. Proximos passos recomendados
1. Sincronizar o `README.md` com esta documentacao para evitar divergencia.
2. Adicionar exemplos de payload/request/response por endpoint.
3. Criar um diagrama de arquitetura versionado (mermaid) no proprio repositrio.
4. Documentar politicas de erro e codigos de resposta por modulo.
