import { requireUser } from '../lib/auth.js';
import { TABELAS_NUTRICIONAIS } from '../features/saude/data/tabelasNutricionais.js';
import { ALIMENTOS_NUTRICIONAIS } from '../features/saude/data/alimentosNutricionais.js';
import { opcoesTabelaNutricional } from '../features/saude/service/tabelaNutricionalService.js';
import { calcularImc } from '../features/saude/service/perfilSaudeService.js';
import { DIET_MEALS } from '../features/saude/service/dietasService.js';
import { normalizeAlertSchedule, validateAlertSchedule } from '../features/saude/service/alertScheduleConfig.js';
import { enrichDietNutrition, foodUnitWeight, matchFoodForDietItem, nutritionForDietItem } from '../features/saude/service/alimentosService.js';

const TABELA_NUTRICIONAL = 'tb_saude_tabela_nutricional';
const RESOURCE_TABELA_NUTRICIONAL = 'tabelas-nutricionais';
const TABELA_ALIMENTOS = 'tb_saude_alimentos';
const RESOURCE_ALIMENTOS = 'alimentos';
const TABELA_DIETAS = 'tb_saude_dietas';
const RESOURCE_DIETAS = 'dietas';
const TABELA_PERFIS = 'tb_saude_perfis';
const TABELA_PERFIL_MEDIDAS = 'tb_saude_perfil_medidas';
const RESOURCE_PERFIS = 'perfis';
const RESOURCE_PERFIL_MEDIDAS = 'perfil-medidas';
const TABELA_AGUA_METAS = 'tb_saude_agua_metas';
const TABELA_AGUA_LOGS = 'tb_saude_agua_logs';
const RESOURCE_CONSUMO_AGUA = 'consumo-agua';
const TABELA_ALERTAS_AGENDA = 'tb_saude_alertas_agenda';
const RESOURCE_ALERTAS_AGENDA = 'alertas-agenda';
let offlineNutritionRows = bundledNutritionRows();
let offlineFoods = bundledFoodRows();
let offlineDiets = [];
let offlineProfiles = [];
let offlineProfileMeasurements = [];
const offlineWaterGoals = new Map();
let offlineWaterLogs = [];
const offlineAlertSchedules = new Map();

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

