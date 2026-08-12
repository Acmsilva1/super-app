import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';

const root = path.resolve(process.cwd());
const envPaths = [
  path.join(root, '.env.local'),
  path.join(root, 'api', '.env.local'),
];

for (const envPath of envPaths) {
  if (!fs.existsSync(envPath)) continue;
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [key, ...vals] = trimmed.split('=');
    if (key && vals.length) {
      process.env[key.trim()] = process.env[key.trim()] || vals.join('=').trim();
    }
  }
}

process.env.PORT ||= '3002';
process.env.VITE_PORT ||= '5173';

const backendPort = Number(process.env.PORT);
const vitePort = Number(process.env.VITE_PORT);

const backend = spawn(process.execPath, [path.join(root, 'dev-server.js')], {
  stdio: 'inherit',
  env: process.env,
});

backend.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 0);
});

const viteServer = await createViteServer({
  server: {
    port: vitePort,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: true,
        secure: false,
      },
      '/rest/v1': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});

await viteServer.listen();
console.log(`\n🚀 Frontend Vite dev server running at http://localhost:${vitePort}`);
console.log(`🔌 Backend dev server running at http://localhost:${backendPort}`);

async function shutdown() {
  backend.kill('SIGTERM');
  await viteServer.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
