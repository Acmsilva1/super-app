const KEY_PREFIX = 'superapp:financeiro:graficos_anuais:';

function storage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function buildFinanceiroAnualCacheKey(userId, ano) {
  const uid = String(userId || '').trim() || 'anon';
  const year = String(ano || '').trim();
  return `${KEY_PREFIX}${uid}:${year}`;
}

export function getFinanceiroAnualCache(userId, ano) {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(buildFinanceiroAnualCacheKey(userId, ano));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || Number(parsed.ano) !== Number(ano)) return null;
    if (!Array.isArray(parsed.graficos_anuais) || parsed.graficos_anuais.length !== 12) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setFinanceiroAnualCache(userId, ano, graficosAnuais) {
  const store = storage();
  if (!store) return false;
  if (!Array.isArray(graficosAnuais) || graficosAnuais.length !== 12) return false;
  try {
    const payload = {
      ano: Number(ano),
      updatedAt: new Date().toISOString(),
      graficos_anuais: graficosAnuais,
    };
    store.setItem(buildFinanceiroAnualCacheKey(userId, ano), JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearFinanceiroAnualCache(userId, ano = null) {
  const store = storage();
  if (!store) return 0;
  const uid = String(userId || '').trim() || 'anon';
  let removed = 0;
  try {
    if (ano != null && String(ano).trim() !== '') {
      store.removeItem(buildFinanceiroAnualCacheKey(userId, ano));
      return 1;
    }
    const prefix = `${KEY_PREFIX}${uid}:`;
    const keys = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && key.startsWith(prefix)) keys.push(key);
    }
    keys.forEach((key) => {
      store.removeItem(key);
      removed += 1;
    });
  } catch {
    return removed;
  }
  return removed;
}

if (typeof window !== 'undefined') {
  window.FinanceiroAnualCache = {
    buildFinanceiroAnualCacheKey,
    getFinanceiroAnualCache,
    setFinanceiroAnualCache,
    clearFinanceiroAnualCache,
  };
}
