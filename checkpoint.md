# Status do Projeto: Super App
**Ultima Atualizacao:** 2026-04-01
**Hash do Ultimo Commit:** `1753298`

## 1. Contexto Atual
- **Objetivo:** Consolidar a documentacao tecnica da pipeline completa do Super App, alinhar endpoints legados com o estado real do sistema, isolar os alertas de `tarefas_jobson` e ampliar a criacao de tarefas com repeticao semanal.
- **Escopo deste checkpoint:** arquitetura atual, fluxo operacional, jobs agendados, observabilidade, documentacao, notificacoes de `tarefas_jobson` e repeticao por dias da semana no mesmo horario.
- **Status geral:** pipeline documentada, metadados saneados, alertas de tarefas ajustados para caber no limite da Vercel Hobby e criacao recorrente implementada no frontend/API.

## 2. Diagnostico do Problema em `tarefas_jobson`
- O repositorio nao possui integracao com Instagram. O envio de alertas implementado no codigo usa apenas Telegram em `api/notificar.js` via `TELEGRAM_TOKEN` e `TELEGRAM_CHAT_ID`.
- O modulo `tarefas_jobson` grava corretamente a flag `notificado: true` na criacao e atualizacao de tarefas, inclusive pelo fluxo do `index.html`.
- O problema operacional mais provavel era a dependencia do fluxo generico `POST /api/notificar`, que processava varios modulos no mesmo endpoint e no mesmo job horario.
- A tentativa inicial de isolar o modulo em um endpoint proprio estourou o limite de 12 Serverless Functions do plano Hobby da Vercel.
- A correcao final foi manter um unico endpoint de notificacao e usar `scope: "tarefas_jobson"` no workflow dedicado.

## 3. Pipeline Atual de Alertas
- [x] `POST /api/notificar` continua responsavel por calendario e saude no fluxo geral.
- [x] `POST /api/notificar` tambem processa `tb_tarefas_jobson` quando recebe `scope = tarefas_jobson`.
- [x] Workflow `Notificacoes - Tarefas Jobson` segue com agenda dedicada.
- [x] Horarios configurados: 08:30 e 11:30 em America/Sao_Paulo.
- [x] Conversao configurada no GitHub Actions: 11:30 e 14:30 UTC em 2026-04-01.
- [x] Apos envio com sucesso, a tarefa e marcada com `notificado: false` para evitar duplicidade.
- [x] O arquivo `api/notificar-tarefas-jobson.js` foi removido para voltar ao limite suportado pela Vercel Hobby.

## 4. O que ja foi feito (DONE)
- [x] README principal reescrito com visao completa do projeto.
- [x] `api/statistics` ajustado para usar o catalogo compartilhado de apps.
- [x] `api/roadmap` atualizado para refletir o ecossistema atual.
- [x] `api/notificar` consolidado como endpoint unico de notificacao com suporte a `scope`.
- [x] `.github/workflows/despertador-tarefas-jobson.yml` ajustado para chamar o endpoint compartilhado.
- [x] Workflows renomeados para nomes mais claros no GitHub Actions.
- [x] `index.html` atualizado para permitir repetir uma nova tarefa em dias escolhidos no mesmo horario.
- [x] `api/tarefas-jobson.js` atualizado para persistir repeticoes com upsert por `data + slot_hora`.
- [x] README atualizado com o endpoint compartilhado e com a observacao sobre Telegram vs Instagram.

## 5. Onde parou (Ponto de Interrupcao)
- O ajuste para contornar o limite da Vercel foi concluido.
- O horario do job dedicado permanece em 08:30 e 11:30 BRT.
- A repeticao semanal foi implementada para novas tarefas, do dia selecionado ate o fim do mes visivel.
- Nao houve alteracao manual de dados de negocio nem escrita direta em tabelas fora do fluxo normal da aplicacao.
- Ainda nao foi executado um teste real de disparo em producao a partir do workflow novo.

## 6. Proximos Passos Recomendados (TODO)
- [ ] Executar manualmente o workflow `Notificacoes - Tarefas Jobson` para validar retorno HTTP 200 da Vercel.
- [ ] Confirmar se as variaveis `TELEGRAM_TOKEN` e `TELEGRAM_CHAT_ID` estao definidas no ambiente da Vercel de producao.
- [ ] Validar no Supabase se tarefas futuras em `tb_tarefas_jobson` estao com `status = 'pendente'` e `notificado = true` antes do horario do job.
- [ ] Testar na interface a criacao de uma tarefa com repeticao em 2 ou 3 dias e validar as ocorrencias geradas no restante do mes.
- [ ] Se o requisito realmente for Instagram, definir a integracao necessaria porque ela nao existe hoje no projeto.

## 7. Artefatos Atualizados
- `README.md`
- `checkpoint.md`
- `api/notificar.js`
- `api/tarefas-jobson.js`
- `index.html`
- `.github/workflows/despertador.yml`
- `.github/workflows/despertador-tarefas-jobson.yml`

## 8. Observacao de Seguranca
- Nenhum dado de negocio foi alterado manualmente.
- As mudancas ficaram restritas a codigo de notificacao, workflow, frontend e documentacao.
- O canal implementado segue sendo Telegram; Instagram nao esta presente no repositorio atual.
