import fs from 'node:fs';
import path from 'node:path';
export function loadLocalEnv(file, env = process.env) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1,-1);
    env[match[1]] ??= value;
  }
}
export function configureDevelopmentEnv(root, { real = false, env = process.env } = {}) {
  if (env.VERCEL || env.NODE_ENV === 'production') throw new Error('Servidor de desenvolvimento proibido em produção.');
  loadLocalEnv(path.join(root,'.env.local'),env);
  loadLocalEnv(path.join(root,'api','.env.local'),env);
  if (env.VERCEL || env.NODE_ENV === 'production') throw new Error('Configuração local de produção não permitida.');
  env.NODE_ENV = 'development'; env.OFFLINE_DEV = real ? 'false' : 'true';
  env.LOCAL_DATA_MODE = real ? 'real' : 'mock'; env.SAUDE_ALERTS_ENABLED = 'false';
  if (!real) {
    env.AUTH_MODE = 'supabase';env.SUPABASE_URL = 'http://127.0.0.1:3000';
    env.SUPABASE_ANON_KEY = 'local-dev-key';env.SUPABASE_SCHEMA = 'superapp';
    for (const name of ['SUPABASE_SERVICE_ROLE_KEY','POSTGREST_URL','POSTGREST_TOKEN','APP_MODE','DATA_MODE']) delete env[name];
  }
  env.PORT ||= '3002'; env.VITE_PORT ||= '5173';return { mock: !real };
}
