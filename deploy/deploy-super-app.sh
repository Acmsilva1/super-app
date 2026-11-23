#!/usr/bin/env bash
# Deploy do Super App na VPS: alinha o git ao SHA/ref e reconstrói o container.
# Preserva /opt/super-app/.env. Uso: deploy-super-app [git-sha|origin/main]
set -Eeuo pipefail

APP_DIR="${SUPERAPP_DIR:-/opt/super-app}"
TARGET_REF="${1:-origin/main}"
COMPOSE_FILE="${SUPERAPP_COMPOSE_FILE:-docker-compose.yml}"

cd "$APP_DIR"

test -f .env || { echo "Arquivo ${APP_DIR}/.env ausente." >&2; exit 1; }
test -f "$COMPOSE_FILE" || { echo "Compose ausente: ${COMPOSE_FILE}" >&2; exit 1; }

# Nunca sobrescrever secrets locais com o que vier do git.
chmod 600 .env 2>/dev/null || true

echo "=== fetch ==="
GIT_TERMINAL_PROMPT=0 git fetch --prune origin

if [[ "$TARGET_REF" =~ ^[0-9a-fA-F]{7,40}$ ]]; then
  RESOLVED="$(git rev-parse --verify "${TARGET_REF}^{commit}")"
elif [[ "$TARGET_REF" == origin/* ]]; then
  RESOLVED="$(git rev-parse --verify "${TARGET_REF}^{commit}")"
else
  RESOLVED="$(git rev-parse --verify "origin/${TARGET_REF}^{commit}")"
fi

echo "=== checkout ${RESOLVED} ==="
# Descarta divergência local do código (ex.: branch antiga); .env fica fora do git.
git checkout -B main "$RESOLVED"
git reset --hard "$RESOLVED"
git clean -fd --exclude=.env --exclude=.env.* --exclude=backups --exclude=.deployed-revision

printf '%s\n' "$RESOLVED" > .deployed-revision
chmod 600 .env
chown root:root .env 2>/dev/null || true

echo "=== docker compose ==="
docker compose -f "$COMPOSE_FILE" up -d --build --force-recreate --remove-orphans
docker compose -f "$COMPOSE_FILE" ps

echo "=== healthz ==="
ok=0
for _ in $(seq 1 30); do
  if curl -fsS -m 3 http://127.0.0.1:3000/healthz >/dev/null 2>&1; then
    ok=1
    break
  fi
  sleep 2
done
if [[ "$ok" -ne 1 ]]; then
  echo "healthz falhou após deploy." >&2
  docker compose -f "$COMPOSE_FILE" logs --tail=80
  exit 1
fi

curl -fsS -m 5 http://127.0.0.1:3000/healthz
echo
echo "deployed=$RESOLVED"
