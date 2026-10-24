import crypto from 'node:crypto';
import { consumeActionLimit } from './actionRateLimit.js';
import { readAlertChannels } from './alertChannelPreferences.js';
import { enqueueWhatsAppAlert } from './whatsappAlertClient.js';
import { previewAllDietAlerts, previewWhatsAppHealthTests } from '../features/saude/service/alertasSaudeScheduler.js';
import { previewFinanceiroDailySummaries } from '../features/financeiro/service/financeiroTelegramScheduler.js';

let lastAttempt = 0;
const CHANNELS_OFF = 'Telegram e WhatsApp estão desligados. Ligue um canal para enviar o teste.';
const FINANCE_AUDIENCE_WARNING = 'O resumo financeiro não foi para o WhatsApp: defina WHATSAPP_FINANCE_PROFILE_ID com o mesmo Perfil do painel.';

async function resolveAlertChannels() {
  try {
    const { getAlertServiceClient } = await import('./alertServiceClient.js');
    return await readAlertChannels(getAlertServiceClient());
  } catch (error) {
    if (error?.message === 'alert_channels_unavailable') throw error;
    return { telegram: true, whatsapp: true };
  }
}

async function deliverWhatsAppManual(alert) {
  const origin = String(process.env.WHATSAPP_API_ORIGIN || '').trim();
  const token = String(process.env.WHATSAPP_INTEGRATION_TOKEN || '').trim();
  const audience = String(alert.audience || '').trim();
  if (!origin || !token) return 'unconfigured';
  if (!audience) return 'no_audience';
  const ok = await enqueueWhatsAppAlert({
    eventType: alert.eventType,
    audience,
    idempotencyKey: `manual:${crypto.randomUUID()}`,
    title: alert.title,
    message: alert.message,
  });
  return ok ? 'sent' : 'failed';
}

async function collectWhatsAppManualAlerts(finance) {
  const jobs = [];
  let warning = '';
  if (typeof previewWhatsAppHealthTests === 'function') {
    try {
      const health = await previewWhatsAppHealthTests();
      if (Array.isArray(health)) {
        for (const item of health) {
          if (!item?.eventType || item.audience == null || String(item.audience).trim() === '') continue;
          jobs.push({
            eventType: item.eventType,
            audience: String(item.audience),
            title: item.title || '[TESTE] Saúde',
            message: item.message || 'Teste do SuperApp.',
          });
        }
      }
    } catch {
      warning = 'WhatsApp de saúde não incluído: falha na consulta.';
    }
  }
  if (finance.status === 'fulfilled') {
    const audience = String(process.env.WHATSAPP_FINANCE_PROFILE_ID || '').trim();
    for (const alert of finance.value || []) {
      jobs.push({
        eventType: 'financeiro.daily_summary',
        audience,
        title: alert.title || '[TESTE] Financeiro',
        message: alert.message,
      });
    }
  }
  return { jobs, warning };
}

async function sendWhatsAppManual(finance) {
  const collected = await collectWhatsAppManualAlerts(finance);
  let sent = 0;
  let expected = 0;
  let failed = false;
  let unconfigured = false;
  let noAudience = false;
  for (const job of collected.jobs) {
    const outcome = await deliverWhatsAppManual(job);
    if (outcome === 'unconfigured') { unconfigured = true; continue; }
    if (outcome === 'no_audience') { noAudience = true; continue; }
    expected += 1;
    if (outcome === 'sent') sent += 1;
    else failed = true;
  }
  const warning = [
    collected.warning,
    noAudience ? FINANCE_AUDIENCE_WARNING : '',
    failed ? 'WhatsApp não confirmou todos os envios de teste.' : '',
  ].filter(Boolean).join(' ');
  return { sent, expected, warning, unconfigured, noAudience, jobs: collected.jobs.length };
}

function zeroManualTestError(channels, whatsapp, warnings) {
  const extra = [];
  if (channels.whatsapp && whatsapp.unconfigured) {
    extra.push('WhatsApp está ligado, mas WHATSAPP_API_ORIGIN ou WHATSAPP_INTEGRATION_TOKEN não está neste deploy. Salve as variáveis em Production e publique o Super App de novo.');
  }
  if (channels.whatsapp && whatsapp.noAudience && !warnings.some((item) => item.includes('WHATSAPP_FINANCE_PROFILE_ID'))) {
    extra.push(FINANCE_AUDIENCE_WARNING);
  }
  if (channels.whatsapp && whatsapp.jobs === 0 && !whatsapp.unconfigured && !warnings.some((item) => /saúde|saude/i.test(item))) {
    extra.push('Nenhum perfil de saúde entrou no teste de WhatsApp.');
  }
  return [...new Set([...warnings, ...extra].filter(Boolean))].join(' ') || 'Nenhuma mensagem de teste foi enviada.';
}

