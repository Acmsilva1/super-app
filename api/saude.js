import { requireUser } from '../lib/auth.js';
import { TABELAS_NUTRICIONAIS } from '../features/saude/data/tabelasNutricionais.js';
import { DIETAS_INICIAIS } from '../features/saude/data/dietas.js';
import { opcoesTabelaNutricional } from '../features/saude/service/tabelaNutricionalService.js';
import { calcularImc } from '../features/saude/service/perfilSaudeService.js';

const TABELA_NUTRICIONAL = 'tb_saude_tabela_nutricional';
const RESOURCE_TABELA_NUTRICIONAL = 'tabelas-nutricionais';
const TABELA_DIETAS = 'tb_saude_dietas';
const RESOURCE_DIETAS = 'dietas';
const TABELA_PERFIS = 'tb_saude_perfis';
const TABELA_PERFIL_MEDIDAS = 'tb_saude_perfil_medidas';
const RESOURCE_PERFIS = 'perfis';
const RESOURCE_PERFIL_MEDIDAS = 'perfil-medidas';
const TABELA_AGUA_METAS = 'tb_saude_agua_metas';
const TABELA_AGUA_LOGS = 'tb_saude_agua_logs';
const RESOURCE_CONSUMO_AGUA = 'consumo-agua';
let offlineNutritionRows = bundledNutritionRows();
let offlineDiets = DIETAS_INICIAIS.map((diet) => structuredClone(diet));
let offlineProfiles = [];
let offlineProfileMeasurements = [];
const offlineWaterGoals = new Map();
let offlineWaterLogs = [];

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

function isMissingTableError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01'
    || code === 'PGRST205'
    || message.includes('does not exist')
    || message.includes('schema cache');
}

function bundledNutritionRows() {
  return TABELAS_NUTRICIONAIS.map((row) => ({ ...row }));
}

function isOfflineMode() {
  return process.env.NODE_ENV === 'test' || process.env.OFFLINE_DEV === 'true';
}

function readBody(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try {
    return JSON.parse(req.body || '{}');
  } catch {
    return null;
  }
}

function validateNutritionPayload(body) {
  const categoria = String(body?.categoria || '').trim();
  const item = String(body?.item || '').trim();
  const porcao = String(body?.porcao ?? body?.porcao_equivalente ?? '').trim();

  if (!categoria || !item || !porcao) {
    return { error: 'Nome do item, tipo da tabela e quantidade da porcao sao obrigatorios.' };
  }
  if (categoria.length > 80) return { error: 'Tipo da tabela deve ter no maximo 80 caracteres.' };
  if (item.length > 200) return { error: 'Nome do item deve ter no maximo 200 caracteres.' };
  if (porcao.length > 2000) return { error: 'Quantidade da porcao deve ter no maximo 2000 caracteres.' };

  return { data: { categoria, item, porcao } };
}

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function validateWaterGoalPayload(body) {
  const nome = String(body?.nome || '').trim();
  const meta_doses = Number(body?.meta_doses);
  if (!nome || nome.length > 80) return { error: 'Informe um nome de ate 80 caracteres para a meta.' };
  if (!Number.isInteger(meta_doses) || meta_doses < 1 || meta_doses > 100) {
    return { error: 'A meta diaria deve ter entre 1 e 100 doses.' };
  }
  return { data: { nome, meta_doses } };
}

function validateWaterProgressPayload(body) {
  const realizado_doses = Number(body?.realizado_doses);
  if (!Number.isInteger(realizado_doses) || realizado_doses < 0 || realizado_doses > 100) {
    return { error: 'A quantidade realizada deve estar entre 0 e 100 doses.' };
  }
  return { data: { realizado_doses } };
}

function dateInSaoPaulo(value) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

function validateDietPayload(body) {
  const titulo = String(body?.titulo || '').trim();
  const objetivo = String(body?.objetivo || '').trim();
  const descricao = String(body?.descricao || '').trim();
  const orientacoes_gerais = String(body?.orientacoes_gerais || '').trim();
  const ritual_diario = String(body?.ritual_diario || '').trim();
  const observacoes = String(body?.observacoes || '').trim();
  const duracao_dias = Number(body?.duracao_dias);
  const dias = Array.isArray(body?.dias) ? body.dias : [];

  if (!titulo || !objetivo || !Number.isInteger(duracao_dias) || duracao_dias < 1 || duracao_dias > 31) {
    return { error: 'Titulo, objetivo e duracao entre 1 e 31 dias sao obrigatorios.' };
  }
  if (titulo.length > 160 || objetivo.length > 120 || descricao.length > 2000 || orientacoes_gerais.length > 12000 || ritual_diario.length > 12000 || observacoes.length > 4000) {
    return { error: 'Um ou mais campos ultrapassam o limite permitido.' };
  }
  if (dias.length !== duracao_dias) return { error: 'O plano deve conter exatamente um registro para cada dia.' };

  const normalizedDays = [];
  for (let index = 0; index < dias.length; index += 1) {
    const day = dias[index] || {};
    const tituloDia = String(day.titulo || '').trim();
    const carboidrato = String(day.carboidrato || '').trim();
    const conteudo = String(day.conteudo || '').trim();
    const jejum_horas = Number(day.jejum_horas);
    const quantidade_refeicoes = Number(day.quantidade_refeicoes);
    if (!tituloDia || !conteudo || !Number.isInteger(jejum_horas) || jejum_horas < 0 || jejum_horas > 24 || !Number.isInteger(quantidade_refeicoes) || quantidade_refeicoes < 1 || quantidade_refeicoes > 12) {
      return { error: `Dados invalidos no dia ${index + 1}.` };
    }
    normalizedDays.push({ numero: index + 1, titulo: tituloDia.slice(0, 160), jejum_horas, quantidade_refeicoes, carboidrato: carboidrato.slice(0, 1000), conteudo: conteudo.slice(0, 12000) });
  }

  return { data: { titulo, objetivo, duracao_dias, descricao, orientacoes_gerais, ritual_diario, dias: normalizedDays, observacoes } };
}

