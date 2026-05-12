# Regras do Agente de IA

Este arquivo consolida as regras e padrões de desenvolvimento para os agentes de IA.

---

# Skill Regras Gerais

## Objetivo
Consolidar regras transversais de engenharia para orientar decisões técnicas, qualidade e colaboração.

## Princípios
- KISS: preferir soluções simples e legíveis.
- DRY: remover duplicações relevantes.
- YAGNI: não implementar o que não é necessário agora.
- SOLID: aplicar quando trouxer clareza e extensibilidade.
- Modularidade primeiro: organizar o sistema em módulos de negócio independentes, evitando acoplamento transversal.
- Convenção de dados: todo acesso a dados da API deve passar pela estrutura `api/data`.
- Preferência de dados: usar DuckDB em todos os projetos para exploração analítica, staging e validação técnica de datasets.
- Diretriz de frontend: padronizar ECharts para gráficos, Framer Motion para animações de UI e Three.js/R3F para cenários Digital Twin 3D.

## Fluxo recomendado
- Especificar antes de implementar (spec-driven).
- Validar requisitos ambíguos antes de codar.
- Entregar incrementalmente com feedback curto.
- Definir plano curto antes de execução e revisar impacto antes de mudanças críticas.
- Em falha repetida, limitar tentativas autônomas em até 3 ciclos antes de escalar para decisão humana.

## Padrões de código
- Nomes semânticos e consistentes.
- Funções pequenas com responsabilidade única.
- Tratar erros de forma explícita.
- Evitar comentários óbvios; código deve se explicar.

## Segurança e conformidade
- Não expor segredos em código.
- Não registrar PII/PHI sem necessidade.
- Aplicar princípio do menor privilégio em acesso e permissões.
- Regra de ouro documental: todo documento processado deve ser revisado ativamente para identificar e registrar possíveis discordâncias com a LGPD.

## Qualidade e entrega
- Toda mudança relevante deve incluir testes.
- Testes são obrigatórios em todos os passos do processo (planejamento, implementação, integração, release e pós-deploy).
- Nenhuma etapa pode avançar sem evidência de testes aprovados da etapa anterior.
- Revisão de código deve focar em risco, segurança e regressão.
- CI deve validar build, lint e testes antes de merge.
- Em projetos críticos, combinar SDD (intenção), TDD (implementação) e BDD (comportamento) para reduzir ambiguidades.

## Workflow DevOps em ambiente corporativo
- Projetar fluxo para ambientes com permissões restritas (Corporate PC), evitando dependência de instalação local privilegiada.
- Priorizar automações via n8n Cloud para orquestração de integrações e rotinas operacionais.
- Usar túneis de conexão seguros para integrações internas/externas, com autenticação forte e trilha de auditoria.

## Padrao de ambiente (.env)
- Todo projeto deve ter arquivo `.env` na raiz com variaveis de ambiente explicitas para caminhos compartilhados.
- Variavel oficial para regras de IA: `AI_RULES_DIR`.
- Compatibilidade legada permitida: `AGENT_RULES_DIR` como fallback quando `AI_RULES_DIR` nao estiver definida.
- Ordem de resolucao recomendada para regras:
  1. `AI_RULES_DIR`
  2. `AGENT_RULES_DIR`
  3. caminho legado local (`.../regras do agente de IA`)
- Em `projetos`, incluir no `.env`:
  - `DATALAKE_DIR=C:\projetos e aplicativos\datalake`
  - `AI_RULES_DIR={caminho_da_pasta_do_projeto}` (onde se encontra o arquivo `agents.md`)
- Em `pessoal` (apps hospedados na Vercel), nao exigir `DATALAKE_DIR` por padrao; manter:
  - `AI_RULES_DIR={caminho_da_pasta_do_projeto}`
- Nao hardcodear caminho de regras no codigo novo; sempre ler por variavel de ambiente com fallback.
- Quando houver consumo de datasets locais, preferir `DATASET_PATH` e permitir derivacao a partir de `DATALAKE_DIR` quando aplicavel.

