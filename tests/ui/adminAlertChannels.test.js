import fs from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const methods = html.slice(html.indexOf('            setAdminAlertChannelState('), html.indexOf('            async loadAdminUsers('));
const controller = () => new Function(`return new class {${methods}};`)();

afterEach(() => vi.unstubAllGlobals());

function setup(telegramEnabled, whatsappEnabled) {
  vi.stubGlobal('showAppConfirmation', vi.fn());
  const make = (enabled) => {
    const label = { textContent: '' };
    return {
      disabled: false,
      state: enabled ? 'true' : 'false',
      labelText: '',
      getAttribute(key) { return key === 'aria-checked' ? this.state : ''; },
      setAttribute(key, value) { if (key === 'aria-checked') this.state = value; if (key === 'aria-label') this.labelText = value; },
      querySelector() { return label; },
      label,
    };
  };
  const telegram = make(telegramEnabled);
  const whatsapp = make(whatsappEnabled);
  const message = { textContent: '' };
  vi.stubGlobal('document', {
    getElementById: (id) => {
      if (id === 'adminAlertChannelTelegram') return telegram;
      if (id === 'adminAlertChannelWhatsApp') return whatsapp;
      return message;
    },
  });
  return { telegram, whatsapp, message };
}

it('mostra Telegram e WhatsApp ligados ou desligados depois de salvar', async () => {
  const { telegram, whatsapp, message } = setup(true, true);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, telegram: true, whatsapp: false }) })));
  await controller().toggleAdminAlertChannel('whatsapp');
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body).toEqual({ action: 'set_alert_channels', telegram: true, whatsapp: false });
  expect(telegram.state).toBe('true');
  expect(whatsapp.state).toBe('false');
  expect(telegram.label.textContent).toBe('Ligado');
  expect(whatsapp.label.textContent).toBe('Desligado');
  expect(telegram.labelText).toBe('Telegram ligado');
  expect(whatsapp.labelText).toBe('WhatsApp desligado');
  expect(message.textContent).toBe('Telegram ligado. WhatsApp desligado.');
  expect(html).toContain('>Telegram<');
  expect(html).toContain('>WhatsApp<');
});

it('mantém o estado anterior se o servidor recusar', async () => {
  const { telegram, whatsapp, message } = setup(false, true);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'Não foi possível salvar os canais.' }) })));
  await controller().toggleAdminAlertChannel('telegram');
  expect(telegram.state).toBe('false');
  expect(whatsapp.state).toBe('true');
  expect(telegram.label.textContent).toBe('Desligado');
  expect(message.textContent).toBe('Não foi possível salvar os canais.');
});
