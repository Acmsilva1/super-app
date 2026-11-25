# Privacidade e retenção — Super App

Este documento descreve controles técnicos. Não é uma declaração de conformidade LGPD nem substitui a definição do controlador e de base legal pelo responsável pelo serviço.

Referências oficiais: [direitos dos titulares — ANPD](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados-1/direito-dos-titulares), [LGPD, arts. 5, 11, 16 e 18](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm). A eliminação está sujeita às hipóteses legais de conservação; o responsável deve avaliar o caso antes de ofertar exclusão automática para tratamentos com obrigação específica de guarda.

## Controles implementados

- Preferência biométrica persistida somente como `credentialId` opaco. Migração remove nome, e-mail, identificador de conta e flags anteriores. Marcador de sessão fica em `sessionStorage`, com hash do identificador de sessão; não é uma decisão de autorização no servidor.
- Logout deve chamar `clearPrivateClientData()` e depois encerrar a sessão: remove caches locais de saúde/dieta e respostas sensíveis do CacheStorage.
- Centro de privacidade: aviso em linguagem simples e exportação dos registros próprios em relatório imprimível que pode ser salvo como PDF. O usuário deve procurar o administrador para solicitar exclusão dos dados.
- A API pública não oferece exclusão de conta. Pedidos de exclusão devem ser avaliados pelo administrador. A migration `migration/20261125_privacy_account_deletion.sql` existe para uso administrativo controlado, é transacional e acessível somente à service_role; revisar FKs em staging e restauração antes de aplicar em produção.
- Exportação inclui as tabelas listadas em `PRIVACY_TABLES`, informa tabelas ausentes e falha em vez de entregar exportação silenciosamente truncada acima de 50.000 registros por tabela. Não inclui logs, backup nem arquivos de sistemas externos. Ampliar o inventário quando criar novos módulos.

## Política atual e pendências operacionais

Dados são mantidos enquanto a conta estiver em uso ou até o administrador concluir um pedido de exclusão. Histórico de medidas/composição corporal não tem expurgo automático por idade. Quando autorizado após avaliação, a exclusão administrativa retira registros próprios das tabelas explicitamente permitidas do Super App, chaves biométricas e permissões na mesma transação; FKs bloqueantes fazem toda a operação falhar sem exclusão parcial. A identidade em `auth.users` permanece porque o projeto pode ser compartilhado com outros aplicativos. Sua exclusão deve ser avaliada pelo administrador após inventariar os outros consumidores.

O operador precisa definir e publicar: identidade/contato do controlador, finalidade e base legal aplicável a cada tratamento sensível, prazo de retenção de histórico clínico, rotação dos backups e prazo de atendimento. Não foi instituído prazo clínico arbitrário, nem destruído histórico para simular cumprimento. Até definir esses prazos, o aviso expõe a limitação.

Backups não são apagados pelo endpoint. Na restauração de um backup, aplicar novamente exclusões posteriores antes de reabrir o serviço. Logs de auditoria e dados compartilhados exigem revisão específica de finalidade/retencão. Não registrar senhas, conteúdo das exportações ou medidas corporais em logs de acesso.
