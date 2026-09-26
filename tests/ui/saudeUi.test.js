import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = fs.readFileSync(path.join(root, 'features/saude/index.js'), 'utf8');
const waterDropSource = fs.readFileSync(path.join(root, 'features/saude/waterDropVisual.js'), 'utf8');

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

  it('usa refeições estruturadas, modal de item e cards clicáveis em Dietas', () => {
    expect(source).toContain('DIET_MEALS');
    expect(source).toContain('data-saude-action="add-diet-item"');
    expect(source).toContain('data-diet-item-form');
    expect(source).toContain('Nome do alimento');
    expect(source).toContain('Quantidade');
    expect(source).toContain('Observação (opcional)');
    expect(source).not.toContain('id="diet-objetivo"');
    expect(source).not.toContain('id="diet-descricao"');
    expect(source).toContain('class="saude-diet-card" data-saude-action="view-diet"');
    expect(source).toContain('state.dietModal = \'detail\'');
    expect(source).toContain('data-saude-action="edit-diet"');
    expect(source).toContain('data-saude-action="delete-diet"');
    expect(source).not.toContain('name="dia_${number}_conteudo"');
  });

  it('substitui confirmações nativas por um alertdialog visual em todo o módulo', () => {
    expect(source).toContain('function requestSaudeConfirmation(');
    expect(source).toContain('role="alertdialog"');
    expect(source).toContain('data-saude-confirm="cancel"');
    expect(source).toContain('data-saude-confirm="accept"');
    expect(source).toContain("event.key === 'Escape'");
    expect(source).toContain("title: 'Excluir acompanhamento de água?'");
    expect(source).toContain("title: 'Excluir medição?'");
    expect(source).toContain("title: 'Remover alimento?'");
    expect(source).toContain("title: 'Excluir dieta?'");
    expect(source).toContain("title: 'Excluir item nutricional?'");
    expect(source).not.toMatch(/(?:globalThis\.)?confirm\s*\(/);
  });

  it('mostra uma confirmação visual de sucesso após concluir exclusões', () => {
    expect(source).toContain('function showSaudeSuccess(');
    expect(source).toContain("toast.setAttribute('role', 'status')");
    expect(source).toContain("toast.setAttribute('aria-live', 'polite')");
    expect(source).toContain('data-saude-success-toast');
    expect(source).toContain('Ação concluída');
    expect(source).toContain('Acompanhamento de água excluído com sucesso.');
    expect(source).toContain('Medição excluída com sucesso.');
    expect(source).toContain('Alimento removido da refeição.');
    expect(source).toContain('Dieta excluída com sucesso.');
    expect(source).toContain('Item da tabela nutricional excluído com sucesso.');
    expect(source).toContain('setTimeout(remove, 3600)');
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
    expect(source).toContain('Linha do tempo · Peso e IMC ·');
    expect(source).toContain('Linha do tempo · Água ·');
    expect(source).toContain('saude-profile-timeline--water');
    expect(source).toContain('calcularImc(profile.peso_kg, profile.altura_cm)');
    expect(source).toContain('.saude-profile-summary { grid-template-columns: 1fr 1fr;');
    expect(source).toContain('saude-profile-detail');
    expect(source).toContain('saude-page-toolbar--stack');
    expect(source).toContain('.saude-profile-form__grid { grid-template-columns: 1fr; }');
  });

  it('oferece um card de consumo de agua com checks em modal e historico diario', () => {
    expect(source).toContain('data-saude-action="open-water-tracker"');
    expect(source).toContain('data-saude-action="toggle-water-dose"');
    expect(source).toMatch(/from '\.\/waterDropVisual\.js(\?v=[^']+)?'/);
    expect(source).toContain('renderWaterDropHtml(state.waterToday)');
    expect(waterDropSource).toContain('data-water-drop-fill');
    expect(waterDropSource).toContain('saude-water-drop__bubble');
    expect(waterDropSource).toContain('saude-water-drop__shell');
    expect(waterDropSource).toContain('saude-water-drop__pool');
    expect(waterDropSource).toContain('animateFillFrom');
    expect(source).toContain('data-water-goal-form');
    expect(source).toContain('Histórico diário');
    expect(source).toContain('role="dialog" aria-modal="true"');
    expect(source).toContain('syncWaterWithHealthProfile(state, healthProfile)');
    expect(source).toContain('if (isLocalWaterStorageMode())');
    expect(source).toContain("if (method === 'POST') return saveLocalWaterGoal(payload)");
    expect(source).toContain('data-water-modal-backdrop');
    expect(source).toContain("event.target.matches('[data-water-modal-backdrop]')");
    expect(source).toContain('is-splash');
    expect(source).toContain('@keyframes saude-water-droplets');
    expect(source).toContain('@media (prefers-reduced-motion: reduce)');
    expect(source).toContain('const motion = globalThis.motion || globalThis.Motion');
    expect(source).toMatch(/syncWaterTrackerDom\(container, state/);
    expect(source).toContain('motion.animate(button');
    expect(source).toContain('function showWaterCelebration(container, state)');
    expect(source).toContain('const completedNow = isMarking && realizado_doses === state.waterToday.meta_doses');
    expect(source).toContain('showWaterCelebration(container, state)');
    expect(source).toContain('refreshWaterVictoryPresentation');
    expect(waterDropSource).toContain('saude-water-drop__success-flag');
    expect(waterDropSource).toContain('data-water-drop-success');
    expect(source).toContain('removeWaterCelebration');
    expect(source).toContain('profile_id: state.waterProfileId');
    expect(source).toContain("payload && method !== 'GET' && method !== 'HEAD'");
    expect(source).not.toContain('data-water-profile-form');
    expect(source).not.toContain('data-saude-action="open-water-profile"');
    expect(source).not.toContain("action: 'delete-profile'");
  });

  it('mantém checks e histórico no modal de água ligado ao perfil de saúde', () => {
    const modalStart = source.indexOf('function renderWaterModal(state)');
    const modalEnd = source.indexOf('function syncWaterTrackerDom(', modalStart);
    const modalSource = source.slice(modalStart, modalEnd);

    expect(modalSource).toContain('saude-water-checks');
    expect(modalSource).toContain('Histórico diário');
    expect(modalSource.indexOf('saude-water-checks')).toBeLessThan(modalSource.indexOf('Histórico diário'));
    expect(source).toContain('saude-water-card__open');
    expect(source).not.toContain('function renderWater(container, state)');
  });

  it('atualiza o check de agua sem reconstruir o modal antes de persistir', () => {
    const start = source.indexOf("if (action === 'toggle-water-dose'");
    const persisted = source.indexOf("applyWaterData(state, await requestWater('PATCH'", start);
    const beforePersist = source.slice(start, persisted);
    expect(start).toBeGreaterThan(-1);
    expect(persisted).toBeGreaterThan(start);
    expect(beforePersist).not.toContain('renderWater(container, state)');
    expect(beforePersist).toContain('state.waterToday = { ...state.waterToday, realizado_doses }');
    expect(beforePersist).toMatch(/syncWaterTrackerDom\(container, state/);
    expect(source.slice(persisted, source.indexOf("if (action === 'delete-measurement'", persisted))).toMatch(/syncWaterTrackerDom\(container, state/);
  });

  it('sincroniza água pelo id do perfil de saúde sem página separada de perfis de água', () => {
    expect(source).toContain("params.set('include_profiles', '0')");
    expect(source).toContain('preserve_profiles: true');
    expect(source).toContain("state.waterModal = state.waterConfig && state.waterToday ? 'tracker' : 'config'");
    expect(source).toContain("action === 'open-water' || (action === 'retry' && state.view === 'water')");
    expect(source).toContain("state.view = 'profiles'");
  });

  it('renderiza Minha Saúde na tela inicial e embute o card de Consumo de Água no painel do perfil', () => {
    expect(source).toContain('<h2 id="profiles-title">Minha Saúde</h2>');
    expect(source).toContain('data-saude-action="open-profile-detail"');
    expect(source).toContain('function renderProfileDetail(container, state)');
    expect(source).toContain('<h3 class="saude-section-title"><i class="fas fa-heart-pulse"></i> Hábitos & Cuidados</h3>');
    expect(source).toContain('data-saude-action="open-water-tracker"');
    expect(source).toContain('saude-profile-modules');
    expect(source).toContain('function renderProfileDietSection(profile, state)');
    expect(source).toContain('syncDietsForHealthProfile(state, healthProfile)');
    expect(source).toContain('data-saude-action="view-diet"');
    expect(source).toContain('renderDietForm(state)');
    expect(source).toContain('renderDietOverlay(state)');
    expect(source).toContain('formatarNumeroSaude(profile.peso_kg)');
    expect(source).toContain('formatarNumeroSaude(profile.altura_cm)');
    expect(source).toContain('formatarNumeroSaude(imc, 2)');
    expect(source).toContain('data-saude-action="delete-water-goal"');
    expect(source).toContain("action: 'delete-goal'");
    expect(source).not.toContain('> Editar meta</button>');
  });

  it('mantem o modal e o salvamento da meta de agua dentro do perfil ativo', () => {
    const actionStart = source.indexOf("if (action === 'create-water-goal' || action === 'edit-water-goal')");
    const actionEnd = source.indexOf("if (action === 'delete-water-goal'", actionStart);
    const submitStart = source.indexOf("const waterGoalForm = event.target.closest('[data-water-goal-form]')");
    const submitEnd = source.indexOf("const measurementForm =", submitStart);
    expect(source.slice(actionStart, actionEnd)).toContain('renderActiveSaudeView(container, state)');
    expect(source.slice(submitStart, submitEnd).match(/renderActiveSaudeView\(container, state\)/g)).toHaveLength(2);
  });

  it('ajusta o peso no cabecalho e exibe o grafico sem pedir a data', () => {
    expect(source).toContain('data-saude-action="adjust-weight"');
    expect(source).toContain('data-saude-weight-form');
    expect(source).toContain('function renderWeightTrend(profile)');
    expect(source).toContain('saude-weight-trend__chart');
    expect(source).toContain('saude-weight-trend__chart--mobile');
    expect(source).toContain('<details class="saude-weight-trend saude-weight-trend--panel">');
    expect(source).toContain('class="saude-weight-trend__viewport"');
    expect(source).toContain('calcularLarguraGraficoPeso(historyLength, { mobile: mobileChart })');
    expect(source).toContain('.saude-weight-trend__chart { width: 100%; height: auto;');
    expect(source).toContain('style="min-width:${chartWidth}px"');
    expect(source).not.toContain('id="profile-data-medicao"');
    expect(source).not.toContain('id="weight-data"');
    expect(source).toContain('data_medicao: state.profileDraft?.data_medicao || todayIsoDate()');
    expect(source).toContain("data_medicao: String(values.get('data_medicao') || '')");
  });

});
