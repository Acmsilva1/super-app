import fs from 'node:fs';
import { CONTENT_SECURITY_POLICY } from '../lib/securityHeaders.js';
const file = new URL('../vercel.json', import.meta.url);
const config = JSON.parse(fs.readFileSync(file, 'utf8'));
const header = config.headers.find(entry => entry.source === '/(.*)').headers.find(entry => entry.key === 'Content-Security-Policy');
header.value = CONTENT_SECURITY_POLICY;
fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
console.log('CSP synchronised with inline script hashes.');