## Anti-patterns a evitar
- Prompt vago sem especificação.
- Copiar código sem entender impacto.
- Aceitar resultado sem validação.
- Aumentar escopo durante execução sem alinhamento.

## Documentação técnica obrigatória
- Toda documentação técnica deve manter estrutura fixa por seção, sem omissão de tópicos obrigatórios.
- Quando um tópico não se aplicar, registrar explicitamente como "Não aplicável" com justificativa objetiva.
- Documentar separação de responsabilidades entre backend (`api`), frontend (`web`) e itens transversais (LGPD, contrato API, riscos).
- Manter identificação e rastreabilidade de revisão documental (DOC-ID/versionamento) em cada artefato técnico.

---

# Skill Backend

## Objetivo
Estabelecer padrões para APIs e serviços backend seguros, testáveis e prontos para produção.

## Stack padrão
- Node.js LTS com TypeScript
- Express ou Fastify
- Python 3.10+ para analytics, IA e automações especializadas
- Zod para validação
- Prisma ou Knex para persistência
- Redis para cache/filas (quando aplicável)
- WebSockets ou Server-Sent Events (SSE) para fluxo em tempo real

## Arquitetura
- Adotar arquitetura modular (modular monolith) como padrão.
- Estrutura de referência na raiz: `api/`, `web/`, `docs/` e diretórios de apoio.
- Separar em camadas: `route -> controller -> use_case (interactor) -> service -> repository`.
- Regras de negócio puras devem ficar em `use_case (interactor)`.
- `service` deve concentrar orquestração técnica e integrações.
- Acesso a banco apenas em `repository/model`.
- Evitar dependência circular entre módulos.
- Cada módulo deve encapsular rotas, casos de uso, serviços e acesso a dados, com contratos claros entre módulos.
- Padronizar `api/data` como camada central de dados da API para banco relacional, cache, arquivos e conectores de fontes diversas.

## API e segurança
- Validar entrada e saída de dados.
- Padronizar erros HTTP com payload consistente.
- Nunca retornar stack trace para cliente.
- Implementar autenticação/autorização por perfil/permissão.
- Aplicar rate limit, CORS, headers de segurança e proteção contra injeção.

## Observabilidade
- Logs estruturados por nível (`info`, `warn`, `error`).
- Não registrar PII/PHI em texto puro.
- Adicionar correlation id para rastreio de requisições.
- Monitorar métricas técnicas e métricas de negócio.
- Exigir métricas de saúde do domínio (ex.: contagem de leitos disponíveis, ocupados e bloqueados).

## Operação
- Healthcheck e readiness/liveness endpoints.
- Configuração por ambiente via variáveis (`.env`).
- Dockerfile e compose para execução local padronizada.
- Integrações e rotinas operacionais devem priorizar automação CI/CD e n8n Cloud.

---

# Skill Frontend

## Objetivo
Definir padrões para desenvolvimento frontend com foco em consistência, acessibilidade, performance e manutenibilidade.

## Stack padrão
- React 18+
- TypeScript (strict)
- Tailwind CSS
- shadcn/ui (Radix UI)
- React Hook Form + Zod
- TanStack Query
- React Router
- ECharts para gráficos e dashboards
- Framer Motion para animações de interface e transições visuais
- Three.js
- React Three Fiber (R3F) para visualização Digital Twin 3D

## Diretrizes de implementação
- Proibir `any` no código de produção.
- Um componente por arquivo; lógica complexa em hooks ou services.
- Evitar acoplamento entre UI e regras de negócio.
- Usar estados globais apenas quando necessário.
- Preferir composição a herança.
- Exigir tipagem rigorosa dos estados que representam entidades físicas do Digital Twin (leito, monitor, sensor, setor e status operacional).

## UI e UX
- Layout responsivo mobile-first.
- Garantir contraste, foco visível e navegação por teclado.
- Tratar loading, erro e estado vazio em todas as telas críticas.
- Padronizar tokens visuais (cores, espaçamento, tipografia, bordas).
- Adotar padrão visual consistente para operação hospitalar: alto contraste, leitura rápida e organização em cards modulares (estilo bento).

