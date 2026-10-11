# Compras pelo Telegram

Texto: descrição e valor, nessa ordem, separados por vírgula. Áudio: transcrição pela Groq e extração por regras; pagamento sempre débito, data de hoje e categoria Outros. Compras entram em `tb_financas` no usuário administrativo definido por `SAUDE_ALERTS_OWNER_USER_ID`. Não grava contas fixas ou compras no crédito. Não altera o cron de alertas. O método interno `debito_pix` corresponde ao agrupamento já usado pelo Financeiro; não altera o contrato do banco.

Exemplos: `Almoço, 15` e `Supermercado, 30,50`. Não usar separador de milhar no valor nem vírgula na descrição. Formatos anteriores com três campos ou cabeçalhos não são mais aceitos. Não incluir crédito ou parcelas.

O bot envia resumo e botões Confirmar/Cancelar. A confirmação expira após 15 minutos. O banco confirma e insere numa única transação, impedindo duplicação por clique ou reentrega. Somente o chat privado positivo configurado em `TELEGRAM_CHAT_ID` e seu titular podem usar. Grupos e mensagens encaminhadas são rejeitados.

## Ativação manual

1. Aplicar `migration/20261006_telegram_compras.sql` no Supabase. RLS sem acesso anon/authenticated; somente service role.
2. As variáveis existentes `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SAUDE_ALERTS_OWNER_USER_ID` e Supabase service role precisam estar na Vercel Production. O servidor deriva um segredo exclusivo para o webhook com HMAC a partir do token do bot. Opcionalmente definir `TELEGRAM_WEBHOOK_SECRET` próprio, de 32 a 256 caracteres, somente letras, números, `_` ou `-`; não reutilizar CRON_SECRET.
3. Fazer commit/push e deploy. Token do bot, chat ID e proprietário já existentes são reutilizados.
4. Registrar o webhook **depois** do deploy: abrir perfil administrador → Alertas → **Ativar compras pelo Telegram**. A API administrativa verifica a autorização exclusiva do administrador, a identidade do proprietário e a existência da tabela antes de chamar setWebhook. Nenhum token ou segredo vai ao navegador; não exige terminal local. O domínio vem de `VERCEL_PROJECT_PRODUCTION_URL`, ou do domínio de `ALERTS_API_URL` já configurado.
5. A rota deve estar acessível ao Telegram sem Deployment Protection, mas continua exigindo o cabeçalho secreto do webhook. Não desligar a proteção de todo o projeto para isso.
6. Testar uma compra pequena, conferir o resumo, confirmar e verificar o lançamento no app. Essa operação grava dado real; ainda não foi executada pelo agente.

O cadastro recusa substituir outro endereço de webhook já existente. Mensagens de compra com mais de 15 minutos são ignoradas; os callbacks continuam usando a validade do rascunho. setWebhook impede getUpdates enquanto ativo. Se o token ou segredo forem alterados, fazer deploy e clicar no botão novamente para atualizar o cadastro. O sucesso do cadastro não comprova entrega: ainda é necessário enviar uma mensagem e verificar a resposta.

## Limitações e recuperação

### Áudio pela Groq

Configurar `GROQ_API_KEY` como segredo na Vercel Production e fazer deploy. Não exige nova migration nem novo webhook se já estiver ativo. O servidor usa `whisper-large-v3` no endpoint de transcrição, com idioma português. Mantendo a conta Groq no Free, aplicam-se suas cotas; o app não muda plano nem usa outro fornecedor como fallback.

Enviar uma mensagem de voz do Telegram, até 60 segundos e 5 MB, com uma única compra. Exemplos: “Comprei um café por dez reais e vinte centavos”, “Gastei trinta reais no supermercado”, “Supermercado no valor de trinta reais e cinquenta centavos”. Não é necessário ditar vírgulas. Também aceita “café dez reais e vinte”, os formatos anteriores e valores numéricos na transcrição. “Dez vírgula dois” equivale a 10,20; “dez reais e dois centavos” equivale a 10,02. O arquivo OGG/OGA é baixado do Telegram pelo servidor, limitado também durante a leitura, e enviado como arquivo à Groq. A URL de download contendo o token do bot nunca é compartilhada com a Groq.

O bot exibe o texto transcrito e o resumo; conferir especialmente o valor antes de confirmar. Formatos ambíguos ou valores não reconhecidos são rejeitados. Não aceita crédito, parcelas ou datas passadas pelo áudio. Não é um interpretador irrestrito de linguagem natural. Números por extenso seguem uma gramática limitada; frases fora dela devem ser reenviadas por texto. Áudio não é armazenado no banco nem em arquivo local; a tabela de rascunhos guarda somente os campos do lançamento. O áudio é processado por Telegram/Groq; isso não constitui garantia sobre a retenção do fornecedor.

Erro de cota, chave ausente/inválida ou falha de transcrição gera orientação pelo bot, sem salvar compra. Reentregas com rascunho já existente não são transcritas novamente; falhas antes da criação do rascunho podem consumir outra chamada se a mensagem for reenviada. Validação de sintaxe local não comprova precisão da transcrição ou execução real; teste com o chat após publicar.

Referência: [transcrição e formatos Groq](https://console.groq.com/docs/speech-to-text).

Se o resumo não chegar por falha de rede, reenviar a compra como nova mensagem; não há gravação sem botão de confirmação. Se houver erro após confirmar, conferir o app antes de tentar novamente; repetir o mesmo botão não cria segunda compra. A confirmação é vinculada ao chat, remetente e proprietário.

Sem desfazer pelo bot nesta versão; editar/excluir no Financeiro. Histórico de rascunhos fica em tabela privada de apoio e não é exposto na API. Não registrar corpo das mensagens em logs. A definição de retenção automática fica para evolução posterior.

Rollback: remover o webhook do Telegram, retirar a rota no deploy e usar `migration/rollback_20261006_telegram_compras.sql`, que mantém a tabela e o histórico. Não desfaz compras já confirmadas.

Referência: [API oficial do Telegram](https://core.telegram.org/bots/api#setwebhook).
