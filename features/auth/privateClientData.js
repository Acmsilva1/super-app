/** Clear user-scoped health/diet/finance caches and leftover biometric markers. */
export async function clearPrivateClientData() {
  for (const storeName of ['localStorage', 'sessionStorage']) {
    try {
      const store = globalThis[storeName];
      for (let i = store.length - 1; i >= 0; i--) {
        const key = store.key(i);
        if (
          /^(superapp[:_](saude|home-diet|diet|financeiro|carne|ui_state)|offline_(token|user)|ritmo_saude_)/i.test(key || '')
          || key === 'superapp_biometric'
          || key === 'superapp_biometric_verified_user'
          || key === 'superapp_biometric_verified_session'
          || key === 'superapp_session_deadline'
        ) store.removeItem(key);
      }
    } catch { /* Browser can disable storage; continue clearing other stores. */ }
  }
  try { if (globalThis.caches) {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const url = new URL(request.url);
        if (url.origin === location.origin && (url.pathname.startsWith('/api/') || /diet|saude|profile/i.test(url.pathname))) await cache.delete(request);
      }
    }
  } } catch { /* Storage can be blocked; logout must still revoke the session. */ }
  globalThis.dispatchEvent?.(new Event('superapp:private-data-cleared'));
}
