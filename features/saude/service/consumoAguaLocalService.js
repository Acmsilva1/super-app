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

function readState(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(WATER_LOCAL_STORAGE_KEY) || 'null');
    if (parsed?.version === 1 && Array.isArray(parsed.days)) return parsed;
  } catch (_error) {
    // Conteudo invalido e substituido por um estado local limpo.
  }
  return { version: 1, config: null, days: [] };
}

function writeState(storage, state) {
  storage.setItem(WATER_LOCAL_STORAGE_KEY, JSON.stringify(state));
}

function responseFromState(state, today) {
  const todayRow = state.days.find((row) => row.data === today) || null;
  return {
    resource: 'consumo-agua',
    storage: 'localStorage',
    config: state.config ? { ...state.config } : null,
    today: todayRow ? { ...todayRow } : null,
    history: state.days
      .filter((row) => row.data < today)
      .sort((a, b) => b.data.localeCompare(a.data))
      .slice(0, 90)
      .map((row) => ({ ...row })),
  };
}

function ensureToday(state, today) {
  if (!state.config) return false;
  if (state.days.some((row) => row.data === today)) return false;
  state.days.push({
    id: `local-water-${today}`,
    data: today,
    meta_doses: state.config.meta_doses,
    realizado_doses: 0,
  });
  state.days = state.days.sort((a, b) => b.data.localeCompare(a.data)).slice(0, 365);
  return true;
}

export function loadLocalWater(storage = globalThis.localStorage, now = new Date()) {
  if (!storage) throw new Error('localStorage indisponível neste navegador.');
  const today = waterDateInSaoPaulo(now);
  const state = readState(storage);
  if (ensureToday(state, today)) writeState(storage, state);
  return responseFromState(state, today);
}

export function saveLocalWaterGoal(payload, storage = globalThis.localStorage, now = new Date()) {
  if (!storage) throw new Error('localStorage indisponível neste navegador.');
  const nome = String(payload?.nome || '').trim();
  const meta_doses = Number(payload?.meta_doses);
  if (!nome || nome.length > 80) throw new Error('Informe um nome de até 80 caracteres para a meta.');
  if (!Number.isInteger(meta_doses) || meta_doses < 1 || meta_doses > 100) throw new Error('A meta diária deve ter entre 1 e 100 doses.');

  const today = waterDateInSaoPaulo(now);
  const state = readState(storage);
  const todayRow = state.days.find((row) => row.data === today);
  if (todayRow && todayRow.realizado_doses > meta_doses) {
    throw new Error('A meta não pode ser menor que a quantidade já realizada hoje.');
  }
  state.config = { nome, meta_doses };
  if (todayRow) todayRow.meta_doses = meta_doses;
  else ensureToday(state, today);
  writeState(storage, state);
  return responseFromState(state, today);
}

export function updateLocalWaterProgress(payload, storage = globalThis.localStorage, now = new Date()) {
  if (!storage) throw new Error('localStorage indisponível neste navegador.');
  const today = waterDateInSaoPaulo(now);
  const state = readState(storage);
  if (!state.config) throw new Error('Crie uma meta de água antes de registrar o consumo.');
  if (ensureToday(state, today)) writeState(storage, state);
  const todayRow = state.days.find((row) => row.data === today);
  const realizado = Number(payload?.realizado_doses);
  if (!Number.isInteger(realizado) || realizado < 0 || realizado > todayRow.meta_doses) {
    throw new Error('A quantidade realizada deve ficar entre zero e a meta do dia.');
  }
  todayRow.realizado_doses = realizado;
  writeState(storage, state);
  return responseFromState(state, today);
}
