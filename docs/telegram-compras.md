# Compras pelo Telegram — somente texto

Envie uma compra por linha, sempre no formato `descrição,reais,centavos`. O primeiro campo é a descrição; os dois campos numéricos formam um único valor monetário. Use exatamente dois dígitos nos centavos, sem símbolo de moeda ou separador de milhar.

```text
padaria,4,25
mercado,15,30
almoço,20,00
```

O exemplo prepara três lançamentos de R$ 4,25, R$ 15,30 e R$ 20,00. Linhas vazias são ignoradas. Limites: 20 lançamentos por mensagem e 4096 caracteres. Se uma linha estiver inválida, o bot informa seu número e não prepara nenhuma compra da mensagem. Corrija e reenvie o texto completo.

O bot mostra descrição e valor de cada linha, total, data de hoje, pagamento Débito e categoria Outros. Um único botão **Confirmar todos** salva o lote inteiro; **Cancelar** descarta todas as linhas. Uma compra continua usando **Confirmar**. A confirmação expira em 15 minutos. Nada entra em `tb_financas` antes da confirmação.

O modo de voz foi removido. Áudios recebem orientação para enviar texto; não são baixados nem enviados a fornecedores de transcrição. `GROQ_API_KEY` não é mais utilizada pelo bot. Valores por extenso, crédito, parcelas e outras datas devem ser registrados no app. O agrupamento interno `debito_pix` foi preservado.

## Banco e publicação

1. Se ainda não existir a tabela, aplicar `migration/20261006_telegram_compras.sql`.
2. Aplicar `migration/20261011_telegram_compras_multiplas.sql` **antes de publicar** o novo código. A função de confirmação aceita rascunhos individuais antigos e lotes novos. Bloqueia o rascunho durante a confirmação e grava todas as linhas em uma transação. Falhas desfazem o lote inteiro; repetir o clique não duplica lançamentos.
3. Publicar o código na Vercel. Se o webhook já estiver cadastrado para a mesma URL, não é necessário recriá-lo. Caso ainda não esteja, habilitar Compras pelo Telegram no perfil administrador após publicar.
4. Validar no chat privado configurado, conferir o resumo e confirmar. Essa verificação real não foi executada pelo agente.

Continuam necessárias as configurações de servidor `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `SAUDE_ALERTS_OWNER_USER_ID` e Supabase service role. O segredo do webhook pode ser derivado por HMAC do token ou definido em `TELEGRAM_WEBHOOK_SECRET`; não reutilizar `CRON_SECRET`. Credenciais ficam somente no servidor.

Somente o chat privado autorizado e seu titular podem criar ou confirmar rascunhos. Grupos, bots e mensagens encaminhadas são rejeitados. A tabela `tb_telegram_compras` mantém RLS e não permite acesso direto por anon/authenticated; somente service role acessa a tabela e a função. Não registrar mensagens ou payloads em logs. Os lançamentos pertencem à conta definida em `SAUDE_ALERTS_OWNER_USER_ID`.

## Recuperação e rollback

`/pendente` recupera o último rascunho individual ou lote válido dos últimos 15 minutos, com os mesmos botões. Se o envio ficar sem confirmação, confira o Financeiro antes de tentar novamente. Lançamentos confirmados podem ser editados ou excluídos no app.

Rollback: republicar o código anterior e aplicar `migration/rollback/20261011_telegram_compras_multiplas.sql`. O rollback recusa voltar enquanto houver lotes pendentes válidos; confirme, cancele ou aguarde a expiração antes. Histórico e lançamentos confirmados são preservados.

Esta alteração não modifica o cron dos alertas. Os testes locais usam mocks de transporte e PostgreSQL em memória; não comprovam execução na Vercel nem entrega real no Telegram.