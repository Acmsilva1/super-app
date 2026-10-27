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

it('o teste manual envia só para o Telegram', async () => {
  const { result, fetchMock } = await run(true, true);
  const telegramCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('telegram-alert'));
  const whatsappCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/control'));
  expect(telegramCalls).toHaveLength(3);
  expect(whatsappCalls).toHaveLength(0);
  expect(result.status).toBe(200);
  expect(result.body.sent).toBe(3);
});

it('recusa quando só WhatsApp está ligado e aponta para a mensageria', async () => {
  const { result, fetchMock } = await run(false, true);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(result.status).toBe(409);
  expect(result.body.error).toMatch(/mensageria/i);
});

it('recusa quando Telegram e WhatsApp estão desligados', async () => {
  const { result } = await run(false, false);
  expect(result.status).toBe(409);
  expect(result.body.error).toMatch(/Telegram/i);
});
