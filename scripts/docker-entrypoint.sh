#!/bin/sh
set -eu

TELEGRAM_PORT="${TELEGRAM_ALERT_PORT:-8091}"
export TELEGRAM_ALERT_INTERNAL_URL="${TELEGRAM_ALERT_INTERNAL_URL:-http://127.0.0.1:${TELEGRAM_PORT}/}"

# Gateway Python idêntico ao da Vercel (api/telegram-alert.py), só no loopback do container.
python3 /app/api/telegram-alert.py --port "$TELEGRAM_PORT" &
PYTHON_PID=$!

shutdown() {
  kill "$PYTHON_PID" 2>/dev/null || true
  wait "$PYTHON_PID" 2>/dev/null || true
}
trap shutdown EXIT INT TERM

# Pequena folga para o bind local; o proxy Node trata indisponibilidade com 502.
sleep 0.3

exec node server.js
