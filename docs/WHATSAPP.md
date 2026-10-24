# Alertas WhatsApp usando o agendamento atual

O cron-job.org continua chamando `/api/saude-alertas-cron`. O Node do Super App
continua calculando horarios, perfil, texto e ocorrencias. A mensageria apenas
seleciona destinatarios cadastrados e processa a fila WhatsApp.

## Configurar no projeto Vercel do SUPER APP

```text
TELEGRAM_ENABLED=false
WHATSAPP_ALERTS_ENABLED=true
WHATSAPP_FINANCE_PROFILE_ID=<ID numerico do perfil do proprietario financeiro>
WHATSAPP_API_ORIGIN=https://SEU-PROJETO-MENSAGERIA.vercel.app
WHATSAPP_INTEGRATION_TOKEN=<mesmo valor de INTEGRATION_TOKEN da mensageria>
```

Nao usar ADMIN_TOKEN. Essas variaveis sao exclusivas de backend, sem prefixo
publico. O token nao vai ao navegador, aos logs nem ao Git. A origem deve ser
HTTPS, sem caminho, parametros ou credenciais. O servidor usa a rota fixa
`/api/control?action=event` e nao segue redirecionamentos.

O fluxo continua usando SAUDE_ALERTS_ENABLED=true, SAUDE_ALERTS_OWNER_USER_ID e
a configuracao Supabase/cron existente. Telegram fica desativado por padrao, mesmo
com credenciais antigas presentes. WhatsApp nao depende das credenciais Telegram.
Se nenhum canal estiver habilitado, o cron nao envia alertas.
Nao foi criado outro endpoint/Function nem outra agenda no Super App.
Nao e necessaria migration nova para esta integracao no Super App.

## Cadastro e escopo

- Agua e dieta: `audience` e o id de tb_saude_perfis convertido para texto.
- Financeiro: `audience` tambem e o ID numerico do perfil de Saude. Configure
  WHATSAPP_FINANCE_PROFILE_ID no Super App com esse ID. O perfil deve pertencer
  ao usuario definido em SAUDE_ALERTS_OWNER_USER_ID; os dados financeiros
  continuam filtrados pelo usuario, sem compartilhar dados entre proprietarios.
- No painel da mensageria, cadastrar o telefone, o mesmo perfil e o tipo habilitado.
- Os resumos de dieta WhatsApp sao formatados por perfil. O resumo agrupado que
  o canal legado recebia fica preservado para eventual reativacao.
- Nenhum botao interativo de registro de agua Telegram e encaminhado ao WhatsApp;
  nesta etapa ele recebe somente a notificacao em texto.
- A mensageria precisa estar conectada e com banco/migrations configurados.

## Destino em grupo

O Super App continua enviando o ID do perfil e o tipo de alerta para a mesma
API da mensageria. O destino (numero ou grupo) e escolhido somente na mensageria;
nao ha nova variavel de ambiente nem ID de grupo para configurar no Super App.

1. Na mensageria, selecione o grupo e cadastre-o com o mesmo ID de perfil usado
   nos alertas de agua/dieta ou em WHATSAPP_FINANCE_PROFILE_ID para Financeiro.
2. Habilite os tipos de alerta desejados nesse cadastro e mantenha-o ativo.
3. Para um mesmo grupo receber varios perfis, crie um cadastro por perfil.
4. Se quiser apenas o grupo, desative os destinatarios individuais anteriores
   para os mesmos perfis/tipos. Destinatarios ativos tambem recebem a mensagem.
5. Use os testes Agua, Dieta e Financeiro do Super App, selecionando o perfil
   correspondente; confira o aceite da fila e depois o resultado na mensageria.

Um grupo compartilha as mensagens com todos os participantes; vincule apenas
os perfis e alertas que deseja compartilhar com essas pessoas.

## Duplicidade e resultados

O registro tb_saude_alertas_envios continua sendo reutilizado. Chaves Telegram
permanecem intactas; WhatsApp usa prefixo `whatsapp:` e hash por ocorrencia,
perfil e parte da mensagem. Isso evita que um canal bloqueie o outro.

Para registros WhatsApp, `status=sent` e o estado legado de encaminhamento
aceito pela API, com `last_error=whatsapp_queue_accepted`. NAO confirma envio,
entrega ou leitura no celular. O resultado real deve ser consultado no painel
da mensageria. Com o canal legado desativado, alerts_sent conta os pedidos
aceitos na fila WhatsApp; nao confirma entrega ou leitura.

Ausencia de destinatarios ativos para um perfil/tipo resulta em
`whatsapp_no_recipients`: a ocorrencia e registrada como processada sem envio,
para nao repetir consultas a cada recuperacao de horario. Novos destinatarios
passam a receber as proximas ocorrencias; nao ha envio retroativo dessa ocorrencia.

