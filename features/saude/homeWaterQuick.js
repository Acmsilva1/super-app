import {
  isLocalWaterStorageMode,
  loadLocalWater,
  migrateLocalWaterDataToHealthProfiles,
  saveLocalWaterGoal,
  updateLocalWaterProgress,
} from './service/consumoAguaLocalService.js';
import {
  refreshWaterVictoryPresentation,
  removeWaterCelebration,
  renderWaterDropHtml,
  stopWaterDropMotion,
  WATER_DROP_STYLES,
  waterIntakePercent,
} from './waterDropVisual.js?v=2026-09-26-water-drop-v14';

const STYLE_ID = 'home-water-quick-styles-v14';
const HOME_WATER_LAST_PROFILE_KEY = 'superapp:home-water-quick:last-profile-id';

function readLastProfileId() {
  try {
    const id = Number(localStorage.getItem(HOME_WATER_LAST_PROFILE_KEY));
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function writeLastProfileId(profileId) {
  try {
    if (profileId != null && profileId !== '') {
      localStorage.setItem(HOME_WATER_LAST_PROFILE_KEY, String(profileId));
    }
  } catch {
    /* storage indisponível */
  }
}

function resolveInitialProfileId(profiles) {
  if (!profiles.length) return null;
  const validIds = new Set(profiles.map((profile) => Number(profile.id)));
  const cached = readLastProfileId();
  if (cached != null && validIds.has(cached)) return cached;
  const saudeMeta = globalThis.superApp?.uiState?.checkpoint?.appMeta?.saude
    || globalThis.superApp?.uiState?.appMeta?.saude;
  const fromCheckpoint = Number(saudeMeta?.selectedProfileId);
  if (Number.isFinite(fromCheckpoint) && validIds.has(fromCheckpoint)) return fromCheckpoint;
  if (profiles.length === 1) return Number(profiles[0].id);
  return null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function ensureStyles() {
  document.querySelectorAll('[id^="home-water-quick-styles"]').forEach((node) => {
    if (node.id !== STYLE_ID) node.remove();
  });
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = `
    .home-water-quick-overlay { position: fixed; inset: 0; z-index: 1300; display: grid; place-items: end center; padding: max(.65rem, env(safe-area-inset-top)) .65rem max(.65rem, env(safe-area-inset-bottom)); background: rgba(2, 6, 23, .78); backdrop-filter: blur(5px); }
    @media (min-width: 520px) { .home-water-quick-overlay { place-items: center; padding: 1rem; } }
    .home-water-quick-modal { width: min(100%, 22rem); max-height: min(88dvh, 36rem); overflow: auto; padding: 1rem; border: 1px solid rgba(56, 189, 248, .35); border-radius: 1.1rem; background: radial-gradient(circle at 15% 0%, rgba(14, 165, 233, .12), transparent 15rem), #0f172a; color: #e5eef5; box-shadow: 0 24px 70px rgba(0, 0, 0, .55); font-family: Montserrat, Arial, sans-serif; }
    .home-water-quick-modal__header { display: flex; align-items: flex-start; justify-content: space-between; gap: .75rem; margin-bottom: .85rem; }
    .home-water-quick-modal__header h3 { margin: 0; font-size: 1.05rem; }
    .home-water-quick-modal__header p { margin: .25rem 0 0; color: #9fb0c3; font-size: .78rem; line-height: 1.4; }
    .home-water-quick-close { width: 2.4rem; height: 2.4rem; border: 1px solid #334155; border-radius: .65rem; background: #162238; color: #e5eef5; cursor: pointer; }
    .home-water-quick-field { display: grid; gap: .35rem; margin-bottom: .65rem; }
    .home-water-quick-field label { font-size: .72rem; font-weight: 700; color: #9fb0c3; }
    .home-water-quick-field input, .home-water-quick-field select { min-height: 2.65rem; padding: .6rem .75rem; border: 1px solid #334155; border-radius: .7rem; background: #0b1324; color: #e5eef5; font: inherit; }
    .home-water-quick-checks { display: grid; grid-template-columns: repeat(auto-fill, minmax(2.35rem, 1fr)); gap: .45rem; margin: .65rem 0 .25rem; }
    .home-water-quick-check { aspect-ratio: 1; min-height: 2.35rem; display: grid; place-items: center; border: 1px solid #334155; border-radius: .55rem; background: #0b1324; color: #718399; font-size: .72rem; cursor: pointer; transition: transform .15s ease, border-color .15s ease, background .15s ease; }
    ${WATER_DROP_STYLES}
    .home-water-quick-check[aria-pressed="true"] { border-color: #38bdf8; background: linear-gradient(135deg, #0369a1, #0ea5e9); color: #fff; }
    .home-water-quick-check:disabled { opacity: .5; cursor: not-allowed; }
    .home-water-quick-actions { display: flex; flex-wrap: wrap; gap: .5rem; justify-content: flex-end; margin-top: .75rem; }
    .home-water-quick-btn { min-height: 2.5rem; padding: .55rem .85rem; border: 1px solid #334155; border-radius: .7rem; background: #162238; color: #e5eef5; font: inherit; font-size: .82rem; font-weight: 700; cursor: pointer; }
    .home-water-quick-btn--primary { border-color: #38bdf8; background: linear-gradient(135deg, #0369a1, #0ea5e9); color: #fff; }
    .home-water-quick-btn--block { width: 100%; justify-content: center; }
    .home-water-quick-overlay { cursor: pointer; }
    .home-water-quick-modal { cursor: default; }
    .home-water-quick-notice { margin: 0 0 .75rem; padding: .65rem .75rem; border-radius: .65rem; font-size: .78rem; line-height: 1.45; }
    .home-water-quick-notice--error { border: 1px solid rgba(248, 113, 113, .45); background: rgba(127, 29, 29, .25); color: #fecaca; }
    .home-water-quick-notice--info { border: 1px solid rgba(56, 189, 248, .35); background: rgba(12, 42, 65, .45); color: #bae6fd; }
    .home-water-quick-status { font-size: .82rem; color: #67e8f9; font-weight: 700; margin-bottom: .35rem; }
  `;
}

async function requestWater(method, payload) {
  if (isLocalWaterStorageMode()) {
    if (method === 'GET') return loadLocalWater(undefined, undefined, payload?.profile_id);
    if (method === 'POST') return saveLocalWaterGoal(payload);
    if (method === 'PATCH') return updateLocalWaterProgress(payload);
    throw new Error('Operação local de consumo de água não suportada.');
  }
  const params = new URLSearchParams({ resource: 'consumo-agua' });
  if (method === 'GET' && payload?.profile_id) params.set('profile_id', String(payload.profile_id));
  if (method === 'GET') params.set('include_profiles', '0');
  const response = await fetch(`/api/saude?${params}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(payload && method !== 'GET' ? { body: JSON.stringify(payload) } : {}),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar o consumo de água.');
  return data;
}

async function loadHealthProfiles() {
  const response = await fetch('/api/saude?resource=perfis', { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os perfis de saúde.');
  const rows = Array.isArray(data.rows) ? data.rows : [];
  if (isLocalWaterStorageMode() && rows.length) migrateLocalWaterDataToHealthProfiles(rows);
  return rows;
}

function applyWaterState(state, data) {
  if (!data || typeof data !== 'object') return;
  if (Array.isArray(data.profiles)) state.profiles = data.profiles;
  if ('config' in data) state.config = data.config || null;
  if ('today' in data) {
    state.today = data.today ? { ...(state.today || {}), ...data.today } : null;
  }
}

function renderProfileField(state, { pickStep = false } = {}) {
  const selected = state.profileId != null ? String(state.profileId) : '';
  const placeholder = pickStep
    ? '<option value="">Selecione o perfil</option>'
    : '';
  return `<div class="home-water-quick-field">
    <label for="home-water-profile-select">${pickStep ? 'De quem é o consumo de água?' : 'Perfil'}</label>
    <select id="home-water-profile-select" ${pickStep ? 'data-home-water-pick' : 'data-home-water-profile'} required>
      ${placeholder}${state.profiles.map((p) => `<option value="${escapeHtml(p.id)}"${String(p.id) === selected ? ' selected' : ''}>${escapeHtml(p.nome)}</option>`).join('')}
    </select>
  </div>`;
}

function syncHomeWaterQuickDom(overlay, state, { animateFillFrom = null, enableChecks = true, skipWaterDrop = false } = {}) {
  if (!state.today) return Promise.resolve();
  const completed = state.today.realizado_doses >= state.today.meta_doses;
  overlay.querySelectorAll('[data-water-dose]').forEach((btn) => {
    const dose = Number(btn.dataset.waterDose);
    btn.setAttribute('aria-pressed', String(dose <= state.today.realizado_doses));
    if (enableChecks) {
      btn.disabled = false;
      btn.removeAttribute('disabled');
    }
  });
  const status = overlay.querySelector('[data-water-status]');
  if (status) {
    status.textContent = completed
      ? 'Meta do dia concluída!'
      : `${state.today.realizado_doses} de ${state.today.meta_doses} doses hoje`;
  }
  if (skipWaterDrop) return Promise.resolve();
  return refreshWaterVictoryPresentation(document.body, overlay, state.today, state.profileId, animateFillFrom != null ? { animateFillFrom } : {});
}

function renderChecks(state) {
  if (!state.today) return '';
  return Array.from({ length: state.today.meta_doses }, (_, index) => {
    const dose = index + 1;
    const checked = dose <= state.today.realizado_doses;
    return `<button type="button" class="home-water-quick-check" data-water-dose="${dose}" aria-pressed="${checked}" aria-label="Dose ${dose}${checked ? ', tomada' : ', pendente'}"${state.busy ? ' disabled' : ''}><i class="fas fa-check"></i></button>`;
  }).join('');
}

function renderModalBody(state, { launchSaude } = {}) {
  if (!state.profiles.length) {
    return `
      <p class="home-water-quick-notice home-water-quick-notice--info">Crie um perfil em Saúde para registrar água.</p>
      <div class="home-water-quick-actions">
        <button type="button" class="home-water-quick-btn" data-action="close">Fechar</button>
        ${typeof launchSaude === 'function' ? '<button type="button" class="home-water-quick-btn home-water-quick-btn--primary" data-action="open-saude">Abrir Saúde</button>' : ''}
      </div>`;
  }

  if (state.step === 'choose-profile') {
    return `
      ${state.error ? `<p class="home-water-quick-notice home-water-quick-notice--error" role="alert">${escapeHtml(state.error)}</p>` : ''}
      <p class="home-water-quick-notice home-water-quick-notice--info">Escolha o perfil de saúde antes de marcar as doses.</p>
      ${renderProfileField(state, { pickStep: true })}
      <div class="home-water-quick-actions">
        <button type="button" class="home-water-quick-btn" data-action="close">Cancelar</button>
        <button type="button" class="home-water-quick-btn home-water-quick-btn--primary" data-action="confirm-profile"${state.busy ? ' disabled' : ''}>Continuar</button>
      </div>`;
  }

  const profileSelect = renderProfileField(state);

  if (!state.config) {
    return `
      ${state.error ? `<p class="home-water-quick-notice home-water-quick-notice--error" role="alert">${escapeHtml(state.error)}</p>` : ''}
      ${profileSelect}
      <p class="home-water-quick-notice home-water-quick-notice--info">Defina uma meta diária de doses para este perfil.</p>
      <form data-home-water-goal-form>
        <div class="home-water-quick-field"><label for="home-water-name">Nome da meta</label><input id="home-water-name" name="nome" maxlength="80" required placeholder="Ex.: Garrafa 500 ml" value="${escapeHtml(state.goalDraft.nome)}"></div>
        <div class="home-water-quick-field"><label for="home-water-meta">Doses por dia</label><input id="home-water-meta" name="meta_doses" type="number" min="1" max="100" step="1" required value="${escapeHtml(state.goalDraft.meta_doses)}"></div>
        <div class="home-water-quick-actions">
          <button type="submit" class="home-water-quick-btn home-water-quick-btn--primary home-water-quick-btn--block"${state.busy ? ' disabled' : ''}>Salvar meta</button>
        </div>
      </form>`;
  }

  if (!state.today) {
    return `<p class="home-water-quick-notice home-water-quick-notice--error" role="alert">Não foi possível carregar o registro de hoje.</p>`;
  }

  const complete = state.today.realizado_doses >= state.today.meta_doses;
  const profileName = state.profiles.find((p) => Number(p.id) === Number(state.profileId))?.nome || 'Perfil';

  return `
    ${state.error ? `<p class="home-water-quick-notice home-water-quick-notice--error" role="alert">${escapeHtml(state.error)}</p>` : ''}
    ${profileSelect}
    <p class="home-water-quick-status" data-water-status>${complete ? 'Meta do dia concluída!' : `${state.today.realizado_doses} de ${state.today.meta_doses} doses hoje`}</p>
    <p style="margin:0;color:#9fb0c3;font-size:.76rem;">${escapeHtml(profileName)} · ${escapeHtml(state.config.nome)}</p>
    <div class="home-water-quick-checks" data-water-checks>${renderChecks(state)}</div>
    ${renderWaterDropHtml(state.today)}
    ${typeof launchSaude === 'function' ? `<div class="home-water-quick-actions"><button type="button" class="home-water-quick-btn home-water-quick-btn--block" data-action="open-saude">Detalhes em Saúde</button></div>` : ''}`;
}

function paintModal(modalRoot, state, options) {
  stopWaterDropMotion(modalRoot);
  const subtitle = state.step === 'choose-profile'
    ? 'Selecione para quem deseja registrar a água.'
    : 'Marque as doses que você tomou hoje.';
  modalRoot.innerHTML = `
    <div class="home-water-quick-modal" role="dialog" aria-modal="true" aria-labelledby="home-water-quick-title">
      <div class="home-water-quick-modal__header">
        <div>
          <h3 id="home-water-quick-title">Consumo de água</h3>
          <p>${subtitle}</p>
        </div>
        <button type="button" class="home-water-quick-close" data-action="close" aria-label="Fechar"><i class="fas fa-xmark"></i></button>
      </div>
      ${renderModalBody(state, options)}
    </div>`;
  if (state.step === 'active' && state.today) {
    requestAnimationFrame(() => {
      refreshWaterVictoryPresentation(document.body, modalRoot, state.today, state.profileId);
    });
  }
}

async function reloadWaterState(state) {
  if (state.profileId == null || state.profileId === '') {
    throw new Error('Selecione um perfil de saúde.');
  }
  state.error = null;
  const data = await requestWater('GET', { profile_id: state.profileId });
  applyWaterState(state, data);
}

export async function openHomeWaterQuickModal(options = {}) {
  ensureStyles();
  document.querySelector('.home-water-quick-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'home-water-quick-overlay';
  overlay.dataset.homeWaterQuickOverlay = '';
  document.body.appendChild(overlay);

  const state = {
    step: 'choose-profile',
    profiles: [],
    profileId: null,
    config: null,
    today: null,
    busy: false,
    waterPatchInFlight: false,
    error: null,
    goalDraft: { nome: 'Água', meta_doses: 8 },
  };

  const close = () => {
    removeWaterCelebration(overlay);
    removeWaterCelebration(document.body);
    overlay.remove();
  };

  const refresh = async () => {
    paintModal(overlay, state, options);
  };

  const openProfileTracker = async (profileId) => {
    const previousProfileId = state.profileId;
    if (String(previousProfileId) !== String(profileId)) {
      removeWaterCelebration(document.body);
      removeWaterCelebration(overlay);
    }
    state.profileId = profileId;
    state.busy = true;
    state.error = null;
    state.step = 'active';
    await refresh();
    try {
      await reloadWaterState(state);
      writeLastProfileId(state.profileId);
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Não foi possível carregar o consumo de água.';
      state.config = null;
      state.today = null;
      state.step = 'choose-profile';
      state.profileId = null;
    } finally {
      state.busy = false;
      await refresh();
      requestAnimationFrame(() => {
        refreshWaterVictoryPresentation(document.body, overlay, state.today, state.profileId);
      });
    }
  };

  const bootstrap = async () => {
    try {
      state.profiles = await loadHealthProfiles();
      const initialProfileId = resolveInitialProfileId(state.profiles);
      if (initialProfileId != null) {
        await openProfileTracker(initialProfileId);
        return;
      }
      state.step = 'choose-profile';
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Não foi possível carregar os perfis de saúde.';
    }
    await refresh();
  };

  const confirmProfileSelection = async (fromPickControl) => {
    const raw = fromPickControl?.value ?? overlay.querySelector('[data-home-water-pick]')?.value;
    const profileId = Number(raw);
    if (!Number.isFinite(profileId) || profileId <= 0) {
      state.error = 'Selecione um perfil para continuar.';
      await refresh();
      return;
    }
    await openProfileTracker(profileId);
  };

  overlay.addEventListener('click', async (event) => {
    if (!event.target.closest('.home-water-quick-modal')) {
      close();
      return;
    }
    const actionEl = event.target.closest('[data-action]');
    const action = actionEl?.dataset?.action;
    if (action === 'close') {
      close();
      return;
    }
    if (action === 'open-saude') {
      close();
      options.launchSaude?.();
      return;
    }
    if (action === 'confirm-profile') {
      await confirmProfileSelection(overlay.querySelector('[data-home-water-pick]'));
      return;
    }
    const doseBtn = event.target.closest('[data-water-dose]');
    if (doseBtn && state.step !== 'active') return;
    if (doseBtn && state.today && !state.waterPatchInFlight) {
      const dose = Number(doseBtn.dataset.waterDose);
      const isMarking = dose > state.today.realizado_doses;
      const realizado_doses = isMarking ? dose : dose - 1;
      const previous = state.today.realizado_doses;
      const fillFromPercent = waterIntakePercent({ ...state.today, realizado_doses: previous });
      const completedNow = isMarking && realizado_doses >= state.today.meta_doses;
      state.waterPatchInFlight = true;
      state.today = { ...state.today, realizado_doses };
      const fillDone = syncHomeWaterQuickDom(overlay, state, { animateFillFrom: fillFromPercent, enableChecks: true });
      try {
        const data = await requestWater('PATCH', { profile_id: state.profileId, realizado_doses });
        applyWaterState(state, data);
        writeLastProfileId(state.profileId);
        state.error = null;
        if (!completedNow) {
          refreshWaterVictoryPresentation(document.body, overlay, state.today, state.profileId);
        }
      } catch (error) {
        state.today = { ...state.today, realizado_doses: previous };
        state.error = error instanceof Error ? error.message : 'Não foi possível marcar a dose.';
        refreshWaterVictoryPresentation(document.body, overlay, state.today, state.profileId);
        removeWaterCelebration(document.body);
      } finally {
        state.waterPatchInFlight = false;
        syncHomeWaterQuickDom(overlay, state, { skipWaterDrop: true });
      }
      return;
    }

  });

  overlay.addEventListener('change', async (event) => {
    const pickSelect = event.target.closest('[data-home-water-pick]');
    if (pickSelect) {
      state.error = null;
      return;
    }
    const profileSelect = event.target.closest('[data-home-water-profile]');
    if (!profileSelect?.value || state.step !== 'active') return;
    await openProfileTracker(Number(profileSelect.value));
  });

  overlay.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-home-water-goal-form]');
    if (!form) return;
    event.preventDefault();
    if (state.busy || !form.reportValidity()) return;
    const values = new FormData(form);
    const fillBeforeGoalSave = state.today ? waterIntakePercent(state.today) : 0;
    state.busy = true;
    state.error = null;
    await refresh();
    try {
      const payload = {
        profile_id: state.profileId,
        nome: String(values.get('nome') || '').trim(),
        meta_doses: Number(values.get('meta_doses')),
      };
      const data = await requestWater('POST', payload);
      applyWaterState(state, data);
      writeLastProfileId(state.profileId);
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Não foi possível salvar a meta.';
    } finally {
      state.busy = false;
      await refresh();
      requestAnimationFrame(() => {
        refreshWaterVictoryPresentation(document.body, overlay, state.today, state.profileId, { animateFillFrom: fillBeforeGoalSave });
      });
    }
  });

  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  paintModal(overlay, state, options);
  await bootstrap();
}
