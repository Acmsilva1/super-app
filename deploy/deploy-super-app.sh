#!/usr/bin/env bash
# Deploy do Super App na VPS: alinha o git a main (ou SHA de main) e reconstrói o container.
# Preserva /opt/super-app/.env. Uso: deploy-super-app [git-sha|origin/main]
# Produção NÃO deve ficar em feature/* — o timer /opt/deploy também deve usar BRANCH=main.
set -Eeuo pipefail

APP_DIR="${SUPERAPP_DIR:-/opt/super-app}"
TARGET_REF="${1:-origin/main}"
COMPOSE_FILE="${SUPERAPP_COMPOSE_FILE:-docker-compose.yml}"
LOCK_FILE="${SUPERAPP_DEPLOY_LOCK:-/var/lock/super-app-deploy.lock}"

cd "$APP_DIR"

test -f .env || { echo "Arquivo ${APP_DIR}/.env ausente." >&2; exit 1; }
test -f "$COMPOSE_FILE" || { echo "Compose ausente: ${COMPOSE_FILE}" >&2; exit 1; }

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Deploy já em andamento (${LOCK_FILE}); abortando." >&2
  exit 1
fi

# Nunca sobrescrever secrets locais com o que vier do git.
chmod 600 .env 2>/dev/null || true

# Evita que o auto-deploy do host (/opt/deploy) volte a feature/*.
if [[ -f /opt/deploy/config/super-app.conf ]]; then
  if grep -qE '^BRANCH=feature/' /opt/deploy/config/super-app.conf; then
    echo "Corrigindo /opt/deploy/config/super-app.conf: BRANCH=main" >&2
    sed -i 's/^BRANCH=feature\/.*/BRANCH=main/' /opt/deploy/config/super-app.conf
  fi
fi

echo "=== fetch ==="
GIT_TERMINAL_PROMPT=0 git fetch --prune origin

if [[ "$TARGET_REF" =~ ^[0-9a-fA-F]{7,40}$ ]]; then
  RESOLVED="$(git rev-parse --verify "${TARGET_REF}^{commit}")"
elif [[ "$TARGET_REF" == origin/* ]]; then
  RESOLVED="$(git rev-parse --verify "${TARGET_REF}^{commit}")"
else
  RESOLVED="$(git rev-parse --verify "origin/${TARGET_REF}^{commit}")"
fi

MAIN_SHA="$(git rev-parse --verify origin/main^{commit})"
# Aceita só commits que estão em origin/main (evita publicar feature/* por engano).
if ! git merge-base --is-ancestor "$RESOLVED" "$MAIN_SHA"; then
  echo "Ref ${TARGET_REF} (${RESOLVED:0:7}) não está em origin/main (${MAIN_SHA:0:7}). Abortando." >&2
  exit 1
fi
# Sempre publica o tip de main quando o pedido é a branch main / origin/main.
if [[ "$TARGET_REF" == "main" || "$TARGET_REF" == "origin/main" ]]; then
  RESOLVED="$MAIN_SHA"
fi

echo "=== checkout main @ ${RESOLVED} ==="
# Sempre branch main — nunca deixa o working tree em feature/*.
git checkout -B main "$RESOLVED"
git reset --hard "$RESOLVED"
git clean -fd --exclude=.env --exclude=.env.* --exclude=backups --exclude=.deployed-revision

BRANCH_NOW="$(git branch --show-current)"
HEAD_NOW="$(git rev-parse HEAD)"
if [[ "$BRANCH_NOW" != "main" || "$HEAD_NOW" != "$RESOLVED" ]]; then
  echo "Checkout inconsistente: branch=${BRANCH_NOW} head=${HEAD_NOW:0:7} expected=main@${RESOLVED:0:7}" >&2
  exit 1
fi

# Sanity dos artefatos de auth (somente e-mail/senha; biometria desativada).
if grep -q 'forgotPasswordBtn' index.html; then
  echo "index.html ainda contém forgotPasswordBtn — abortando." >&2
  exit 1
fi
if grep -q 'requireBiometricAfterPassword' index.html; then
  echo "index.html ainda exige biometria após senha — abortando." >&2
  exit 1
fi
if [[ -f features/auth/biometric.js ]]; then
  echo "features/auth/biometric.js ainda presente — abortando." >&2
  exit 1
fi
if ! grep -q 'SESSION_TTL_MS' index.html; then
  echo "index.html sem SESSION_TTL_MS (sessão de 3h) — abortando." >&2
  exit 1
fi
if [[ -f api/webauthn.js ]] && ! grep -q '410' api/webauthn.js; then
  echo "api/webauthn.js deve responder 410 (biometria desativada) — abortando." >&2
  exit 1
fi

# Atualiza o helper instalado a partir do repo (após checkout).
if [[ -f deploy/deploy-super-app.sh ]]; then
  install -m 755 deploy/deploy-super-app.sh /usr/local/sbin/deploy-super-app
fi

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

# Confirma o que o container realmente serve.
forgot_count="$(docker exec super-app sh -c 'grep -c forgotPasswordBtn /app/index.html || true')"
if [[ "${forgot_count:-0}" != "0" ]]; then
  echo "Container ainda serve forgotPasswordBtn (count=${forgot_count})." >&2
  exit 1
fi
if docker exec super-app test -f /app/features/auth/biometric.js; then
  echo "Container ainda contém /app/features/auth/biometric.js." >&2
  exit 1
fi
bio_count="$(docker exec super-app sh -c 'grep -c requireBiometricAfterPassword /app/index.html || true')"
if [[ "${bio_count:-0}" != "0" ]]; then
  echo "Container ainda exige biometria (count=${bio_count})." >&2
  exit 1
fi

curl -fsS -m 5 http://127.0.0.1:3000/healthz
echo
echo "deployed=$RESOLVED branch=main"
