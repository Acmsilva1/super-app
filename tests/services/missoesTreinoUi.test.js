import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sameEntityId } from '../../features/missoes_treino/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'features/missoes_treino/index.js'), 'utf8');

describe('interacoes da UI de missoes de treino', () => {
  it('trata IDs numericos do Supabase e IDs textuais do dataset como o mesmo registro', () => {
    expect(sameEntityId(42, '42')).toBe(true);
    expect(sameEntityId('demo-1', 'demo-1')).toBe(true);
    expect(sameEntityId(42, '43')).toBe(false);
  });

  it('aproveita o exercicio preenchido ao criar sem exigir clique previo em Adicionar', () => {
    expect(source).toContain('if (!this.tempMissions.length) this.addTempItem();');
    expect(source).toContain('Preencha um exercício, séries e repetições antes de criar a missão.');
  });
});
