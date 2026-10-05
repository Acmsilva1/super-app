import { spawn } from 'node:child_process';
import { configureDevelopmentEnv } from './local-env.js';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';

const root = path.resolve(process.cwd());
const real = process.argv.includes('--real');
configureDevelopmentEnv(root, { real });

const backendPort = Number(process.env.PORT);
const vitePort = Number(process.env.VITE_PORT);

const backend = spawn(process.execPath, [path.join(root, 'dev-server.js')], {
  stdio: 'inherit',
  windowsHide: true,
  env: process.env,
});

backend.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});

const viteServer = await createViteServer({
  plugins: [{
    name: 'protect-local-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        let pathname;
        try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
        catch { res.statusCode = 400; res.end(); return; }
        if (/(?:^|\/)(?:\.env[^/]*|\.git|local|work|backups)(?:\/|$)/i.test(pathname)) {
          res.statusCode = 403; res.end('Arquivo local protegido.'); return;
        }
        next();
      });
    },
  }],
  server: {
    port: vitePort,
    host: '127.0.0.1',
    strictPort: true,
    fs: { deny: ['**/.env', '**/.env.*', '**/.git/**', '**/local/**', '**/*.pem', '**/*.key'] },
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: true,
        secure: false,
      },

    },
  },
});

try { await viteServer.listen(); } catch (error) { backend.kill(); throw error; }
console.log(`\n🚀 Frontend Vite dev server running at http://localhost:${vitePort}`);
console.log(`🔌 Backend dev server running at http://localhost:${backendPort}`);

async function shutdown() {
  backend.kill('SIGTERM');
  await viteServer.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
