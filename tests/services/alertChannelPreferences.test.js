import { expect, it } from 'vitest';
import { readAlertChannels, writeAlertChannels } from '../../lib/alertChannelPreferences.js';

function client(result) {
  const query = {
    select() { return query; },
    eq() { return query; },
    upsert(row) { query.saved = row; return query; },
    then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); },
  };
  return { from() { return query; }, query };
}

it('liga o WhatsApp quando a linha ou a tabela ainda não existe', async () => {
  expect(await readAlertChannels(client({ data: [], error: null }))).toEqual({ whatsapp: true });
  expect(await readAlertChannels(client({ data: null, error: null }))).toEqual({ whatsapp: true });
  expect(await readAlertChannels(client({ data: null, error: { code: 'PGRST205' } }))).toEqual({ whatsapp: true });
});

it('lê desligado só quando a coluna é false e ignora a coluna legada do Telegram', async () => {
  expect(await readAlertChannels(client({ data: [{ telegram_enabled: true, whatsapp_enabled: false }], error: null }))).toEqual({ whatsapp: false });
  expect(await readAlertChannels(client({ data: [{ telegram_enabled: false, whatsapp_enabled: true }], error: null }))).toEqual({ whatsapp: true });
});

it('grava só o booleano do WhatsApp e recusa estado inválido', async () => {
  const fake = client({ data: [{ whatsapp_enabled: false }], error: null });
  expect((await writeAlertChannels(fake, { whatsapp: 'sim' })).status).toBe(400);
  const saved = await writeAlertChannels(fake, { whatsapp: false });
  expect(saved).toMatchObject({ status: 200, body: { ok: true, whatsapp: false } });
  expect(fake.query.saved).toMatchObject({ id: 'alerts', whatsapp_enabled: false });
  expect(fake.query.saved).not.toHaveProperty('telegram_enabled');
});
