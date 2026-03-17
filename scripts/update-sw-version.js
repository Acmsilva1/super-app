/**
 * Atualiza CACHE_VERSION no sw.js com o hash do último commit (ou timestamp).
 * Rode antes do deploy (ex.: npm run update-sw) para invalidar cache a cada commit.
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const swPath = join(root, 'sw.js');

let version;
try {
  version = execSync('git rev-parse --short HEAD', { encoding: 'utf-8', cwd: root }).trim();
} catch {
  version = 't' + Date.now();
}

const content = readFileSync(swPath, 'utf-8');
const updated = content.replace(/const CACHE_VERSION = '[^']+';/, `const CACHE_VERSION = '${version}';`);
if (updated === content) {
  console.warn('update-sw-version: CACHE_VERSION não encontrado em sw.js');
  process.exit(1);
}
writeFileSync(swPath, updated);
console.log('sw.js CACHE_VERSION atualizado para:', version);
