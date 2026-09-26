/**
 * Fonte única: package.json "version".
 * Gera app-version.json, lib/appVersion.js e atualiza CACHE_VERSION em sw.js.
 *
 * No deploy (Vercel), VERCEL_GIT_COMMIT_SHA diferencia builds com o mesmo semver.
 * Local: timestamp do sync.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const semver = String(pkg.version || '0.0.0').trim();
const shortSha = String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || '').slice(0, 7);
const buildStamp = shortSha || new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
const cacheVersion = `app-${semver}-${buildStamp}`;
const displayVersion = `V.${semver}`;

const manifest = {
  semver,
  display: displayVersion,
  cacheVersion,
  generatedAt: new Date().toISOString(),
};

fs.writeFileSync(path.join(root, 'app-version.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

const libContent = `/** Gerado por scripts/sync-app-version.cjs — não editar manualmente. */
export const APP_SEMVER = '${semver}';
export const APP_DISPLAY_VERSION = '${displayVersion}';
export const APP_CACHE_VERSION = '${cacheVersion}';
`;

fs.writeFileSync(path.join(root, 'lib', 'appVersion.js'), libContent, 'utf8');

const swPath = path.join(root, 'sw.js');
let sw = fs.readFileSync(swPath, 'utf8');
if (!/const CACHE_VERSION = '[^']+';/.test(sw)) {
  console.error('sync-app-version: CACHE_VERSION não encontrado em sw.js');
  process.exit(1);
}
sw = sw.replace(/const CACHE_VERSION = '[^']+';/, `const CACHE_VERSION = '${cacheVersion}';`);
fs.writeFileSync(swPath, sw, 'utf8');

console.log(`[sync-app-version] ${displayVersion} (cache: ${cacheVersion})`);