function bundledFoodRows() {
  return ALIMENTOS_NUTRICIONAIS.map((row) => ({ ...row, id: row.source_order }));
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

function validateFoodPayload(body) {
  const categoria = String(body?.categoria || '').trim();
  const item = String(body?.item || '').trim();
  const porcao = String(body?.porcao ?? body?.porcao_equivalente ?? '').trim();
  const observacoes = String(body?.observacoes || '').trim();
  const fonte_nutricional = String(body?.fonte_nutricional || 'Cadastro manual').trim();
  const pesoRaw = body?.peso_referencia_g ?? body?.peso_g;
  const peso_referencia_g = pesoRaw === '' || pesoRaw == null ? null : Number(String(pesoRaw).replace(',', '.'));
  const peso_unidade_g = body?.peso_unidade_g === '' || body?.peso_unidade_g == null ? null : Number(String(body.peso_unidade_g).replace(',', '.'));
  const rawNutrients = [body?.kcal_100g, body?.proteina_100g, body?.carboidrato_100g, body?.gordura_100g];
  if (rawNutrients.some((value) => value == null || String(value).trim() === '')) {
    return { error: 'Preencha calorias, proteína, carboidrato e gordura por 100 g/ml.' };
  }
  const [kcal_100g, proteina_100g, carboidrato_100g, gordura_100g] = rawNutrients
    .map((value) => Number(String(value).replace(',', '.')));
  if (!categoria || !item || !porcao) return { error: 'Categoria, alimento e porção de referência são obrigatórios.' };
  if (categoria.length > 80 || item.length > 200 || porcao.length > 200 || observacoes.length > 1000 || fonte_nutricional.length > 200) {
    return { error: 'Um ou mais campos do alimento ultrapassam o limite permitido.' };
  }
  if (peso_referencia_g !== null && (!Number.isFinite(peso_referencia_g) || peso_referencia_g <= 0 || peso_referencia_g > 10000)) {
    return { error: 'O peso de referência deve ser maior que zero e não passar de 10000 g/ml.' };
  }
  if (peso_unidade_g !== null && (!Number.isFinite(peso_unidade_g) || peso_unidade_g < 0.01 || peso_unidade_g > 10000)) return { error: 'Informe um peso por unidade entre 0,01 e 10000 g.' };
  const nutrientValues = [kcal_100g, proteina_100g, carboidrato_100g, gordura_100g];
  if (nutrientValues.some((value, index) => !Number.isFinite(value) || value < 0 || value > (index === 0 ? 2000 : 1000))) {
    return { error: 'Informe valores nutricionais válidos por 100 g/ml.' };
  }
  return { data: { categoria, item, porcao, peso_referencia_g, peso_unidade_g, kcal_100g, proteina_100g,
    carboidrato_100g, gordura_100g, observacoes: observacoes || null, fonte_nutricional: fonte_nutricional || 'Cadastro manual' } };
}

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function validateWaterGoalPayload(body) {
  const profile_id = parseId(body?.profile_id);
  if (!profile_id) return { error: 'Informe o perfil de saude.' };
  const nome = String(body?.nome || '').trim();
  const meta_doses = Number(body?.meta_doses);
  if (!nome || nome.length > 80) return { error: 'Informe um nome de ate 80 caracteres para a meta.' };
  if (!Number.isInteger(meta_doses) || meta_doses < 1 || meta_doses > 100) {
    return { error: 'A meta diaria deve ter entre 1 e 100 doses.' };
  }
  return { data: { nome, meta_doses, profile_id } };
}

function validateWaterProgressPayload(body) {
  const profile_id = parseId(body?.profile_id);
  if (!profile_id) return { error: 'Informe o perfil de saude.' };
  const realizado_doses = Number(body?.realizado_doses);
  if (!Number.isInteger(realizado_doses) || realizado_doses < 0 || realizado_doses > 100) {
    return { error: 'A quantidade realizada deve estar entre 0 e 100 doses.' };
  }
  return { data: { realizado_doses, profile_id } };
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

function validateDietPayload(body, isCreate = false) {
  const titulo = String(body?.titulo || '').trim();
  const objetivo = String(body?.objetivo || 'Plano alimentar').trim();
  const descricao = String(body?.descricao || '').trim();
  const orientacoes_gerais = String(body?.orientacoes_gerais || '').trim();
  const ritual_diario = String(body?.ritual_diario || '').trim();
  const observacoes = String(body?.observacoes || '').trim();
  const meta_calorias = body?.meta_calorias === '' || body?.meta_calorias == null ? null : Number(body.meta_calorias);
  const duracao_dias = Number(body?.duracao_dias);
  const dias = Array.isArray(body?.dias) ? body.dias : [];
  const refeicoes = Array.isArray(body?.refeicoes) ? body.refeicoes : null;
  const perfil_id = parseId(body?.perfil_id);

  if (isCreate && !perfil_id) {
    return { error: 'É necessário selecionar um perfil para cadastrar a dieta.' };
  }
  if (body?.perfil_id !== undefined && body?.perfil_id !== null && !perfil_id) {
    return { error: 'Perfil selecionado é inválido.' };
  }

  const profileField = perfil_id ? { perfil_id } : {};

  if (meta_calorias !== null && (!Number.isInteger(meta_calorias) || meta_calorias < 500 || meta_calorias > 10000)) {
    return { error: 'A meta diaria deve ficar entre 500 e 10000 kcal.' };
  }

  if (refeicoes) {
    if (!titulo || titulo.length > 160 || objetivo.length > 120 || descricao.length > 2000 || observacoes.length > 4000) {
      return { error: 'Nome, objetivo, descricao ou observacoes ultrapassam o limite permitido.' };
    }

    const normalizedMeals = [];
    let itemCount = 0;
    for (const mealDefinition of DIET_MEALS) {
      const meal = refeicoes.find((entry) => entry?.tipo === mealDefinition.tipo);
      const items = Array.isArray(meal?.itens) ? meal.itens : [];
      if (items.length > 50) return { error: `${mealDefinition.titulo} deve ter no maximo 50 itens.` };
      const normalizedItems = [];
      for (const item of items) {
        const nome = String(item?.nome || '').trim();
        let quantidade = String(item?.quantidade || '').trim();
        const structuredQuantity = item?.quantidade_valor != null || item?.quantidade_unidade != null;
        const quantidade_valor = structuredQuantity ? Number(String(item.quantidade_valor).replace(',', '.')) : null;
        const quantidade_unidade = String(item?.quantidade_unidade || '');
        if (structuredQuantity) {
          if (!Number.isFinite(quantidade_valor) || quantidade_valor <= 0 || quantidade_valor > 10000 || !['g', 'ml', 'un', 'porcao'].includes(quantidade_unidade)) return { error: 'Informe uma quantidade maior que zero e uma unidade válida.' };
          quantidade = `${quantidade_valor} ${quantidade_unidade === 'un' ? 'unidades' : quantidade_unidade === 'porcao' ? 'porções' : quantidade_unidade}`;
        }
        const observacao = String(item?.observacao || '').trim();
        const calorias = item?.calorias === '' || item?.calorias == null ? null : Number(item.calorias);
        const alimento_id = item?.alimento_id == null || item?.alimento_id === '' ? null : parseId(item.alimento_id);
        if (!nome || !quantidade) return { error: `Alimento e quantidade sao obrigatorios em ${mealDefinition.titulo}.` };
        if (calorias !== null && (!Number.isInteger(calorias) || calorias < 0 || calorias > 10000)) {
          return { error: `As calorias de cada alimento devem ser um numero inteiro entre 0 e 10000.` };
        }
        if (item?.alimento_id != null && item?.alimento_id !== '' && !alimento_id) return { error: 'O alimento selecionado é inválido.' };
        if (nome.length > 160 || quantidade.length > 120 || observacao.length > 500) {
          return { error: `Um item de ${mealDefinition.titulo} ultrapassa o limite permitido.` };
        }
        normalizedItems.push({ nome, quantidade, observacao, calorias, alimento_id,
          ...(structuredQuantity ? { quantidade_valor, quantidade_unidade } : {}) });
      }
      itemCount += normalizedItems.length;
      normalizedMeals.push({ ...mealDefinition, itens: normalizedItems });
    }
    if (itemCount === 0) return { error: 'Adicione pelo menos um alimento à dieta.' };

    const activeMealCount = normalizedMeals.filter((meal) => meal.itens.length > 0).length;
    return {
      data: {
        ...profileField,
        titulo,
        objetivo,
        duracao_dias: 1,
        descricao,
        orientacoes_gerais: '',
        ritual_diario: '',
        dias: [{ numero: 1, titulo: 'Plano alimentar', jejum_horas: 0, quantidade_refeicoes: activeMealCount, carboidrato: '', conteudo: '' }],
        refeicoes: normalizedMeals,
        meta_calorias,
        observacoes,
      },
    };
  }

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

  return { data: { ...profileField, titulo, objetivo, duracao_dias, descricao, orientacoes_gerais, ritual_diario, dias: normalizedDays, refeicoes: [], observacoes, meta_calorias } };
}

const PROFILE_MEASURE_FIELDS = ['peso_kg', 'altura_cm'];

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
  return { data };
}

function validateNewWeightPayload(body) {
  const perfil_id = parseId(body?.perfil_id);
  const peso_kg = parseDecimal(body?.peso_kg);
  if (!perfil_id) return { error: 'Perfil invalido.' };
  if (!Number.isFinite(peso_kg) || peso_kg < 1 || peso_kg > 500) return { error: 'Peso deve estar entre 1 e 500 kg.' };
  return { data: { perfil_id, peso_kg } };
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

function waterResult(config, today, history, storage, profiles = null, profileId = null) {
  return {
    resource: RESOURCE_CONSUMO_AGUA,
    storage,
    ...(Array.isArray(profiles) ? { profiles: profiles.map((profile) => ({ id: profile.id, nome: profile.nome })) } : {}),
    profile_id: profileId,
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

async function loadSaudeProfilesForWater(userId, includeAllUsers = false) {
  if (isOfflineMode()) {
    return {
      rows: offlineProfiles
        .filter((row) => includeAllUsers || row.created_by === userId)
        .map((row) => ({ id: row.id, nome: row.nome })),
      storage: 'memory',
    };
  }
  const { supabase } = await import('../lib/supabase.js');
  let query = supabase.from(TABELA_PERFIS).select('id,nome').order('created_at', { ascending: true });
  if (!includeAllUsers) query = query.eq('created_by', userId);
  const { data, error } = await query;
  return error ? { error } : { rows: data || [], storage: 'supabase' };
}

async function requireSaudeProfileForWater(userId, profileId, isAdmin = false) {
  const id = parseId(profileId);
  if (!id) return { invalid: true };
  if (isOfflineMode()) {
    const profile = offlineProfiles.find((row) => Number(row.id) === id && (isAdmin || row.created_by === userId));
    if (!profile) return { notFound: true };
    return { profile: { id: profile.id, nome: profile.nome, created_by: profile.created_by }, storage: 'memory' };
  }
  const { supabase } = await import('../lib/supabase.js');
  let query = supabase.from(TABELA_PERFIS).select('id,nome,created_by').eq('id', id);
  if (!isAdmin) query = query.eq('created_by', userId);
  const { data, error, status, statusText } = await query.maybeSingle();
  if (error) return { error, status, statusText };
  if (!data) return { notFound: true };
  return { profile: data, storage: 'supabase' };
}

async function deleteWaterGoal(profileId, userId) {
  if (isOfflineMode()) {
    const key = `${userId}:${profileId}`;
    if (!offlineWaterGoals.has(key)) return { notFound: true };
    offlineWaterGoals.delete(key);
    offlineWaterLogs = offlineWaterLogs.filter((row) => !(Number(row.perfil_id) === profileId && row.created_by === userId));
    return loadWater(userId, profileId);
  }
  const { supabase } = await import('../lib/supabase.js');
  const { error: logsError } = await supabase.from(TABELA_AGUA_LOGS)
    .delete().eq('perfil_id', profileId).eq('created_by', userId);
  if (logsError) return { error: logsError };
  const { data, error } = await supabase.from(TABELA_AGUA_METAS)
    .delete().eq('perfil_id', profileId).eq('created_by', userId).select('perfil_id').maybeSingle();
  if (error) return { error };
  if (!data) return { notFound: true };
  return loadWater(userId, profileId);
}

async function loadWater(userId, requestedProfileId = null, { includeProfiles = true, isAdmin = false } = {}) {
  const today = dateInSaoPaulo(new Date());
  const profileResult = includeProfiles ? await loadSaudeProfilesForWater(userId, isAdmin) : null;
  if (profileResult?.error) return profileResult;
  const profiles = profileResult?.rows || null;
  let profileId = parseId(requestedProfileId);
  if (requestedProfileId != null) {
    const owned = await requireSaudeProfileForWater(userId, requestedProfileId, isAdmin);
    if (owned.error) return owned;
    if (owned.invalid) return { invalidProfile: true };
    if (owned.notFound) return { notFound: true };
    profileId = owned.profile.id;
  } else if (profiles?.length) {
    profileId = profiles[0]?.id || null;
  }
  if (!profileId) return waterResult(null, null, [], profileResult?.storage || 'supabase', profiles, null);
  if (isOfflineMode()) {
    const config = offlineWaterGoals.get(`${userId}:${profileId}`)
      || (isAdmin ? [...offlineWaterGoals.entries()].find(([key]) => key.endsWith(`:${profileId}`))?.[1] : null)
      || null;
    if (!config) return waterResult(null, null, [], 'memory', profiles, profileId);
    let todayRow = offlineWaterLogs.find((row) => Number(row.perfil_id) === Number(profileId)
      && (isAdmin || row.created_by === userId) && row.data_local === today);
    const ownerCanInitialize = !isAdmin || offlineProfiles.some((row) => Number(row.id) === Number(profileId) && row.created_by === userId);
    if (!todayRow && ownerCanInitialize) {
      todayRow = {
        id: Math.max(0, ...offlineWaterLogs.map((row) => Number(row.id) || 0)) + 1,
        created_by: userId,
        perfil_id: profileId,
        data_local: today,
        meta_doses: config.meta_doses,
        realizado_doses: 0,
      };
      offlineWaterLogs.push(todayRow);
    }
    const history = offlineWaterLogs
      .filter((row) => (isAdmin || row.created_by === userId) && Number(row.perfil_id) === Number(profileId) && row.data_local < today)
      .sort((a, b) => b.data_local.localeCompare(a.data_local))
      .slice(0, 90);
    if (!todayRow && isAdmin) todayRow = { data_local: today, meta_doses: config.meta_doses, realizado_doses: 0 };
    return waterResult(config, todayRow, history, 'memory', profiles, profileId);
  }

  const { supabase } = await import('../lib/supabase.js');
  let configRequest = supabase.from(TABELA_AGUA_METAS)
    .select('nome,meta_doses').eq('perfil_id', profileId);
  let todayRequest = supabase.from(TABELA_AGUA_LOGS)
    .select('id,data_local,meta_doses,realizado_doses').eq('perfil_id', profileId).eq('data_local', today);
  let historyRequest = supabase.from(TABELA_AGUA_LOGS)
    .select('id,data_local,meta_doses,realizado_doses').eq('perfil_id', profileId).lt('data_local', today)
    .order('data_local', { ascending: false }).limit(90);
  if (!isAdmin) {
    configRequest = configRequest.eq('created_by', userId);
    todayRequest = todayRequest.eq('created_by', userId);
    historyRequest = historyRequest.eq('created_by', userId);
  }
  configRequest = configRequest.maybeSingle();
  todayRequest = todayRequest.maybeSingle();
  const [configResult, todayResult, historyResult] = await Promise.all([configRequest, todayRequest, historyRequest]);
  const { data: config, error: configError } = configResult;
  if (configError) return { error: configError };
  if (!config) return waterResult(null, null, [], 'supabase', profiles, profileId);
  let { data: todayRow, error: todayError } = todayResult;
  if (todayError) return { error: todayError };
  const ownerProfile = isAdmin ? await requireSaudeProfileForWater(userId, profileId, true) : null;
  if (ownerProfile?.error) return ownerProfile;
  const ownerCanInitialize = !isAdmin || ownerProfile?.profile?.created_by === userId;
  if (!todayRow && ownerCanInitialize) {
    const { data: inserted, error: insertError } = await supabase.from(TABELA_AGUA_LOGS).insert({
      created_by: userId, perfil_id: profileId, data_local: today,
      meta_doses: config.meta_doses, realizado_doses: 0,
    }).select('id,data_local,meta_doses,realizado_doses').single();
    if (insertError?.code === '23505') {
      const { data: concurrentRow, error: concurrentError } = await supabase.from(TABELA_AGUA_LOGS)
        .select('id,data_local,meta_doses,realizado_doses')
        .eq('created_by', userId).eq('perfil_id', profileId).eq('data_local', today).single();
      if (concurrentError) return { error: concurrentError };
      todayRow = concurrentRow;
    } else {
      if (insertError) return { error: insertError };
      todayRow = inserted;
    }
  }
  const { data: history, error: historyError } = historyResult;
  if (!todayRow && isAdmin) todayRow = { data_local: today, meta_doses: config.meta_doses, realizado_doses: 0 };
  return historyError ? { error: historyError } : waterResult(config, todayRow, history, 'supabase', profiles, profileId);
}

async function saveWaterGoal(payload, userId) {
  const today = dateInSaoPaulo(new Date());
  const profileResult = await requireSaudeProfileForWater(userId, payload.profile_id);
  if (profileResult.error) return profileResult;
  if (profileResult.notFound) return { notFound: true };
  const profileId = profileResult.profile.id;
  if (isOfflineMode()) {
    const todayRow = offlineWaterLogs.find((row) => row.created_by === userId && Number(row.perfil_id) === Number(profileId) && row.data_local === today);
    if (todayRow && todayRow.realizado_doses > payload.meta_doses) return { conflict: true };
    offlineWaterGoals.set(`${userId}:${profileId}`, { nome: payload.nome, meta_doses: payload.meta_doses });
    if (todayRow) todayRow.meta_doses = payload.meta_doses;
    return loadWater(userId, profileId);
  }

  const { supabase } = await import('../lib/supabase.js');
  const { data: current, error: currentError } = await supabase.from(TABELA_AGUA_LOGS)
    .select('id,realizado_doses').eq('created_by', userId).eq('perfil_id', profileId).eq('data_local', today).maybeSingle();
  if (currentError) return { error: currentError };
  if (current && Number(current.realizado_doses) > payload.meta_doses) return { conflict: true };

  const { error: goalError } = await supabase.from(TABELA_AGUA_METAS)
    .upsert({ created_by: userId, perfil_id: profileId, nome: payload.nome, meta_doses: payload.meta_doses }, { onConflict: 'created_by,perfil_id' });
  if (goalError) return { error: goalError };

  const dailyQuery = current
    ? supabase.from(TABELA_AGUA_LOGS).update({ meta_doses: payload.meta_doses }).eq('id', current.id).eq('created_by', userId)
    : supabase.from(TABELA_AGUA_LOGS).insert({ created_by: userId, perfil_id: profileId, data_local: today, meta_doses: payload.meta_doses, realizado_doses: 0 });
  const { error: dailyError } = await dailyQuery;
  if (dailyError) return { error: dailyError };
  return loadWater(userId, profileId);
}

async function updateWaterProgress(payload, userId) {
  const today = dateInSaoPaulo(new Date());
  const profileResult = await requireSaudeProfileForWater(userId, payload.profile_id);
  if (profileResult.error) return profileResult;
  if (profileResult.notFound) return { notFound: true };
  const profileId = profileResult.profile.id;
  if (isOfflineMode()) {
    const loaded = await loadWater(userId, profileId);
    if (!loaded.config || !loaded.today) return { notFound: true };
    if (payload.realizado_doses > loaded.today.meta_doses) return { conflict: true };
    const row = offlineWaterLogs.find((item) => item.created_by === userId && Number(item.perfil_id) === profileId && item.data_local === today);
    row.realizado_doses = payload.realizado_doses;
    return loadWater(userId, profileId);
  }

  const { supabase } = await import('../lib/supabase.js');
  const { data: current, error: currentError } = await supabase.from(TABELA_AGUA_LOGS)
    .select('id,meta_doses').eq('created_by', userId).eq('perfil_id', profileId).eq('data_local', today).maybeSingle();
  if (currentError) return { error: currentError };
  if (!current) return { notFound: true };
  if (payload.realizado_doses > Number(current.meta_doses)) return { conflict: true };
  const { data, error } = await supabase.from(TABELA_AGUA_LOGS)
    .update({ realizado_doses: payload.realizado_doses })
    .eq('id', current.id).eq('created_by', userId)
    .select('id,data_local,meta_doses,realizado_doses').maybeSingle();
  if (error) return { error };
  if (!data) return { notFound: true };
  return {
    resource: RESOURCE_CONSUMO_AGUA,
    storage: 'supabase',
    profile_id: profileId,
    today: {
      id: data.id,
      data: data.data_local,
      meta_doses: Number(data.meta_doses),
      realizado_doses: Number(data.realizado_doses),
    },
  };
}

async function loadAlertSchedule(profileId, userId, isAdmin = false) {
  const owned = await requireSaudeProfileForWater(userId, profileId, isAdmin);
  if (owned.error || owned.notFound || owned.invalid) return owned;
  if (isOfflineMode()) {
    const row = offlineAlertSchedules.get(`${userId}:${profileId}`)
      || (isAdmin ? [...offlineAlertSchedules.entries()].find(([key]) => key.endsWith(`:${profileId}`))?.[1] : null)
      || null;
    return { row: normalizeAlertSchedule(row), storage: 'memory' };
  }
  const { supabase } = await import('../lib/supabase.js');
  let query = supabase.from(TABELA_ALERTAS_AGENDA)
    .select('perfil_id,agua_ativo,agua_intervalo_horas,dieta_ativa,dieta_id,updated_at').eq('perfil_id', profileId);
  if (!isAdmin) query = query.eq('created_by', userId);
  const { data, error } = await query.maybeSingle();
  if (error) return { error };
  return { row: normalizeAlertSchedule(data), storage: 'supabase', updated_at: data?.updated_at || null };
}

async function saveAlertSchedule(profileId, payload, userId, isAdmin = false) {
  const validation = validateAlertSchedule(payload);
  if (validation.error) return { validationError: validation.error };
  const owned = await requireSaudeProfileForWater(userId, profileId, isAdmin);
  if (owned.error || owned.notFound || owned.invalid) return owned;
  const scheduleOwnerId = owned.profile.created_by || userId;
  if (validation.data.dieta_id !== null) {
    if (isOfflineMode()) {
      const dietExists = offlineDiets.some((diet) => Number(diet.id) === validation.data.dieta_id
        && Number(diet.perfil_id) === Number(profileId)
        && (isAdmin || diet.created_by === userId));
      if (!dietExists) return { dietNotFound: true };
    } else {
      const { supabase } = await import('../lib/supabase.js');
      let query = supabase.from(TABELA_DIETAS)
        .select('id').eq('id', validation.data.dieta_id).eq('perfil_id', profileId);
      if (!isAdmin) query = query.eq('created_by', userId);
      const { data: diet, error: dietError, status, statusText } = await query.maybeSingle();
      if (dietError) return { error: dietError, status, statusText };
      if (!diet) return { dietNotFound: true };
    }
  }
  const row = { perfil_id: profileId, created_by: scheduleOwnerId, ...validation.data };
  if (isOfflineMode()) {
    offlineAlertSchedules.set(`${scheduleOwnerId}:${profileId}`, row);
    return { row: normalizeAlertSchedule(row), storage: 'memory' };
  }
  const { supabase } = await import('../lib/supabase.js');
  const { data, error, status, statusText } = await supabase.from(TABELA_ALERTAS_AGENDA)
    .upsert(row, { onConflict: 'perfil_id' })
    .select('perfil_id,agua_ativo,agua_intervalo_horas,dieta_ativa,dieta_id,updated_at')
    .single();
  return error
    ? { error, status, statusText }
    : { row: normalizeAlertSchedule(data), storage: 'supabase', updated_at: data.updated_at };
}

async function loadProfiles(userId, includeAllUsers = false) {
  if (isOfflineMode()) return { rows: withProfileHistory(offlineProfiles, offlineProfileMeasurements), storage: 'memory' };
  const { supabase } = await import('../lib/supabase.js');
  let profilesQuery = supabase.from(TABELA_PERFIS)
    .select('id,nome,sexo,data_nascimento,data_medicao,peso_kg,altura_cm,created_at,updated_at')
    .order('created_at', { ascending: true });
  if (!includeAllUsers) profilesQuery = profilesQuery.eq('created_by', userId);
  const { data: profiles, error } = await profilesQuery;
  if (error) return { error };
  if (!profiles?.length) return { rows: [], storage: 'supabase' };
  const ids = profiles.map((profile) => profile.id);
  let measurementsQuery = supabase.from(TABELA_PERFIL_MEDIDAS)
    .select('id,perfil_id,peso_kg,altura_cm,imc,registrado_em')
    .in('perfil_id', ids)
    .order('registrado_em', { ascending: false });
  if (!includeAllUsers) measurementsQuery = measurementsQuery.eq('created_by', userId);
  const { data: measurements, error: historyError } = await measurementsQuery;
  return historyError ? { error: historyError } : { rows: withProfileHistory(profiles, measurements || []), storage: 'supabase' };
}

async function createProfile(payload, userId) {
  if (isOfflineMode()) {
    const id = Math.max(0, ...offlineProfiles.map((profile) => Number(profile.id) || 0)) + 1;
    const timestamp = new Date().toISOString();
    const row = { id, ...payload, created_by: userId, created_at: timestamp, updated_at: timestamp };
    offlineProfiles.push(row);
    offlineProfileMeasurements.unshift(profileMeasurement(row, offlineProfileMeasurements.length + 1, timestamp));
    return { row: withProfileHistory([row], offlineProfileMeasurements)[0], storage: 'memory' };
  }
  const { supabase } = await import('../lib/supabase.js');
  const { data, error } = await supabase.from(TABELA_PERFIS).insert({ ...payload, created_by: userId })
    .select('id,nome,sexo,data_nascimento,data_medicao,peso_kg,altura_cm,created_at,updated_at').single();
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
      offlineProfileMeasurements.unshift(profileMeasurement(row, offlineProfileMeasurements.length + 1, new Date().toISOString()));
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

async function createWeightMeasurement(payload, userId) {
  const timestamp = new Date().toISOString();
  if (isOfflineMode()) {
    const profileIndex = offlineProfiles.findIndex((profile) => Number(profile.id) === payload.perfil_id);
    if (profileIndex < 0) return { notFound: true };
    const row = { ...offlineProfiles[profileIndex], peso_kg: payload.peso_kg, data_medicao: dateInSaoPaulo(timestamp), updated_at: timestamp };
    offlineProfiles[profileIndex] = row;
    offlineProfileMeasurements.unshift(profileMeasurement(row, Math.max(0, ...offlineProfileMeasurements.map((item) => Number(item.id) || 0)) + 1, timestamp));
    return { row: withProfileHistory([row], offlineProfileMeasurements)[0], storage: 'memory' };
  }

  const { supabase } = await import('../lib/supabase.js');
  const { data: profile, error: profileError } = await supabase.from(TABELA_PERFIS)
    .select('id,peso_kg,altura_cm').eq('id', payload.perfil_id).eq('created_by', userId).maybeSingle();
  if (profileError) return { error: profileError };
  if (!profile) return { notFound: true };

  if (Number(profile.peso_kg) === payload.peso_kg) {
    const { error } = await supabase.from(TABELA_PERFIL_MEDIDAS).insert({
      perfil_id: profile.id,
      created_by: userId,
      peso_kg: payload.peso_kg,
      altura_cm: profile.altura_cm,
      registrado_em: timestamp,
    });
    if (error) return { error };
  } else {
    const { error } = await supabase.from(TABELA_PERFIS).update({ peso_kg: payload.peso_kg, data_medicao: dateInSaoPaulo(timestamp) })
      .eq('id', profile.id).eq('created_by', userId);
    if (error) return { error };
  }

  const loaded = await loadProfiles(userId);
  if (loaded.error) return loaded;
  return { row: loaded.rows.find((item) => Number(item.id) === Number(profile.id)), storage: 'supabase' };
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

async function loadDiets(userId, profileId = null, isAdmin = false) {
  const foods = await loadFoods();
  if (foods.error) return foods;
  if (isOfflineMode()) {
    let rows = offlineDiets.map((diet) => structuredClone(diet));
    if (profileId) {
      rows = rows.filter((diet) => Number(diet.perfil_id) === Number(profileId));
    }
    return { rows: rows.map((row) => enrichDietNutrition(row, foods.rows)), storage: 'memory' };
  }
  const { supabase } = await import('../lib/supabase.js');
  let query = supabase
    .from(TABELA_DIETAS)
    .select('id,slug,titulo,objetivo,duracao_dias,descricao,orientacoes_gerais,ritual_diario,dias,refeicoes,observacoes,meta_calorias,perfil_id,source_file,created_at,updated_at')
    .order('created_at', { ascending: false });
  if (profileId) {
    query = query.eq('perfil_id', profileId);
  }
  if (!isAdmin) {
    query = query.or(`created_by.is.null,created_by.eq.${userId}`);
  }
  const { data, error } = await query;
  if (error && isMissingTableError(error)) return { rows: [], storage: 'empty-fallback' };
  return error ? { error } : { rows: (data || []).map((row) => enrichDietNutrition(row, foods.rows)), storage: 'supabase' };
}

async function createDiet(payload, userId) {
  if (payload.perfil_id) {
    const ownedProfile = await requireSaudeProfileForWater(userId, payload.perfil_id);
    if (ownedProfile.error) return { error: ownedProfile.error };
    if (ownedProfile.notFound || ownedProfile.invalid) return { notFound: true };
  }
  const slug = slugify(payload.titulo);
  if (isOfflineMode()) {
    const id = Math.max(0, ...offlineDiets.map((diet) => Number(diet.id) || 0)) + 1;
    const row = { id, slug, ...payload, created_by: userId, source_file: 'Cadastro manual' };
    offlineDiets.unshift(row);
    return { row: structuredClone(row), storage: 'memory' };
  }
  const { supabase } = await import('../lib/supabase.js');
  const { data, error } = await supabase
    .from(TABELA_DIETAS)
    .insert({ slug, ...payload, source_file: 'Cadastro manual', created_by: userId })
    .select('id,slug,titulo,objetivo,duracao_dias,descricao,orientacoes_gerais,ritual_diario,dias,refeicoes,observacoes,meta_calorias,perfil_id,source_file,created_at,updated_at')
    .single();
  return error ? { error } : { row: data, storage: 'supabase' };
}

async function updateDiet(id, payload, userId, isAdmin = false) {
  if (payload.perfil_id && !isAdmin) {
    const ownedProfile = await requireSaudeProfileForWater(userId, payload.perfil_id);
    if (ownedProfile.error) return { error: ownedProfile.error };
    if (ownedProfile.notFound || ownedProfile.invalid) return { notFound: true };
  }
  if (isOfflineMode()) {
    const index = offlineDiets.findIndex((diet) => Number(diet.id) === id && (isAdmin || diet.created_by === userId));
    if (index < 0) return { notFound: true };
    offlineDiets[index] = { ...offlineDiets[index], ...payload, slug: slugify(payload.titulo) };
    return { row: structuredClone(offlineDiets[index]), storage: 'memory' };
  }
  const { supabase } = await import('../lib/supabase.js');
  let query = supabase
    .from(TABELA_DIETAS)
    .update({ slug: slugify(payload.titulo), ...payload })
    .eq('id', id);
  if (!isAdmin) query = query.eq('created_by', userId);
  const { data, error } = await query
    .select('id,slug,titulo,objetivo,duracao_dias,descricao,orientacoes_gerais,ritual_diario,dias,refeicoes,observacoes,meta_calorias,perfil_id,source_file,created_at,updated_at')
    .maybeSingle();
  if (error) return { error };
  return data ? { row: data, storage: 'supabase' } : { notFound: true };
}

async function deleteDiet(id, userId, isAdmin = false) {
  if (isOfflineMode()) {
    const previousLength = offlineDiets.length;
    offlineDiets = offlineDiets.filter((diet) => Number(diet.id) !== id || (!isAdmin && diet.created_by !== userId));
    return previousLength === offlineDiets.length ? { notFound: true } : { storage: 'memory' };
  }
  const { supabase } = await import('../lib/supabase.js');
  let query = supabase.from(TABELA_DIETAS).delete().eq('id', id);
  if (!isAdmin) query = query.eq('created_by', userId);
  const { data, error } = await query.select('id').maybeSingle();
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

function foodApiRow(row) {
  const weight = Number(row.peso_referencia_g ?? row.peso_g);
  const scaled = (value) => Number.isFinite(weight) && weight > 0 && Number.isFinite(Number(value))
    ? Math.round((Number(value) * weight / 100) * 100) / 100
    : null;
  return {
    id: row.id,
    source_order: row.source_order,
    categoria: row.categoria,
    item: row.item,
    porcao: row.porcao ?? row.porcao_equivalente,
    peso_referencia_g: Number.isFinite(weight) ? weight : null,
    peso_unidade_g: foodUnitWeight(row),
    kcal_100g: Number(row.kcal_100g),
    proteina_100g: Number(row.proteina_100g),
    carboidrato_100g: Number(row.carboidrato_100g),
    gordura_100g: Number(row.gordura_100g),
    kcal_porcao: scaled(row.kcal_100g),
    proteina_porcao: scaled(row.proteina_100g),
    carboidrato_porcao: scaled(row.carboidrato_100g),
    gordura_porcao: scaled(row.gordura_100g),
    observacoes: row.observacoes || null,
    fonte_nutricional: row.fonte_nutricional || 'Cadastro manual',
  };
}

async function loadFoods() {
  if (isOfflineMode()) return { rows: offlineFoods.map(foodApiRow), storage: 'bundled-fallback' };
  const { supabase } = await import('../lib/supabase.js');
  const columns = 'id,source_order,categoria,item,porcao_equivalente,peso_referencia_g,peso_unidade_g,kcal_100g,proteina_100g,carboidrato_100g,gordura_100g,observacoes,fonte_nutricional';
  let { data, error } = await supabase.from(TABELA_ALIMENTOS).select(columns).order('source_order', { ascending: true });
  if (error && ['42703', 'PGRST204'].includes(error.code)) {
    ({ data, error } = await supabase.from(TABELA_ALIMENTOS).select(columns.replace('peso_unidade_g,', '')).order('source_order', { ascending: true }));
  }
  if (error && isMissingTableError(error)) return { rows: bundledFoodRows().map(foodApiRow), storage: 'bundled-fallback' };
  return error ? { error } : { rows: (data || []).map(foodApiRow), storage: 'supabase' };
}

async function createFood(payload) {
  if (isOfflineMode()) {
    const source_order = Math.max(0, ...offlineFoods.map((row) => Number(row.source_order) || 0)) + 1;
    const row = { id: source_order, source_order, ...payload };
    offlineFoods.unshift(row);
    return { row: foodApiRow(row), storage: 'memory' };
  }
  const { supabase } = await import('../lib/supabase.js');
  const { data, error } = await supabase.from(TABELA_ALIMENTOS).insert({
    categoria: payload.categoria, item: payload.item, porcao_equivalente: payload.porcao,
    peso_referencia_g: payload.peso_referencia_g, peso_unidade_g: payload.peso_unidade_g, kcal_100g: payload.kcal_100g,
    proteina_100g: payload.proteina_100g, carboidrato_100g: payload.carboidrato_100g,
    gordura_100g: payload.gordura_100g, observacoes: payload.observacoes,
    fonte_nutricional: payload.fonte_nutricional, source_file: 'Cadastro manual',
  }).select('id,source_order,categoria,item,porcao_equivalente,peso_referencia_g,peso_unidade_g,kcal_100g,proteina_100g,carboidrato_100g,gordura_100g,observacoes,fonte_nutricional').single();
  return error ? { error } : { row: foodApiRow(data), storage: 'supabase' };
}

async function saveDietWithNutrition(id, payload, body, auth) {
  const loaded = await loadFoods();
  if (loaded.error) return loaded;
  const foods = loaded.rows;
  for (const meal of payload.refeicoes || []) {
    for (const [index, item] of meal.itens.entries()) {
      const food = matchFoodForDietItem(item, foods);
      if (item.alimento_id && !foods.some((entry) => Number(entry.id) === Number(item.alimento_id))) {
        return { invalid: 'O alimento selecionado não está mais no catálogo. Selecione novamente.' };
      }
      if (food) { item.alimento_id = Number(food.id); item.nome = food.item; }
      const customDestination = body.novo_alimento && body.novo_alimento_destino?.refeicao === meal.tipo && body.novo_alimento_destino?.indice === index;
      if (item.quantidade_valor != null && !customDestination && (!food || nutritionForDietItem(item, foods).proteina == null)) {
        return { invalid: 'Selecione um alimento com peso por unidade cadastrado ou informe a quantidade em gramas.' };
      }
    }
  }
  if (!body.novo_alimento) {
    const result = id ? await updateDiet(id, payload, auth.user.id, auth.isAdmin) : await createDiet(payload, auth.user.id);
    return result.row ? { ...result, row: enrichDietNutrition(result.row, foods) } : result;
  }
  if (!auth.isAdmin) return { forbidden: true };
  const validation = validateFoodPayload(body.novo_alimento);
  if (validation.error) return { invalid: validation.error };
  const destination = body.novo_alimento_destino;
  const meal = payload.refeicoes?.find((entry) => entry.tipo === destination?.refeicao);
  const index = destination?.indice;
  if (!meal || !Number.isInteger(index) || index < 0 || index >= meal.itens.length) return { invalid: 'Destino do novo alimento inválido.' };
  const foodPayload = validation.data;
  meal.itens[index].nome = foodPayload.item;
  meal.itens[index].alimento_id = null;
  meal.itens[index].calorias = null;
  const reusedFood = matchFoodForDietItem({ nome: foodPayload.item }, foods);
  if (reusedFood) foodPayload.item = reusedFood.item;
  const candidate = reusedFood || { ...foodPayload, id: null };
  if (nutritionForDietItem({ ...meal.itens[index], nome: candidate.item, alimento_id: candidate.id }, [candidate]).proteina == null) {
    return { invalid: 'Informe o peso por unidade do novo alimento ou use gramas na quantidade da dieta.' };
  }
  if (isOfflineMode()) {
    const profile = offlineProfiles.find((entry) => Number(entry.id) === Number(payload.perfil_id) && (id && auth.isAdmin || entry.created_by === auth.user.id));
    const existing = id ? offlineDiets.find((entry) => Number(entry.id) === id && (auth.isAdmin || entry.created_by === auth.user.id)) : null;
    if (!profile || id && !existing) return { notFound: true };
    const existingFood = foods.find((entry) => entry.item.trim().toLowerCase() === foodPayload.item.toLowerCase());
    const order = Math.max(0, ...offlineFoods.map((entry) => Number(entry.source_order))) + 1;
    const newFood = existingFood || foodApiRow({ id: order, source_order: order, ...foodPayload });
    meal.itens[index] = { ...meal.itens[index], nome: newFood.item, alimento_id: Number(newFood.id) };
    const result = id ? await updateDiet(id, payload, auth.user.id, auth.isAdmin) : await createDiet(payload, auth.user.id);
    if (!result.row) return result;
    if (!existingFood) offlineFoods.push({ id: order, source_order: order, ...foodPayload });
    return { ...result, food: newFood, row: enrichDietNutrition(result.row, [...foods, newFood]) };
  }
  const { supabase } = await import('../lib/supabase.js');
  const { data, error } = await supabase.rpc('save_saude_dieta_with_food', {
    p_id: id, p_actor: auth.user.id, p_admin: auth.isAdmin,
    p_diet: { ...payload, slug: slugify(payload.titulo) },
    p_food: foodPayload, p_meal: destination.refeicao, p_index: index,
  });
  if (error) return { error: { ...error, message: ['PGRST202', '42883'].includes(error.code)
    ? 'Aplique a migration de integração dos alimentos com as dietas antes de salvar pela opção Outros.' : error.message } };
  const food = foodApiRow(data.food);
  return { storage: 'supabase', food, row: enrichDietNutrition(data.row, [...foods.filter((entry) => Number(entry.id) !== Number(food.id)), food]) };
}

async function updateFood(id, payload) {
  if (isOfflineMode()) {
    const index = offlineFoods.findIndex((row) => Number(row.id) === id);
    if (index < 0) return { notFound: true };
    offlineFoods[index] = { ...offlineFoods[index], ...payload };
    return { row: foodApiRow(offlineFoods[index]), storage: 'memory' };
  }
  const { supabase } = await import('../lib/supabase.js');
  const { data, error } = await supabase.from(TABELA_ALIMENTOS).update({
    categoria: payload.categoria, item: payload.item, porcao_equivalente: payload.porcao,
    peso_referencia_g: payload.peso_referencia_g, peso_unidade_g: payload.peso_unidade_g, kcal_100g: payload.kcal_100g,
    proteina_100g: payload.proteina_100g, carboidrato_100g: payload.carboidrato_100g,
    gordura_100g: payload.gordura_100g, observacoes: payload.observacoes,
    fonte_nutricional: payload.fonte_nutricional,
  }).eq('id', id)
    .select('id,source_order,categoria,item,porcao_equivalente,peso_referencia_g,peso_unidade_g,kcal_100g,proteina_100g,carboidrato_100g,gordura_100g,observacoes,fonte_nutricional').maybeSingle();
  return error ? { error } : data ? { row: foodApiRow(data), storage: 'supabase' } : { notFound: true };
}

async function deleteFood(id) {
  if (isOfflineMode()) {
    const length = offlineFoods.length;
    offlineFoods = offlineFoods.filter((row) => Number(row.id) !== id);
    return length === offlineFoods.length ? { notFound: true } : { storage: 'memory' };
  }
  const { supabase } = await import('../lib/supabase.js');
  const { data, error } = await supabase.from(TABELA_ALIMENTOS).delete().eq('id', id).select('id').maybeSingle();
  return error ? { error } : data ? { storage: 'supabase' } : { notFound: true };
}

export default async function handler(req, res) {
  if (req.method === 'GET' && req.query?.health === '1') {
    return json(res, 200, { ok: true, service: 'saude' });
  }

  const auth = await requireUser(req, { appId: 'saude' });
  if (!auth.ok) return json(res, auth.status, auth.data);

  if (!auth.isAdmin && [RESOURCE_TABELA_NUTRICIONAL, RESOURCE_ALIMENTOS].includes(req.query?.resource) && req.method !== 'GET') {
    return json(res, 403, { error: 'Somente o administrador pode alterar o catálogo compartilhado de alimentos.' });
  }

  if (req.method === 'GET') {
    if (req.query?.resource === RESOURCE_ALERTAS_AGENDA) {
      const profileId = parseId(req.query?.profile_id);
      if (!profileId) return json(res, 400, { error: 'Perfil invalido.' });
      if (auth.isAdmin && !isOfflineMode() && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return json(res, 503, { error: 'A leitura master de Saúde requer SUPABASE_SERVICE_ROLE_KEY no servidor.' });
      }
      const result = await loadAlertSchedule(profileId, auth.user.id, auth.isAdmin);
      if (result.error) return json(res, 500, { error: 'Nao foi possivel carregar os agendamentos.' });
      if (result.notFound || result.invalid) return json(res, 404, { error: 'Perfil de saude nao encontrado.' });
      return json(res, 200, { resource: RESOURCE_ALERTAS_AGENDA, ...result });
    }
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
    if (req.query?.resource === RESOURCE_ALIMENTOS) {
      const result = await loadFoods();
      if (result.error) return json(res, 500, { error: result.error.message });
      const categorias = [...new Set(result.rows.map((row) => row.categoria).filter(Boolean))];
      return json(res, 200, { resource: RESOURCE_ALIMENTOS, storage: result.storage, admin_view: auth.isAdmin, total: result.rows.length, categorias, rows: result.rows });
    }
    if (req.query?.resource === RESOURCE_DIETAS) {
      const profileId = req.query?.profile_id ? parseId(req.query.profile_id) : null;
      if (req.query?.profile_id && !profileId) return json(res, 400, { error: 'Perfil invalido.' });
      if (profileId && !auth.isAdmin) {
        const ownedProfile = await requireSaudeProfileForWater(auth.user.id, profileId);
        if (ownedProfile.error) return json(res, 500, { error: ownedProfile.error.message });
        if (ownedProfile.notFound || ownedProfile.invalid) return json(res, 404, { error: 'Perfil de saude nao encontrado.' });
      }
      const result = await loadDiets(auth.user.id, profileId, auth.isAdmin);
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
      if (auth.isAdmin && !isOfflineMode() && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return json(res, 503, { error: 'A visualização master de Saúde requer SUPABASE_SERVICE_ROLE_KEY no servidor.' });
      }
      const result = await loadProfiles(auth.user.id, auth.isAdmin);
      if (result.error) return json(res, 500, { error: result.error.message });
      return json(res, 200, { resource: RESOURCE_PERFIS, storage: result.storage, admin_view: auth.isAdmin, total: result.rows.length, rows: result.rows });
    }
    if (req.query?.resource === RESOURCE_CONSUMO_AGUA) {
      const requestedProfileId = req.query?.profile_id == null ? null : parseId(req.query.profile_id);
      if (req.query?.profile_id != null && !requestedProfileId) return json(res, 400, { error: 'Perfil invalido.' });
      if (auth.isAdmin && !isOfflineMode() && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return json(res, 503, { error: 'A leitura master de Saúde requer SUPABASE_SERVICE_ROLE_KEY no servidor.' });
      }
      const result = await loadWater(auth.user.id, requestedProfileId, {
        includeProfiles: req.query?.include_profiles !== '0', isAdmin: auth.isAdmin,
      });
      if (result.error) return json(res, 500, { error: result.error.message });
      if (result.notFound) return json(res, 404, { error: 'Perfil de saude nao encontrado.' });
      if (result.invalidProfile) return json(res, 400, { error: 'Perfil invalido.' });
      return json(res, 200, result);
    }

    return json(res, 200, {
      module: 'saude',
      status: 'ready',
      configured: true,
      pages: [
        { id: 'alimentos', title: 'Alimentos' },
        { id: 'tabela-nutricional', title: 'Tabela Nutricional' },
        { id: 'dietas', title: 'Dietas' },
        { id: 'perfis', title: 'Perfil' },
        { id: 'consumo-agua', title: 'Consumo de agua' },
      ],
      message: 'Módulo de Saúde disponível.',
    });
  }

  if (![RESOURCE_ALIMENTOS, RESOURCE_TABELA_NUTRICIONAL, RESOURCE_DIETAS, RESOURCE_PERFIS, RESOURCE_PERFIL_MEDIDAS, RESOURCE_CONSUMO_AGUA, RESOURCE_ALERTAS_AGENDA].includes(req.query?.resource)) {
    return json(res, 400, { error: 'Recurso invalido.' });
  }

  if (req.query?.resource === RESOURCE_ALERTAS_AGENDA && req.method === 'POST') {
    const body = readBody(req);
    if (!body) return json(res, 400, { error: 'JSON invalido.' });
    const profileId = parseId(body.profile_id ?? req.query?.profile_id);
    if (!profileId) return json(res, 400, { error: 'Perfil invalido.' });
    const result = await saveAlertSchedule(profileId, body, auth.user.id, auth.isAdmin);
    if (result.error) {
      const code = String(result.error.code || 'BACKEND_ERROR').replace(/[^A-Z0-9_-]/gi, '').slice(0, 32) || 'BACKEND_ERROR';
      const messages = {
        '23503': 'O perfil ou a dieta selecionada não está mais disponível. Atualize os dados e tente novamente.',
        '23514': 'O intervalo escolhido não é aceito pelo banco. Atualize a tela e selecione de 1 a 12 horas.',
        '42501': 'O banco recusou a gravação por falta de permissão. Código de suporte: 42501.',
      };
      const error = result.error;
      const diagnostic = JSON.stringify({
        type: typeof error,
        constructor: error?.constructor?.name || null,
        keys: error && (typeof error === 'object' || typeof error === 'function')
          ? Object.keys(error).slice(0, 12)
          : [],
        name: error?.name || null,
        message: error?.message || (typeof error === 'string' ? error : null),
        status: error?.status ?? error?.statusCode ?? null,
        responseStatus: result.status ?? null,
        responseStatusText: result.statusText || null,
      })
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
        .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[token]')
        .replace(/https?:\/\/[^\s?]+\?[^\s]+/gi, '[url]')
        .slice(0, 180);
      console.error(`[saude] Falha ao salvar agendamentos. Código: ${code}; diagnóstico: ${diagnostic}`);
      return json(res, 500, {
        error: messages[code] || `Não foi possível salvar os agendamentos. Código de suporte: ${code}.`,
        code,
      });
    }
    if (result.notFound || result.invalid) return json(res, 404, { error: 'Perfil de saude nao encontrado.' });
    if (result.dietNotFound) return json(res, 404, { error: 'A dieta selecionada nao pertence a este perfil.' });
    if (result.validationError) return json(res, 400, { error: result.validationError });
    return json(res, 200, { resource: RESOURCE_ALERTAS_AGENDA, ...result });
  }

  if (req.query?.resource === RESOURCE_CONSUMO_AGUA && req.method === 'POST') {
    const body = readBody(req);
    if (!body) return json(res, 400, { error: 'JSON invalido.' });
    const validation = validateWaterGoalPayload(body);
    if (validation.error) return json(res, 400, { error: validation.error });
    const result = await saveWaterGoal(validation.data, auth.user.id);
    if (result.error) return json(res, 500, { error: result.error.message });
    if (result.notFound) return json(res, 404, { error: 'Perfil de saude nao encontrado.' });
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

  if (req.query?.resource === RESOURCE_CONSUMO_AGUA && req.method === 'DELETE') {
    const body = readBody(req);
    if (!body) return json(res, 400, { error: 'JSON invalido.' });
    if (body.action !== 'delete-goal') return json(res, 400, { error: 'Acao invalida.' });
    const profileId = parseId(body.profile_id ?? req.query?.profile_id);
    if (!profileId) return json(res, 400, { error: 'Perfil invalido.' });
    const result = await deleteWaterGoal(profileId, auth.user.id);
    if (result.error) return json(res, 500, { error: result.error.message });
    if (result.notFound) return json(res, 404, { error: 'Meta de agua nao encontrada.' });
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

  if (req.query?.resource === RESOURCE_PERFIL_MEDIDAS && req.method === 'POST') {
    const body = readBody(req);
    if (!body) return json(res, 400, { error: 'JSON invalido.' });
    const validation = validateNewWeightPayload(body);
    if (validation.error) return json(res, 400, { error: validation.error });
    const result = await createWeightMeasurement(validation.data, auth.user.id);
    if (result.error) return json(res, 500, { error: result.error.message });
    if (result.notFound) return json(res, 404, { error: 'Perfil nao encontrado.' });
    return json(res, 201, result);
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
    const isCreate = req.method === 'POST';
    const validation = validateDietPayload(body, isCreate);
    if (validation.error) return json(res, 400, { error: validation.error });
    const id = isCreate ? null : parseId(body.id ?? req.query?.id);
    if (!isCreate && !id) return json(res, 400, { error: 'ID invalido.' });
    const result = await saveDietWithNutrition(id, validation.data, body, auth);
    if (result.invalid) return json(res, 400, { error: result.invalid });
    if (result.forbidden) return json(res, 403, { error: 'Somente o administrador pode cadastrar um novo alimento no catálogo.' });
    if (result.error) return json(res, 500, { error: result.error.message });
    if (result.notFound) return json(res, 404, { error: 'Dieta nao encontrada.' });
    return json(res, isCreate ? 201 : 200, result);
  }

  if (req.query?.resource === RESOURCE_DIETAS && req.method === 'DELETE') {
    const body = readBody(req);
    if (!body) return json(res, 400, { error: 'JSON invalido.' });
    const id = parseId(body.id ?? req.query?.id);
    if (!id) return json(res, 400, { error: 'ID invalido.' });
    const result = await deleteDiet(id, auth.user.id, auth.isAdmin);
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

  if (req.query?.resource === RESOURCE_ALIMENTOS && (req.method === 'POST' || req.method === 'PATCH')) {
    const body = readBody(req);
    if (!body) return json(res, 400, { error: 'JSON inválido.' });
    const validation = validateFoodPayload(body);
    if (validation.error) return json(res, 400, { error: validation.error });
    if (req.method === 'POST') {
      const result = await createFood(validation.data);
      if (result.error) return json(res, 500, { error: result.error.message });
      return json(res, 201, result);
    }
    const id = parseId(body.id ?? req.query?.id);
    if (!id) return json(res, 400, { error: 'ID inválido.' });
    const result = await updateFood(id, validation.data);
    if (result.error) return json(res, 500, { error: result.error.message });
    if (result.notFound) return json(res, 404, { error: 'Alimento não encontrado.' });
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

  if (req.query?.resource === RESOURCE_ALIMENTOS && req.method === 'DELETE') {
    const body = readBody(req);
    if (!body) return json(res, 400, { error: 'JSON inválido.' });
    const id = parseId(body.id ?? req.query?.id);
    if (!id) return json(res, 400, { error: 'ID inválido.' });
    const result = await deleteFood(id);
    if (result.error) return json(res, 500, { error: result.error.message });
    if (result.notFound) return json(res, 404, { error: 'Alimento não encontrado.' });
    return json(res, 200, { ok: true, ...result });
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return json(res, 405, { error: 'Method Not Allowed' });
}
