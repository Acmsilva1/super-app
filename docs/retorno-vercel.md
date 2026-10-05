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