## Performance
- Evitar renders desnecessários (`memo`, `useMemo`, `useCallback` quando fizer sentido).
- Fazer code splitting por rota.
- Otimizar listas grandes (virtualização quando necessário).
- Evitar chamadas de API duplicadas.

## Qualidade
- Cobrir componentes e hooks críticos com testes.
- Remover logs de debug antes de merge.
- Não deixar código morto ou comentários óbvios.

---

# Skill Database

## Objetivo
Definir práticas para modelagem, migração, consulta e governança de dados com foco em integridade e performance.

## Banco padrão
- PostgreSQL como base relacional principal.
- Redis para cache e estado volátil quando necessário.
- DuckDB como padrão preferencial em todos os projetos para análise local, staging analítico e validação de dados.
- Centralizar a infraestrutura de dados em `api/data` (conexões, repositórios, adapters e pipelines).
- Tratar `api/data` como gateway único para dados estruturados e não estruturados (SQL, cache, arquivos, streams e integrações).

## Modelagem
- Usar `snake_case` e nomes semânticos.
- Chaves primárias consistentes (`uuid` quando aplicável).
- Declarar constraints (`not null`, `unique`, `check`, `fk`).
- Projetar índices com base em leitura real, não por suposição.
- Regra de negócio crítica: leitos de isolamento (`ISOL`) devem ser sempre computados como ocupados em métricas de ocupação e performance.
- Garantir consistência de contagem para unidades com capacidade fixa (ex.: total de 96 leitos), com validações automáticas e alertas de divergência.

## Migrações
- Toda alteração de schema deve ocorrer via migration versionada.
- Nunca alterar estrutura diretamente em produção sem controle.
- Garantir estratégia de rollback.

## Consultas
- Evitar `select *`.
- Usar `explain analyze` para consultas lentas.
- Preferir paginação e filtros indexados.
- Materialized views para relatórios pesados quando necessário.

## Segurança e LGPD
- Classificar PII/PHI e aplicar Data Masking dinâmico por perfil de acesso.
- Evitar dados sensíveis em logs e dumps.
- Aplicar mascaramento/anonimização para uso analítico.
- Controlar acesso por privilégio mínimo.
- Manter Audit Logs detalhados de acesso a dados sensíveis (quem acessou, quando, qual dado e motivo técnico).

## ETL e qualidade de dados
- Validar tipos, nulos, duplicidade e integridade referencial.
- Tratar falhas de carga com reprocessamento idempotente.

---

# Skill Testes

## Objetivo
Garantir qualidade contínua com testes confiáveis, rápidos e alinhados ao risco de negócio.

## Regra crítica (obrigatória)
- Testes são obrigatórios em todos os passos do processo, sem exceção.
- Nenhuma etapa avança sem evidência de teste aprovado da etapa anterior.
- Sem teste, sem merge; sem merge, sem deploy.

## Estratégia
- Priorizar testes em serviços e fluxos críticos.
- Combinar testes unitários, integração e E2E.
- Aplicar abordagem spec-driven para reduzir ambiguidade.

## Pirâmide de testes
- Unitário: maior volume, execução rápida.
- Integração: contratos entre camadas (API, banco, filas).
- E2E: poucos cenários críticos ponta a ponta.

## Boas práticas
- Não testar apenas caminho feliz; cobrir erros, limites e nulos.
- Isolar dependências externas com mocks/fakes quando necessário.
- Evitar testes frágeis acoplados à implementação interna.
- Manter dados de teste previsíveis e reutilizáveis.
- Para integração com banco, priorizar ambiente real isolado (ex.: Testcontainers) em vez de mock excessivo.

## Critérios mínimos
- Todo bug corrigido deve incluir teste de regressão.
- Toda feature crítica deve incluir ao menos 1 teste de integração.
- Pipeline deve falhar ao quebrar testes.
- Cobertura é indicador secundário; foco principal é risco.
- Meta de cobertura: mínimo 80% geral e 100% para lógica crítica de negócio.

