import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const tests = [
  'tests/services/securityScope.test.js',
  'tests/services/authSecurity.test.js',
  'tests/services/authAuthorization.runtime.test.js',
  'tests/api/saudeAdminCrud.api.test.js',
  'tests/services/saudeTreinosHandler.test.js',
  'tests/api/privacy.api.test.js',
  'tests/services/privacyClient.test.js',
  'tests/database/privacyDeletion.runtime.test.js',
];
const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--maxWorkers', '2', ...new Set(tests)], {
  cwd: root, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test', OFFLINE_DEV: 'true' },
});
if (result.error) { console.error('Não foi possível executar a auditoria de autorização:', result.error.message); }
process.exitCode = result.status ?? 1;
