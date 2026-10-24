import { afterEach, expect, it, vi } from 'vitest';

const channels = vi.hoisted(() => ({ value: [] }));
vi.mock('../../lib/actionRateLimit.js', () => ({ consumeActionLimit: async () => true }));
vi.mock('../../lib/alertServiceClient.js', () => ({
  getAlertServiceClient: () => ({
    from() {
      const query = {
        select() { return query; },
        eq() { return query; },
        then(resolve, reject) { return Promise.resolve({ data: channels.value, error: null }).then(resolve, reject); },
      };
      return query;
    },
  }),
}));
vi.mock('../../features/saude/service/alertasSaudeScheduler.js', () => ({
  previewAllDietAlerts: async () => ['Dieta teste'],
  previewWhatsAppHealthTests: async () => [
    { eventType: 'health.water_progress', audience: '15', title: '[TESTE] Água', message: 'Teste do SuperApp: alerta de água.' },
    { eventType: 'health.diet_menu', audience: '15', title: '[TESTE] Dieta', message: 'Teste do SuperApp: alerta de dieta.' },
  ],
}));
vi.mock('../../features/financeiro/service/financeiroTelegramScheduler.js', () => ({
  previewFinanceiroDailySummaries: async () => [
    { event_type: 'financeiro.daily_summary', title: '[TESTE] Financeiro', message: 'Resumo de teste' },
  ],
}));

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function run(telegram, whatsapp) {
  channels.value = [{ telegram_enabled: telegram, whatsapp_enabled: whatsapp }];
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('OFFLINE_DEV', 'false');
  vi.stubEnv('WHATSAPP_API_ORIGIN', 'https://mensageria.example');
  vi.stubEnv('WHATSAPP_INTEGRATION_TOKEN', 'token-de-teste');
  vi.stubEnv('WHATSAPP_FINANCE_PROFILE_ID', '42');
  if (telegram) {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'fake');
    vi.stubEnv('TELEGRAM_CHAT_ID', 'fake');
    vi.stubEnv('ALERTS_API_TOKEN', 'x'.repeat(32));
    vi.stubEnv('ALERTS_API_URL', 'https://example.invalid/api/telegram-alert');
  }
  const fetchMock = vi.fn(async (url) => String(url).includes('/api/control')
    ? { status: 202, ok: true, json: async () => ({ ok: true }) }
    : { ok: true, json: async () => ({ ok: true, telegram_message_id: 7 }) });
  vi.stubGlobal('fetch', fetchMock);
  const { runTelegramManualTest } = await import('../../lib/telegramManualTest.js');
  return { result: await runTelegramManualTest(), fetchMock };
}

it.each([
  ['os dois', true, true, 3, 3],
  ['só Telegram', true, false, 3, 0],
  ['só WhatsApp', false, true, 0, 3],
  ['nenhum', false, false, 0, 0],
])('o teste manual envia para %s', async (_label, telegram, whatsapp, telegramCount, whatsappCount) => {
  const { result, fetchMock } = await run(telegram, whatsapp);
  const telegramCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('telegram-alert'));
  const whatsappCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/control'));
  expect(telegramCalls).toHaveLength(telegramCount);
  expect(whatsappCalls).toHaveLength(whatsappCount);
  if (!telegram && !whatsapp) {
    expect(result.status).toBe(409);
    expect(result.body.error).toBe('Telegram e WhatsApp estão desligados. Ligue um canal para enviar o teste.');
    return;
  }
  expect(result.status).toBe(200);
  expect(result.body.sent).toBe(telegramCount + whatsappCount);
  if (whatsapp) {
    const bodies = whatsappCalls.map(([, options]) => JSON.parse(options.body));
    expect(bodies.map((item) => item.audience)).toEqual(['15', '15', '42']);
    expect(bodies.map((item) => item.event_type)).toEqual(['health.water_progress', 'health.diet_menu', 'financeiro.daily_summary']);
    expect(bodies.every((item) => item.source === 'superapp' && item.idempotency_key.startsWith('manual:'))).toBe(true);
  }
});

it('não diz que o teste foi enviado quando o WhatsApp ligado não tem origem', async () => {
  channels.value = [{ telegram_enabled: false, whatsapp_enabled: true }];
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('OFFLINE_DEV', 'false');
  vi.stubEnv('WHATSAPP_API_ORIGIN', '');
  vi.stubEnv('WHATSAPP_INTEGRATION_TOKEN', '');
  vi.stubEnv('WHATSAPP_FINANCE_PROFILE_ID', '42');
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const { runTelegramManualTest } = await import('../../lib/telegramManualTest.js');
  const result = await runTelegramManualTest();
  expect(result.status).toBe(502);
  expect(result.body.ok).toBe(false);
  expect(result.body.sent).toBe(0);
  expect(result.body.error).toContain('WHATSAPP_API_ORIGIN');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('não zera a saúde do WhatsApp quando falta o perfil financeiro', async () => {
  channels.value = [{ telegram_enabled: false, whatsapp_enabled: true }];
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('OFFLINE_DEV', 'false');
  vi.stubEnv('WHATSAPP_API_ORIGIN', 'https://mensageria.example');
  vi.stubEnv('WHATSAPP_INTEGRATION_TOKEN', 'token-de-teste');
  vi.stubEnv('WHATSAPP_FINANCE_PROFILE_ID', '');
  const fetchMock = vi.fn(async () => ({ status: 202, ok: true, json: async () => ({ ok: true }) }));
  vi.stubGlobal('fetch', fetchMock);
  const { runTelegramManualTest } = await import('../../lib/telegramManualTest.js');
  const result = await runTelegramManualTest();
  const bodies = fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body));
  expect(result.status).toBe(200);
  expect(result.body.sent).toBe(2);
  expect(result.body.partial).toBe(true);
  expect(result.body.warnings.join(' ')).toContain('WHATSAPP_FINANCE_PROFILE_ID');
  expect(bodies.map((item) => item.event_type)).toEqual(['health.water_progress', 'health.diet_menu']);
});

it('informa falha do WhatsApp em vez de sucesso com zero', async () => {
  channels.value = [{ telegram_enabled: false, whatsapp_enabled: true }];
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('OFFLINE_DEV', 'false');
  vi.stubEnv('WHATSAPP_API_ORIGIN', 'https://mensageria.example');
  vi.stubEnv('WHATSAPP_INTEGRATION_TOKEN', 'token-de-teste');
  vi.stubEnv('WHATSAPP_FINANCE_PROFILE_ID', '42');
  vi.stubGlobal('fetch', vi.fn(async () => ({ status: 401, ok: false, json: async () => ({ ok: false }) })));
  const { runTelegramManualTest } = await import('../../lib/telegramManualTest.js');
  const result = await runTelegramManualTest();
  expect(result.status).toBe(502);
  expect(result.body.sent).toBe(0);
  expect(result.body.error).toContain('não confirmou');
});
