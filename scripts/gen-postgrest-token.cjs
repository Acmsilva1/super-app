#!/usr/bin/env node
// Uso: node scripts/gen-postgrest-token.cjs "<POSTGREST_JWT_SECRET>" "<FIXED_USER_ID>"
const crypto = require('node:crypto');

const [secret, sub] = process.argv.slice(2);
if (!secret || secret.length < 32 || !sub) {
  console.error('Uso: node scripts/gen-postgrest-token.cjs "<segredo com 32+ caracteres>" "<uuid do usuario>"');
  process.exit(1);
}

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const header = b64url({ alg: 'HS256', typ: 'JWT' });
const payload = b64url({ role: 'service_role', sub, iat: Math.floor(Date.now() / 1000) });
const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');

console.log(`${header}.${payload}.${signature}`);
