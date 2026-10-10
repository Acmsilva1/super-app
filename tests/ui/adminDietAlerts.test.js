import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
afterEach(() => vi.unstubAllGlobals());

describe('Painel administrativo de dietas do Telegram', () => {
  it('confirms that the test also delivered the financial summaries', async () => {
    vi.stubGlobal('showAppConfirmation', vi.fn());
    const button = { disabled: false, textContent: '' };
    const message = { textContent: '' };
    vi.stubGlobal('document', { getElementById: (id) => id === 'adminTelegramTest' ? button : message });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, sent: 5 }) })));
    const testMethod = html.slice(html.indexOf('            async testAdminTelegram('), html.indexOf('            async loadAdminUsers('));
    await new Function(`return ({${testMethod}});`)().testAdminTelegram();
    expect(showAppConfirmation).toHaveBeenCalledWith('Teste enviado: 5 mensagens.');
    expect(message.textContent).toBe('');
    expect(button.disabled).toBe(false);
  });
});
