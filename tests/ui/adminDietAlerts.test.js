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
    expect(message.textContent).toBe('Teste enviado: 5 mensagem(ns) para os canais ligados.');
    expect(button.textContent).toBe('Testar alertas');
    expect(button.disabled).toBe(false);
  });

  it('diz que nada foi enviado quando Telegram e WhatsApp estão desligados', async () => {
    const button = { disabled: false, textContent: 'Testar alertas' };
    const message = { textContent: '' };
    vi.stubGlobal('document', { getElementById: (id) => id === 'adminTelegramTest' ? button : message });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      json: async () => ({ ok: false, error: 'Telegram e WhatsApp estão desligados. Ligue um canal para enviar o teste.' }),
    })));
    const testMethod = html.slice(html.indexOf('            async testAdminTelegram('), html.indexOf('            async loadAdminUsers('));
    await new Function(`return ({${testMethod}});`)().testAdminTelegram();
    expect(message.textContent).toBe('Telegram e WhatsApp estão desligados. Ligue um canal para enviar o teste.');
    expect(button.textContent).toBe('Testar alertas');
    expect(button.disabled).toBe(false);
  });
});
