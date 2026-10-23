const catalogue = {
  whatsapp_config_invalid: ['Configuração do Super App', 'Confira WHATSAPP_API_ORIGIN: deve ser HTTPS e sem caminho. Confira também WHATSAPP_INTEGRATION_TOKEN: mínimo de 32 caracteres.'],
  configuration_ok: ['Configuração do Super App', 'WhatsApp habilitado; origem HTTPS e formato da chave conferidos. Isso ainda não valida a chave na mensageria.'],
  profile_ok: ['Perfil e destinatários', 'Perfil localizado no banco do Super App; o código será usado para selecionar os destinatários.'],
  finance_ok: ['Perfil e destinatários', 'Proprietário financeiro configurado e selecionado como destino lógico.'],
  profile_query_failed: ['Banco do Super App', 'Falha ao consultar tb_saude_perfis. Confira SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SCHEMA e a disponibilidade do banco.'],
  client_configuration_failed: ['Banco do Super App', 'Não foi possível criar o cliente do banco. Confira as variáveis Supabase do Super App.'],
  record_ok: ['Registro no Super App', 'Ocorrência registrada para impedir duplicidade.'],
  whatsapp_claim_failed: ['Registro no Super App', 'Não foi possível registrar o teste em tb_saude_alertas_envios. Confira a tabela, o schema e as permissões no banco do Super App.'],
  request_started: ['Rota de mensageria', 'Chamando POST /api/control?action=event.'],
  gateway_unauthorized: ['Autenticação da mensageria', 'A API recusou a chave. WHATSAPP_INTEGRATION_TOKEN no Super App deve ser igual a INTEGRATION_TOKEN na mensageria; não use ADMIN_TOKEN.'],
  gateway_forbidden: ['Acesso à mensageria', 'Acesso bloqueado. Confira a proteção do deploy e se a URL aponta para o projeto de produção correto.'],
  gateway_not_found: ['Rota de mensageria', 'Rota não encontrada. Confira WHATSAPP_API_ORIGIN e publique a versão que contém /api/control.'],
  gateway_rate_limited: ['Rota de mensageria', 'A mensageria limitou as requisições. Aguarde antes de testar novamente.'],
  gateway_invalid_request: ['Contrato da mensageria', 'A mensageria recusou o formato do pedido. Confira se os dois projetos estão com versões compatíveis.'],
  gateway_invalid_response: ['Resposta da mensageria', 'A resposta não confirmou uma fila válida. Pode ser uma página de proteção, URL incorreta ou versão incompatível. Não repita antes de conferir a fila.'],
  gateway_unavailable: ['Serviço de mensageria', 'A API respondeu com erro interno. Confira as variáveis, migrations e disponibilidade do banco no projeto da mensageria.'],
  gateway_database_tls: ['Banco da mensageria', 'Certificado do banco recusado. Confira DATABASE_CA_CERT no projeto da mensageria.'],
  gateway_database_auth: ['Banco da mensageria', 'Credenciais do banco recusadas. Confira DATABASE_URL na mensageria e a codificação da senha.'],
  gateway_database_schema: ['Banco da mensageria', 'Tabelas ausentes ou incompatíveis. Execute a migration da mensageria no banco apontado pela DATABASE_URL.'],
  gateway_database_permission: ['Banco da mensageria', 'O usuário PostgreSQL não tem permissão para acessar as tabelas da mensageria.'],
  gateway_database_network: ['Banco da mensageria', 'A mensageria não conseguiu acessar o banco. Confira host, porta do pooler e disponibilidade do Supabase.'],
  request_timeout: ['Conexão com a mensageria', 'Tempo limite excedido. O pedido pode ter chegado; confira a fila antes de repetir.'],
  request_dns: ['Conexão com a mensageria', 'O domínio da mensageria não foi encontrado. Confira WHATSAPP_API_ORIGIN.'],
  request_network: ['Conexão com a mensageria', 'Falha de rede, conexão ou redirecionamento. Confira a URL de produção e sua disponibilidade; o resultado do pedido não foi confirmado.'],
  no_recipients: ['Destinatários da mensageria', 'Nenhum destinatário ativo corresponde ao perfil e ao tipo deste teste. Confira os três campos no painel da mensageria.'],
  duplicate_request: ['Proteção contra duplicidade', 'Essa ocorrência já foi registrada. Confira o histórico; ela não será enviada novamente automaticamente.'],
  queue_accepted: ['Fila da mensageria', 'A API aceitou o pedido e retornou itens da fila. Isso não confirma envio ou leitura no celular.'],
  whatsapp_record_failed: ['Registro no Super App', 'A fila aceitou o pedido, mas falhou a gravação da confirmação local. Confira a fila antes de repetir para evitar duplicidade.'],
  whatsapp_time_budget: ['Tempo de processamento', 'O tempo disponível para este teste terminou. Confira a fila antes de repetir.'],
  unknown_failure: ['Processamento do teste', 'Falha não classificada. O resultado não foi confirmado; confira a fila antes de repetir.']
};
export function testDiagnostic(code, state = 'error', httpStatus) {
  const known = Object.hasOwn(catalogue, code) ? code : 'unknown_failure';
  const [stage, message] = catalogue[known];
  return { stage, code: known, state, message, ...(Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599 ? { http_status: httpStatus } : {}) };
}
export function responseDiagnostic(status, payload) {
  const database = {
    database_tls_error: 'gateway_database_tls', database_auth_failed: 'gateway_database_auth',
    database_schema_missing: 'gateway_database_schema', database_schema_outdated: 'gateway_database_schema',
    database_permission_denied: 'gateway_database_permission', database_timeout: 'gateway_database_network',
    database_unreachable: 'gateway_database_network', database_host_not_found: 'gateway_database_network',
    database_unavailable: 'gateway_database_network', database_connection_limit: 'gateway_database_network'
  };
  if (status >= 500 && Object.hasOwn(database, payload?.error || '')) return database[payload.error];
  return { 401: 'gateway_unauthorized', 403: 'gateway_forbidden', 404: 'gateway_not_found', 429: 'gateway_rate_limited', 400: 'gateway_invalid_request', 409: 'gateway_invalid_request', 413: 'gateway_invalid_request', 422: 'gateway_invalid_request' }[status] || (status >= 500 ? 'gateway_unavailable' : 'gateway_invalid_response');
}
