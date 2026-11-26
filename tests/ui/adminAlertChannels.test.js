import fs from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const methods = html.slice(html.indexOf('            setAdminAlertChannelState('), html.indexOf('            async loadAdminUsers('));
const controller = () => new Function(`return new class {${methods}};`)();

afterEach(() => vi.unstubAllGlobals());

function setup(whatsappEnabled) {
  vi.stubGlobal('showAppConfirmation', vi.fn());
  const label = { textContent: '' };
  const whatsapp = {
    disabled: false,
    state: whatsappEnabled ? 'true' : 'false',
    labelText: '',
    getAttribute(key) { return key === 'aria-checked' ? this.state : ''; },
    setAttribute(key, value) { if (key === 'aria-checked') this.state = value; if (key === 'aria-label') this.labelText = value; },
    querySelector() { return label; },
    label,
  };
  const message = { textContent: '' };
  vi.stubGlobal('document', {
    getElementById: (id) => (id === 'adminAlertChannelWhatsApp' ? whatsapp : message),
  });
  return { whatsapp, message };
}

it('mostra o WhatsApp ligado ou desligado depois de salvar', async () => {
  const { whatsapp, message } = setup(true);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, whatsapp: false }) })));
  await controller().toggleAdminAlertChannel();
  const body = JSON.parse(fetch.mock.calls[0][1].body);
  expect(body).toEqual({ action: 'set_alert_channels', whatsapp: false });
  expect(whatsapp.state).toBe('false');
  expect(whatsapp.label.textContent).toBe('Desligado');
  expect(whatsapp.labelText).toBe('WhatsApp desligado');
  expect(message.textContent).toBe('WhatsApp desligado.');
  expect(html).toContain('>WhatsApp<');
  expect(html).not.toContain('adminAlertChannelTelegram');
});

it('mantém o estado anterior se o servidor recusar', async () => {
  const { whatsapp, message } = setup(true);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'Não foi possível salvar os canais.' }) })));
  await controller().toggleAdminAlertChannel();
  expect(whatsapp.state).toBe('true');
  expect(whatsapp.label.textContent).toBe('Ligado');
  expect(message.textContent).toBe('Não foi possível salvar os canais.');
});