const PROFILE_MEASURE_FIELDS = ['peso_kg', 'altura_cm', 'cintura_cm', 'quadril_cm', 'peito_cm', 'braco_cm', 'coxa_cm'];

function parseDecimal(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function validateProfilePayload(body) {
  const nome = String(body?.nome || '').trim();
  const sexo = String(body?.sexo || '').trim();
  const data_nascimento = String(body?.data_nascimento || '').trim();
  const data_medicao = String(body?.data_medicao || '').trim();
  const allowedSex = new Set(['feminino', 'masculino', 'outro', 'nao_informado']);
  const birthDate = /^\d{4}-\d{2}-\d{2}$/.test(data_nascimento) ? new Date(`${data_nascimento}T12:00:00Z`) : null;
  const measurementDate = /^\d{4}-\d{2}-\d{2}$/.test(data_medicao) ? new Date(`${data_medicao}T12:00:00Z`) : null;
  const today = new Date();

  if (!nome || nome.length > 120) return { error: 'Nome deve ter entre 1 e 120 caracteres.' };
  if (!allowedSex.has(sexo)) return { error: 'Sexo invalido.' };
  if (!birthDate || Number.isNaN(birthDate.getTime()) || birthDate.toISOString().slice(0, 10) !== data_nascimento || birthDate > today || birthDate.getUTCFullYear() < 1900) {
    return { error: 'Data de nascimento invalida.' };
  }
  if (!measurementDate || Number.isNaN(measurementDate.getTime()) || measurementDate.toISOString().slice(0, 10) !== data_medicao) {
    return { error: 'Data da medicao invalida.' };
  }

  const data = { nome, sexo, data_nascimento, data_medicao };
  for (const field of PROFILE_MEASURE_FIELDS) data[field] = parseDecimal(body?.[field]);
  if (!Number.isFinite(data.peso_kg) || data.peso_kg < 1 || data.peso_kg > 500) return { error: 'Peso deve estar entre 1 e 500 kg.' };
  if (!Number.isFinite(data.altura_cm) || data.altura_cm < 30 || data.altura_cm > 260) return { error: 'Altura deve estar entre 30 e 260 cm.' };
  const limits = { cintura_cm: [10, 400], quadril_cm: [10, 400], peito_cm: [10, 400], braco_cm: [5, 200], coxa_cm: [5, 250] };
  for (const [field, [min, max]] of Object.entries(limits)) {
    if (data[field] !== null && (!Number.isFinite(data[field]) || data[field] < min || data[field] > max)) {
      return { error: 'Uma ou mais medidas corporais sao invalidas.' };
    }
  }
  return { data };
}

function validateProfileMeasurementPayload(body) {
  const data_medicao = String(body?.data_medicao || '').trim();
  const measurementDate = /^\d{4}-\d{2}-\d{2}$/.test(data_medicao) ? new Date(`${data_medicao}T12:00:00Z`) : null;
  if (!measurementDate || Number.isNaN(measurementDate.getTime()) || measurementDate.toISOString().slice(0, 10) !== data_medicao) {
    return { error: 'Data da medicao invalida.' };
  }

  const data = { data_medicao };
  for (const field of PROFILE_MEASURE_FIELDS) data[field] = parseDecimal(body?.[field]);
  if (!Number.isFinite(data.peso_kg) || data.peso_kg < 1 || data.peso_kg > 500) return { error: 'Peso deve estar entre 1 e 500 kg.' };
  if (!Number.isFinite(data.altura_cm) || data.altura_cm < 30 || data.altura_cm > 260) return { error: 'Altura deve estar entre 30 e 260 cm.' };
  const limits = { cintura_cm: [10, 400], quadril_cm: [10, 400], peito_cm: [10, 400], braco_cm: [5, 200], coxa_cm: [5, 250] };
  for (const [field, [min, max]] of Object.entries(limits)) {
    if (data[field] !== null && (!Number.isFinite(data[field]) || data[field] < min || data[field] > max)) {
      return { error: 'Uma ou mais medidas corporais sao invalidas.' };
    }
  }
  return { data };
}

function profileMeasurement(profile, id, timestamp = new Date().toISOString()) {
  return {
    id,
    perfil_id: profile.id,
    ...Object.fromEntries(PROFILE_MEASURE_FIELDS.map((field) => [field, profile[field]])),
    imc: calcularImc(profile.peso_kg, profile.altura_cm),
    registrado_em: timestamp,
  };
}

function withProfileHistory(profiles, measurements) {
  return profiles.map((profile) => ({
    ...profile,
    imc: calcularImc(profile.peso_kg, profile.altura_cm),
    historico: measurements.filter((row) => Number(row.perfil_id) === Number(profile.id)),
  }));
}

function waterResult(config, today, history, storage) {
  return {
    resource: RESOURCE_CONSUMO_AGUA,
    storage,
    config: config ? { nome: config.nome, meta_doses: Number(config.meta_doses) } : null,
    today: today ? {
      id: today.id,
      data: today.data_local,
      meta_doses: Number(today.meta_doses),
      realizado_doses: Number(today.realizado_doses),
    } : null,
    history: (history || []).map((row) => ({
      id: row.id,
      data: row.data_local,
      meta_doses: Number(row.meta_doses),
      realizado_doses: Number(row.realizado_doses),
    })),
  };
}

async function loadWater(userId) {
  const today = dateInSaoPaulo(new Date());
  if (isOfflineMode()) {
    const config = offlineWaterGoals.get(userId) || null;
    if (!config) return waterResult(null, null, [], 'memory');
    let todayRow = offlineWaterLogs.find((row) => row.created_by === userId && row.data_local === today);
    if (!todayRow) {
      todayRow = {
        id: Math.max(0, ...offlineWaterLogs.map((row) => Number(row.id) || 0)) + 1,
        created_by: userId,
        data_local: today,
        meta_doses: config.meta_doses,
        realizado_doses: 0,
      };
      offlineWaterLogs.push(todayRow);
    }
    const history = offlineWaterLogs
      .filter((row) => row.created_by === userId && row.data_local < today)
      .sort((a, b) => b.data_local.localeCompare(a.data_local))
      .slice(0, 90);
    return waterResult(config, todayRow, history, 'memory');
  }

  const { supabase } = await import('../lib/supabase.js');
  const { data: config, error: configError } = await supabase.from(TABELA_AGUA_METAS)
    .select('nome,meta_doses').eq('created_by', userId).maybeSingle();
  if (configError) return { error: configError };
  if (!config) return waterResult(null, null, [], 'supabase');

  const { error: ensureError } = await supabase.from(TABELA_AGUA_LOGS).upsert({
    created_by: userId,
    data_local: today,
    meta_doses: config.meta_doses,
    realizado_doses: 0,
  }, { onConflict: 'created_by,data_local', ignoreDuplicates: true });
  if (ensureError) return { error: ensureError };

  const { data: todayRow, error: todayError } = await supabase.from(TABELA_AGUA_LOGS)
    .select('id,data_local,meta_doses,realizado_doses')
    .eq('created_by', userId).eq('data_local', today).single();
  if (todayError) return { error: todayError };

  const { data: history, error: historyError } = await supabase.from(TABELA_AGUA_LOGS)
    .select('id,data_local,meta_doses,realizado_doses')
    .eq('created_by', userId).lt('data_local', today)
    .order('data_local', { ascending: false }).limit(90);
  return historyError ? { error: historyError } : waterResult(config, todayRow, history, 'supabase');
}

async function saveWaterGoal(payload, userId) {
  const today = dateInSaoPaulo(new Date());
  if (isOfflineMode()) {
    const todayRow = offlineWaterLogs.find((row) => row.created_by === userId && row.data_local === today);
    if (todayRow && todayRow.realizado_doses > payload.meta_doses) return { conflict: true };
    offlineWaterGoals.set(userId, { ...payload });
    if (todayRow) todayRow.meta_doses = payload.meta_doses;
    return loadWater(userId);
  }

  const { supabase } = await import('../lib/supabase.js');
  const { data: current, error: currentError } = await supabase.from(TABELA_AGUA_LOGS)
    .select('id,realizado_doses').eq('created_by', userId).eq('data_local', today).maybeSingle();
  if (currentError) return { error: currentError };
  if (current && Number(current.realizado_doses) > payload.meta_doses) return { conflict: true };

  const { error: goalError } = await supabase.from(TABELA_AGUA_METAS)
    .upsert({ created_by: userId, ...payload }, { onConflict: 'created_by' });
  if (goalError) return { error: goalError };

  const dailyQuery = current
    ? supabase.from(TABELA_AGUA_LOGS).update({ meta_doses: payload.meta_doses }).eq('id', current.id).eq('created_by', userId)
    : supabase.from(TABELA_AGUA_LOGS).insert({ created_by: userId, data_local: today, meta_doses: payload.meta_doses, realizado_doses: 0 });
  const { error: dailyError } = await dailyQuery;
  if (dailyError) return { error: dailyError };
  return loadWater(userId);
}

async function updateWaterProgress(payload, userId) {
  const today = dateInSaoPaulo(new Date());
  if (isOfflineMode()) {
    const loaded = await loadWater(userId);
    if (!loaded.config || !loaded.today) return { notFound: true };
    if (payload.realizado_doses > loaded.today.meta_doses) return { conflict: true };
    const row = offlineWaterLogs.find((item) => item.created_by === userId && item.data_local === today);
    row.realizado_doses = payload.realizado_doses;
    return loadWater(userId);
  }

  const { supabase } = await import('../lib/supabase.js');
  const { data: current, error: currentError } = await supabase.from(TABELA_AGUA_LOGS)
    .select('id,meta_doses').eq('created_by', userId).eq('data_local', today).maybeSingle();
  if (currentError) return { error: currentError };
  if (!current) return { notFound: true };
  if (payload.realizado_doses > Number(current.meta_doses)) return { conflict: true };
  const { data, error } = await supabase.from(TABELA_AGUA_LOGS)
    .update({ realizado_doses: payload.realizado_doses })
    .eq('id', current.id).eq('created_by', userId).select('id').maybeSingle();
  if (error) return { error };
  if (!data) return { notFound: true };
  return loadWater(userId);
}

async function loadProfiles(userId) {
  if (isOfflineMode()) return { rows: withProfileHistory(offlineProfiles, offlineProfileMeasurements), storage: 'memory' };
  const { supabase } = await import('../lib/supabase.js');
  const { data: profiles, error } = await supabase
    .from(TABELA_PERFIS)
    .select('id,nome,sexo,data_nascimento,data_medicao,peso_kg,altura_cm,cintura_cm,quadril_cm,peito_cm,braco_cm,coxa_cm,created_at,updated_at')
    .eq('created_by', userId)
    .order('created_at', { ascending: true });
  if (error) return { error };
  if (!profiles?.length) return { rows: [], storage: 'supabase' };
  const ids = profiles.map((profile) => profile.id);
  const { data: measurements, error: historyError } = await supabase
    .from(TABELA_PERFIL_MEDIDAS)
    .select('id,perfil_id,peso_kg,altura_cm,cintura_cm,quadril_cm,peito_cm,braco_cm,coxa_cm,imc,registrado_em')
    .eq('created_by', userId)
    .in('perfil_id', ids)
    .order('registrado_em', { ascending: false });
  return historyError ? { error: historyError } : { rows: withProfileHistory(profiles, measurements || []), storage: 'supabase' };
}

async function createProfile(payload, userId) {
  if (isOfflineMode()) {
    const id = Math.max(0, ...offlineProfiles.map((profile) => Number(profile.id) || 0)) + 1;
    const timestamp = new Date().toISOString();
    const row = { id, ...payload, created_at: timestamp, updated_at: timestamp };
    offlineProfiles.push(row);
    offlineProfileMeasurements.unshift(profileMeasurement(row, offlineProfileMeasurements.length + 1, `${payload.data_medicao}T12:00:00-03:00`));
    return { row: withProfileHistory([row], offlineProfileMeasurements)[0], storage: 'memory' };
  }
  const { supabase } = await import('../lib/supabase.js');
  const { data, error } = await supabase.from(TABELA_PERFIS).insert({ ...payload, created_by: userId })
    .select('id,nome,sexo,data_nascimento,data_medicao,peso_kg,altura_cm,cintura_cm,quadril_cm,peito_cm,braco_cm,coxa_cm,created_at,updated_at').single();
  if (error) return { error };
  const loaded = await loadProfiles(userId);
  if (loaded.error) return loaded;
  return { row: loaded.rows.find((profile) => Number(profile.id) === Number(data.id)), storage: 'supabase' };
}

async function updateProfile(id, payload, userId) {
  if (isOfflineMode()) {
    const index = offlineProfiles.findIndex((profile) => Number(profile.id) === id);
    if (index < 0) return { notFound: true };
    const previous = offlineProfiles[index];
    const measuresChanged = PROFILE_MEASURE_FIELDS.some((field) => previous[field] !== payload[field]);
    const measurementDateChanged = previous.data_medicao !== payload.data_medicao;
    const row = { ...previous, ...payload, updated_at: new Date().toISOString() };
    offlineProfiles[index] = row;
    if (measuresChanged) {
      offlineProfileMeasurements.unshift(profileMeasurement(row, offlineProfileMeasurements.length + 1, `${payload.data_medicao}T12:00:00-03:00`));
    } else if (measurementDateChanged) {
      const latest = offlineProfileMeasurements
        .filter((measurement) => Number(measurement.perfil_id) === id)
        .sort((a, b) => Number(b.id) - Number(a.id))[0];
      if (latest) latest.registrado_em = `${payload.data_medicao}T12:00:00-03:00`;
    }
    return { row: withProfileHistory([row], offlineProfileMeasurements)[0], storage: 'memory' };
  }
  const { supabase } = await import('../lib/supabase.js');
  const { data, error } = await supabase.from(TABELA_PERFIS).update(payload).eq('id', id).eq('created_by', userId).select('id').maybeSingle();
  if (error) return { error };
  if (!data) return { notFound: true };
  const loaded = await loadProfiles(userId);
  if (loaded.error) return loaded;
  return { row: loaded.rows.find((profile) => Number(profile.id) === id), storage: 'supabase' };
}

async function updateProfileMeasurement(id, payload, userId) {
  const timestamp = `${payload.data_medicao}T12:00:00-03:00`;
  const measurementPayload = Object.fromEntries(PROFILE_MEASURE_FIELDS.map((field) => [field, payload[field]]));

  if (isOfflineMode()) {
    const index = offlineProfileMeasurements.findIndex((measurement) => Number(measurement.id) === id);
    if (index < 0) return { notFound: true };
    const current = offlineProfileMeasurements[index];
    offlineProfileMeasurements[index] = { ...current, ...measurementPayload, imc: calcularImc(payload.peso_kg, payload.altura_cm), registrado_em: timestamp };
    const latestId = Math.max(...offlineProfileMeasurements.filter((measurement) => Number(measurement.perfil_id) === Number(current.perfil_id)).map((measurement) => Number(measurement.id)));
    if (id === latestId) {
      const profileIndex = offlineProfiles.findIndex((profile) => Number(profile.id) === Number(current.perfil_id));
      if (profileIndex >= 0) offlineProfiles[profileIndex] = { ...offlineProfiles[profileIndex], ...measurementPayload, data_medicao: payload.data_medicao, updated_at: new Date().toISOString() };
    }
    const profile = withProfileHistory(offlineProfiles, offlineProfileMeasurements).find((item) => Number(item.id) === Number(current.perfil_id));
    return { row: profile, storage: 'memory' };
  }

  const { supabase } = await import('../lib/supabase.js');
  const { data: current, error: currentError } = await supabase.from(TABELA_PERFIL_MEDIDAS)
    .select('id,perfil_id').eq('id', id).eq('created_by', userId).maybeSingle();
  if (currentError) return { error: currentError };
  if (!current) return { notFound: true };

  const { data: latestRows, error: latestError } = await supabase.from(TABELA_PERFIL_MEDIDAS)
    .select('id').eq('perfil_id', current.perfil_id).eq('created_by', userId).order('id', { ascending: false }).limit(1);
  if (latestError) return { error: latestError };

  const { data: updated, error: updateError } = await supabase.from(TABELA_PERFIL_MEDIDAS)
    .update({ ...measurementPayload, registrado_em: timestamp }).eq('id', id).eq('created_by', userId).select('id').maybeSingle();
  if (updateError) return { error: updateError };
  if (!updated) return { notFound: true };

  if (Number(latestRows?.[0]?.id) === id) {
    const { error: profileError } = await supabase.from(TABELA_PERFIS)
      .update({ ...measurementPayload, data_medicao: payload.data_medicao }).eq('id', current.perfil_id).eq('created_by', userId);
    if (profileError) return { error: profileError };
  }

  const loaded = await loadProfiles(userId);
  if (loaded.error) return loaded;
  return { row: loaded.rows.find((profile) => Number(profile.id) === Number(current.perfil_id)), storage: 'supabase' };
}

async function deleteProfileMeasurement(id, userId) {
  if (isOfflineMode()) {
    const current = offlineProfileMeasurements.find((measurement) => Number(measurement.id) === id);
    if (!current) return { notFound: true };
    const latestId = Math.max(...offlineProfileMeasurements.filter((measurement) => Number(measurement.perfil_id) === Number(current.perfil_id)).map((measurement) => Number(measurement.id)));
    offlineProfileMeasurements = offlineProfileMeasurements.filter((measurement) => Number(measurement.id) !== id);
    if (id === latestId) {
      const replacement = offlineProfileMeasurements
        .filter((measurement) => Number(measurement.perfil_id) === Number(current.perfil_id))
        .sort((a, b) => Number(b.id) - Number(a.id))[0];
      const profileIndex = offlineProfiles.findIndex((profile) => Number(profile.id) === Number(current.perfil_id));
      if (replacement && profileIndex >= 0) {
        offlineProfiles[profileIndex] = {
          ...offlineProfiles[profileIndex],
          ...Object.fromEntries(PROFILE_MEASURE_FIELDS.map((field) => [field, replacement[field]])),
          data_medicao: replacement.registrado_em.slice(0, 10),
          updated_at: new Date().toISOString(),
        };
      }
    }
    const profile = withProfileHistory(offlineProfiles, offlineProfileMeasurements).find((item) => Number(item.id) === Number(current.perfil_id));
    return { row: profile, storage: 'memory' };
  }

  const { supabase } = await import('../lib/supabase.js');
  const { data: current, error: currentError } = await supabase.from(TABELA_PERFIL_MEDIDAS)
    .select('id,perfil_id').eq('id', id).eq('created_by', userId).maybeSingle();
  if (currentError) return { error: currentError };
  if (!current) return { notFound: true };

  const { data: latestBefore, error: latestBeforeError } = await supabase.from(TABELA_PERFIL_MEDIDAS)
    .select('id').eq('perfil_id', current.perfil_id).eq('created_by', userId).order('id', { ascending: false }).limit(1);
  if (latestBeforeError) return { error: latestBeforeError };

  const { data: deleted, error: deleteError } = await supabase.from(TABELA_PERFIL_MEDIDAS)
    .delete().eq('id', id).eq('created_by', userId).select('id').maybeSingle();
  if (deleteError) return { error: deleteError };
  if (!deleted) return { notFound: true };

  if (Number(latestBefore?.[0]?.id) === id) {
    const { data: replacements, error: replacementError } = await supabase.from(TABELA_PERFIL_MEDIDAS)
      .select('peso_kg,altura_cm,cintura_cm,quadril_cm,peito_cm,braco_cm,coxa_cm,registrado_em')
      .eq('perfil_id', current.perfil_id).eq('created_by', userId).order('id', { ascending: false }).limit(1);
    if (replacementError) return { error: replacementError };
    const replacement = replacements?.[0];
    if (replacement) {
      const dataMedicao = dateInSaoPaulo(replacement.registrado_em);
      const profilePayload = { ...Object.fromEntries(PROFILE_MEASURE_FIELDS.map((field) => [field, replacement[field]])), data_medicao: dataMedicao };
      const { error: profileError } = await supabase.from(TABELA_PERFIS).update(profilePayload).eq('id', current.perfil_id).eq('created_by', userId);
      if (profileError) return { error: profileError };
    }
  }

  const loaded = await loadProfiles(userId);
  if (loaded.error) return loaded;
  return { row: loaded.rows.find((profile) => Number(profile.id) === Number(current.perfil_id)), storage: 'supabase' };
}

async function loadDiets() {
  if (isOfflineMode()) return { rows: offlineDiets.map((diet) => structuredClone(diet)), storage: 'bundled-fallback' };
  const { supabase } = await import('../lib/supabase.js');
  const { data, error } = await supabase
    .from(TABELA_DIETAS)
    .select('id,slug,titulo,objetivo,duracao_dias,descricao,orientacoes_gerais,ritual_diario,dias,observacoes,source_file,created_at,updated_at')
    .order('created_at', { ascending: false });
  if (error && isMissingTableError(error)) return { rows: DIETAS_INICIAIS.map((diet) => structuredClone(diet)), storage: 'bundled-fallback' };
  return error ? { error } : { rows: data || [], storage: 'supabase' };
}

async function createDiet(payload, userId) {
  const slug = slugify(payload.titulo);
  if (isOfflineMode()) {
    const id = Math.max(0, ...offlineDiets.map((diet) => Number(diet.id) || 0)) + 1;
    const row = { id, slug, ...payload, source_file: 'Cadastro manual' };
    offlineDiets.unshift(row);
    return { row: structuredClone(row), storage: 'memory' };
  }
  const { supabase } = await import('../lib/supabase.js');
  const { data, error } = await supabase
    .from(TABELA_DIETAS)
    .insert({ slug, ...payload, source_file: 'Cadastro manual', created_by: userId })
    .select('id,slug,titulo,objetivo,duracao_dias,descricao,orientacoes_gerais,ritual_diario,dias,observacoes,source_file,created_at,updated_at')
    .single();
  return error ? { error } : { row: data, storage: 'supabase' };
}

async function updateDiet(id, payload) {
  if (isOfflineMode()) {
    const index = offlineDiets.findIndex((diet) => Number(diet.id) === id);
    if (index < 0) return { notFound: true };
    offlineDiets[index] = { ...offlineDiets[index], ...payload, slug: slugify(payload.titulo) };
    return { row: structuredClone(offlineDiets[index]), storage: 'memory' };
  }
  const { supabase } = await import('../lib/supabase.js');
  const { data, error } = await supabase
    .from(TABELA_DIETAS)
    .update({ slug: slugify(payload.titulo), ...payload })
    .eq('id', id)
    .select('id,slug,titulo,objetivo,duracao_dias,descricao,orientacoes_gerais,ritual_diario,dias,observacoes,source_file,created_at,updated_at')
    .maybeSingle();
  if (error) return { error };
  return data ? { row: data, storage: 'supabase' } : { notFound: true };
}

async function deleteDiet(id) {
  if (isOfflineMode()) {
    const previousLength = offlineDiets.length;
    offlineDiets = offlineDiets.filter((diet) => Number(diet.id) !== id);
    return previousLength === offlineDiets.length ? { notFound: true } : { storage: 'memory' };
  }
  const { supabase } = await import('../lib/supabase.js');
  const { data, error } = await supabase.from(TABELA_DIETAS).delete().eq('id', id).select('id').maybeSingle();
  if (error) return { error };
  return data ? { storage: 'supabase' } : { notFound: true };
}

function apiRow(row) {
  return {
    id: row.id,
    categoria: row.categoria,
    protocolo: row.protocolo ?? null,
    item: row.item,
    porcao: row.porcao ?? row.porcao_equivalente,
  };
}

async function loadNutritionRows() {
  if (isOfflineMode()) {
    return { rows: offlineNutritionRows.map((row) => ({ ...row })), storage: 'bundled-fallback' };
  }

  const { supabase } = await import('../lib/supabase.js');
  const { data, error } = await supabase
    .from(TABELA_NUTRICIONAL)
    .select('id,source_order,categoria,protocolo,item,porcao_equivalente')
    .order('source_order', { ascending: true });

  if (error && isMissingTableError(error)) {
    return { rows: bundledNutritionRows(), storage: 'bundled-fallback' };
  }
  if (error) return { error };

  return {
    storage: 'supabase',
    rows: (data || []).map(apiRow),
  };
}

async function createNutritionRow(payload) {
  if (isOfflineMode()) {
    const nextId = Math.max(0, ...offlineNutritionRows.map((row) => Number(row.id) || 0)) + 1;
    const nextOrder = Math.max(0, ...offlineNutritionRows.map((row) => Number(row.source_order || row.id) || 0)) + 1;
    const row = { id: nextId, source_order: nextOrder, protocolo: null, ...payload };
    offlineNutritionRows.unshift(row);
    return { row: apiRow(row), storage: 'memory' };
  }

  const { supabase } = await import('../lib/supabase.js');
  const { data: latest, error: orderError } = await supabase
    .from(TABELA_NUTRICIONAL)
    .select('source_order')
    .order('source_order', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (orderError) return { error: orderError };

  const { data, error } = await supabase
    .from(TABELA_NUTRICIONAL)
    .insert({
      source_order: Number(latest?.source_order || 0) + 1,
      categoria: payload.categoria,
      protocolo: null,
      item: payload.item,
      porcao_equivalente: payload.porcao,
      source_file: 'Cadastro manual',
    })
    .select('id,categoria,protocolo,item,porcao_equivalente')
    .single();
  return error ? { error } : { row: apiRow(data), storage: 'supabase' };
}

async function updateNutritionRow(id, payload) {
  if (isOfflineMode()) {
    const index = offlineNutritionRows.findIndex((row) => Number(row.id) === id);
    if (index < 0) return { notFound: true };
    offlineNutritionRows[index] = { ...offlineNutritionRows[index], ...payload };
    return { row: apiRow(offlineNutritionRows[index]), storage: 'memory' };
  }

  const { supabase } = await import('../lib/supabase.js');
  const { data, error } = await supabase
    .from(TABELA_NUTRICIONAL)
    .update({ categoria: payload.categoria, item: payload.item, porcao_equivalente: payload.porcao })
    .eq('id', id)
    .select('id,categoria,protocolo,item,porcao_equivalente')
    .maybeSingle();
  if (error) return { error };
  return data ? { row: apiRow(data), storage: 'supabase' } : { notFound: true };
}

async function deleteNutritionRow(id) {
  if (isOfflineMode()) {
    const previousLength = offlineNutritionRows.length;
    offlineNutritionRows = offlineNutritionRows.filter((row) => Number(row.id) !== id);
    return previousLength === offlineNutritionRows.length ? { notFound: true } : { storage: 'memory' };
  }

  const { supabase } = await import('../lib/supabase.js');
  const { data, error } = await supabase
    .from(TABELA_NUTRICIONAL)
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) return { error };
  return data ? { storage: 'supabase' } : { notFound: true };
}

export default async function handler(req, res) {
  if (req.method === 'GET' && req.query?.health === '1') {
    return json(res, 200, { ok: true, service: 'saude' });
  }

  const auth = await requireUser(req, { appId: 'saude', adminOnly: true });
  if (!auth.ok) return json(res, auth.status, auth.data);

  if (req.method === 'GET') {
    if (req.query?.resource === RESOURCE_TABELA_NUTRICIONAL) {
      const result = await loadNutritionRows();
      if (result.error) return json(res, 500, { error: result.error.message });
      const options = opcoesTabelaNutricional(result.rows);
      return json(res, 200, {
        resource: 'tabelas-nutricionais',
        source: 'tabelas nutricionais dieta.xlsx',
        storage: result.storage,
        total: result.rows.length,
        ...options,
        rows: result.rows,
      });
    }
    if (req.query?.resource === RESOURCE_DIETAS) {
      const result = await loadDiets();
      if (result.error) return json(res, 500, { error: result.error.message });
      const id = req.query?.id ? parseId(req.query.id) : null;
      if (req.query?.id && !id) return json(res, 400, { error: 'ID invalido.' });
      if (id) {
        const row = result.rows.find((diet) => Number(diet.id) === id);
        return row ? json(res, 200, { resource: RESOURCE_DIETAS, storage: result.storage, row }) : json(res, 404, { error: 'Dieta nao encontrada.' });
      }
      return json(res, 200, { resource: RESOURCE_DIETAS, storage: result.storage, total: result.rows.length, rows: result.rows });
    }
    if (req.query?.resource === RESOURCE_PERFIS) {
      const result = await loadProfiles(auth.user.id);
      if (result.error) return json(res, 500, { error: result.error.message });
      return json(res, 200, { resource: RESOURCE_PERFIS, storage: result.storage, total: result.rows.length, rows: result.rows });
    }
    if (req.query?.resource === RESOURCE_CONSUMO_AGUA) {
      const result = await loadWater(auth.user.id);
      if (result.error) return json(res, 500, { error: result.error.message });
      return json(res, 200, result);
    }

    return json(res, 200, {
      module: 'saude',
      status: 'ready',
      configured: true,
      pages: [
        { id: 'tabela-nutricional', title: 'Tabela Nutricional' },
        { id: 'dietas', title: 'Dietas' },
        { id: 'perfis', title: 'Perfil' },
        { id: 'consumo-agua', title: 'Consumo de agua' },
      ],
      message: 'Módulo de Saúde disponível.',
    });
  }

  if (![RESOURCE_TABELA_NUTRICIONAL, RESOURCE_DIETAS, RESOURCE_PERFIS, RESOURCE_PERFIL_MEDIDAS, RESOURCE_CONSUMO_AGUA].includes(req.query?.resource)) {
    return json(res, 400, { error: 'Recurso invalido.' });
  }

  if (req.query?.resource === RESOURCE_CONSUMO_AGUA && req.method === 'POST') {
    const body = readBody(req);
    if (!body) return json(res, 400, { error: 'JSON invalido.' });
    const validation = validateWaterGoalPayload(body);
    if (validation.error) return json(res, 400, { error: validation.error });
    const result = await saveWaterGoal(validation.data, auth.user.id);
    if (result.error) return json(res, 500, { error: result.error.message });
    if (result.conflict) return json(res, 409, { error: 'A meta nao pode ser menor que a quantidade ja realizada hoje.' });
    return json(res, 200, result);
  }

  if (req.query?.resource === RESOURCE_CONSUMO_AGUA && req.method === 'PATCH') {
    const body = readBody(req);
    if (!body) return json(res, 400, { error: 'JSON invalido.' });
    const validation = validateWaterProgressPayload(body);
    if (validation.error) return json(res, 400, { error: validation.error });
    const result = await updateWaterProgress(validation.data, auth.user.id);
    if (result.error) return json(res, 500, { error: result.error.message });
    if (result.notFound) return json(res, 404, { error: 'Crie uma meta de agua antes de registrar o consumo.' });
    if (result.conflict) return json(res, 409, { error: 'A quantidade realizada nao pode ultrapassar a meta do dia.' });
    return json(res, 200, result);
  }

  if (req.query?.resource === RESOURCE_PERFIS && (req.method === 'POST' || req.method === 'PATCH')) {
    const body = readBody(req);
    if (!body) return json(res, 400, { error: 'JSON invalido.' });
    const validation = validateProfilePayload(body);
    if (validation.error) return json(res, 400, { error: validation.error });
    if (req.method === 'POST') {
      const result = await createProfile(validation.data, auth.user.id);
      if (result.error) return json(res, 500, { error: result.error.message });
      return json(res, 201, result);
    }
    const id = parseId(body.id ?? req.query?.id);
    if (!id) return json(res, 400, { error: 'ID invalido.' });
    const result = await updateProfile(id, validation.data, auth.user.id);
    if (result.error) return json(res, 500, { error: result.error.message });
    if (result.notFound) return json(res, 404, { error: 'Perfil nao encontrado.' });
    return json(res, 200, result);
  }

  if (req.query?.resource === RESOURCE_PERFIL_MEDIDAS && req.method === 'PATCH') {
    const body = readBody(req);
    if (!body) return json(res, 400, { error: 'JSON invalido.' });
    const id = parseId(body.id ?? req.query?.id);
    if (!id) return json(res, 400, { error: 'ID invalido.' });
    const validation = validateProfileMeasurementPayload(body);
    if (validation.error) return json(res, 400, { error: validation.error });
    const result = await updateProfileMeasurement(id, validation.data, auth.user.id);
    if (result.error) return json(res, 500, { error: result.error.message });
    if (result.notFound) return json(res, 404, { error: 'Medicao nao encontrada.' });
    return json(res, 200, result);
  }

  if (req.query?.resource === RESOURCE_PERFIL_MEDIDAS && req.method === 'DELETE') {
    const body = readBody(req);
    if (!body) return json(res, 400, { error: 'JSON invalido.' });
    const id = parseId(body.id ?? req.query?.id);
    if (!id) return json(res, 400, { error: 'ID invalido.' });
    const result = await deleteProfileMeasurement(id, auth.user.id);
    if (result.error) return json(res, 500, { error: result.error.message });
    if (result.notFound) return json(res, 404, { error: 'Medicao nao encontrada.' });
    return json(res, 200, { ok: true, ...result });
  }

  if (req.query?.resource === RESOURCE_DIETAS && (req.method === 'POST' || req.method === 'PATCH')) {
    const body = readBody(req);
    if (!body) return json(res, 400, { error: 'JSON invalido.' });
    const validation = validateDietPayload(body);
    if (validation.error) return json(res, 400, { error: validation.error });
    if (req.method === 'POST') {
      const result = await createDiet(validation.data, auth.user.id);
      if (result.error) return json(res, 500, { error: result.error.message });
      return json(res, 201, result);
    }
    const id = parseId(body.id ?? req.query?.id);
    if (!id) return json(res, 400, { error: 'ID invalido.' });
    const result = await updateDiet(id, validation.data);
    if (result.error) return json(res, 500, { error: result.error.message });
    if (result.notFound) return json(res, 404, { error: 'Dieta nao encontrada.' });
    return json(res, 200, result);
  }

  if (req.query?.resource === RESOURCE_DIETAS && req.method === 'DELETE') {
    const body = readBody(req);
    if (!body) return json(res, 400, { error: 'JSON invalido.' });
    const id = parseId(body.id ?? req.query?.id);
    if (!id) return json(res, 400, { error: 'ID invalido.' });
    const result = await deleteDiet(id);
    if (result.error) return json(res, 500, { error: result.error.message });
    if (result.notFound) return json(res, 404, { error: 'Dieta nao encontrada.' });
    return json(res, 200, { ok: true, ...result });
  }

  if (req.query?.resource === RESOURCE_TABELA_NUTRICIONAL && (req.method === 'POST' || req.method === 'PATCH')) {
    const body = readBody(req);
    if (!body) return json(res, 400, { error: 'JSON invalido.' });
    const validation = validateNutritionPayload(body);
    if (validation.error) return json(res, 400, { error: validation.error });

    if (req.method === 'POST') {
      const result = await createNutritionRow(validation.data);
      if (result.error) return json(res, 500, { error: result.error.message });
      return json(res, 201, result);
    }

    const id = parseId(body.id ?? req.query?.id);
    if (!id) return json(res, 400, { error: 'ID invalido.' });
    const result = await updateNutritionRow(id, validation.data);
    if (result.error) return json(res, 500, { error: result.error.message });
    if (result.notFound) return json(res, 404, { error: 'Item nao encontrado.' });
    return json(res, 200, result);
  }

  if (req.query?.resource === RESOURCE_TABELA_NUTRICIONAL && req.method === 'DELETE') {
    const body = readBody(req);
    if (!body) return json(res, 400, { error: 'JSON invalido.' });
    const id = parseId(body.id ?? req.query?.id);
    if (!id) return json(res, 400, { error: 'ID invalido.' });
    const result = await deleteNutritionRow(id);
    if (result.error) return json(res, 500, { error: result.error.message });
    if (result.notFound) return json(res, 404, { error: 'Item nao encontrado.' });
    return json(res, 200, { ok: true, ...result });
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return json(res, 405, { error: 'Method Not Allowed' });
}
