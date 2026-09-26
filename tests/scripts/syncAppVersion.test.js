import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '../..');

describe('sync-app-version', () => {
  it('gera manifest alinhado ao package.json', () => {
    execFileSync(process.execPath, [path.join(root, 'scripts/sync-app-version.cjs')], {
      cwd: root,
      env: { ...process.env, VERCEL_GIT_COMMIT_SHA: 'abc1234deadbeef' },
    });
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'app-version.json'), 'utf8'));
    const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
    const lib = fs.readFileSync(path.join(root, 'lib/appVersion.js'), 'utf8');

    expect(manifest.semver).toBe(pkg.version);
    expect(manifest.display).toBe(`V.${pkg.version}`);
    expect(manifest.cacheVersion).toBe(`app-${pkg.version}-abc1234`);
    expect(sw).toContain(`const CACHE_VERSION = '${manifest.cacheVersion}';`);
    expect(lib).toContain(`APP_DISPLAY_VERSION = '${manifest.display}'`);
  });
});
