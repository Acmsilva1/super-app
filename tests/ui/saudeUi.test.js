import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'features/saude/index.js'), 'utf8');

describe('UI mobile do módulo Saúde', () => {
  it('isola a paginação do menu nav global no mobile', () => {
    expect(source).toContain('<div class="saude-pagination" role="navigation"');
    expect(source).not.toContain('<nav class="saude-pagination"');
    expect(source).toContain('data-saude-page="${page}"');
  });

  it('mantém lista mobile sem rolagem horizontal', () => {
    expect(source).toContain('@media (max-width: 760px)');
    expect(source).toContain('.saude-table-wrap { width: 100%; overflow: hidden;');
    expect(source).toContain('.saude-table tr { display: grid;');
  });

  it('oferece perfis familiares com formulario, IMC e linha do tempo responsiva', () => {
    expect(source).toContain('data-saude-action="open-profiles"');
    expect(source).toContain('data-saude-profile-form');
    expect(source).toContain('name="data_medicao"');
    expect(source).toContain('Data da medição');
    expect(source).toContain("data_medicao: String(values.get('data_medicao') || '')");
    expect(source).toContain('state.profileDraft = { ...blankProfileDraft(), ...profile }');
    expect(source).toContain('data-saude-action="edit-measurement"');
    expect(source).toContain('data-saude-action="delete-measurement"');
    expect(source).toContain('Esta ação não poderá ser desfeita.');
    expect(source).toContain('Linha do tempo');
    expect(source).toContain('calcularImc(profile.peso_kg, profile.altura_cm)');
    expect(source).toContain('.saude-profile-summary { grid-template-columns: 1fr 1fr; }');
    expect(source).toContain('.saude-profile-form__grid { grid-template-columns: 1fr; }');
  });

});
