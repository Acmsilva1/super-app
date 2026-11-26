# Runtime contínuo: front/PWA estático + handlers /api/* servidos pelo Express (server.js).
FROM node:24-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

RUN apk add --no-cache wget

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
