# Checkpoint Pre-Refactor Visual
**Data:** 2026-04-02  
**Objetivo:** registrar o estado atual antes da modernizacao visual completa da UX.

## Escopo da rodada
- Reestilizacao visual completa da shell principal e modulos em `index.html`.
- Ajustes de motion, microinteracoes, estados de feedback e responsividade mobile/PWA.
- Preservacao dos fluxos funcionais existentes (CRUD, dashboard, notificacoes, agenda/check, janelas de app).

## Baseline tecnico
- Arquivo principal de UX: `index.html`.
- Tema atual: variaveis em `:root` com base azul e layout funcional.
- Janelas de app em fullscreen por padrao (`.app-window.maximized`) com estilo simples.
- Dashboard ja possui melhorias recentes de monitoramento e sincronizacao de agenda.

## Criticos que nao podem quebrar
- Abertura de apps e renderizacao de conteudo em `.window-content`.
- Dashboard com graficos e relatorios operacionais.
- Modal de notificacoes.
- Modulo calendario e check de confirmacao.
- Fluxograma (escopo visual isolado em `.fluxograma-root`).

## Estrategia de rollback
- As mudancas serao concentradas majoritariamente em CSS e pequenos ajustes de markup/comportamento em `index.html`.
- Caso a UX degrade ou apareca regressao funcional, rollback rapido pelo estado anterior desse arquivo.

## Resultado esperado
- UX mais futurista, com profundidade visual, atmosfera, animacoes intencionais e melhor feedback.
- Melhor leitura em mobile sem clipping visual.
- Experiencia consistente entre dashboard, cards de app e janelas de modulo.
