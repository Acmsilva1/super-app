import crypto from 'node:crypto';
import { consumeActionLimit } from './actionRateLimit.js';
import { previewAllDietAlerts } from '../features/saude/service/alertasSaudeScheduler.js';
import { previewFinanceiroDailySummaries } from '../features/financeiro/service/financeiroTelegramScheduler.js';

let lastAttempt = 0;

// Chamado apenas depois da autorização administrativa no handler.
export async function runTelegramManualTest() {
  const deadline = Date.now() + 45000;
  if (process.env.OFFLINE_DEV === 'true' || process.env.NODE_ENV === 'test') {
    return { status: 200, body: { ok: true, simulated: true, sent: 0 } };
  }
  for (const name of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'ALERTS_API_TOKEN']) {
    if (!String(process.env[name] || '').trim()) {
      return { status: 503, body: { ok: false, error: `Configure ${name} na Vercel e faça um novo deploy.` } };
    }
  }
  const token = process.env.ALERTS_API_TOKEN;
  if (token.trim().length < 32) {
    return { status: 503, body: { ok: false, error: 'ALERTS_API_TOKEN precisa ter pelo menos 32 caracteres.' } };
  }
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  let gateway;
  try {
    gateway = new URL(process.env.ALERTS_API_URL || (host ? `https://${host}/api/telegram-alert` : ''));
    if (gateway.protocol !== 'https:' || gateway.username || gateway.password || gateway.pathname !== '/api/telegram-alert' || gateway.search || gateway.hash) throw new Error();
  } catch {
    return { status: 503, body: { ok: false, error: 'Configure ALERTS_API_URL com a URL HTTPS do gateway /api/telegram-alert.' } };
  }
  const now = Date.now();
  // Limite adicional por instância; o botão também fica bloqueado durante a chamada.
  if (now - lastAttempt < 60000) {
    return { status: 429, body: { ok: false, error: 'Aguarde um minuto antes de repetir o teste.' } };
  }
  lastAttempt = now;
  try {
    if (!await consumeActionLimit('telegram-test',process.env.SAUDE_ALERTS_OWNER_USER_ID,1,60)) return { status:429, body:{ok:false,error:'Aguarde um minuto antes de repetir o teste.'} };
  } catch { return { status:503, body:{ok:false,error:'Controle de testes indisponivel. Confira a migration de limites.'} }; }
  const [diets, finance] = await Promise.allSettled([
    previewAllDietAlerts(), previewFinanceiroDailySummaries(),
  ]);
  const warnings = [];
  if (diets.status === 'rejected') warnings.push('Dietas não incluídas: falha na consulta. Confira o acesso ao banco e as migrations na Vercel.');
  if (finance.status === 'rejected') warnings.push('Financeiro não incluído: falha na consulta. Confira o acesso ao banco e a view de despesas fixas na Vercel.');
  if (diets.status === 'rejected' && finance.status === 'rejected') {
    return { status: 503, body: { ok: false, sent: 0, warnings, error: warnings.join(' ') } };
  }
  const dietMessages = diets.status === 'fulfilled' ? diets.value : [];
  const alerts = [
    { event_type: 'health.water_progress', title: '[TESTE MANUAL] Água', message: 'Teste do SuperApp: perfil fictício com 3 de 8 doses. Não representa seus dados reais.' },
    ...(diets.status === 'rejected' ? [] : dietMessages.length ? dietMessages : ['Nenhuma dieta cadastrada foi encontrada no banco.']).map((message, index) => ({
      event_type: 'health.diet_menu', title: `[TESTE MANUAL] Todas as dietas${dietMessages.length > 1 ? ` (${index + 1}/${dietMessages.length})` : ''}`, message,
    })),
    ...(finance.status === 'fulfilled' ? finance.value : []),
  ];
  const results = [];
  for (const alert of alerts) {
    if (Date.now() + 1500 >= deadline) return { status:502, body:{ok:false,sent:results.length,expected:alerts.length,results,error:'Tempo do teste esgotado. Confira as mensagens recebidas antes de repetir.'} };
    try {
      const headers = { 'Content-Type': 'application/json', 'X-Alert-Token': token };
      if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
      const response = await fetch(gateway.href, {
        method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(Math.min(20000, deadline-Date.now()-1000)),
        body: JSON.stringify({ source: 'superapp-node', severity: 'info', dedupe_key: `manual:${crypto.randomUUID()}`, occurred_at: new Date().toISOString(), ...alert }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok || !Number.isSafeInteger(payload.telegram_message_id)) {
        const telegramErrors = {
          telegram_token_invalid: 'O Telegram rejeitou TELEGRAM_BOT_TOKEN. Confira o token do bot no BotFather e atualize a secret.',
          telegram_chat_not_found: 'O Telegram não encontrou o chat. Confira TELEGRAM_CHAT_ID e envie /start ao bot no chat de destino.',
          telegram_bot_blocked: 'O bot está bloqueado no chat de destino. Desbloqueie-o no Telegram.',
          telegram_start_required: 'Abra uma conversa com o bot no Telegram e envie /start antes de testar.',
          telegram_recipient_is_bot: 'TELEGRAM_CHAT_ID aponta para outro bot. Use o ID do seu chat ou grupo de destino.',
          telegram_bot_no_permission: 'O bot não tem permissão no grupo ou canal de destino. Confira sua participação e permissão para enviar mensagens.',
          telegram_forbidden: 'O Telegram negou acesso ao chat. Confira se o bot foi iniciado, está desbloqueado e tem permissão no destino.',
          telegram_rate_limited: 'O Telegram limitou os envios. Aguarde antes de repetir o teste.',
          telegram_bad_request: 'O Telegram rejeitou os dados de envio. Confira TELEGRAM_CHAT_ID e as permissões do bot.',
          telegram_network_error: 'A Vercel não conseguiu confirmar a conexão com o Telegram. A entrega pode ter ocorrido; confira o chat antes de repetir.',
        };
        const errors = {
          401: 'O gateway recusou a chave interna. Confira ALERTS_API_TOKEN e o deploy.',
          403: 'O deploy bloqueou o gateway. Confira a proteção de deployment.',
          503: 'O gateway não encontrou uma configuração válida do Telegram.',
          502: 'O gateway não confirmou o envio ao Telegram. Confira o bot e o chat de destino.',
        };
        const sent = results.length;
        const detail = response.status === 502 && Object.hasOwn(telegramErrors, payload.error) ? telegramErrors[payload.error] : errors[response.status];
        return { status: 502, body: { ok: false, sent, results, error: `${sent ? `${sent} mensagem(ns) enviada(s); próxima parte sem confirmação. ` : ''}${detail || 'O gateway não confirmou a entrega.'} Não há reenvio automático.` } };
      }
      results.push({ type: alert.event_type, message_id: payload.telegram_message_id });
    } catch {
      return { status: 502, body: { ok: false, sent: results.length, results, error: `${results.length ? `${results.length} mensagem(ns) enviada(s). ` : ''}O envio ficou sem confirmação. Verifique o Telegram antes de repetir o teste.` } };
    }
  }
  return { status: 200, body: { ok: true, simulated: false, partial: warnings.length > 0, warnings, sent: results.length, expected: alerts.length, results } };
}
