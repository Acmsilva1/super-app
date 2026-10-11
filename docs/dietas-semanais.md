# Dietas semanais — V.1.4.0

Aplicar `migration/20261010_add_saude_dietas_semanais.sql` antes de publicar esta versão. Depende da migration de integração de alimentos de 07/10. A migration adiciona `semanal` e `semana` à tabela existente e atualiza a RPC de cadastro atômico do alimento. Não modifica os planos únicos nem as políticas de acesso.

Cada semana guarda sete dias, ordenados de segunda a domingo. Dias vazios são permitidos; precisa existir ao menos um alimento na semana. A API valida os alimentos de todos os dias. A consulta e edição no módulo começam na segunda-feira. O atalho da home e os alertas selecionam o dia atual de `America/Sao_Paulo`. O bot mantém os horários e a regra de reunir dietas já configurados. Um dia vazio informa menu não cadastrado, sem repetir outro dia.

O teste manual do Telegram usa a mesma seleção de dia do scheduler. A nutrição da mensagem corresponde somente à refeição anunciada.

Rollback: `migration/rollback/20261010_saude_dietas_semanais.sql`. Interrompe se houver dietas semanais para evitar descarte de dados; exportar ou converter esses registros antes de reverter. Não aplicar rollback automaticamente.

Validação local usa armazenamento em memória e transporte Telegram simulado. Publicação, migration no banco real e entrega real do bot são etapas separadas.

## Seleção de alertas — V.1.5.0

Aplicar também `20261010_add_saude_dieta_alerta_ativo.sql` antes do deploy. Dietas existentes mantêm o envio; novas começam desligadas. Cada dieta possui on/off persistido imediatamente na API. O desligamento geral dos Agendadores continua pausando todas as dietas do perfil, inclusive as ligadas individualmente. O teste manual respeita o on/off da dieta. Editar alimentos não altera essa escolha.

## Horários editáveis — V.1.6.0

Aplicar `20261010_add_saude_dieta_horarios.sql` antes desta versão. Os Agendadores do perfil permitem até 12 avisos, cada um com refeição e horário de Brasília. Horários repetidos para a mesma refeição são recusados. As configurações atuais mantêm 07h/11h/15h/19h como padrão até serem alteradas. Salvar persiste a agenda; o scheduler consulta o banco a cada execução, sem reiniciar o bot ou alterar o cron.

O acionador existente consulta a cada cinco minutos e pode sofrer atrasos do provedor. O bot busca horários devidos na última hora e evita repetição pelas chaves de entrega persistidas. Alterações salvas não disparam retroativamente os horários anteriores ao salvamento. Água mantém seu intervalo e janela atuais. A pausa geral e o on/off individual das dietas continuam sendo respeitados.

## Janela da água — V.1.7.0

Aplicar `20261010_add_saude_agua_janela.sql` antes do deploy. Início e fim ficam salvos por perfil, com padrão anterior de 07:30 a 22:30. A janela deve começar e terminar no mesmo dia, com fim após início. O bot envia no início e nos intervalos de horas a partir dele, até o limite final; não força um aviso no fim se o intervalo não coincidir. O início aceita minutos livres. O acionador periódico e a recuperação da última hora também atendem a água, respeitando a janela, a pausa do perfil e a deduplicação persistida. Salvar atualiza a configuração lida nas próximas execuções.


## V.1.8.2 — revisão dos agendadores

A revisão reproduziu a interferência entre água e dieta na recuperação de avisos atrasados.
A agenda passa a registrar `agua_updated_at` e `dieta_updated_at` independentemente.
O banco atualiza somente a data da seção que mudou; salvar os mesmos valores preserva as datas.
O bot usa a data da respectiva seção para impedir envios anteriores à configuração salva.

Antes de publicar esta versão, aplicar `migration/20261010_fix_saude_alertas_section_timestamps.sql`,
após as migrations de horários de dieta e da janela de água. A migration preserva os horários e
inicializa as novas datas com o `updated_at` existente. O rollback correspondente requer também
reverter o código. Não houve aplicação em banco real nem envio real ao Telegram na validação.
