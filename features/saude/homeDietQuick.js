import { countDietItems, normalizeDietMeals } from './service/dietasService.js';

const STYLE_ID = 'home-diet-quick-styles-v1';
export const HOME_DIET_LAST_PROFILE_KEY = 'superapp:home-diet-quick:last-profile-id';
export const HOME_DIET_LAST_DIET_KEY = 'superapp:home-diet-quick:last-diet-id';

export function readHomeDietLastProfileId(storage = globalThis.localStorage) {
  try {
    const id = Number(storage?.getItem(HOME_DIET_LAST_PROFILE_KEY));
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function writeHomeDietLastProfileId(profileId, storage = globalThis.localStorage) {
  try {
    const id = Number(profileId);
    if (Number.isFinite(id) && id > 0) storage?.setItem(HOME_DIET_LAST_PROFILE_KEY, String(id));
  } catch {
    /* localStorage indisponível */
  }
}

export function readHomeDietLastDietId(storage = globalThis.localStorage) {
  try {
    const id = Number(storage?.getItem(HOME_DIET_LAST_DIET_KEY));
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function writeHomeDietLastDietId(dietId, storage = globalThis.localStorage) {
  try {
    const id = Number(dietId);
    if (Number.isFinite(id) && id > 0) storage?.setItem(HOME_DIET_LAST_DIET_KEY, String(id));
  } catch {
    /* localStorage indisponível */
  }
}

function clearHomeDietLastDietId(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(HOME_DIET_LAST_DIET_KEY);
  } catch {
    /* localStorage indisponível */
  }
}

export function resolveHomeDietInitialProfileId(profiles, storage = globalThis.localStorage) {
  const validProfiles = Array.isArray(profiles) ? profiles : [];
  const cached = readHomeDietLastProfileId(storage);
  if (cached != null && validProfiles.some((profile) => Number(profile.id) === cached)) return cached;
  return validProfiles.length === 1 ? Number(validProfiles[0].id) : null;
}

export function resolveHomeDietInitialDietId(diets, storage = globalThis.localStorage) {
  const cached = readHomeDietLastDietId(storage);
  if (cached == null) return null;
  return (Array.isArray(diets) ? diets : []).some((diet) => Number(diet.id) === cached) ? cached : null;
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
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = `
    .home-diet-quick-overlay { position: fixed; inset: 0; z-index: 1300; display: grid; place-items: end center; padding: max(.65rem, env(safe-area-inset-top)) .65rem max(.65rem, env(safe-area-inset-bottom)); background: rgba(2, 6, 23, .78); backdrop-filter: blur(5px); cursor: pointer; }
    @media (min-width: 520px) { .home-diet-quick-overlay { place-items: center; padding: 1rem; } }
    .home-diet-quick-modal { width: min(100%, 36rem); max-height: min(90dvh, 48rem); overflow: auto; padding: 1rem; border: 1px solid rgba(74, 164, 85, .42); border-radius: 1.1rem; background: radial-gradient(circle at 15% 0%, rgba(50, 119, 70, .18), transparent 18rem), #0f172a; color: #e5eef5; box-shadow: 0 24px 70px rgba(0, 0, 0, .55); font-family: Montserrat, Arial, sans-serif; cursor: default; }
    .home-diet-quick-header { display: flex; align-items: flex-start; justify-content: space-between; gap: .75rem; margin-bottom: .85rem; }
    .home-diet-quick-header h3 { margin: 0; font-size: 1.05rem; }
    .home-diet-quick-header p { margin: .25rem 0 0; color: #9fb0c3; font-size: .78rem; line-height: 1.4; }
    .home-diet-quick-close { flex: 0 0 auto; width: 2.4rem; height: 2.4rem; border: 1px solid #334155; border-radius: .65rem; background: #162238; color: #e5eef5; cursor: pointer; }
    .home-diet-quick-field { display: grid; gap: .35rem; margin-bottom: .75rem; }
    .home-diet-quick-field label { font-size: .72rem; font-weight: 700; color: #9fb0c3; }
    .home-diet-quick-field select { min-height: 2.65rem; padding: .6rem .75rem; border: 1px solid #334155; border-radius: .7rem; background: #0b1324; color: #e5eef5; font: inherit; }
    .home-diet-quick-notice { margin: 0 0 .75rem; padding: .65rem .75rem; border: 1px solid rgba(149, 193, 31, .28); border-radius: .65rem; background: rgba(50, 119, 70, .16); color: #d9f5df; font-size: .78rem; line-height: 1.45; }
    .home-diet-quick-notice--error { border-color: rgba(248, 113, 113, .45); background: rgba(127, 29, 29, .25); color: #fecaca; }
    .home-diet-quick-actions { display: flex; flex-wrap: wrap; gap: .5rem; justify-content: flex-end; margin-top: .8rem; }
    .home-diet-quick-btn { min-height: 2.5rem; padding: .55rem .85rem; border: 1px solid #334155; border-radius: .7rem; background: #162238; color: #e5eef5; font: inherit; font-size: .82rem; font-weight: 700; cursor: pointer; }
    .home-diet-quick-btn--primary { border-color: #4aa455; background: linear-gradient(135deg, #275f3a, #4aa455); color: #fff; }
    .home-diet-quick-list { display: grid; gap: .65rem; }
    .home-diet-quick-card { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: .75rem; padding: .8rem .9rem; border: 1px solid rgba(74, 164, 85, .3); border-radius: .8rem; background: rgba(11, 19, 36, .82); color: #e5eef5; text-align: left; cursor: pointer; }
    .home-diet-quick-card strong { display: block; font-size: .9rem; }
    .home-diet-quick-card span { display: block; margin-top: .2rem; color: #a7cbb0; font-size: .72rem; }
    .home-diet-quick-meals { display: grid; gap: .7rem; }
    .home-diet-quick-meal { padding: .75rem; border: 1px solid rgba(148, 163, 184, .16); border-radius: .8rem; background: rgba(3, 7, 18, .35); }
    .home-diet-quick-meal h4 { margin: 0 0 .45rem; color: #d9f5df; font-size: .88rem; }
    .home-diet-quick-item { padding: .45rem 0; border-top: 1px solid rgba(148, 163, 184, .12); font-size: .82rem; }
    .home-diet-quick-item:first-of-type { border-top: 0; }
    .home-diet-quick-item p { margin: .18rem 0 0; color: #9fb0c3; font-size: .74rem; }
    .home-diet-quick-observation { margin: .8rem 0 0; color: #9fb0c3; font-size: .8rem; line-height: 1.5; white-space: pre-wrap; }
  `;
}

async function requestJson(url, fallbackMessage) {
  const response = await fetch(url, { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || fallbackMessage);
  return data;
}

async function loadProfiles() {
  const data = await requestJson('/api/saude?resource=perfis', 'Não foi possível carregar os perfis de saúde.');
  return Array.isArray(data.rows) ? data.rows : [];
}

async function loadDiets(profileId) {
  const data = await requestJson(`/api/saude?resource=dietas&profile_id=${encodeURIComponent(profileId)}`, 'Não foi possível carregar as dietas.');
  return Array.isArray(data.rows) ? data.rows : [];
}

function renderProfilePicker(state) {
  const selected = state.profileId == null ? '' : String(state.profileId);
  return `
    ${state.error ? `<p class="home-diet-quick-notice home-diet-quick-notice--error" role="alert">${escapeHtml(state.error)}</p>` : state.busy ? '<p class="home-diet-quick-notice" role="status"><i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Carregando...</p>' : '<p class="home-diet-quick-notice">Escolha o perfil para abrir suas dietas.</p>'}
    <div class="home-diet-quick-field">
      <label for="home-diet-profile-select">Qual perfil deseja consultar?</label>
      <select id="home-diet-profile-select" data-home-diet-profile required${state.busy ? ' disabled' : ''}>
        <option value="">Selecione o perfil</option>
        ${state.profiles.map((profile) => `<option value="${escapeHtml(profile.id)}"${String(profile.id) === selected ? ' selected' : ''}>${escapeHtml(profile.nome)}</option>`).join('')}
      </select>
    </div>
    <div class="home-diet-quick-actions">
      <button type="button" class="home-diet-quick-btn" data-action="close">Cancelar</button>
      <button type="button" class="home-diet-quick-btn home-diet-quick-btn--primary" data-action="confirm-profile"${state.busy ? ' disabled' : ''}>${state.busy ? 'Carregando...' : 'Abrir dieta'}</button>
    </div>`;
}

function renderDietList(state) {
  const profile = state.profiles.find((item) => Number(item.id) === Number(state.profileId));
  if (!state.diets.length) {
    return `
      <p class="home-diet-quick-notice">Nenhuma dieta cadastrada para ${escapeHtml(profile?.nome || 'este perfil')}.</p>
      <div class="home-diet-quick-actions">
        <button type="button" class="home-diet-quick-btn" data-action="change-profile">Trocar perfil</button>
        ${typeof state.launchSaude === 'function' ? '<button type="button" class="home-diet-quick-btn home-diet-quick-btn--primary" data-action="open-saude">Abrir Saúde</button>' : ''}
      </div>`;
  }
  return `
    <div class="home-diet-quick-field">
      <label for="home-diet-active-profile">Perfil</label>
      <select id="home-diet-active-profile" data-home-diet-active-profile>
        ${state.profiles.map((item) => `<option value="${escapeHtml(item.id)}"${Number(item.id) === Number(state.profileId) ? ' selected' : ''}>${escapeHtml(item.nome)}</option>`).join('')}
      </select>
    </div>
    <div class="home-diet-quick-list">
      ${state.diets.map((diet) => `<button type="button" class="home-diet-quick-card" data-diet-id="${escapeHtml(diet.id)}"><span><strong>${escapeHtml(diet.titulo)}</strong><span>${countDietItems(diet.refeicoes)} itens</span></span><i class="fas fa-chevron-right" aria-hidden="true"></i></button>`).join('')}
    </div>`;
}

function renderDietDetail(state) {
  const diet = state.diets.find((item) => Number(item.id) === Number(state.dietId));
  if (!diet) return '<p class="home-diet-quick-notice home-diet-quick-notice--error">A dieta selecionada não está disponível.</p>';
  const meals = normalizeDietMeals(diet.refeicoes).filter((meal) => meal.itens.length);
  const content = meals.length
    ? `<div class="home-diet-quick-meals">${meals.map((meal) => `<section class="home-diet-quick-meal"><h4>${escapeHtml(meal.titulo)}</h4>${meal.itens.map((item) => `<div class="home-diet-quick-item"><strong>${escapeHtml(item.nome)} — ${escapeHtml(item.quantidade)}</strong>${item.observacao ? `<p>${escapeHtml(item.observacao)}</p>` : ''}</div>`).join('')}</section>`).join('')}</div>`
    : '<p class="home-diet-quick-notice">Esta dieta ainda não possui alimentos cadastrados.</p>';
  return `${content}${diet.observacoes ? `<p class="home-diet-quick-observation"><strong>Observações:</strong><br>${escapeHtml(diet.observacoes)}</p>` : ''}<div class="home-diet-quick-actions">${state.diets.length > 1 ? '<button type="button" class="home-diet-quick-btn" data-action="back-to-diets">Outras dietas</button>' : '<button type="button" class="home-diet-quick-btn" data-action="change-profile">Trocar perfil</button>'}${typeof state.launchSaude === 'function' ? '<button type="button" class="home-diet-quick-btn home-diet-quick-btn--primary" data-action="open-saude">Editar em Saúde</button>' : ''}</div>`;
}

function paintModal(overlay, state) {
  const diet = state.diets.find((item) => Number(item.id) === Number(state.dietId));
  const title = state.step === 'detail' ? (diet?.titulo || 'Dieta') : 'Dietas';
  const subtitle = state.step === 'choose-profile'
    ? 'Selecione para quem deseja consultar o plano alimentar.'
    : `Plano alimentar de ${state.profiles.find((item) => Number(item.id) === Number(state.profileId))?.nome || 'perfil'}.`;
  const body = state.step === 'choose-profile'
    ? renderProfilePicker(state)
    : state.step === 'detail' ? renderDietDetail(state) : renderDietList(state);
  overlay.innerHTML = `<section class="home-diet-quick-modal" role="dialog" aria-modal="true" aria-labelledby="home-diet-quick-title"><div class="home-diet-quick-header"><div><h3 id="home-diet-quick-title">${escapeHtml(title)}</h3><p>${escapeHtml(subtitle)}</p></div><button type="button" class="home-diet-quick-close" data-action="close" aria-label="Fechar"><i class="fas fa-xmark"></i></button></div>${body}</section>`;
}

export async function openHomeDietQuickModal(options = {}) {
  ensureStyles();
  document.querySelector('.home-diet-quick-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'home-diet-quick-overlay';
  overlay.dataset.homeDietQuickOverlay = '';
  document.body.appendChild(overlay);

  const state = { step: 'choose-profile', profiles: [], profileId: null, diets: [], dietId: null, busy: false, error: null, launchSaude: options.launchSaude };
  const close = () => overlay.remove();

  const openProfile = async (profileId, { preferredDietId = null } = {}) => {
    state.busy = true;
    state.error = null;
    state.profileId = Number(profileId);
    writeHomeDietLastProfileId(state.profileId);
    paintModal(overlay, state);
    try {
      state.diets = await loadDiets(state.profileId);
      const preferredDiet = preferredDietId == null
        ? null
        : state.diets.find((diet) => Number(diet.id) === Number(preferredDietId));
      if (preferredDiet) {
        state.dietId = Number(preferredDiet.id);
        state.step = 'detail';
      } else if (state.diets.length === 1) {
        state.dietId = Number(state.diets[0].id);
        writeHomeDietLastDietId(state.dietId);
        state.step = 'detail';
      } else {
        if (preferredDietId != null) clearHomeDietLastDietId();
        state.dietId = null;
        state.step = 'diet-list';
      }
    } catch (error) {
      state.error = error instanceof Error ? error.message : 'Não foi possível carregar as dietas.';
      state.step = 'choose-profile';
    } finally {
      state.busy = false;
      paintModal(overlay, state);
    }
  };

  overlay.addEventListener('click', async (event) => {
    if (!event.target.closest('.home-diet-quick-modal')) return close();
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'close') return close();
    if (action === 'confirm-profile') {
      const profileId = Number(overlay.querySelector('[data-home-diet-profile]')?.value);
      if (!Number.isFinite(profileId) || profileId <= 0) {
        state.error = 'Selecione um perfil para continuar.';
        paintModal(overlay, state);
        return;
      }
      await openProfile(profileId);
      return;
    }
    if (action === 'change-profile') {
      state.step = 'choose-profile';
      state.error = null;
      paintModal(overlay, state);
      return;
    }
    if (action === 'back-to-diets') {
      state.step = 'diet-list';
      state.dietId = null;
      paintModal(overlay, state);
      return;
    }
    if (action === 'open-saude') {
      const intent = state.profileId != null
        ? { profileId: state.profileId, screen: 'hub' }
        : null;
      close();
      options.launchSaude?.(intent);
      return;
    }
    const dietButton = event.target.closest('[data-diet-id]');
    if (dietButton) {
      state.dietId = Number(dietButton.dataset.dietId);
      writeHomeDietLastDietId(state.dietId);
      state.step = 'detail';
      paintModal(overlay, state);
    }
  });

  overlay.addEventListener('change', async (event) => {
    const profileSelect = event.target.closest('[data-home-diet-active-profile]');
    if (profileSelect?.value) await openProfile(Number(profileSelect.value));
  });

  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  state.busy = true;
  paintModal(overlay, state);
  try {
    state.profiles = await loadProfiles();
    state.profileId = resolveHomeDietInitialProfileId(state.profiles);
    const lastDietId = readHomeDietLastDietId();
    if (state.profileId != null && lastDietId != null) {
      await openProfile(state.profileId, { preferredDietId: lastDietId });
    } else if (!state.profiles.length) {
      state.error = 'Crie um perfil em Saúde antes de consultar dietas.';
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : 'Não foi possível carregar os perfis de saúde.';
  } finally {
    state.busy = false;
  }
  paintModal(overlay, state);
}
