#!/usr/bin/env bash
# Dispara GET /api/saude-alertas-cron no Super App local (VPS).
# Secret vem de /opt/super-app/.env — nunca hardcodar.
set -euo pipefail

ENV_FILE="${SUPERAPP_ENV_FILE:-/opt/super-app/.env}"
BASE_URL="${SUPERAPP_CRON_URL:-http://127.0.0.1:3000}"
MODE="${1:-scheduled}"
TIMEOUT="${SUPERAPP_CRON_TIMEOUT:-170}"
LOG_TAG="saude-alertas-cron"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "$LOG_TAG: env ausente: $ENV_FILE" >&2
  exit 1
fi

# Extrai CRON_SECRET com LF/CRLF; ignora comentários
CRON_SECRET="$(
  tr -d '\r' < "$ENV_FILE" | awk -F= '
    /^[[:space:]]*CRON_SECRET[[:space:]]*=/ {
      v = $0
      sub(/^[^=]*=/, "", v)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", v)
      gsub(/^"|"$/, "", v)
      gsub(/^'\''|'\''$/, "", v)
      print v
      exit
    }
  '
)"

if [[ ${#CRON_SECRET} -lt 32 ]]; then
  echo "$LOG_TAG: CRON_SECRET invalido ou curto em $ENV_FILE" >&2
  exit 1
fi

URL="${BASE_URL%/}/api/saude-alertas-cron?mode=${MODE}"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

http_code="$(
  curl --silent --show-error --max-time "$TIMEOUT" \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    -H "Accept: application/json" \
    -o "$tmp" -w "%{http_code}" \
    "$URL"
)"

body="$(cat "$tmp" 2>/dev/null || true)"
echo "$LOG_TAG: HTTP ${http_code} mode=${MODE} url=${URL}"
echo "$LOG_TAG: body=${body}"

case "$http_code" in
  200|202) exit 0 ;;
  *) exit 1 ;;
esac
