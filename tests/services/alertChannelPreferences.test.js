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

it('liga os dois canais quando a linha ou a tabela ainda não existe', async () => {
  expect(await readAlertChannels(client({ data: [], error: null }))).toEqual({ telegram: true, whatsapp: true });
  expect(await readAlertChannels(client({ data: null, error: null }))).toEqual({ telegram: true, whatsapp: true });
  expect(await readAlertChannels(client({ data: null, error: { code: 'PGRST205' } }))).toEqual({ telegram: true, whatsapp: true });
});

it('lê desligado só quando a coluna é false', async () => {
  const channels = await readAlertChannels(client({
    data: [{ telegram_enabled: false, whatsapp_enabled: true }],
    error: null,
  }));
  expect(channels).toEqual({ telegram: false, whatsapp: true });
});

it('grava os dois booleanos e recusa estado inválido', async () => {
  const fake = client({ data: [{ telegram_enabled: false, whatsapp_enabled: false }], error: null });
  expect((await writeAlertChannels(fake, { telegram: 'sim', whatsapp: true })).status).toBe(400);
  const saved = await writeAlertChannels(fake, { telegram: false, whatsapp: false });
  expect(saved).toMatchObject({ status: 200, body: { ok: true, telegram: false, whatsapp: false } });
  expect(fake.query.saved).toMatchObject({ id: 'alerts', telegram_enabled: false, whatsapp_enabled: false });
});