## Processo obrigatório por etapa (gate de qualidade)
1. Pré-implementação (spec e risco)
- Escrever critérios de aceite testáveis.
- Definir casos obrigatórios: sucesso, erro, limite, nulo, permissão e concorrência.
- Identificar PII/PHI e incluir casos LGPD (acesso indevido, masking e trilha de auditoria).

2. Implementação (desenvolvimento local)
- Criar/atualizar testes unitários junto com o código.
- Validar branches de decisão e tratamento de erro.
- Bloqueio da etapa: não prosseguir se teste unitário falhar.

3. Integração (API, banco, filas, cache)
- Executar testes de integração com ambiente isolado e realista (Testcontainers quando aplicável).
- Validar contrato API (status, payload, schema e mensagens de erro).
- Validar migração, rollback e consistência transacional.
- Bloqueio da etapa: não prosseguir se qualquer contrato quebrar.

4. Frontend e experiência
- Validar componentes críticos, estados de loading/erro/vazio e acessibilidade básica.
- Validar gráficos (ECharts), animações/transições (Framer Motion) e comportamento de telas 3D (Three.js/R3F) sem quebrar fluxo funcional.
- Bloqueio da etapa: não prosseguir se fluxo crítico do usuário falhar.

5. End-to-End (fluxos de negócio)
- Executar E2E dos fluxos prioritários: autenticação, operação principal, persistência e retorno visual.
- Confirmar integração ponta a ponta com dados corretos.
- Bloqueio da etapa: sem E2E crítico verde, release é reprovado.

6. Resiliência e tempo real
- Testar queda e reconexão de WebSocket/SSE.
- Testar saturação de eventos e reinício de serviço sem perda relevante de estado.
- Confirmar fallback, idempotência e alerta operacional.
- Bloqueio da etapa: sem recuperação observável, não publicar.

7. Pré-release (pipeline)
- Executar suíte completa: lint, unitários, integração, E2E e segurança básica.
- Verificar cobertura mínima exigida e testes de regressão da release.
- Bloqueio da etapa: pipeline deve reprovar automaticamente em qualquer falha.

8. Pós-deploy (validação em produção)
- Rodar smoke tests e health checks.
- Monitorar erros, latência e métricas de negócio após deploy.
- Preparar rollback imediato se regressão crítica for detectada.

## Matriz mínima obrigatória por tipo de teste
- Unitário: regra de negócio, validação de entrada, tratamento de exceção e caminhos alternativos.
- Integração: contrato API, persistência real, autorização, cache e filas/eventos.
- E2E: jornada principal, jornada alternativa e cenário de falha recuperável.
- Segurança/LGPD: autorização, masking dinâmico, ausência de PII/PHI em logs e registro de auditoria.
- Dados: consistência de contagem, integridade referencial, duplicidade, nulos e precisão de agregações.

## Resiliência e caos
- Incluir cenários de falha controlada (Chaos) para fluxos críticos em tempo real.
- Validar perda de conexão (WebSocket/SSE), saturação de eventos e reinício de nó sem perda relevante de estado.
- Definir critérios de recuperação observáveis antes de produção (alerta, fallback, reconexão e idempotência).

## Ferramentas sugeridas
- Frontend: Vitest/Jest + React Testing Library.
- Backend Node: Jest/Vitest + Supertest.
- Python: Pytest.
- E2E: Playwright ou Cypress.

---

# Changelog — notificacao evolucao

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release headers follow this format:
`## [X.Y.Z] - YYYY-MM-DD - Release title`

## [0.1.0] - 2026-05-07 - Padrao de ambiente compartilhado

### Added
- Definido padrao oficial de `.env` em `regras-gerais.md`.
- Formalizada variavel `AI_RULES_DIR` como fonte principal para regras de IA.
- Registrada compatibilidade legada com `AGENT_RULES_DIR` via fallback.
- Documentado padrao por contexto:
  - `projetos`: `DATALAKE_DIR` + `AI_RULES_DIR`
  - `pessoal` (Vercel): apenas `AI_RULES_DIR`
