# Runtime contínuo 1:1 com o artefato estático + handlers /api/* da Vercel.
# Node serve o mesmo front/PWA; Python mantém o gateway /api/telegram-alert.
FROM node:24-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    TELEGRAM_ALERT_PORT=8091

RUN apk add --no-cache python3 wget

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --chown=node:node . .
RUN chmod +x /app/scripts/docker-entrypoint.sh \
  && node scripts/sync-app-version.cjs

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
