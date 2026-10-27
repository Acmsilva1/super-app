# Super App na VPS (Docker) — parity 1:1 com a Vercel

Premissa: **zero redesign**. O container serve os mesmos estáticos (HTML/CSS/JS/PWA/ícones/`sw.js`) e as mesmas rotas `/api/*` com o mesmo contrato. A Vercel permanece intacta; isto é só runtime/hospedagem.

## O que sobe no container

| Peça | Como |
|------|------|
| Front + PWA | `server.js` (Express) — `index.html`, `styles/`, `features/`, `components/`, `backgrounds/`, `sw.js`, `manifest.json`, ícones |
| `lib/uiConfirmation.js` | Allowlist no server (único `lib/` do browser) |
| APIs Node | Handlers em `api/**/*.js` (inclui `admin/usuarios`) |
| Rewrites Vercel | `financeiro-simulador` → financeiro; `auth-config`/`statistics`/`roadmap` → apps |
| Gateway Telegram | `api/telegram-alert.py` no loopback + proxy em `/api/telegram-alert` (sem arquivo `.js` que sombrearia a Function na Vercel) |
| Health | `GET /healthz` → `{ "ok": true }` |

## Build e run local (Docker)

```bash
# Modelo canônico versionável (sem secrets): .env.vps.example
cp .env.vps.example .env
# edite .env com valores reais (Supabase, tokens). OFFLINE_DEV deve permanecer false.

docker compose build
docker compose up -d
curl -s http://127.0.0.1:3000/healthz
```

Cada variável está comentada em português em `.env.vps.example` (obrigatória vs opcional).

Stack legado PostgREST (AUTH_MODE=fixed): `docker compose -f docker-compose.postgrest.yml --env-file .env up -d` — não misturar com o modo Supabase na mesma porta.

## Variáveis de ambiente

### Obrigatórias (modo Supabase / VPS)

| Variável | Uso |
|----------|-----|
| `SUPABASE_URL` | Projeto Supabase |
| `SUPABASE_ANON_KEY` | Login no browser via `/api/auth-config` |
| `SUPABASE_SERVICE_ROLE_KEY` | APIs servidor, admin, alertas, callbacks |
| `SUPABASE_SCHEMA` | Default `public` (igual produção Vercel) |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` no container |
| `PORT` | `3000` |
| `OFFLINE_DEV` | **`false`** (senão o server recusa subir) |

### Obrigatórias se alertas/cron estiverem ativos

| Variável | Uso |
|----------|-----|
| `CRON_SECRET` | ≥32 chars; `Authorization: Bearer …` nos crons |
| `SAUDE_ALERTS_ENABLED` | `true` |
| `SAUDE_ALERTS_OWNER_USER_ID` | UUID owner/admin |
| `ALERTS_API_URL` | **HTTPS** público `…/api/telegram-alert` |
| `ALERTS_API_TOKEN` | ≥32 chars; header `X-Alert-Token` |
| `TELEGRAM_BOT_TOKEN` | Bot |
| `TELEGRAM_CHAT_ID` | Chat destino |

### WhatsApp / mensageria (mesma VPS)

| Variável | Obrig. | Notas |
|----------|--------|--------|
| `WHATSAPP_API_ORIGIN` | Se usar WA | **Somente HTTPS** (código atual rejeita `http://`). Ex.: `https://mensageria.duckdns.org` |
| `WHATSAPP_INTEGRATION_TOKEN` | Se usar WA | Bearer para `/api/control` |
| `WHATSAPP_WATER_CALLBACK_TOKEN` | Callback água | ≥32, distinto |
| `WHATSAPP_PURCHASE_CALLBACK_TOKEN` | Callback compras | ≥32, distinto |
| `WHATSAPP_FINANCE_PROFILE_ID` | Alertas fin. WA | audience |
| `WHATSAPP_PURCHASE_OWNER_PHONE` | Não | Legado |

