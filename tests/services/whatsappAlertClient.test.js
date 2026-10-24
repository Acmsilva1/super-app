import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { enqueueWhatsAppAlert } from '../../lib/whatsappAlertClient.js';

const alert = {
  eventType: 'health.water_progress',
  audience: '7',
  idempotencyKey: 'agua:2026-10-05:07:30:7',
  title: 'Progresso de agua - Ana',
  message: 'hora de beber',
};

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.stubEnv('WHATSAPP_API_ORIGIN', 'https://mensageria.example');
  vi.stubEnv('WHATSAPP_INTEGRATION_TOKEN', 'token-de-teste');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('não chama sem origem, token ou audience', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('WHATSAPP_API_ORIGIN', '');
  expect(await enqueueWhatsAppAlert(alert)).toBe(false);
  vi.stubEnv('WHATSAPP_API_ORIGIN', 'https://mensageria.example');
  vi.stubEnv('WHATSAPP_INTEGRATION_TOKEN', ' ');
  expect(await enqueueWhatsAppAlert(alert)).toBe(false);
  vi.stubEnv('WHATSAPP_INTEGRATION_TOKEN', 'token-de-teste');
  expect(await enqueueWhatsAppAlert({ ...alert, audience: '  ' })).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('não chama origem http nem URL com usuário e senha', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('WHATSAPP_API_ORIGIN', 'http://mensageria.example');
  expect(await enqueueWhatsAppAlert(alert)).toBe(false);
  vi.stubEnv('WHATSAPP_API_ORIGIN', 'https://user:segredo-url@mensageria.example');
  expect(await enqueueWhatsAppAlert(alert)).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(error.mock.calls.flat().join(' ')).not.toContain('segredo-url');
  expect(error.mock.calls.flat().join(' ')).not.toContain('token-de-teste');
});

it('trata 202 e duplicate como sucesso e limita título e mensagem', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ status: 202, ok: true, json: async () => ({ ok: true }) })
    .mockResolvedValueOnce({ status: 409, ok: false, json: async () => ({ duplicate: true }) });
  vi.stubGlobal('fetch', fetchMock);
  expect(await enqueueWhatsAppAlert({ ...alert, title: 'a'.repeat(200), message: 'b'.repeat(4000) })).toBe(true);
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe('https://mensageria.example/api/control?action=event');
  expect(options.method).toBe('POST');
  expect(options.redirect).toBe('error');
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(options.headers).toMatchObject({ 'Content-Type': 'application/json', Authorization: 'Bearer token-de-teste' });
  const body = JSON.parse(options.body);
  expect(Object.keys(body).sort()).toEqual(['audience', 'event_type', 'idempotency_key', 'message', 'source', 'title']);
  expect(body.source).toBe('superapp');
  expect(body.title).toHaveLength(120);
  expect(body.message).toHaveLength(3500);
  expect(await enqueueWhatsAppAlert(alert)).toBe(true);
});

it('registra 4xx, 5xx e falha de rede sem rejeitar a chamada', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ status: 500, ok: false, json: async () => ({}) })
    .mockRejectedValueOnce(new Error('network'));
  vi.stubGlobal('fetch', fetchMock);
  await expect(enqueueWhatsAppAlert(alert)).resolves.toBe(false);
  await expect(enqueueWhatsAppAlert(alert)).resolves.toBe(false);
  expect(error.mock.calls.flat().join(' ')).toContain('falha http_500');
  expect(error.mock.calls.flat().join(' ')).toContain('falha de rede');
  expect(error.mock.calls.flat().join(' ')).not.toContain('token-de-teste');
});
