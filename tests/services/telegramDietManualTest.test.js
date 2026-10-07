import { afterEach, describe, expect, it, vi } from 'vitest';
const preview = vi.hoisted(() => vi.fn());
vi.mock('../../features/saude/service/alertasSaudeScheduler.js', () => ({ previewAllDietAlerts: preview }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Teste manual das dietas reais', () => {
  it('sends every preview part, including all registered diet titles', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('OFFLINE_DEV', 'false');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'fake');
    vi.stubEnv('TELEGRAM_CHAT_ID', 'fake');
    vi.stubEnv('ALERTS_API_TOKEN', 'x'.repeat(32));
    vi.stubEnv('ALERTS_API_URL', 'https://example.invalid/api/telegram-alert');
    preview.mockResolvedValue(['Emagrecimento — Juliana', 'Manutenção — Juliana\nPlano — André']);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, telegram_message_id: 7 }) });
    vi.stubGlobal('fetch', fetchMock);
    const { runTelegramManualTest } = await import('../../lib/telegramManualTest.js');
    const result = await runTelegramManualTest();
    expect(result.status).toBe(200);
    expect(result.body.sent).toBe(3);
    expect(preview).toHaveBeenCalled();
    const messages = fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body));
    expect(messages[1].message).toBe('Emagrecimento — Juliana');
    expect(messages[2].message).toContain('Manutenção');
    expect(messages[2].message).toContain('André');
    expect(messages.slice(1).every((item) => item.event_type === 'health.diet_menu')).toBe(true);
  });
});
