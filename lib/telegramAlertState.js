export function markTelegramPending(payload = {}) {
  return {
    ...payload,
    telegram_sent: false,
    telegram_sent_at: null,
  };
}
