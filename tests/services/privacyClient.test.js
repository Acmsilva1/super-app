import { it, expect, vi, afterEach } from 'vitest';
import { clearPrivateClientData } from '../../features/auth/privateClientData.js';

function storage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    get length() { return map.size; },
    key: (i) => [...map.keys()][i],
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

afterEach(() => vi.unstubAllGlobals());

it('logout purges diet/health browser data, biometric leftovers and cached API responses', async () => {
  const local = storage({
    'superapp:home-diet-quick:last-diet-id': '1',
    'superapp:saude:consumo-agua:v1': 'sensitive',
    superapp_biometric: 'opaque',
    superapp_session_deadline: String(Date.now() + 3600000),
  });
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', storage({
    superapp_ui_state_v1: 'sensitive',
    superapp_biometric_verified_session: 'marker',
  }));
  vi.stubGlobal('location', { origin: 'https://app.test' });
  const remove = vi.fn();
  vi.stubGlobal('caches', {
    keys: async () => ['shell'],
    open: async () => ({
      keys: async () => [
        { url: 'https://app.test/api/saude?resource=dietas' },
        { url: 'https://app.test/icon.png' },
      ],
      delete: remove,
    }),
  });
  await clearPrivateClientData();
  expect(local.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  expect(remove).toHaveBeenCalledTimes(1);
});
