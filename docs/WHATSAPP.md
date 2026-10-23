# Alertas WhatsApp usando o agendamento atual

O cron-job.org continua chamando `/api/saude-alertas-cron`. O Node do Super App
continua calculando horarios, perfil, texto e ocorrencias. A mensageria apenas
seleciona destinatarios cadastrados e processa a fila WhatsApp.

## Configurar no projeto Vercel do SUPER APP

```text
WHATSAPP_ALERTS_ENABLED=true
WHATSAPP_API_ORIGIN=https://SEU-PROJETO-MENSAGERIA.vercel.app
WHATSAPP_INTEGRATION_TOKEN=<mesmo valor de INTEGRATION_TOKEN da mensageria>
```

Nao usar ADMIN_TOKEN. As tres variaveis sao exclusivas de backend, sem prefixo
publico. O token nao vai ao navegador, aos logs nem ao Git. A origem deve ser
HTTPS, sem caminho, parametros ou credenciais. O servidor usa a rota fixa
`/api/control?action=event` e nao segue redirecionamentos.

As variaveis existentes de Telegram/Supabase/cron permanecem iguais. O fluxo
ainda usa SAUDE_ALERTS_ENABLED, o proprietario e a configuracao Telegram atual.
Sem a flag WHATSAPP_ALERTS_ENABLED=true, o comportamento anterior e preservado.
Nao foi criado outro endpoint/Function nem outra agenda no Super App.
Nao e necessaria migration nova para esta integracao no Super App.

## Cadastro e escopo

- Agua e dieta: `audience` e o id de tb_saude_perfis convertido para texto.
- Financeiro: `audience` e o UUID do proprietario configurado em
  SAUDE_ALERTS_OWNER_USER_ID. Nao e o id numerico do perfil de saude.
- No painel da mensageria, cadastrar o telefone, o mesmo perfil e o tipo habilitado.
- Os resumos de dieta WhatsApp sao formatados por perfil. O resumo agrupado que
  o Telegram ja recebia permanece igual.
- Nenhum botao interativo de registro de agua Telegram e encaminhado ao WhatsApp;
  nesta etapa ele recebe somente a notificacao em texto.
- A mensageria precisa estar conectada e com banco/migrations configurados.

## Duplicidade e resultados

O registro tb_saude_alertas_envios continua sendo reutilizado. Chaves Telegram
permanecem intactas; WhatsApp usa prefixo `whatsapp:` e hash por ocorrencia,
perfil e parte da mensagem. Isso evita que um canal bloqueie o outro.

Para registros WhatsApp, `status=sent` e o estado legado de encaminhamento
aceito pela API, com `last_error=whatsapp_queue_accepted`. NAO confirma envio,
entrega ou leitura no celular. O resultado real deve ser consultado no painel
da mensageria. A contagem alerts_sent do cron continua sendo do Telegram.

Ausencia de destinatarios ativos para um perfil/tipo resulta em
`whatsapp_no_recipients`: a ocorrencia e registrada como processada sem envio,
para nao repetir consultas a cada recuperacao de horario. Novos destinatarios
passam a receber as proximas ocorrencias; nao ha envio retroativo dessa ocorrencia.

Falha/timeout fica `uncertain` com `whatsapp_delivery_unconfirmed`, sem reenvio
automatico da mesma ocorrencia. Conferir a fila antes de qualquer reprocessamento
manual. Telegram e WhatsApp sao tentados independentemente; uma falha e reportada
ao cron depois que os dois tiveram oportunidade de processar o alerta.

Mensagens longas sao divididas para respeitar o limite da mensageria. Cada parte
possui sua propria chave. Uma falha pode deixar envio parcial; conferir o painel.

O cron preserva a recuperacao de horarios da ultima hora. Ao ativar WhatsApp,
ocorrencias dessa janela ainda sem registro WhatsApp podem ser encaminhadas.

## Ativacao e rollback

1. Publicar as alteracoes do Super App pelo fluxo habitual.
2. Configurar as tres variaveis no Super App e fazer novo deploy.
3. Confirmar no painel da mensageria o numero remetente e destinatario/perfil.
4. Validar um envio real explicitamente autorizado e conferir o resultado.

Rollback: definir WHATSAPP_ALERTS_ENABLED=false e fazer novo deploy do Super App.
Isso interrompe novos encaminhamentos; nao cancela pedidos que ja estavam na fila
da mensageria. Telegram permanece funcionando.

Nenhuma configuracao de producao, migration ou envio real foi executado pela
implementacao local. Os testes usam mocks e nao acessam contas WhatsApp/Telegram.

## Testes manuais pelo painel

A secao administrativa Testes de disparo WhatsApp oferece Agua, Dieta e Financeiro.
Agua e dieta exigem selecao de um perfil de Saude. Financeiro usa o proprietario
configurado em SAUDE_ALERTS_OWNER_USER_ID. Sao mensagens sinteticas identificadas
como teste; nao enviam todas as dietas nem resumos financeiros reais.
A rota continua sendo POST /api/admin/usuarios com action=test_whatsapp, protegida
por autenticacao administrativa. O cliente nao recebe token da mensageria.
Cada tipo tem limite de um teste por minuto por administrador. O requestId separa
ocorrencias manuais e permite identificar repeticoes sem disparo automatico.
Pedido aceito na fila nao significa entrega: conferir Ultimos envios na mensageria.
Os comandos de compras Telegram e o agendamento automatico permanecem intactos.

O resultado do teste manual inclui diagnostico por etapa: perfil, configuracao,
registro local, chamada da API, autenticacao e aceite da fila. Falhas HTTP,
timeout, certificado/banco remoto e destinatarios ausentes trazem orientacao no
proprio painel. Apenas codigos conhecidos e mensagens fixas sao exibidos;
respostas internas, tokens, senhas e URLs com credenciais nunca sao encaminhados.
O diagnostico vai ate o aceite na fila: nao confirma execucao posterior do worker,
entrega ou leitura no celular. O resultado de envio continua na mensageria.
