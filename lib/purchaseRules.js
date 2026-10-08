export function unsupportedPurchaseIntent(text) {
  const normalized = String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return /\b(?:credito|parcelas?|parcelad[oa]s?|amanha|ontem|anteontem|semana|mes|ano|segunda|terca|quarta|quinta|sexta|sabado|domingo|passad[oa]|proxim[oa])\b/.test(normalized)
    || /\b\d{1,4}[\/-]\d{1,2}(?:[\/-]\d{1,4})?\b/.test(normalized);
}
