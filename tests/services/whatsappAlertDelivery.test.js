import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deliverAlertChannels, enqueueWhatsAppAlert, splitMessage } from '../../lib/whatsappAlertDelivery.js';
let rows, config;
const alert = { eventType: 'health.water_progress', audience: '3', title: 'Água', message: 'Lembrete', dedupeKey: 'agua:hoje:10:3' };
beforeEach(() => {
  vi.stubEnv('WHATSAPP_ALERTS_ENABLED', 'true');
  vi.stubEnv('WHATSAPP_API_ORIGIN', 'https://mensageria.example');
  vi.stubEnv('WHATSAPP_INTEGRATION_TOKEN', 't'.repeat(64));
  rows = new Map();
  config = { ownerId: 'owner', client: { from() {
    let body, mode, key;
    const query = {
      insert(value) { mode = 'insert'; body = value; return query; },
      update(value) { mode = 'update'; body = value; return query; },
      select() { mode = 'select'; return query; }, maybeSingle() { return query; },
      eq(field, value) { if (field === 'dedupe_key') key = value; return query; },
      then(resolve, reject) {
        let response = { error: null };
        if (mode === 'insert') {
          if (rows.has(body.dedupe_key)) response.error = { code: '23505' };
          else rows.set(body.dedupe_key, { ...body });
        } else if (mode === 'update') Object.assign(rows.get(key), body);
        else response.data = rows.get(key) || null;
        return Promise.resolve(response).then(resolve, reject);
      }
    }; return query;
  } } };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 202, json: async () => ({ ok: true, jobs: [{ id: 'job', status: 'pending' }] }) }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe('ponte WhatsApp', () => {
  it('envia o perfil e contrato da mensageria, sem encaminhar dados extras do Telegram', async () => {
    await enqueueWhatsAppAlert(config, { ...alert, waterPrompt: { private: 'telegram' } });
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe('https://mensageria.example/api/control?action=event');
    expect(request.headers.Authorization).toBe('Bearer ' + 't'.repeat(64));
    expect(request.redirect).toBe('error');
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({ source: 'superapp', audience: '3', event_type: 'health.water_progress' });
    expect(body.waterPrompt).toBeUndefined();
    expect([...rows.values()][0]).toMatchObject({ status: 'sent', last_error: 'whatsapp_queue_accepted' });
  });
  it('desativado nao faz requisicoes nem altera registros', async () => {
    vi.stubEnv('WHATSAPP_ALERTS_ENABLED', 'false');
    expect(await enqueueWhatsAppAlert(config, alert)).toBe(false);
    expect(fetch).not.toHaveBeenCalled(); expect(rows.size).toBe(0);
  });
  it('deduplica por perfil e canal sem bloquear outro perfil', async () => {
    await enqueueWhatsAppAlert(config, alert); await enqueueWhatsAppAlert(config, alert);
    await enqueueWhatsAppAlert(config, { ...alert, audience: '4' });
    expect(fetch).toHaveBeenCalledTimes(2); expect(rows.size).toBe(2);
  });
  it('nao impede Telegram quando o WhatsApp falha e vice-versa', async () => {
    fetch.mockRejectedValueOnce(new Error('rede'));
    const telegram = vi.fn().mockResolvedValue(true);
    await expect(deliverAlertChannels(telegram, config, alert)).rejects.toThrow('whatsapp_delivery_uncertain');
    expect(telegram).toHaveBeenCalledOnce();
    await expect(deliverAlertChannels(() => { throw Error('telegram'); }, config, { ...alert, dedupeKey: 'outro' })).rejects.toThrow('telegram');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('sem destinatario registra ausencia sem interromper o Telegram', async () => {
    fetch.mockResolvedValueOnce({ status: 422, json: async () => ({ error: 'no_authorized_recipients' }) });
    expect(await deliverAlertChannels(async () => true, config, alert)).toBe(true);
    expect([...rows.values()][0].last_error).toBe('whatsapp_no_recipients');
  });
  it('recusa HTTP e configuracao incompleta antes de trafegar conteudo', async () => {
    vi.stubEnv('WHATSAPP_API_ORIGIN', 'http://localhost');
    await expect(enqueueWhatsAppAlert(config, alert)).rejects.toThrow('whatsapp_config_invalid');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('divide mensagens longas sem quebrar emojis e mantem chaves curtas', async () => {
    const message = '💧'.repeat(2000);
    expect(splitMessage(message).join('')).toBe(message);
    await enqueueWhatsAppAlert(config, { ...alert, message });
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [, request] of fetch.mock.calls) {
      const body = JSON.parse(request.body); expect(body.message.length).toBeLessThanOrEqual(3500); expect(body.idempotency_key.length).toBeLessThanOrEqual(160);
    }
  });
});

it('diagnostico identifica HTTP 401 sem incluir o corpo ou a chave', async () => {
  fetch.mockResolvedValueOnce({status:401,json:async()=>({error:'invalid_integration_token',private:'SEGREDO'})});
  const diagnostics=[];
  await expect(enqueueWhatsAppAlert(config,{...alert,onDiagnostic:item=>diagnostics.push(item)})).rejects.toThrow('whatsapp_delivery_uncertain');
  expect(diagnostics.some(item=>item.code==='gateway_unauthorized'&&item.http_status===401)).toBe(true);
  expect(JSON.stringify(diagnostics)).not.toContain('SEGREDO');
  expect(JSON.stringify(diagnostics)).not.toContain('t'.repeat(64));
});
it('distingue falha TLS do banco remoto de falha de rota', async () => {
  fetch.mockResolvedValueOnce({status:503,json:async()=>({error:'database_tls_error'})});
  const diagnostics=[];
  await expect(enqueueWhatsAppAlert(config,{...alert,onDiagnostic:item=>diagnostics.push(item)})).rejects.toThrow('whatsapp_delivery_uncertain');
  expect(diagnostics.at(-1)).toMatchObject({code:'gateway_database_tls',stage:'Banco da mensageria',http_status:503});
});
it('diagnostico distingue timeout e ausencia de destinatarios', async () => {
  fetch.mockRejectedValueOnce(Object.assign(new Error('PRIVATE URL'),{name:'TimeoutError'}));
  const timeout=[];
  await expect(enqueueWhatsAppAlert(config,{...alert,onDiagnostic:item=>timeout.push(item)})).rejects.toThrow('whatsapp_delivery_uncertain');
  expect(timeout.at(-1).code).toBe('request_timeout');
  const missing=[];
  fetch.mockResolvedValueOnce({status:422,json:async()=>({error:'no_authorized_recipients'})});
  await enqueueWhatsAppAlert(config,{...alert,dedupeKey:'missing',onDiagnostic:item=>missing.push(item)});
  expect(missing.at(-1)).toMatchObject({code:'no_recipients',state:'warning'});
});
