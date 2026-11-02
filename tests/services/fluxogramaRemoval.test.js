import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { APPS } from '../../api/apps.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('remoção isolada do módulo Fluxograma', () => {
  it('remove o módulo do catálogo sem alterar os demais módulos ativos', () => {
    const activeIds = APPS.filter((app) => app.status === 'active').map((app) => app.id);

    expect(activeIds).toEqual(['financeiro', 'lista_compras', 'saude']);
    expect(activeIds).not.toContain('fluxograma');
  });

  it('remove entrypoints exclusivos e preserva entrypoints independentes', () => {
    expect(fs.existsSync(path.join(root, 'api/fluxograma.js'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'api/fluxograma-export.js'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'features/fluxograma'))).toBe(false);

    for (const relativePath of [
      'api/financeiro.js',
      'api/lista-compras.js',
      'api/saude.js',
      'features/financeiro/index.js',
      'features/lista_compras/index.js',
      'features/saude/index.js',
    ]) {
      expect(fs.existsSync(path.join(root, relativePath)), relativePath).toBe(true);
    }
  });

  it('remove referências executáveis do shell, mock e permissões', () => {
    const runtimeSources = [
      read('index.html'),
      read('scripts/local-mock-api.js'),
      read('lib/adminUsuariosHandler.js'),
    ].join('\n');

    expect(runtimeSources).not.toMatch(/fluxograma|flowchart/i);
  });
});
