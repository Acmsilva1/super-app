# Retorno do SuperApp à Vercel

## Integração

Supabase Auth, login, cadastro público e recuperação de senha foram preservados.
O painel de administração continua restrito ao proprietário e usa Supabase Auth
Admin para criar contas, redefinir senhas, bloquear/reativar usuários e conceder
permissões. As senhas geradas são exibidas uma vez no painel; não há obrigação
de troca no próximo login, pois esse mecanismo era exclusivo da autenticação
local da VPS. A recuperação de senha existente continua disponível.

Foram trazidos os ajustes de navegação/mobile, Saúde (calorias e agendas),
arquivos de análise financeira/cache anual e o módulo de treino presente na VPS.
Docker, Caddy, autenticação local e Central de Controle não foram integrados.
Os registros existentes no PostgreSQL da VPS não são transferidos por essa mudança.

## Banco: antes de publicar

Revisar/aplicar no Supabase, nesta ordem:

1. `migration/20261005_add_meta_calorias_dietas.sql`
2. `migration/20261005_saude_alertas_supabase.sql`

As tabelas de Saúde e `app_user_roles` precisam existir. A agenda usa RLS por
`auth.uid()`. O histórico de envio é exclusivo de `service_role`; não armazena
o texto das mensagens. Não aplicar a migration de agenda original da VPS,
que depende de `superapp_data`, `superapp_anon` e autenticação local.
Nenhuma migration foi aplicada automaticamente. Scripts de rollback são
destrutivos e estão em `migration/rollback/` para revisão manual.

## Fluxo dos alertas

GitHub Actions → GET `/api/saude-alertas-cron` → Node consulta as agendas no
Supabase → POST `/api/telegram-alert` → Python lê as variáveis e envia ao Telegram.
O Python é uma função do mesmo projeto, sem servidor contínuo ou polling.
O Node não depende de um executável Python dentro do runtime Node da Vercel.

O plano Hobby não permite Cron frequente na Vercel. Por isso o workflow
`.github/workflows/saude-alertas.yml` dispara a cada cinco minutos. O agendamento
do GitHub depende do arquivo estar na branch padrão, pode atrasar e pode ser
desabilitado pelo GitHub em repositórios públicos inativos. Não há garantia
de horário exato. O Node verifica o intervalo atual e o anterior de meia hora.
Se o atraso passar da janela de recuperação, avisos antigos não são enviados.

Cada perfil/horário tem uma chave única no Supabase. Chamadas concorrentes
não repetem o envio. Falhas com resultado incerto ficam registradas como
`uncertain` e não são reenviadas automaticamente, evitando duplicidade caso
o Telegram tenha recebido a mensagem antes de um timeout. Conferir manualmente
esses registros; não há garantia de entrega exatamente uma vez entre serviços.
O destino Telegram é único e os alertas consultam somente o proprietário
configurado em `SAUDE_ALERTS_OWNER_USER_ID`.

## Variáveis da Vercel — ambiente Production

- `TELEGRAM_BOT_TOKEN`: token do bot.
- `TELEGRAM_CHAT_ID`: chat autorizado que recebe os avisos.
- `ALERTS_API_TOKEN`: segredo aleatório de pelo menos 32 caracteres para Node → Python.
- `CRON_SECRET`: outro segredo aleatório de pelo menos 32 caracteres para o agendador → Node.
- `SAUDE_ALERTS_ENABLED`: `true` depois de aplicar as migrations.
- `SAUDE_ALERTS_OWNER_USER_ID`: UUID do proprietário no Supabase Auth.
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`: usadas apenas no servidor.
- `SUPABASE_ANON_KEY`: manter a configuração do login existente.
- `ALERTS_API_URL`: URL HTTPS de produção terminada em `/api/telegram-alert`.
  Pode ser omitida quando `VERCEL_PROJECT_PRODUCTION_URL` identifica o domínio
  correto; para domínio próprio, informar explicitamente evita ambiguidade.
- `VERCEL_AUTOMATION_BYPASS_SECRET`: necessário somente se Deployment Protection
  bloquear as chamadas entre funções/externas. Usar o segredo de bypass da Vercel.

Nunca colocar esses valores no código nem enviá-los em prints/logs.
Redeploy é necessário após alterar variáveis da Vercel.

## Configuração do GitHub

Em Settings → Secrets and variables → Actions:

- Variable `SUPERAPP_URL`: origem HTTPS de produção, sem caminho, por exemplo
  `https://seu-app.vercel.app`.
