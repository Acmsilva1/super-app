import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carrega .env.local manualmente sem depender de pacotes externos
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...vals] = trimmed.split('=');
      if (key && vals.length) {
        process.env[key.trim()] = vals.join('=').trim();
      }
    }
  }
}

const app = express();
app.use(express.json());

// Servir arquivos estaticos do front-end (HTML, CSS, JS, imagens)
app.use(express.static(__dirname));

// Proxy para PostgREST local na porta 3000 quando Supabase JS chama /rest/v1/*
app.use('/rest/v1', async (req, res) => {
  const targetUrl = `http://127.0.0.1:3000${req.url}`;
  try {
    const headers = { ...req.headers };
    delete headers.host;
    const options = {
      method: req.method,
      headers,
    };
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      options.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }
    const response = await fetch(targetUrl, options);
    res.status(response.status);
    response.headers.forEach((val, key) => res.setHeader(key, val));
    const data = await response.arrayBuffer();
    return res.end(Buffer.from(data));
  } catch (err) {
    return res.status(500).json({ error: `Erro no proxy local do PostgREST: ${err.message}` });
  }
});

// Roteamento dinamico de rotas Serverless (/api/*)
app.all('/api/:endpoint', async (req, res) => {
  const endpoint = req.params.endpoint;
  const modulePath = `./api/${endpoint}.js`;
  try {
    const { default: handler } = await import(modulePath);
    return await handler(req, res);
  } catch (err) {
    console.error(`[DevServer] Erro na rota /api/${endpoint}:`, err.message);
    return res.status(500).json({ error: `Erro na rota /api/${endpoint}: ${err.message}` });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 SUPER APP LOCAL SERVER RODANDO!`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`🔒 Modo Offline: OFFLINE_DEV=${process.env.OFFLINE_DEV || 'false'}`);
  console.log(`🔌 Banco Local: ${process.env.SUPABASE_URL || 'Nao configurado'}`);
  console.log(`======================================================\n`);
});
