import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile(fileName) {
  const envPath = path.join(__dirname, fileName);
  if (!fs.existsSync(envPath)) return;
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...vals] = trimmed.split('=');
    if (key && vals.length) {
      process.env[key.trim()] ||= vals.join('=').trim();
    }
  }
}

const PUBLIC_ROOT_FILES = new Set(['index.html', 'sw.js', 'manifest.json', 'app-version.json']);
const PUBLIC_DIRS = ['styles', 'features', 'components', 'backgrounds'];
const NO_CACHE_FILES = new Set(['index.html', 'sw.js', 'app-version.json']);
const IMMUTABLE_FILES = new Set(['icon-192.png', 'icon-512.png']);
const CONSOLIDATED_ROUTES = new Set(['auth-config', 'statistics', 'roadmap']);

function setStaticHeaders(res, filePath) {
  const name = path.basename(filePath);
  if (NO_CACHE_FILES.has(name)) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else if (IMMUTABLE_FILES.has(name)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
  if (name === 'manifest.json') res.setHeader('Content-Type', 'application/manifest+json');
  if (name === 'sw.js') res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
}

function isPublicRootFile(name) {
  return PUBLIC_ROOT_FILES.has(name) || (/\.png$/i.test(name) && !name.includes('/'));
}

function safeEqual(a, b) {
  const left = crypto.createHash('sha256').update(String(a)).digest();
  const right = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(left, right);
}

function isBasicAuthExempt(reqPath) {
  return reqPath === '/healthz' || reqPath === '/manifest.json' || /^\/[^/]+\.png$/i.test(reqPath);
}

function basicAuth({ user, password }) {
  return (req, res, next) => {
    if (isBasicAuthExempt(req.path)) return next();
    const match = String(req.headers.authorization || '').match(/^Basic\s+(.+)$/i);
    if (match) {
      const decoded = Buffer.from(match[1], 'base64').toString('utf8');
      const sep = decoded.indexOf(':');
      const okUser = sep >= 0 && safeEqual(decoded.slice(0, sep), user);
      const okPass = sep >= 0 && safeEqual(decoded.slice(sep + 1), password);
      if (okUser && okPass) return next();
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="SUPERAPP", charset="UTF-8"');
    return res.status(401).send('Acesso restrito');
  };
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  if (process.env.BASIC_AUTH_USER && process.env.BASIC_AUTH_PASSWORD) {
    app.use(basicAuth({ user: process.env.BASIC_AUTH_USER, password: process.env.BASIC_AUTH_PASSWORD }));
  }

  app.use(express.json({ limit: '4.5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '4.5mb' }));
  app.use(express.text({ limit: '4.5mb' }));

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  app.all('/api/*', async (req, res) => {
    const requestedEndpoint = String(req.path || '').replace(/^\/api\//, '').replace(/\/$/, '');
    const endpoint = CONSOLIDATED_ROUTES.has(requestedEndpoint) ? 'apps' : requestedEndpoint;
    if (CONSOLIDATED_ROUTES.has(requestedEndpoint)) {
      req.query = { ...req.query, route: requestedEndpoint };
    }
    if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/i.test(endpoint)) {
      return res.status(404).json({ error: 'Rota de API nao encontrada.' });
    }
    const modulePath = path.join(__dirname, 'api', `${endpoint}.js`);
    if (!fs.existsSync(modulePath)) {
      return res.status(404).json({ error: 'Rota de API nao encontrada.' });
    }
    try {
      const { default: handler } = await import(pathToFileURL(modulePath).href);
      return await handler(req, res);
    } catch (err) {
      console.error(`[server] Erro na rota /api/${endpoint}:`, err);
      if (res.headersSent) return res.end();
      return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  });

  for (const dir of PUBLIC_DIRS) {
    app.use(`/${dir}`, express.static(path.join(__dirname, dir), {
      dotfiles: 'ignore',
      index: false,
      setHeaders: setStaticHeaders,
    }));
  }

  app.get('/', (req, res) => {
    setStaticHeaders(res, 'index.html');
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  app.get('/:file', (req, res, next) => {
    const name = req.params.file;
    if (!isPublicRootFile(name)) return next();
    const filePath = path.join(__dirname, name);
    if (!fs.existsSync(filePath)) return next();
    setStaticHeaders(res, name);
    return res.sendFile(filePath);
  });

  app.use((req, res) => res.status(404).send('Not found'));

  return app;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  loadEnvFile('.env');
  loadEnvFile('.env.local');

  if (process.env.OFFLINE_DEV === 'true' || process.env.NODE_ENV === 'test') {
    console.error('[server] OFFLINE_DEV=true ou NODE_ENV=test desativam a autenticacao. Recusando iniciar.');
    process.exit(1);
  }
  const required = process.env.AUTH_MODE === 'fixed'
    ? ['POSTGREST_URL', 'POSTGREST_TOKEN', 'BASIC_AUTH_USER', 'BASIC_AUTH_PASSWORD']
    : ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length) {
    console.error(`[server] Variaveis obrigatorias ausentes: ${missing.join(', ')}`);
    process.exit(1);
  }
  if (process.env.AUTH_MODE === 'fixed' && String(process.env.BASIC_AUTH_PASSWORD).length < 12) {
    console.error('[server] BASIC_AUTH_PASSWORD precisa ter pelo menos 12 caracteres com AUTH_MODE=fixed.');
    process.exit(1);
  }

  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '127.0.0.1';
  createApp().listen(port, host, () => {
    console.log(`[server] SUPERAPP em http://${host}:${port}`);
  });
}
