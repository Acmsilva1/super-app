export const WATER_LOCAL_STORAGE_KEY = 'superapp:saude:consumo-agua:v1';

export function waterDateInSaoPaulo(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

export function isLocalWaterStorageMode(location = globalThis.location) {
  const hostname = String(location?.hostname || '').toLowerCase();
  return location?.protocol === 'file:' || ['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname);
}

function blankState() {
  return { version: 2, nextProfileId: 1, selected_profile_id: null, profiles: [], goals: {}, days: [] };
}

function migrateState(parsed) {
  if (parsed?.version === 2 && Array.isArray(parsed.profiles) && Array.isArray(parsed.days)) return parsed;
  if (parsed?.version !== 1 || !Array.isArray(parsed.days)) return blankState();
  const state = blankState();
  if (!parsed.config) return state;
  const profile = { id: 'local-water-profile-1', nome: 'Meu perfil' };
  state.nextProfileId = 2;
  state.selected_profile_id = profile.id;
  state.profiles.push(profile);
  state.goals[profile.id] = { ...parsed.config };
  state.days = parsed.days.map((row) => ({ ...row, profile_id: profile.id }));
  return state;
}

function readState(storage) {
  try {
    return migrateState(JSON.parse(storage.getItem(WATER_LOCAL_STORAGE_KEY) || 'null'));
  } catch (_error) {
    return blankState();
  }
}

function writeState(storage, state) {
  storage.setItem(WATER_LOCAL_STORAGE_KEY, JSON.stringify(state));
}

function normalizeProfileName(value) {
  const nome = String(value || '').trim();
  if (!nome || nome.length > 80) throw new Error('Informe um nome de até 80 caracteres para o perfil.');
  return nome;
}

function ensureDefaultProfile(state) {
  if (state.profiles.length) return state.profiles[0];
  const profile = { id: `local-water-profile-${state.nextProfileId++}`, nome: 'Meu perfil' };
  state.profiles.push(profile);
  state.selected_profile_id = profile.id;
  return profile;
}

function resolveProfile(state, profileId, createDefault = false) {
  const requested = String(profileId || state.selected_profile_id || '').trim();
  let profile = state.profiles.find((row) => String(row.id) === requested) || null;
  if (!profile && createDefault) profile = ensureDefaultProfile(state);
  if (!profile && state.profiles.length) profile = state.profiles[0];
  if (profile) state.selected_profile_id = profile.id;
  return profile;
}

function responseFromState(state, today, profile) {
  const profileId = profile?.id || null;
  const todayRow = profileId
    ? state.days.find((row) => row.profile_id === profileId && row.data === today) || null
    : null;
  return {
    resource: 'consumo-agua',
    storage: 'localStorage',
    profiles: state.profiles.map((row) => ({ ...row })),
    profile_id: profileId,
    config: profileId && state.goals[profileId] ? { ...state.goals[profileId] } : null,
    today: todayRow ? { ...todayRow } : null,
    history: profileId ? state.days
      .filter((row) => row.profile_id === profileId && row.data < today)
      .sort((a, b) => b.data.localeCompare(a.data))
      .slice(0, 90)
      .map((row) => ({ ...row })) : [],
  };
}

function ensureToday(state, today, profile) {
  const config = profile ? state.goals[profile.id] : null;
  if (!profile || !config) return false;
  if (state.days.some((row) => row.profile_id === profile.id && row.data === today)) return false;
  state.days.push({
    id: `local-water-${profile.id}-${today}`,
    profile_id: profile.id,
    data: today,
    meta_doses: config.meta_doses,
    realizado_doses: 0,
  });
  state.days = state.days.sort((a, b) => b.data.localeCompare(a.data)).slice(0, 1000);
  return true;
}

export function loadLocalWater(storage = globalThis.localStorage, now = new Date(), profileId = null) {
  if (!storage) throw new Error('localStorage indisponível neste navegador.');
  const today = waterDateInSaoPaulo(now);
  const state = readState(storage);
  const profile = resolveProfile(state, profileId);
  if (ensureToday(state, today, profile)) writeState(storage, state);
  return responseFromState(state, today, profile);
}

export function createLocalWaterProfile(payload, storage = globalThis.localStorage, now = new Date()) {
  if (!storage) throw new Error('localStorage indisponível neste navegador.');
  const nome = normalizeProfileName(payload?.nome);
  const state = readState(storage);
  const profile = { id: `local-water-profile-${state.nextProfileId++}`, nome };
  state.profiles.push(profile);
  state.selected_profile_id = profile.id;
  writeState(storage, state);
  return responseFromState(state, waterDateInSaoPaulo(now), profile);
}

export function saveLocalWaterGoal(payload, storage = globalThis.localStorage, now = new Date()) {
  if (!storage) throw new Error('localStorage indisponível neste navegador.');
  const nome = String(payload?.nome || '').trim();
  const meta_doses = Number(payload?.meta_doses);
  if (!nome || nome.length > 80) throw new Error('Informe um nome de até 80 caracteres para a meta.');
  if (!Number.isInteger(meta_doses) || meta_doses < 1 || meta_doses > 100) throw new Error('A meta diária deve ter entre 1 e 100 doses.');

  const today = waterDateInSaoPaulo(now);
  const state = readState(storage);
  const profile = resolveProfile(state, payload?.profile_id, true);
  const todayRow = state.days.find((row) => row.profile_id === profile.id && row.data === today);
  if (todayRow && todayRow.realizado_doses > meta_doses) {
    throw new Error('A meta não pode ser menor que a quantidade já realizada hoje.');
  }
  state.goals[profile.id] = { nome, meta_doses };
  if (todayRow) todayRow.meta_doses = meta_doses;
  else ensureToday(state, today, profile);
  writeState(storage, state);
  return responseFromState(state, today, profile);
}

export function updateLocalWaterProgress(payload, storage = globalThis.localStorage, now = new Date()) {
  if (!storage) throw new Error('localStorage indisponível neste navegador.');
  const today = waterDateInSaoPaulo(now);
  const state = readState(storage);
  const profile = resolveProfile(state, payload?.profile_id);
  if (!profile || !state.goals[profile.id]) throw new Error('Crie uma meta de água antes de registrar o consumo.');
  if (ensureToday(state, today, profile)) writeState(storage, state);
  const todayRow = state.days.find((row) => row.profile_id === profile.id && row.data === today);
  const realizado = Number(payload?.realizado_doses);
  if (!Number.isInteger(realizado) || realizado < 0 || realizado > todayRow.meta_doses) {
    throw new Error('A quantidade realizada deve ficar entre zero e a meta do dia.');
  }
  todayRow.realizado_doses = realizado;
  writeState(storage, state);
  return responseFromState(state, today, profile);
}
