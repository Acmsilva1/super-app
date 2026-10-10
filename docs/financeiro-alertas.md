# Alertas personalizados do Financeiro

Na visão geral, abaixo do gráfico, crie uma regra com nome, conteúdo, cron e estado ativo/pausado. Resumos disponíveis: débito/Pix do dia; despesas fixas pagas e pendentes; receitas/despesas/saldo do mês. Mensagens personalizadas enviam apenas o texto informado. Textos opcionais dos resumos são adicionados antes dos valores calculados.

## Ativação

1. Aplicar `migration/20261010_create_financeiro_alertas.sql` no SQL Editor do banco usado pela Vercel. O arquivo cria agenda com RLS e acesso exclusivo da API privilegiada. A migration não foi aplicada pelo Codex em banco real.
2. Publicar os arquivos da aplicação. A rota fica em `/api/financeiro?recurso=alertas`, sem nova Function.
3. Manter `SUPABASE_SERVICE_ROLE_KEY`, `SAUDE_ALERTS_OWNER_USER_ID`, `SAUDE_ALERTS_ENABLED=true`, `ALERTS_API_TOKEN` e a configuração já existente do gateway/bot somente no servidor. Não inserir tokens no frontend.
4. Manter o workflow `.github/workflows/saude-alertas.yml` ativo na branch padrão. Ele já chama o agendador conjunto de Saúde e Financeiro. Testar entrega real separadamente após publicar.

A migration preserva os horários 13h/20h (débito/Pix) e 21h (fixas) da conta proprietária já usada no projeto. Caso `SAUDE_ALERTS_OWNER_USER_ID` tenha sido alterado, revisar o UUID da conta no trecho de carga inicial antes de aplicar. Regras adicionais pertencem ao usuário autenticado que as cria; apenas a conta vinculada ao chat do bot pode editá-las. O bot atual possui um único destinatário, não é um envio multiusuário.

## Cron

Cinco campos: minuto, hora, dia do mês, mês, dia da semana. Horários em `America/Sao_Paulo`. Aceita `*`, números, listas, intervalos e passos. Dia da semana 0 ou 7 = domingo. Quando dia do mês e dia da semana são restritos, basta um dos dois coincidir, conforme semântica cron POSIX.

- `0 13,20 * * *`: todos os dias às 13h e às 20h.
- `0 9 * * 1-5`: dias úteis às 9h.
- `0 9 1 * *`: dia 1 às 9h.
- `*/15 9-18 * * 1-5`: a cada 15 minutos, de 9h a 18h59, nos dias úteis.

Intervalo mínimo de cinco minutos, limite de 50 regras por conta e mensagem de até 1.500 caracteres. O preview mostra os próximos três horários. A execução depende do servidor e pode atrasar; o GitHub Actions não garante horário exato.

O worker considera a ocorrência mais recente dos últimos 60 minutos, sem produzir uma sequência de avisos atrasados. Ocorrências anteriores à criação da regra são ignoradas. A chave persistida contém a regra, a data e o horário programado; aquisição concorrente ou reexecução não duplicam o envio. Uma entrega incerta não é repetida automaticamente para evitar duplicação. O registro fica na tabela de entregas já existente `tb_saude_alertas_envios`.

## Modo local e reversão

No modo mock, CRUD fica em memória, perde-se ao reiniciar o backend e não envia Telegram. Persistência real exige a migration e conexão real.

`migration/rollback/20261010_financeiro_alertas.sql` pausa as regras e revoga o acesso à tabela, preservando dados. Reimplantar também o código anterior do agendador para restaurar os três horários fixos. O código novo mantém o legado quando a tabela ainda não existe, facilitando o rollout; uma tabela existente sem regras ativas não provoca envios legados.