- Secret `CRON_SECRET`: mesmo valor da Vercel.
- Secret `VERCEL_AUTOMATION_BYPASS_SECRET`: somente se houver proteção de deployment.
- Variable `SAUDE_ALERTS_SCHEDULER_ENABLED`: `true` somente depois de configurar
  a Vercel e o banco. Sem essa variável o workflow permanece desativado.

Token do Telegram, chat e chave do Supabase ficam exclusivamente na Vercel.
O workflow aceita execução manual, mas envia alertas reais quando habilitado.
Não executar para teste sem autorização para mensageria externa.

## Validação e publicação

Usar os testes locais e o relatório de integração. A instalação das variáveis,
as migrations reais, a validação visual e o envio real ao Telegram continuam
dependendo do ambiente. Commit, push e deploy são manuais.

## Teste manual do Telegram no admin

Depois do deploy, entrar com a conta administradora e abrir **Meu perfil → Alertas → Testar Telegram**. O botão envia duas mensagens fictícias identificadas como TESTE MANUAL, uma de água e outra de dieta. Não altera os agendamentos nem consulta dados de saúde reais.

A ação usa `POST /api/admin/usuarios` com `action: test_telegram`, após a mesma autorização owner usada na administração de usuários. O Node chama `/api/telegram-alert` no servidor. As três variáveis sensíveis permanecem somente no runtime da Vercel; o navegador não recebe seus valores. Não depende de ativar o cron ou de aplicar as migrations dos alertas.

No modo mock, retorna simulação com zero mensagens enviadas. Em produção, sucesso exige confirmação do Telegram para ambas. Falha parcial informa que água foi entregue e dieta não foi confirmada; timeout não causa reenvio automático. Confira o chat antes de repetir. Existe um intervalo de um minuto por instância do servidor entre tentativas, além do bloqueio do botão enquanto o envio está em andamento.

Requer `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` e `ALERTS_API_TOKEN` (pelo menos 32 caracteres) aplicadas no deploy. A URL do gateway pode ser configurada em `ALERTS_API_URL`; sem ela usa o domínio de produção da Vercel. Se Deployment Protection bloquear a chamada, configurar `VERCEL_AUTOMATION_BYPASS_SECRET` no servidor. O handler administrativo recebeu duração máxima de 60 segundos para aguardar os dois envios.

## Ativação dos alertas — 05/10/2026

André confirmou a execução de `20261005_saude_alertas_supabase.sql` e o recebimento do teste manual pelo botão administrativo. Essas confirmações são do usuário; o disparo automático ainda não foi validado em produção nesta etapa.

Configuração criada no ambiente Production da Vercel: `SAUDE_ALERTS_ENABLED=true`, `SAUDE_ALERTS_OWNER_USER_ID` com o proprietário existente e `CRON_SECRET`. No GitHub Actions foram configurados o mesmo secret `CRON_SECRET`, `SUPERAPP_URL=https://super-app-zeta-virid.vercel.app` e `SAUDE_ALERTS_SCHEDULER_ENABLED=true`. Telegram e Supabase continuam configurados somente na Vercel.

Horários diários em America/Sao_Paulo, preservados da VPS:

- Dieta: 07:00, 11:00, 15:00 e 19:00.
- Água: de 07:30 a 22:30; padrão de 3 horas (07:30, 10:30, 13:30, 16:30, 19:30 e 22:30).
- O admin mantém ativação individual de água/dieta, intervalo de água entre 1 e 12 horas e seleção de dieta por perfil.

O GitHub chama o Node a cada cinco minutos; o Node consulta as agendas salvas e chama o Python, que envia ao Telegram usando as variáveis do servidor. GitHub Actions pode atrasar. A falha de envio em um perfil agora permite processar os demais, incluindo o intervalo atual e o anterior; ao final, o erro continua sendo informado ao workflow. A proteção persistente contra duplicidade foi preservada.

