import { beforeEach, describe, expect, it } from 'vitest';

function installMemoryLocalStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (key) => (map.has(String(key)) ? map.get(String(key)) : null),
    setItem: (key, value) => { map.set(String(key), String(value)); },
    removeItem: (key) => { map.delete(String(key)); },
    clear: () => { map.clear(); },
    key: (index) => Array.from(map.keys())[index] || null,
    get length() { return map.size; },
  };
}

installMemoryLocalStorage();

const {
  buildFinanceiroAnualCacheKey,
  clearFinanceiroAnualCache,
  getFinanceiroAnualCache,
  setFinanceiroAnualCache,
} = await import('../../lib/financeiroAnualCache.js');

function sampleSeries(ano) {
  return Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    mes_ano: `${ano}-${String(i + 1).padStart(2, '0')}`,
    receitas: i * 10,
    despesas: i * 5,
    saldo: i * 5,
  }));
}

describe('financeiroAnualCache', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('monta chave por usuario e ano', () => {
    expect(buildFinanceiroAnualCacheKey('user-1', 2026)).toBe(
      'superapp:financeiro:graficos_anuais:user-1:2026',
    );
  });

  it('salva e le cache valido', () => {
    const series = sampleSeries(2026);
    expect(setFinanceiroAnualCache('u1', 2026, series)).toBe(true);
    const cached = getFinanceiroAnualCache('u1', 2026);
    expect(cached?.ano).toBe(2026);
    expect(cached?.graficos_anuais).toEqual(series);
  });

  it('ignora cache incompleto', () => {
    localStorage.setItem(
      buildFinanceiroAnualCacheKey('u1', 2026),
      JSON.stringify({ ano: 2026, graficos_anuais: [{ mes: 1 }] }),
    );
    expect(getFinanceiroAnualCache('u1', 2026)).toBeNull();
  });

  it('limpa todos os anos do usuario', () => {
    setFinanceiroAnualCache('u1', 2025, sampleSeries(2025));
    setFinanceiroAnualCache('u1', 2026, sampleSeries(2026));
    setFinanceiroAnualCache('u2', 2026, sampleSeries(2026));
    expect(clearFinanceiroAnualCache('u1')).toBe(2);
    expect(getFinanceiroAnualCache('u1', 2025)).toBeNull();
    expect(getFinanceiroAnualCache('u1', 2026)).toBeNull();
    expect(getFinanceiroAnualCache('u2', 2026)?.ano).toBe(2026);
  });
});