**Rede Docker / host:** `http://mensageria:PORT`, `http://172.17.0.1:PORT` e `host.docker.internal` **não** funcionam com o cliente atual (exige `https:`). Use o hostname DuckDNS (ou outro) com TLS na mensageria. Opcionalmente coloque o `super-app` na mesma Docker network só para DNS interno de outros fluxos; a origem configurada no Super App continua HTTPS.

Na mensageria, `SUPERAPP_API_ORIGIN` pode apontar para `https://seu-app.duckdns.org` (após TLS) ou, se a mensageria aceitar HTTP interno, `http://super-app:3000` — isso é config da mensageria, não deste repo.

### Opcionais

| Variável | Uso |
|----------|-----|
| `TELEGRAM_WEBHOOK_SECRET` | Senão deriva do bot token |
| `TELEGRAM_ALERT_PORT` / `TELEGRAM_ALERT_INTERNAL_URL` | Loopback do Python no container |
| `BASIC_AUTH_*` | Camada HTTP extra (não substitui Supabase Auth) |
| `SUPERAPP_PUBLISH` | Bind publish do compose |
| `GIT_COMMIT` | Sufixo de cacheVersion no `version:sync` da imagem |
| `VERCEL_*` | Só Vercel; omitir na VPS |

### Não usar na VPS produção

`OFFLINE_DEV=true`, `AUTH_MODE=fixed` (a menos que use o compose PostgREST), `LOCAL_DATA_MODE`, `VERCEL_AUTOMATION_BYPASS_SECRET`.

## Crons na VPS

Na Vercel o GitHub Actions chama o endpoint. Na VPS use **crontab** ou **systemd timer** no host (ou num container one-shot), contra a URL interna:

```bash
# a cada 5 min, fora do minuto 0 (mesmo espírito do workflow)
2-59/5 * * * * curl -fsS -H "Authorization: Bearer ${CRON_SECRET}" \
  "http://127.0.0.1:3000/api/saude-alertas-cron" >/dev/null
```

Opcional treino de modelo:

```bash
15 3 * * * curl -fsS -X POST -H "Authorization: Bearer ${CRON_SECRET}" \
  "http://127.0.0.1:3000/api/cron-treinar-modelo" >/dev/null
```

- Auth: `lib/cronAuth.js` → `isCronAuthorized` (`Bearer` + `CRON_SECRET` ≥32).
- Health do app: `GET /healthz` (sem secret; isento de Basic Auth se houver).
- Teste manual Telegram: `GET /api/saude-alertas-cron?mode=telegram_test` com o mesmo Bearer (ou o botão admin, igual antes).

Com Basic Auth na frente, o cron deve chamar `127.0.0.1` **atrás** do proxy ou enviar também o header Basic — preferir bind `127.0.0.1` + cron local sem Basic no path interno.

## Próximos passos na VPS

1. Copiar o repo (ou artefato) + `.env` preenchido a partir de `.env.vps.example`.
2. `docker compose build && docker compose up -d`.
3. Validar `curl http://127.0.0.1:3000/healthz` e login Supabase no browser via túnel/SSH.
4. Configurar crontab dos alertas com `CRON_SECRET`.
5. Depois: DuckDNS + reverse proxy TLS → apontar `ALERTS_API_URL` e `WHATSAPP_API_ORIGIN` (HTTPS).
6. Na mensageria: `SUPERAPP_API_ORIGIN` para a URL canônica do Super App.

## Riscos / residual

- **HTTPS obrigatório** para `ALERTS_API_URL` e `WHATSAPP_API_ORIGIN` em `NODE_ENV=production` — sem DuckDNS/TLS, alertas Telegram/WhatsApp falham (comportamento igual ao código Vercel).
- Gateway Python sobe no mesmo container; se o Python cair, `/api/telegram-alert` responde 502 (Node e estáticos seguem).
- Não criar `api/telegram-alert.js` no repo: sombrearia a Function Python na Vercel.
- Conta Vercel pausada: sem deploy Vercel nesta adaptação.
- Compose PostgREST legado separado; não é o caminho Supabase.