O painel administrativo agora mostra as execuções aceitas pelo endpoint, tentativas de envio e códigos de falha sem tokens. Sem execuções recentes, confira em GitHub → Actions se o workflow `Alertas de Saude` foi disparado e se `SAUDE_ALERTS_SCHEDULER_ENABLED=true`; sem tentativas com o workflow rodando, confira `SAUDE_ALERTS_ENABLED`, UUID do proprietário, agendas e horários. `sent` com `telegram_message_id` confirma a entrega aceita pelo Telegram; `uncertain` exige conferir o chat antes de qualquer reenvio. Uma execução ainda como `running` pode indicar timeout ou encerramento da função. Os alertas automáticos continuam consultando somente `SAUDE_ALERTS_OWNER_USER_ID`.

## Monitoramento administrativo de Saúde — 06/10/2026

Em **Meu perfil → Administração → Acompanhamento do módulo Saúde**, a visualização abre em **Todos os usuários de Saúde**, com opção de filtrar por conta. Mostra perfis atuais, medições, dietas, água, agendas e eventos, identificando a conta dona dos registros. A API exige a mesma validação owner-only de `requireUser({ adminOnly: true })` e usa a chave service role exclusivamente no servidor.

Antes de usar o histórico, aplicar `migration/20261006_saude_admin_activity_audit.sql` depois das migrations de alertas e tabelas do módulo Saúde. Os triggers registram snapshots de INSERT, UPDATE e DELETE de perfis, medidas, dietas, metas e logs de água e agendas. Se essa migration já tiver sido executada, aplicar também `migration/20261006_saude_alertas_runs_running.sql` para habilitar o estado de execução em andamento usado pela versão atual do cron. O histórico começa na instalação da auditoria; ele não consegue reconstruir alterações anteriores. O painel pagina os eventos anteriores. A tabela de auditoria nega acesso a `anon` e `authenticated`; somente service role acessa via endpoint administrativo.

Essa migration também habilita códigos seguros de falha de entrega e um registro de execuções autenticadas do cron, retido por 30 dias. Se não houver execução registrada, a chamada pode não ter chegado autenticada ao endpoint; verificar o run do GitHub Actions e conferir URL/segredo. Se houver `skipped`, verificar as variáveis de ativação; `failed` indica falha ao processar agenda/dados; `uncertain` significa que não foi possível confirmar a resposta do gateway e requer conferência manual no Telegram.

Uma cópia de recuperação da chave do cron está em `.env.cron.local`, confirmada como ignorada pelo Git. Não compartilhar nem versionar esse arquivo.

Ainda é necessário o commit/push manual e o deploy para aplicar as mudanças e as variáveis novas ao runtime. Nenhum commit, push ou deploy foi executado nesta etapa. Não foram executados testes automatizados novos nem disparo manual do cron; apenas revisão do diff e `git diff --check`.

## Administração de contas e senhas — 05/10/2026

Em **Meu perfil → Administração**, o proprietário pode criar uma conta com nome, email, senha inicial e confirmação; liberar módulos; bloquear/reativar usuários; e escolher uma nova senha para qualquer conta, inclusive a própria (botão **Alterar minha senha**). Novas senhas aceitam de 8 a 128 caracteres e continuam sujeitas à política configurada no Supabase.

A ação `PATCH /api/admin/usuarios` com `action: set_password` usa a Admin API do Supabase somente no servidor e mantém `requireUser({ adminOnly: true })`, que exige a identidade do proprietário e papel administrativo existentes. As senhas escolhidas não são retornadas na resposta nem persistidas em armazenamento local; os campos são limpos após envio e ao fechar o painel. O modo mock simula a mudança sem alterar o login fictício ou guardar a senha.

O botão, formulário e chamada `auth.signUp` do cadastro público foram removidos. Login e recuperação de senha do Supabase permanecem.

**Configuração externa ainda obrigatória:** em Supabase → Authentication → Sign In / Providers, desligar **Allow new users to sign up** e manter **Allow anonymous sign-ins** desligado. Isso bloqueia cadastro direto pela API pública; a criação administrativa continua usando a Admin API. Remover a tela não substitui essa configuração. Não há credencial de gerenciamento do Supabase disponível nesta sessão para aplicar essa alteração; ela não foi executada nem confirmada.

Não foi alterada nenhuma senha real, criada nenhuma conta em produção ou executado deploy. Revisão do diff e sintaxe JavaScript realizadas; testes automatizados e validação visual/funcional dessas mudanças não executados. Commit, push e deploy ficam a cargo de André.
