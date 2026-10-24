// Reativacao do canal legado exige opt-in explicito no servidor.
export function telegramEnabled() { return process.env.TELEGRAM_ENABLED === 'true'; }
