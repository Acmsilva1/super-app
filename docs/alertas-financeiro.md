# Alertas do Financeiro — V1.9.0

Na Visão geral, abaixo do gráfico, crie um alerta escolhendo a seção e um ou mais horários do dia. Não é necessário escrever nome, mensagem ou expressão cron.

O formulário mostra o conteúdo de cada resumo. Cada módulo tem uma abertura própria, compartilhada entre a prévia e o bot, seguida pela identificação do módulo e pelos dados consultados no momento do envio. Em Geral, a mensagem começa com “Sua visão financeira completa, em um só resumo.” e reúne todos os módulos.

- Extrato diário: gastos do dia com débito/Pix.
- Despesas fixas: valores pagos e pendentes do mês.
- Receitas: total recebido no mês.
- Poupança: saldo acumulado e meta cadastrada.
- Simulador: metas salvas e data da última simulação; resultados não são recalculados pelo alerta.
- Geral: reúne receitas, despesas e saldo mensal, extrato do dia, fixas, poupança e simulador.

Horários diários em Brasília, até 12 por alerta, com pelo menos cinco minutos de intervalo. Cada horário é armazenado e calculado separadamente, evitando combinações indevidas de horas e minutos. O cron da infraestrutura continua acionando o bot periodicamente; o envio pode atrasar até a próxima execução. O scheduler recupera ocorrências da última hora e usa uma chave persistente para cada alerta, data e horário. Alterações não disparam retroativamente horários anteriores à edição.

## Banco e publicação

Aplicar `migration/20261010_financeiro_alertas_secoes_horarios.sql` após a migration original `20261010_create_financeiro_alertas.sql`, antes de publicar esta versão. A migration acrescenta `horarios` e amplia as seções permitidas, mantendo o isolamento por conta e o acesso exclusivamente pela API. Foi validada em PostgreSQL em memória; não foi aplicada em produção.

Alertas antigos mantêm seus cron e mensagens até serem editados. Ao salvar a edição, passam a usar o resumo padrão e os horários diários escolhidos. Pausar ou ativar um alerta antigo preserva seu agendamento original.

Rollback: `migration/rollback/20261010_financeiro_alertas_secoes_horarios.sql`, junto com o código anterior. O rollback recusa remover horários enquanto existirem novos agendamentos: é preciso convertê-los explicitamente para o formato antigo antes. Não há descarte silencioso de regras.

O gateway atual atende somente a conta proprietária configurada. Em modo local os alertas ficam em memória e nenhum Telegram é enviado.
