export const VISIBLE_MS = 20_000;
export const HIDDEN_MS = 20_000;

export function normalizeMessages(messages) {
  return Array.from(
    new Set(
      (Array.isArray(messages) ? messages : [])
        .filter((m) => typeof m === 'string' && m.trim().length > 0)
        .map((m) => m.trim()),
    ),
  );
}

export function sameList(a, b) {
  return Array.isArray(a)
    && Array.isArray(b)
    && a.length === b.length
    && a.every((item, i) => item === b[i]);
}

export function pickNextTip(pool, previous) {
  const list = Array.isArray(pool) ? pool : [];
  if (!list.length) return null;
  const candidates = list.length > 1 ? list.filter((m) => m !== previous) : list;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? list[0];
}
