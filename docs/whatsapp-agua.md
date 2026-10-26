# Água pelo WhatsApp

O Super App gera o lembrete e envia à mensageria um `water_prompt` assinado quando o perfil tem meta diária em ml. A mensageria apresenta as opções 100, 200, 300, 400, 500 ml, 1 L e 2 L. Depois de validar o destinatário e a seleção, chama o backend do Super App; a confirmação no WhatsApp só deve ser enviada após resposta de sucesso e mostra o total diário e o restante até a meta.

## Ativação

1. Confirmar que `migration/20261013_saude_agua_ml.sql` já foi aplicada e que cada perfil possui meta em ml.
2. Aplicar `migration/20261025_whatsapp_water_day_guard.sql`. Ela atualiza somente a função de registro existente para rejeitar lembretes WhatsApp de outro dia dentro da mesma transação, inclusive na virada da meia-noite. Não cria tabelas nem remove histórico. Rollback: `migration/rollback/20261025_whatsapp_water_day_guard.sql`, após parar o retorno de água no worker.
3. Configurar `WHATSAPP_WATER_CALLBACK_TOKEN` no servidor do Super App e no worker da mensageria: mesmo segredo aleatório de pelo menos 32 caracteres, distinto dos tokens administrativo e de integração. Nunca usar prefixo público. Sua rotação invalida seletores anteriores; aguarde novo lembrete.
4. No worker, configurar `SUPERAPP_API_ORIGIN` com a origem HTTPS do Super App. O callback é `POST /api/saude?resource=whatsapp-water`. Seguir também a documentação da mensageria para migrations e autorização dos remetentes/grupos.
5. Manter `WHATSAPP_API_ORIGIN`, `WHATSAPP_INTEGRATION_TOKEN`, `SAUDE_ALERTS_OWNER_USER_ID`, conexão service-role do backend e canal WhatsApp habilitados. O proprietário configurado precisa continuar owner/admin; o backend resolve o `created_by` real do perfil assinado para gravar no indicador correto, inclusive em perfis de terceiros administrados.
6. Publicar as duas aplicações pelo fluxo habitual e validar um lembrete real com seleção, confirmação e atualização no app. Nenhum deploy, segredo, banco real ou envio real foi realizado nesta implementação.

Sem o novo segredo, o envio de alertas anterior continua funcionando, mas nenhum seletor de registro é emitido. A biblioteca da mensageria determina a apresentação da seleção; não se deve prometer botões interativos sem comprovação no aparelho.

## Contrato

O evento `health.water_progress` mantém os campos anteriores e pode incluir:

```json
{
  "water_prompt": {
    "profile_id": "1",
    "date": "2026-10-25",
    "dedupe_key": "agua:2026-10-25:07:30:1",
    "signature": "HMAC_SHA256_HEX"
  }
}
```

A assinatura HMAC SHA256 usa `WHATSAPP_WATER_CALLBACK_TOKEN` sobre `JSON.stringify([profile_id,date,dedupe_key])`, com todos os campos do array como strings. É um contrato servidor a servidor; quem possui esse segredo é um serviço confiável. A mensageria é responsável por autorizar o remetente e vincular a resposta ao lembrete efetivamente enviado. O callback não aceita um proprietário informado pelo cliente.

```http
POST /api/saude?resource=whatsapp-water
Authorization: Bearer <WHATSAPP_WATER_CALLBACK_TOKEN>
Content-Type: application/json
```

Corpo: `{ "water_prompt": { ... }, "amount_ml": 200 }`. Somente números inteiros entre as sete opções são aceitos. Resposta 200:

```json
{
  "ok": true,
  "duplicate": false,
  "profile_name": "Ana",
  "amount_ml": 200,
  "realizado_ml": 700,
  "meta_ml": 2000,
  "remaining_ml": 1300
}
```

Um lembrete admite um registro, mesmo que enviado a vários destinatários. Repetir a mesma quantidade usa `wa-water:<dedupe_key>` e retorna `duplicate:true` sem somar novamente. Trocar a quantidade no mesmo lembrete retorna 409; use o app ou um novo lembrete para um novo consumo. Telegram e WhatsApp mantêm chaves de check-in distintas, como canais independentes.

Erros: 400 `invalid_request`/`invalid_prompt`; 401 `unauthorized`; 403 `profile_forbidden`; 405 `method_not_allowed`; 409 `water_request_conflict`/`water_goal_required`; 410 `water_prompt_expired`; 413 `invalid_request`; 503 `water_unavailable`. Reenvio após timeout deve preservar prompt e quantidade. Falha ou resposta ambígua não confirma registro no WhatsApp; o retry idempotente permite consultar o resultado.

O dia é `America/Sao_Paulo`. Consumo pode ultrapassar a meta; `remaining_ml` para em zero. O recurso usa a Function Saúde existente e preserva o orçamento de 12 Functions da Vercel. Nenhuma alteração de frontend ou Telegram é necessária: o app lê os mesmos dados de água ao atualizar o acompanhamento.

## Verificação local

`npx vitest run tests/services/whatsappWater.test.js tests/services/whatsappAlertClient.test.js tests/services/alertasVercel.test.js tests/services/telegramWater.test.js tests/database/saudeWaterMlSql.test.js --pool threads --maxWorkers 1`

Os testes cobrem emissão pelo scheduler, transporte assinado, dispatch da rota real, validação de token/perfil/quantidade/dia, resolução do proprietário, sucesso/duplicidade/conflito e RPC/migration/rollback em PostgreSQL embarcado. Mocks e PGlite não comprovam Supabase, Vercel ou entrega e seleção reais no WhatsApp.
