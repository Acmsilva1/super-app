# Compras confirmadas pelo WhatsApp

A mensageria interpreta texto e áudio, apresenta os lançamentos e pede confirmação. Uma frase como “gastei 10 reais na padaria” já fornece o necessário: descrição e valor. O bot preenche automaticamente a modalidade única Débito/Pix e a categoria Outros, sem perguntar essas informações. O Super App recebe somente itens estruturados após essa confirmação; não recebe áudio, texto bruto nem chave Groq e não executa LLM. O painel da mensageria define quais pessoas podem registrar compras. Todos os lançamentos autorizados entram na mesma conta financeira do proprietário configurado no Super App, como despesas variáveis de hoje por débito/Pix, categoria Outros.

## Configuração e ativação

- Super App e worker: mesmo `WHATSAPP_PURCHASE_CALLBACK_TOKEN` aleatório de pelo menos 32 caracteres, distinto dos tokens de água, administração e envio de alertas.
- Super App e worker: `WHATSAPP_PURCHASE_OWNER_PHONE` em E.164 (`+` e código do país) continua identificando a conta conectada para diagnóstico. Ela não dispensa a autorização do painel para registrar compras. Nunca derivar proprietário de uma interpretação do modelo.
- Super App: `WHATSAPP_API_ORIGIN` HTTPS e `WHATSAPP_INTEGRATION_TOKEN` existentes são usados para consultar a autorização online na mensageria. Cada pessoa precisa de cadastro individual ativo com permissão `purchases.record`. Cadastros que apenas recebem alertas não concedem permissão de registro.
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
  "sender_phone": "<telefone E.164 do remetente real>",
  "authorization_id": "00000000-0000-4000-8000-000000000020",
  "authorization_version": "<SHA256 hexadecimal minúsculo de 64 caracteres>",
  "confirmed": true,
  "date": "2026-10-26",
  "items": [
    { "description": "Padaria", "amount_cents": 425, "payment": "debito_pix" },
    { "description": "Mercado", "amount_cents": 1530, "payment": "debito_pix" }
  ]
}
```

O worker é responsável por obter a confirmação explícita do usuário, identificar o remetente real da mensagem, vincular a confirmação ao rascunho e à autorização corretos e rejeitar remetentes/grupos não autorizados. O callback exige `confirmed:true`, telefone E.164, `authorization_id` UUID e `authorization_version` hexadecimal minúsculo de 64 caracteres. Não aceita uma escolha de conta pelo modelo ou corpo. Não existe ação de preparar rascunho nessa API: a linha intermediária do banco só é inserida após a confirmação já ter chegado.

Aceita 1 a 20 itens. Cada descrição tem 1 a 120 caracteres, sem controles. `amount_cents` deve ser número inteiro entre 1 e 999999999, sem arredondar centavos recebidos. `payment` usa `debito_pix` nos pedidos novos, preenchido automaticamente pelo worker; `debito` e `pix` continuam aceitos para repetir rascunhos antigos sem modificar seu conteúdo. Todos persistem no método existente `debito_pix`. Esse campo técnico continua obrigatório no callback, mas o usuário não precisa informar pagamento ou categoria. Crédito, parcelas e propriedades extras dos itens são recusados.

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

A RPC confirma todo o lote na mesma transação. Cada UUID de rascunho usa um identificador negativo derivado de hash para não compartilhar os IDs positivos do Telegram, e `chat_id`/`sender_id` recebem prefixo `wa:`. O payload guarda os itens e um hash canônico do pedido; diferenças de método, quantidade, descrição, ordem ou data no mesmo UUID retornam conflito. Mesmo UUID já salvo retorna `duplicate:true` sem nova gravação, após revalidar a autorização atual. A identidade `wa:<remetente real>` impede que outra pessoa autorizada reutilize o mesmo UUID para recuperar ou alterar a compra. Um retry de pedido já salvo no dia anterior também pode recuperar o sucesso, desde que telefone, proprietário e conteúdo sejam os mesmos. Um pedido novo ou ainda pendente de outro dia é recusado. A mensageria deve preservar o UUID/conteúdo nas repetições após timeout. Não normalize `payment` de um UUID antigo de `debito`/`pix` para `debito_pix`: o hash original é preservado e essa troca no mesmo pedido retorna 409. Use `debito_pix` para novos UUIDs; pedidos pendentes/salvos antigos repetem exatamente os campos anteriores.

Erros: 400 `invalid_request`; 401 `unauthorized`; 403 `sender_forbidden`/`owner_forbidden`; 405 `method_not_allowed`; 409 `request_conflict`/`purchase_cancelled`/`purchase_expired`; 410 `purchase_date_expired`; 413 `invalid_request`; 503 `purchase_unavailable`. Nunca mostrar confirmação de registro quando a resposta for erro ou ambígua.

## Autorização online da mensageria

Antes de criar o cliente de banco ou ler dados financeiros, inclusive em retries já salvos, o Super App faz `POST /api/control?action=interaction-authorize` na origem HTTPS da mensageria, com `Authorization: Bearer <WHATSAPP_INTEGRATION_TOKEN>`, timeout de oito segundos e redirects recusados. O pedido contém somente:

```json
{
  "sender_phone": "<remetente E.164>",
  "permission": "purchases.record",
  "authorization_id": "<UUID do cadastro individual>",
  "authorization_version": "<versão hexadecimal de 64 caracteres>"
}
```

A versão é `sha256(JSON.stringify([recipient.id, recipient.updated_at instanceof Date ? recipient.updated_at.toISOString() : recipient.updated_at]))`, em hexadecimal minúsculo, fornecida pelo worker a partir do cadastro administrativo. Editar, desativar ou reautorizar o cadastro muda a versão e invalida confirmações antigas. `authorization_id` e versão não autorizam por conta própria: o servidor consulta o estado atual e recusa autorização ambígua para o mesmo telefone.

Somente resposta HTTP 200 com `ok:true`, `authorized:true` e eco exato do telefone, UUID e versão permite continuar. HTTP 403 da mensageria retorna `sender_forbidden`; erro de rede, timeout, configuração ausente, redirect, JSON/resposta divergente ou outro status retornam `purchase_unavailable` (503), sem acesso financeiro. Não existe fallback para o número conectado quando a autorização é negada ou o serviço está indisponível.

O proprietário financeiro permanece exclusivamente `SAUDE_ALERTS_OWNER_USER_ID`. Identificadores informados por remetente/modelo não selecionam outra conta. O mesmo número pode receber alertas sem estar autorizado a registrar compras; habilitação de alertas e permissões de interação são controles separados.

## Diagnóstico e verificação

O mesmo callback aceita `{ "action":"healthcheck", "sender_phone":"<telefone autorizado>" }`. Esse diagnóstico continua restrito ao `WHATSAPP_PURCHASE_OWNER_PHONE` e independe da consulta ACL, pois não registra compras. Após autenticação e checagem de owner/admin, chama a RPC com UUID inexistente e identificadores reservados incompatíveis com os registros normais. Espera `unavailable`, sem inserir ou confirmar qualquer compra, e retorna `{ "ok":true, "purchases_available":true }`. Isso comprova acesso à função; não comprova sozinho a versão multilote nem uma compra real. Opcionalmente, envie também `authorization_id` e `authorization_version`: quando qualquer um desses campos estiver presente, ambos precisam ser válidos e o servidor consulta a ACL antes do banco, como em um registro. O sucesso então inclui `authorization_verified:true`, permitindo verificar o circuito Super App → mensageria sem inserir compras. Negação ou indisponibilidade da ACL bloqueia esse diagnóstico ampliado; o diagnóstico sem os dois campos mantém o comportamento anterior.

Testes locais cobrem rota real, autenticação, confirmação, limites, proprietário/telefone, autorização online antes de qualquer acesso financeiro, revogação, indisponibilidade, resposta divergente, idempotência, conflito de payload, retry de outro dia e fluxo completo da API até a função SQL em PGlite com duas requisições simultâneas. Não criam compras em produção e não usam Groq nem WhatsApp reais.
