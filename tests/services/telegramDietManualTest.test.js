import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../lib/actionRateLimit.js', () => ({ consumeActionLimit: async () => true }));
const preview = vi.hoisted(() => vi.fn());
const financePreview = vi.hoisted(() => vi.fn());
vi.mock('../../features/saude/service/alertasSaudeScheduler.js', () => ({ previewAllDietAlerts: preview }));
vi.mock('../../features/financeiro/service/financeiroTelegramScheduler.js', () => ({ previewFinanceiroDailySummaries: financePreview }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('Teste manual das dietas reais', () => {
  it('interrompe antes do limite Vercel e informa entrega parcial', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV','development'); vi.stubEnv('OFFLINE_DEV','false');
    vi.stubEnv('TELEGRAM_BOT_TOKEN','fake');vi.stubEnv('TELEGRAM_CHAT_ID','fake');vi.stubEnv('ALERTS_API_TOKEN','x'.repeat(32));vi.stubEnv('ALERTS_API_URL','https://example.invalid/api/telegram-alert');
    preview.mockResolvedValue(['Dieta']);financePreview.mockResolvedValue([{event_type:'financeiro.daily_summary',message:'Teste'}]);
    let clock=Date.now(); const start=clock; vi.spyOn(Date,'now').mockImplementation(()=>clock);
    const fetchMock=vi.fn().mockImplementation(async()=>{clock=start+44000;return {ok:true,json:async()=>({ok:true,telegram_message_id:1})};}); vi.stubGlobal('fetch',fetchMock);
    const {runTelegramManualTest}=await import('../../lib/telegramManualTest.js'); const result=await runTelegramManualTest();
    expect(result.status).toBe(502);expect(result.body.sent).toBe(1);expect(result.body.expected).toBe(3);expect(fetchMock).toHaveBeenCalledOnce();
  });
  it('sends every preview part, including all registered diet titles', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('OFFLINE_DEV', 'false');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'fake');
    vi.stubEnv('TELEGRAM_CHAT_ID', 'fake');
    vi.stubEnv('ALERTS_API_TOKEN', 'x'.repeat(32));
    vi.stubEnv('ALERTS_API_URL', 'https://example.invalid/api/telegram-alert');
    preview.mockResolvedValue(['Emagrecimento — Juliana', 'Manutenção — Juliana\nPlano — André']);
    financePreview.mockResolvedValue([
      { event_type: 'financeiro.daily_summary', title: '[TESTE MANUAL] Débito/Pix', message: '💳 Gastos de hoje com débito/Pix: R$ 125,50' },
      { event_type: 'financeiro.daily_summary', title: '[TESTE MANUAL] Despesas fixas', message: '🏠 Despesas fixas deste mês\n✅ Pago: R$ 2.000,00\n⏳ Pendente: R$ 500,00' },
    ]);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, telegram_message_id: 7 }) });
    vi.stubGlobal('fetch', fetchMock);
    const { runTelegramManualTest } = await import('../../lib/telegramManualTest.js');
    const result = await runTelegramManualTest();
    expect(result.status).toBe(200);
    expect(result.body.sent).toBe(5);
    expect(result.body.expected).toBe(5);
    expect(preview).toHaveBeenCalled();
    const messages = fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body));
    expect(messages[1].message).toBe('Emagrecimento — Juliana');
    expect(messages[2].message).toContain('Manutenção');
    expect(messages[2].message).toContain('André');
    expect(messages.slice(1, 3).every((item) => item.event_type === 'health.diet_menu')).toBe(true);
    expect(messages.slice(3).every((item) => item.event_type === 'financeiro.daily_summary')).toBe(true);
    expect(messages[3].message).toContain('125,50');
    expect(messages[4].message).toContain('Pendente: R$ 500,00');
  });
  it('reports a financial read failure before sending any test messages', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('OFFLINE_DEV', 'false');
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'fake');
    vi.stubEnv('TELEGRAM_CHAT_ID', 'fake');
    vi.stubEnv('ALERTS_API_TOKEN', 'x'.repeat(32));
    vi.stubEnv('ALERTS_API_URL', 'https://example.invalid/api/telegram-alert');
    preview.mockResolvedValue(['Dieta']);
    financePreview.mockRejectedValue(new Error('private database diagnostic'));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { runTelegramManualTest } = await import('../../lib/telegramManualTest.js');
    const result = await runTelegramManualTest();
    expect(result.status).toBe(503);
    expect(result.body.sent).toBe(0);
    expect(result.body.error).toContain('Financeiro');
    expect(result.body.error).not.toContain('private');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
