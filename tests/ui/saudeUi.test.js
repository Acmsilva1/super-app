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

  it('oferece um card de consumo de agua com checks em modal e historico diario', () => {
    expect(source).toContain('data-saude-action="open-water"');
    expect(source).toContain('data-saude-action="open-water-tracker"');
    expect(source).toContain('data-saude-action="toggle-water-dose"');
    expect(source).toContain('data-water-goal-form');
    expect(source).toContain('Histórico diário');
    expect(source).toContain('role="dialog" aria-modal="true"');
    expect(source).toContain('state.waterDate !== todayIsoDate()');
    expect(source).toContain('if (isLocalWaterStorageMode())');
    expect(source).toContain("if (method === 'POST') return saveLocalWaterGoal(payload)");
    expect(source).toContain('data-water-modal-backdrop');
    expect(source).toContain("event.target.matches('[data-water-modal-backdrop]')");
    expect(source).toContain('is-splash');
    expect(source).toContain('@keyframes saude-water-droplets');
    expect(source).toContain('@media (prefers-reduced-motion: reduce)');
    expect(source).toContain('const motion = globalThis.motion || globalThis.Motion');
    expect(source).toContain('syncWaterTrackerDom(container, state)');
    expect(source).toContain('motion.animate(button');
    expect(source).toContain('function showWaterCelebration(container, state)');
    expect(source).toContain('const completedNow = isMarking && realizado_doses === state.waterToday.meta_doses');
    expect(source).toContain('if (completedNow) showWaterCelebration(container, state)');
    expect(source).toContain('saude-water-confetti');
    expect(source).toContain("layer.setAttribute('aria-live', 'polite')");
  });

  it('atualiza o check de agua sem reconstruir o modal antes de persistir', () => {
    const start = source.indexOf("if (action === 'toggle-water-dose'");
    const persisted = source.indexOf("applyWaterData(state, await requestWater('PATCH'", start);
    const beforePersist = source.slice(start, persisted);
    expect(start).toBeGreaterThan(-1);
    expect(persisted).toBeGreaterThan(start);
    expect(beforePersist).not.toContain('renderWater(container, state)');
    expect(source.slice(persisted, source.indexOf("if (action === 'delete-measurement'", persisted))).toContain('syncWaterTrackerDom(container, state)');
  });

});
