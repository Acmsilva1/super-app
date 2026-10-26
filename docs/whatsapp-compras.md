# Compras confirmadas pelo WhatsApp

A mensageria interpreta texto e áudio, apresenta os lançamentos e pede confirmação. O Super App recebe somente itens estruturados após essa confirmação; não recebe áudio, texto bruto nem chave Groq e não executa LLM. A primeira versão aceita exclusivamente o telefone pessoal pinado da conta conectada e registra despesas variáveis de hoje por débito/Pix, categoria Outros.

## Configuração e ativação

- Super App e worker: mesmo `WHATSAPP_PURCHASE_CALLBACK_TOKEN` aleatório de pelo menos 32 caracteres, distinto dos tokens de água, administração e envio de alertas.
- Super App e worker: `WHATSAPP_PURCHASE_OWNER_PHONE` em E.164 (`+` e código do país), fixado na conta autorizada. Nunca derivar proprietário de uma interpretação do modelo.
- Super App: `SAUDE_ALERTS_OWNER_USER_ID` precisa identificar owner/admin existente. É essa conta que recebe os lançamentos. A conexão service-role continua apenas no runtime servidor.
- Worker: `SUPERAPP_API_ORIGIN` com a origem HTTPS canônica do Super App e `GROQ_API_KEY` somente no worker. O fluxo de captura e confirmação é documentado na mensageria.
- Banco: reutiliza `tb_telegram_compras` e a função `telegram_confirm_purchase` das migrations existentes `20261006_telegram_compras.sql` e `20261011_telegram_compras_multiplas.sql`. Não há nova migration nesta implementação. A versão multilote precisa estar instalada para o registro de vários itens.

O recurso utiliza a Function Financeiro existente; não adiciona uma décima terceira Function da Vercel. Telegram e água mantêm os contratos anteriores.

## Contrato servidor a servidor

`POST /api/financeiro?resource=whatsapp-purchases`, `Authorization: Bearer <WHATSAPP_PURCHASE_CALLBACK_TOKEN>`, JSON:

```json
{
  "action": "record",
  "request_id": "00000000-0000-4000-8000-000000000010",
  "sender_phone": "<telefone E.164 autorizado>",
  "confirmed": true,
  "date": "2026-10-26",
  "items": [
    { "description": "Padaria", "amount_cents": 425, "payment": "debito" },
    { "description": "Mercado", "amount_cents": 1530, "payment": "pix" }
  ]
}
```

O worker é responsável por obter a confirmação explícita do usuário, vincular a confirmação ao rascunho correto e rejeitar remetentes/grupos não autorizados. O callback exige `confirmed:true`, valida o telefone e não aceita uma escolha de conta pelo modelo ou corpo. Não existe ação de preparar rascunho nessa API: a linha intermediária do banco só é inserida após a confirmação já ter chegado.

Aceita 1 a 20 itens. Cada descrição tem 1 a 120 caracteres, sem controles. `amount_cents` deve ser número inteiro entre 1 e 999999999, sem arredondar centavos recebidos. `payment` aceita exatamente `debito` ou `pix`; ambos persistem no método existente `debito_pix`. Crédito, parcelas e propriedades extras dos itens são recusados.

Resposta 200:

```json
{
  "ok": true,
  "status": "saved",
  "duplicate": false,
  "request_id": "00000000-0000-4000-8000-000000000010",
  "count": 2,
  "total_cents": 1955,
  "date": "2026-10-26"
}
```

A RPC confirma todo o lote na mesma transação. Cada UUID de rascunho usa um identificador negativo derivado de hash para não compartilhar os IDs positivos do Telegram, e `chat_id`/`sender_id` recebem prefixo `wa:`. O payload guarda os itens e um hash canônico do pedido; diferenças de método, quantidade, descrição, ordem ou data no mesmo UUID retornam conflito. Mesmo UUID já salvo retorna `duplicate:true` sem nova gravação. Um retry de pedido já salvo no dia anterior também pode recuperar o sucesso, desde que telefone, proprietário e conteúdo sejam os mesmos. Um pedido novo ou ainda pendente de outro dia é recusado. A mensageria deve preservar o UUID/conteúdo nas repetições após timeout.

Erros: 400 `invalid_request`; 401 `unauthorized`; 403 `sender_forbidden`/`owner_forbidden`; 405 `method_not_allowed`; 409 `request_conflict`/`purchase_cancelled`/`purchase_expired`; 410 `purchase_date_expired`; 413 `invalid_request`; 503 `purchase_unavailable`. Nunca mostrar confirmação de registro quando a resposta for erro ou ambígua.

## Diagnóstico e verificação

O mesmo callback aceita `{ "action":"healthcheck", "sender_phone":"<telefone autorizado>" }`. Após autenticação e checagem de owner/admin, chama a RPC com UUID inexistente e identificadores reservados incompatíveis com os registros normais. Espera `unavailable`, sem inserir ou confirmar qualquer compra, e retorna `{ "ok":true, "purchases_available":true }`. Isso comprova acesso à função; não comprova sozinho a versão multilote nem uma compra real.

Testes locais cobrem rota real, autenticação, confirmação, limites, proprietário/telefone, idempotência, conflito de payload, retry de outro dia e fluxo completo da API até a função SQL em PGlite com duas requisições simultâneas. Não criam compras em produção e não usam Groq nem WhatsApp reais.
