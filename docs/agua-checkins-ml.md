# Água por ml — protótipo

O app e o atalho da tela inicial oferecem sete gotas: 100, 200, 300, 400, 500 ml, 1 L e 2 L. Cada clique registra um consumo; os botões ficam bloqueados durante a gravação. Depois da confirmação, ficam disponíveis para o próximo consumo. A gota de progresso mostra consumo/meta e para visualmente em 100%; o volume registrado pode ultrapassar a meta. O campo de meta é definido pelo usuário (100 a 10000 ml); o valor inicial do formulário não é uma recomendação clínica.

O bot pergunta o volume no lembrete de água. O usuário pode tocar no botão ou responder, por exemplo, `200 ml`, à mensagem correspondente. Cada lembrete permite um check-in. Depois da confirmação, os botões são removidos. Respostas escritas devem usar a opção Responder do Telegram na mensagem do lembrete; sem essa referência, o bot pede que o usuário responda ao lembrete escolhido. Isso identifica o perfil e mantém a mesma chave em caso de reenvio do webhook. Lembretes de dias anteriores não aceitam registros para hoje. A espera é persistida no banco, sem manter o cron ou uma função Vercel em execução. Ao reabrir o acompanhamento no app, os dados são consultados novamente para trazer o consumo registrado pelo bot.

## Ativação

1. Aplicar `migration/20261013_saude_agua_ml.sql` no SQL Editor do Supabase do projeto. Se já aplicou a versão anterior, reaplique o arquivo atualizado para liberar 1 L e 2 L.
2. Publicar as alterações do backend, gateway Python e frontend pelo fluxo normal de deploy.
3. Configurar novamente a meta de água de cada perfil em ml.
4. Manter habilitados os alertas de água e o webhook do Telegram. O webhook já aceita mensagens e callbacks; não foi ativado ou alterado em produção neste trabalho.

O bot continua restrito à conta pessoal e ao chat configurados, como antes. Os perfis precisam pertencer ao proprietário configurado para os alertas. O app mantém a resolução do proprietário nas operações administrativas.

## Dados e segurança

A migration é aditiva: mantém as colunas e o histórico em doses. Não converte doses para ml, pois não existe um volume conhecido por dose. O acompanhamento em ml começa ao configurar a nova meta; o histórico antigo permanece no banco, mas não aparece como volume no novo acompanhamento.

`tb_saude_agua_checkins` guarda cada registro e seu identificador de requisição. A RPC soma os volumes com serialização por meta/perfil e deduplica os reenvios. Ela valida usuário, perfil, quantidades e identificador. O registro do app só muda visualmente depois da resposta de sucesso. Em falha de confirmação, uma repetição na mesma tela usa a mesma chave para não contar a tentativa duas vezes.

O rollback em `migration/rollback/20261013_saude_agua_ml.sql` bloqueia a remoção das estruturas se houver check-ins reais. Exporte os dados antes de reverter. Nada foi aplicado ao Supabase nem enviado ao Telegram real.

## Validação

- 71 testes JavaScript em 10 arquivos, incluindo SQL em PGlite, callback/resposta escrita, isolamento de usuário/perfil, simultaneidade, deduplicação, chegada/ultrapassagem da meta e bloqueio de clique concorrente.
- Mais 3 cenários específicos de água na suíte da API, aprovados.
- 6 testes Python do gateway, sem transporte real.
- Navegador local com dados fictícios: 200 ml + 300 ml = 500 ml, 25% de uma meta de 2000 ml; três cliques separados de 500 ml completaram a meta. O atalho e Saúde mostraram o mesmo total e as opções. Não houve envio real ao Telegram.
- A execução inicial da suíte completa da API também encontrou uma expectativa anterior de dieta (`Ovos` versus o nome canônico `Ovo inteiro`), fora da mudança de água; essa expectativa não foi alterada.

Não validado: Supabase de produção, webhook habilitado em produção e resposta a um lembrete real. Esses testes dependem da migration e do deploy e devem ocorrer de forma explícita.
