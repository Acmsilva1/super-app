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
