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
  return { version: 2, nextProfileId: 1, selected_profile_id: null, profiles: [], goals: {}, days: [], linked_health_profiles: false };
}

function normalizeWaterProfileName(nome) {
  const key = String(nome || '').trim().toLowerCase();
  if (key === 'meu perfil') return 'perfil 1';
  return key;
}

function isLegacyWaterProfileId(id, healthIds) {
  const value = String(id || '');
  return value.startsWith('local-water-profile-') || !healthIds.has(value);
}

/**
 * Move metas e histórico do módulo antigo de água para o id do perfil de saúde (por nome).
 * Idempotente: roda uma vez por navegador (flag linked_health_profiles).
 */
export function migrateLocalWaterDataToHealthProfiles(healthProfiles, storage = globalThis.localStorage) {
  if (!storage || !Array.isArray(healthProfiles) || !healthProfiles.length) {
    return { migrated: false, mappings: [] };
  }
  const state = readState(storage);
  if (state.linked_health_profiles) return { migrated: false, mappings: [], already: true };

  const healthIds = new Set(healthProfiles.map((row) => String(row.id)));
  const healthByName = new Map(
    healthProfiles.map((row) => [normalizeWaterProfileName(row.nome), row]),
  );
  const legacyProfiles = state.profiles.filter((row) => isLegacyWaterProfileId(row.id, healthIds));
  const mappings = [];

  const resolveHealthTarget = (waterProfile) => {
    const byName = healthByName.get(normalizeWaterProfileName(waterProfile.nome));
    if (byName) return byName;
    if (legacyProfiles.length === 1 && healthProfiles.length === 1) return healthProfiles[0];
    return null;
  };

  for (const waterProfile of legacyProfiles) {
    const target = resolveHealthTarget(waterProfile);
    if (!target) continue;

    const oldId = String(waterProfile.id);
    const newId = String(target.id);
    if (oldId === newId) continue;

    const hasPayload = Boolean(state.goals[oldId]) || state.days.some((row) => String(row.profile_id) === oldId);
    if (!hasPayload) continue;

    mappings.push({ from: oldId, to: newId, nome: waterProfile.nome });

    if (state.goals[oldId] && !state.goals[newId]) state.goals[newId] = { ...state.goals[oldId] };
    delete state.goals[oldId];

    state.days.forEach((row) => {
      if (String(row.profile_id) !== oldId) return;
      const duplicate = state.days.find((other) => String(other.profile_id) === newId && other.data === row.data);
      if (duplicate) {
        duplicate.realizado_doses = Math.max(Number(duplicate.realizado_doses) || 0, Number(row.realizado_doses) || 0);
        duplicate.meta_doses = Math.max(Number(duplicate.meta_doses) || 0, Number(row.meta_doses) || 0);
        row._discard = true;
      } else {
        row.profile_id = newId;
        row.id = `local-water-${newId}-${row.data}`;
      }
    });
    state.days = state.days.filter((row) => !row._discard);

    state.profiles = state.profiles.filter((row) => String(row.id) !== oldId);
    if (!state.profiles.some((row) => String(row.id) === newId)) {
      state.profiles.push({ id: newId, nome: target.nome });
    } else {
      const linked = state.profiles.find((row) => String(row.id) === newId);
      if (linked) linked.nome = target.nome;
    }
  }

  for (const healthProfile of healthProfiles) {
    const id = String(healthProfile.id);
    if (!state.profiles.some((row) => String(row.id) === id)) {
      state.profiles.push({ id, nome: healthProfile.nome });
    }
  }

  state.linked_health_profiles = true;
  writeState(storage, state);
  return { migrated: mappings.length > 0, mappings };
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

function resolveProfile(state, profileId, createDefault = false, strict = false) {
  const requested = String(profileId || state.selected_profile_id || '').trim();
  let profile = requested
    ? state.profiles.find((row) => String(row.id) === requested) || null
    : null;
  if (!profile && !requested && createDefault) profile = ensureDefaultProfile(state);
  if (!profile && !strict && state.profiles.length) profile = state.profiles[0];
  if (profile) state.selected_profile_id = profile.id;
  return profile;
}

/** Vincula consumo de água ao id do perfil de saúde (master). */
export function ensureLocalWaterProfileLinkedToHealth(healthProfile, storage = globalThis.localStorage, { rename = true } = {}) {
  if (!storage || !healthProfile?.id) return null;
  const id = String(healthProfile.id);
  const nome = String(healthProfile.nome || 'Perfil').trim() || 'Perfil';
  const state = readState(storage);
  let profile = state.profiles.find((row) => String(row.id) === id) || null;
  if (!profile) {
    profile = { id, nome };
    state.profiles.push(profile);
  } else if (rename && profile.nome !== nome) {
    profile.nome = nome;
  }
  state.selected_profile_id = id;
  writeState(storage, state);
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

export function loadLocalWater(storage = globalThis.localStorage, now = new Date(), profileId = null, options = {}) {
  if (!storage) throw new Error('localStorage indisponível neste navegador.');
  const today = waterDateInSaoPaulo(now);
  const state = readState(storage);
  if (options.healthProfile) {
    ensureLocalWaterProfileLinkedToHealth(options.healthProfile, storage);
    profileId = String(options.healthProfile.id);
  }
  const strict = options.strict ?? Boolean(profileId);
  const profile = resolveProfile(state, profileId, options.createDefault ?? false, strict);
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

export function updateLocalWaterProfile(payload, storage = globalThis.localStorage, now = new Date()) {
  if (!storage) throw new Error('localStorage indisponível neste navegador.');
  const nome = normalizeProfileName(payload?.nome);
  const state = readState(storage);
  const profile = state.profiles.find((row) => String(row.id) === String(payload?.profile_id || ''));
  if (!profile) throw new Error('Perfil de água não encontrado.');
  profile.nome = nome;
  state.selected_profile_id = profile.id;
  writeState(storage, state);
  return responseFromState(state, waterDateInSaoPaulo(now), profile);
}

export function deleteLocalWaterProfile(payload, storage = globalThis.localStorage, now = new Date()) {
  if (!storage) throw new Error('localStorage indisponível neste navegador.');
  const state = readState(storage);
  const profileId = String(payload?.profile_id || '');
  const index = state.profiles.findIndex((row) => String(row.id) === profileId);
  if (index < 0) throw new Error('Perfil de água não encontrado.');
  state.profiles.splice(index, 1);
  delete state.goals[profileId];
  state.days = state.days.filter((row) => String(row.profile_id) !== profileId);
  const nextProfile = state.profiles[Math.min(index, state.profiles.length - 1)] || null;
  state.selected_profile_id = nextProfile?.id || null;
  if (nextProfile) ensureToday(state, waterDateInSaoPaulo(now), nextProfile);
  writeState(storage, state);
  return responseFromState(state, waterDateInSaoPaulo(now), nextProfile);
}

export function deleteLocalWaterGoal(payload, storage = globalThis.localStorage, now = new Date()) {
  if (!storage) throw new Error('localStorage indisponível neste navegador.');
  const profileId = String(payload?.profile_id || '').trim();
  if (!profileId) throw new Error('Perfil inválido.');
  const today = waterDateInSaoPaulo(now);
  const state = readState(storage);
  if (!state.profiles.some((row) => String(row.id) === profileId)) {
    throw new Error('Meta de água não encontrada.');
  }
  if (!state.goals[profileId]) throw new Error('Meta de água não encontrada.');
  delete state.goals[profileId];
  state.days = state.days.filter((row) => String(row.profile_id) !== profileId);
  writeState(storage, state);
  const profile = state.profiles.find((row) => String(row.id) === profileId) || null;
  return responseFromState(state, today, profile);
}

export function saveLocalWaterGoal(payload, storage = globalThis.localStorage, now = new Date()) {
  if (!storage) throw new Error('localStorage indisponível neste navegador.');
  const nome = String(payload?.nome || '').trim();
  const meta_doses = Number(payload?.meta_doses);
  if (!nome || nome.length > 80) throw new Error('Informe um nome de até 80 caracteres para a meta.');
  if (!Number.isInteger(meta_doses) || meta_doses < 1 || meta_doses > 100) throw new Error('A meta diária deve ter entre 1 e 100 doses.');

  const today = waterDateInSaoPaulo(now);
  if (payload?.profile_id) {
    ensureLocalWaterProfileLinkedToHealth(
      { id: payload.profile_id, nome: payload.health_profile_nome || 'Perfil' },
      storage,
      { rename: Boolean(payload.health_profile_nome) },
    );
  }
  const state = readState(storage);
  const profile = resolveProfile(state, payload?.profile_id, !payload?.profile_id, Boolean(payload?.profile_id));
  if (!profile) throw new Error('Perfil inválido.');
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
  const profile = resolveProfile(state, payload?.profile_id, false, Boolean(payload?.profile_id));
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
