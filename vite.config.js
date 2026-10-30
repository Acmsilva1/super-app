import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const root = path.dirname(fileURLToPath(import.meta.url));

/** Porta do preview:local / mock API (padrão 3000). */
function apiProxyTarget() {
  const port = process.env.VITE_API_PROXY_PORT || process.env.PORT || process.env.PREVIEW_PORT || '3000';
  return `http://127.0.0.1:${port}`;
}

/**
 * Vite puro (npx vite) não sobe backend. Este plugin:
 * 1) tenta proxy para preview:local;
 * 2) se a API estiver fora do ar, responde auth-config offline embutido
 *    para o login admin/admin não quebrar com HTML.
 */
function offlineApiPlugin() {
  const target = apiProxyTarget();
  return {
    name: 'superapp-offline-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        let pathname = '';
        try {
          pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
        } catch {
          res.statusCode = 400;
          res.end();
          return;
        }
        if (/(?:^|\/)(?:\.env[^/]*|\.git|local|work|backups)(?:\/|$)/i.test(pathname)) {
          res.statusCode = 403;
          res.end('Arquivo local protegido.');
          return;
        }
        if (!pathname.startsWith('/api/') && pathname !== '/healthz') return next();

        const upstream = new URL(req.url || '/', target);
        const headers = { ...req.headers, host: upstream.host };
        delete headers['accept-encoding'];

        const proxyReq = http.request(
          {
            protocol: upstream.protocol,
            hostname: upstream.hostname,
            port: upstream.port,
            path: upstream.pathname + upstream.search,
            method: req.method,
            headers,
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
            proxyRes.pipe(res);
          },
        );

        proxyReq.on('error', () => {
          if (pathname === '/api/auth-config' && req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(JSON.stringify({
              offlineMode: true,
              fakeToken: 'offline-dev-token',
              user: { id: 'f88a6351-317d-425b-afcd-9430c8a34f53', email: 'andre@local.dev' },
            }));
            return;
          }
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({
            error: 'API local indisponível. Rode `npm run preview:local` (porta 3000) ou `npm run dev`.',
          }));
        });

        req.pipe(proxyReq);
      });
    },
  };
}

export default defineConfig({
  root,
  plugins: [offlineApiPlugin()],
  server: {
    host: '127.0.0.1',
    fs: {
      deny: ['**/.env', '**/.env.*', '**/.git/**', '**/local/**', '**/*.pem', '**/*.key'],
    },
  },
});