Falha/timeout fica `uncertain` com `whatsapp_delivery_unconfirmed`, sem reenvio
automatico da mesma ocorrencia. Conferir a fila antes de qualquer reprocessamento
manual. O canal legado nao e chamado enquanto TELEGRAM_ENABLED estiver ausente
ou false. Se futuramente os dois canais forem habilitados, sao tentados de forma
independente; uma falha nao impede a tentativa do outro.

Mensagens longas sao divididas para respeitar o limite da mensageria. Cada parte
possui sua propria chave. Uma falha pode deixar envio parcial; conferir o painel.

O cron preserva a recuperacao de horarios da ultima hora. Ao ativar WhatsApp,
ocorrencias dessa janela ainda sem registro WhatsApp podem ser encaminhadas.

## Ativacao e rollback

1. Publicar as alteracoes do Super App pelo fluxo habitual.
2. Configurar as variaveis no Super App e fazer novo deploy.
3. Confirmar no painel da mensageria o numero remetente e destinatario/perfil.
4. Validar um envio real explicitamente autorizado e conferir o resultado.

Rollback: definir WHATSAPP_ALERTS_ENABLED=false e fazer novo deploy do Super App.
Isso interrompe novos encaminhamentos; nao cancela pedidos que ja estavam na fila
da mensageria. Para retomar o canal legado, habilite TELEGRAM_ENABLED=true e
confira suas credenciais antes de publicar novamente.

Nenhuma configuracao de producao, migration ou envio real foi executado pela
implementacao local. Os testes usam mocks e nao acessam contas WhatsApp/Telegram.

## Testes manuais pelo painel

A secao administrativa Testes de disparo WhatsApp oferece Agua, Dieta e Financeiro.
Agua, dieta e financeiro exigem selecao de um perfil de Saude. No teste
financeiro, esse perfil deve pertencer ao proprietario configurado em
SAUDE_ALERTS_OWNER_USER_ID. O teste manual usa a selecao do painel; o agendamento
automatico usa WHATSAPP_FINANCE_PROFILE_ID. Sao mensagens sinteticas identificadas
como teste; nao enviam todas as dietas nem resumos financeiros reais.
A rota continua sendo POST /api/admin/usuarios com action=test_whatsapp, protegida
por autenticacao administrativa. O cliente nao recebe token da mensageria.
Cada tipo tem limite de um teste por minuto por administrador. O requestId separa
ocorrencias manuais e permite identificar repeticoes sem disparo automatico.
Pedido aceito na fila nao significa entrega: conferir Ultimos envios na mensageria.
O agendamento automatico continua usando o cron existente. Os comandos de compras
do canal legado estao desativados; o codigo foi preservado para futura retomada.

O resultado do teste manual inclui diagnostico por etapa: perfil, configuracao,
registro local, chamada da API, autenticacao e aceite da fila. Falhas HTTP,
timeout, certificado/banco remoto e destinatarios ausentes trazem orientacao no
proprio painel. Apenas codigos conhecidos e mensagens fixas sao exibidos;
respostas internas, tokens, senhas e URLs com credenciais nunca sao encaminhados.
O diagnostico vai ate o aceite na fila: nao confirma execucao posterior do worker,
entrega ou leitura no celular. O resultado de envio continua na mensageria.

## Numero remetente e notificacoes

O numero conectado e o remetente. Usar esse mesmo numero como destinatario
pode resultar em mensagem na conversa consigo mesmo, sem aviso de recebimento.
O framework nao garante nem forca notificacoes do WhatsApp para mensagens proprias.
Para receber pelo WhatsApp como outra conta, use outro numero como remetente.
Nao e necessario outro aparelho se voce puder registrar a segunda conta no mesmo
celular. O cadastro do numero remetente como destinatario nao e obrigatorio.
Notificacoes push proprias do Super App nao estao implementadas nesta mudanca.

## Canal legado desativado

O Telegram agora exige `TELEGRAM_ENABLED=true` explicitamente; ausente ou false bloqueia alertas, testes e processamento do webhook. Configure `TELEGRAM_ENABLED=false` na Vercel do Super App e publique o codigo atualizado. O WhatsApp continua usando suas variaveis e nao depende de ALERTS_API_URL/ALERTS_API_TOKEN.

A interface de compras do canal legado fica em um template inativo e o backend foi preservado. Para retomar futuramente, habilite a variavel e restaure os controles do template; o webhook e credenciais existentes precisam ser conferidos. Nenhum webhook externo e apagado por esta alteracao.

O contador alerts_sent do cron conta pedidos aceitos pelo canal ativo; no WhatsApp isso significa enfileiramento, e a entrega continua sendo acompanhada na mensageria.