// Chamado apenas depois da autorização administrativa no handler.
export async function runTelegramManualTest() {
  const deadline = Date.now() + 45000;
  if (process.env.OFFLINE_DEV === 'true' || process.env.NODE_ENV === 'test') {
    return { status: 200, body: { ok: true, simulated: true, sent: 0 } };
  }
  let channels;
  try {
    channels = await resolveAlertChannels();
  } catch {
    return { status: 503, body: { ok: false, sent: 0, error: 'Não foi possível ler os canais de alerta.' } };
  }
  if (!channels.telegram && !channels.whatsapp) {
    return { status: 409, body: { ok: false, sent: 0, channels, error: CHANNELS_OFF } };
  }
  let gateway = null;
  let token = '';
  if (channels.telegram) {
    for (const name of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'ALERTS_API_TOKEN']) {
      if (!String(process.env[name] || '').trim()) {
        return { status: 503, body: { ok: false, error: `Configure ${name} na Vercel e faça um novo deploy.` } };
      }
    }
    token = process.env.ALERTS_API_TOKEN;
    if (token.trim().length < 32) {
      return { status: 503, body: { ok: false, error: 'ALERTS_API_TOKEN precisa ter pelo menos 32 caracteres.' } };
    }
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
    try {
      gateway = new URL(process.env.ALERTS_API_URL || (host ? `https://${host}/api/telegram-alert` : ''));
      if (gateway.protocol !== 'https:' || gateway.username || gateway.password || gateway.pathname !== '/api/telegram-alert' || gateway.search || gateway.hash) throw new Error();
    } catch {
      return { status: 503, body: { ok: false, error: 'Configure ALERTS_API_URL com a URL HTTPS do gateway /api/telegram-alert.' } };
    }
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
    channels.telegram ? previewAllDietAlerts() : Promise.resolve([]), previewFinanceiroDailySummaries(),
  ]);
  const warnings = [];
  if (diets.status === 'rejected') warnings.push('Dietas não incluídas: falha na consulta. Confira o acesso ao banco e as migrations na Vercel.');
  if (finance.status === 'rejected') warnings.push('Financeiro não incluído: falha na consulta. Confira o acesso ao banco e a view de despesas fixas na Vercel.');
  if (channels.telegram && diets.status === 'rejected' && finance.status === 'rejected') {
    return { status: 503, body: { ok: false, sent: 0, warnings, error: warnings.join(' ') } };
  }
  const dietMessages = diets.status === 'fulfilled' ? diets.value : [];
  const alerts = channels.telegram ? [
    { event_type: 'health.water_progress', title: '[TESTE MANUAL] Água', message: 'Teste do SuperApp: perfil fictício com 3 de 8 doses. Não representa seus dados reais.' },
    ...(diets.status === 'rejected' ? [] : dietMessages.length ? dietMessages : ['Nenhuma dieta cadastrada foi encontrada no banco.']).map((message, index) => ({
      event_type: 'health.diet_menu', title: `[TESTE MANUAL] Todas as dietas${dietMessages.length > 1 ? ` (${index + 1}/${dietMessages.length})` : ''}`, message,
    })),
    ...(finance.status === 'fulfilled' ? finance.value : []),
  ] : [];
  const results = [];
  let stopped = null;
  if (channels.telegram) {
    for (const alert of alerts) {
      if (Date.now() + 1500 >= deadline) {
        stopped = { status:502, body:{ok:false,sent:results.length,expected:alerts.length,results,error:'Tempo do teste esgotado. Confira as mensagens recebidas antes de repetir.'} };
        break;
      }
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
          stopped = { status: 502, body: { ok: false, sent, results, error: `${sent ? `${sent} mensagem(ns) enviada(s); próxima parte sem confirmação. ` : ''}${detail || 'O gateway não confirmou a entrega.'} Não há reenvio automático.` } };
          break;
        }
        results.push({ type: alert.event_type, message_id: payload.telegram_message_id });
      } catch {
        stopped = { status: 502, body: { ok: false, sent: results.length, results, error: `${results.length ? `${results.length} mensagem(ns) enviada(s). ` : ''}O envio ficou sem confirmação. Verifique o Telegram antes de repetir o teste.` } };
        break;
      }
    }
  }
  const whatsapp = channels.whatsapp ? await sendWhatsAppManual(finance) : { sent: 0, expected: 0, warning: '', unconfigured: false, noAudience: false, jobs: 0 };
  if (whatsapp.warning) warnings.push(whatsapp.warning);
  if (stopped) {
    stopped.body.sent += whatsapp.sent;
    if (Number.isInteger(stopped.body.expected)) stopped.body.expected += whatsapp.expected;
    if (warnings.length) stopped.body.warnings = warnings;
    return stopped;
  }
  const sent = results.length + whatsapp.sent;
  if (sent === 0) {
    const error = zeroManualTestError(channels, whatsapp, warnings);
    return { status: 502, body: { ok: false, sent: 0, expected: alerts.length + whatsapp.expected, warnings, error, channels } };
  }
  return { status: 200, body: { ok: true, simulated: false, partial: warnings.length > 0, warnings, sent, expected: alerts.length + whatsapp.expected, results, channels } };
}
