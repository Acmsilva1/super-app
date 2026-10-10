import { DIET_MEALS, dietForDate } from './dietasService.js';
import { enrichDietNutrition, nutritionForDietItem } from './alimentosService.js';
import { DEFAULT_ALERT_SCHEDULE, normalizeAlertSchedule } from './alertScheduleConfig.js';

const TIME_ZONE = 'America/Sao_Paulo';
const SAFE_DELIVERY_ERRORS = new Set([
  'telegram_token_invalid', 'telegram_chat_not_found', 'telegram_bot_blocked',
  'telegram_start_required', 'telegram_recipient_is_bot', 'telegram_bot_no_permission',
  'telegram_forbidden', 'telegram_rate_limited', 'telegram_bad_request',
  'telegram_network_error', 'telegram_config_missing', 'telegram_send_failed',
]);


function saoPauloClock(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

async function readAlertConfig(deadline) {
  const ownerId = String(process.env.SAUDE_ALERTS_OWNER_USER_ID || '').trim();
  const configuredUrl = String(process.env.ALERTS_API_URL || '').trim();
  const deploymentHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const url = configuredUrl || (deploymentHost ? `https://${deploymentHost}/api/telegram-alert` : '');
  const token = String(process.env.ALERTS_API_TOKEN || '').trim();
  const enabled = process.env.SAUDE_ALERTS_ENABLED === 'true';
  if (!enabled || !ownerId || !url || !token) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ownerId)) {
    throw new Error('SAUDE_ALERTS_OWNER_USER_ID inválido.');
  }
  const gateway = new URL(url);
  if (gateway.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(gateway.hostname))) {
    throw new Error('alerts_gateway_https_required');
  }
  const { getAlertServiceClient } = await import('../../../lib/alertServiceClient.js');
  return { ownerId, url, token, client: getAlertServiceClient({deadline}) };
}

async function sendAlert(config, { eventType, title, message, dedupeKey }) {
  if (config.deadline && Date.now() + 22000 > config.deadline) throw new Error('alerts_time_budget');
  const client = config.client;
  const { error: claimError } = await client.from('tb_saude_alertas_envios').insert({
    created_by: config.ownerId, dedupe_key: dedupeKey, status: 'sending',
  });
  if (claimError?.code === '23505') return false;
  if (claimError) throw new Error('alerts_claim_failed');
  try {
    const headers = { 'Content-Type': 'application/json', 'X-Alert-Token': config.token };
    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    const response = await fetch(config.url, {
      method: 'POST', headers, redirect: 'error',
      body: JSON.stringify({ source: 'superapp-node', event_type: eventType,
        severity: 'info', title, message, dedupe_key: dedupeKey, occurred_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(Math.max(1,Math.min(20000,(config.deadline || Date.now()+21000)-Date.now()-1000))),
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok) {
      const errorCode = SAFE_DELIVERY_ERRORS.has(payload?.error)
        ? payload.error
        : `gateway_http_${response.status}`;
      throw Object.assign(new Error(errorCode), { code: errorCode });
    }
    if (!payload.ok || !Number.isSafeInteger(payload.telegram_message_id)) throw new Error('alerts_gateway_invalid_response');
    const { error } = await client.from('tb_saude_alertas_envios')
      .update({ status: 'sent', telegram_message_id: payload.telegram_message_id, updated_at: new Date().toISOString() })
      .eq('created_by', config.ownerId).eq('dedupe_key', dedupeKey);
    if (error) throw new Error('alerts_delivery_record_failed');
    return true;
  } catch (error) {
    const errorCode = SAFE_DELIVERY_ERRORS.has(error?.code)
      ? error.code
      : /^gateway_http_[1-5][0-9]{2}$/.test(error?.code || '')
        ? error.code
        : ['alerts_gateway_invalid_response', 'alerts_delivery_record_failed'].includes(error?.message)
          ? error.message
          : 'delivery_error';
    await client.from('tb_saude_alertas_envios').update({ status: 'uncertain', last_error: errorCode, updated_at: new Date().toISOString() })
      .eq('created_by', config.ownerId).eq('dedupe_key', dedupeKey);
    throw new Error('alerts_delivery_uncertain');
  }
}

async function loadAlertData(config, today) {
  const supabase = config.client;
  const [profilesResult, goalsResult, logsResult, dietsResult, schedulesResult, foodsResult] = await Promise.all([
    supabase.from('tb_saude_perfis')
      .select('id,nome,created_by').order('created_at', { ascending: true }),
    supabase.from('tb_saude_agua_metas')
      .select('perfil_id,nome,meta_doses'),
    supabase.from('tb_saude_agua_logs')
      .select('perfil_id,data_local,meta_doses,realizado_doses')
      .eq('data_local', today),
    supabase.from('tb_saude_dietas')
      .select('id,perfil_id,titulo,refeicoes,semanal,semana,alerta_ativo,updated_at')
      .order('id', { ascending: true }),
    supabase.from('tb_saude_alertas_agenda')
      .select('perfil_id,agua_ativo,agua_intervalo_horas,agua_inicio,agua_fim,dieta_ativa,dieta_id,dieta_horarios,updated_at'),
    supabase.from('tb_saude_alimentos')
      .select('id,item,porcao_equivalente,peso_referencia_g,peso_unidade_g,kcal_100g,proteina_100g,carboidrato_100g,gordura_100g')
      .order('source_order', { ascending: true }),
  ]);
  let availableFoods = foodsResult;
  if (availableFoods.error && ['42703', 'PGRST204'].includes(String(availableFoods.error.code))) {
    availableFoods = await supabase.from('tb_saude_alimentos')
      .select('id,item,porcao_equivalente,peso_referencia_g,kcal_100g,proteina_100g,carboidrato_100g,gordura_100g')
      .order('source_order', { ascending: true });
  }
  const scheduleTableMissing = schedulesResult.error && ['42P01', 'PGRST205'].includes(String(schedulesResult.error.code));
  const foodsTableMissing = availableFoods.error && ['42P01', 'PGRST205'].includes(String(availableFoods.error.code));
  const failed = [profilesResult, goalsResult, logsResult, dietsResult, ...(scheduleTableMissing ? [] : [schedulesResult]), ...(foodsTableMissing ? [] : [availableFoods])].find((result) => result.error);
  if (failed) throw new Error(`saude_data_${failed.error.code || 'unavailable'}`);

  const profiles = profilesResult.data || [];
  const goals = new Map((goalsResult.data || []).map((row) => [String(row.perfil_id), row]));
  const logs = new Map((logsResult.data || []).map((row) => [String(row.perfil_id), row]));
  const diets = dietsResult.data || [];
  const schedules = new Map((scheduleTableMissing ? [] : (schedulesResult.data || []))
    .map((row) => [String(row.perfil_id), { ...normalizeAlertSchedule(row), updated_at: row.updated_at }]));
  return { profiles, goals, logs, diets, schedules, foods: foodsTableMissing ? [] : (availableFoods.data || []) };
}

function waterProfileReport(profile, goal, log, date, time) {
  const target = Number(goal?.meta_doses ?? log?.meta_doses);
  const completed = Number(log?.realizado_doses || 0);
  const configured = Number.isInteger(target) && target > 0;
  return {
    pipeline: 'agua',
    data: date,
    horario: time,
    perfil: { id: profile.id, nome: profile.nome },
    recipiente: goal?.nome || null,
    meta_doses: configured ? target : null,
    doses_realizadas: configured ? completed : null,
    doses_restantes: configured ? Math.max(0, target - completed) : null,
    unidade: 'doses',
    situacao: configured ? 'meta_em_andamento' : 'meta_nao_configurada',
  };
}

function dietProfileReport(profile, diet, meal, date, time, foods = []) {
  diet = dietForDate(diet, date);
  const meals = Array.isArray(diet?.refeicoes) ? diet.refeicoes : [];
  const selectedMeal = meals.find((entry) => entry?.tipo === meal.tipo);
  const items = Array.isArray(selectedMeal?.itens) ? selectedMeal.itens : [];
  const definition = DIET_MEALS.find((entry) => entry.tipo === meal.tipo);
  return {
    pipeline: 'dieta',
    data: date,
    horario: time,
    periodo: definition?.titulo || meal.titulo,
    perfil: { id: profile.id, nome: profile.nome },
    dieta: diet ? { id: diet.id, titulo: diet.titulo, dia_semana: diet.dia_semana } : null,
    menu: items.map((item) => {
      const nutrition = nutritionForDietItem(item, foods);
      return {
        alimento: String(item?.nome || ''),
        quantidade: String(item?.quantidade || ''),
        calorias_kcal: nutrition.kcal,
        proteina_g: nutrition.proteina,
        carboidrato_g: nutrition.carboidrato,
        gordura_g: nutrition.gordura,
      };
    }),
    nutricao_refeicao: enrichDietNutrition({ refeicoes: selectedMeal ? [selectedMeal] : [] }, foods).nutricao_total,
  };
}

function readablePart(value, maxLength = 100) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function displayDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : readablePart(value, 20);
}

function formatWaterAlert(report) {
  const name = readablePart(report.perfil?.nome, 80) || 'seu perfil';
  const lines = [`💧 Hora de beber água, ${name}!`, `📅 ${displayDate(report.data)} · ⏰ ${report.horario}`];
  if (report.situacao === 'meta_nao_configurada') {
    lines.push('🥤 Ainda falta configurar a meta diária de água deste perfil.');
    return lines.join('\n');
  }
  const container = readablePart(report.recipiente, 60);
  lines.push(`🥤 Meta${container ? ` (${container})` : ''}: ${report.meta_doses} doses`);
  lines.push(`✅ Já registradas: ${report.doses_realizadas} de ${report.meta_doses}`);
  lines.push(report.doses_restantes > 0
    ? `🎯 Faltam ${report.doses_restantes} ${report.doses_restantes === 1 ? 'dose' : 'doses'} para a meta.`
    : '🏆 Meta de água concluída. Mandou bem!');
  return lines.join('\n');
}

function formatDietAlert(report) {
  const name = readablePart(report.perfil?.nome, 80) || 'seu perfil';
  const meal = readablePart(report.periodo, 60) || 'refeição';
  const lines = [`🍽️ ${meal} na sequência, ${name}!`, `📅 ${displayDate(report.data)} · ⏰ ${report.horario}`];
  if (report.dieta?.titulo) lines.push(`📋 Plano: ${readablePart(report.dieta.titulo, 100)}`);
  else lines.push('📋 Nenhuma dieta selecionada para este perfil.');
  if (report.dieta?.dia_semana) lines.push(`🗓️ ${report.dieta.dia_semana}`);
  const menu = Array.isArray(report.menu) ? report.menu : [];
  if (menu.length) {
    lines.push('🥗 Menu:');
    for (const item of menu) {
      const food = readablePart(item.alimento, 90);
      const quantity = readablePart(item.quantidade, 40);
      if (!food) continue;
      lines.push(`• ${food}${quantity ? ` — ${quantity}` : ''}`);
    }
  } else {
    lines.push('🥗 O menu desta refeição ainda não foi cadastrado.');
  }

  const displayNutrition = (value) => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const mealTotals = report.nutricao_refeicao;
  if (menu.length && mealTotals?.completo) {
    lines.push(`🥗 Nesta refeição, você ingere ${displayNutrition(mealTotals.proteina)} g de proteínas, ${displayNutrition(mealTotals.carboidrato)} g de carboidratos e ${displayNutrition(mealTotals.gordura)} g de gorduras, totalizando ${displayNutrition(mealTotals.kcal)} kcal.`);
  } else if (menu.length) {
    lines.push('ℹ️ Ainda faltam dados de alguns alimentos para calcular o total desta refeição. Confira o cadastro e as quantidades no app.');
  }

  return lines.join('\n');
}

async function dispatchWaterForProfile(config, data, profile, date, time) {
  const key = `agua:${date}:${time}:${profile.id}`;
  const report = waterProfileReport(profile, data.goals.get(String(profile.id)), data.logs.get(String(profile.id)), date, time);
  return Number(await sendAlert(config, { eventType: 'health.water_progress', title: `Progresso de agua - ${profile.nome}`, message: formatWaterAlert(report), dedupeKey: key }));
}

export function buildDietAlertMessages(data, meal, date, time, { includeInactive = false } = {}) {
  const profiles = new Map(data.profiles.map((profile) => [String(profile.id), profile]));
  const blocks = data.diets.filter((diet) => diet.alerta_ativo !== false && (includeInactive
    || data.schedules.get(String(diet.perfil_id))?.dieta_ativa !== false))
    .map((diet) => {
      const profile = profiles.get(String(diet.perfil_id)) || { id: diet.perfil_id, nome: 'Perfil não vinculado' };
      return formatDietAlert(dietProfileReport(profile, diet, meal, date, time, data.foods));
    });
  if (!blocks.length) return [];
  // Keep every diet and item; long summaries continue in additional Telegram messages.
  const characters = Array.from(blocks.join('\n\n────────────────\n\n'));
  const messages = [];
  let message = '';
  for (const character of characters) {
    if (message.length + character.length > 2800) {
      messages.push(message);
      message = '';
    }
    message += character;
  }
  if (message) messages.push(message);
  return messages;
}

export async function previewAllDietAlerts(now = new Date()) {
  const { getAlertServiceClient } = await import('../../../lib/alertServiceClient.js');
  const { date, time } = saoPauloClock(now);
  const data = await loadAlertData({ client: getAlertServiceClient() }, date);
  return data.diets.flatMap(diet => {
    const schedule = normalizeAlertSchedule(data.schedules.get(String(diet.perfil_id)));
    const meal = schedule.dieta_horarios.find(entry => entry.horario >= time) || schedule.dieta_horarios[0];
    return meal ? buildDietAlertMessages({ ...data, diets: [diet] }, meal, date, meal.horario, { includeInactive: true }) : [];
  });
}

async function dispatchCurrentSlot(config, value, data) {
  const { date, time } = saoPauloClock(value);
  const failures = [];
  let alertsSent = 0;
  try {
    data ||= await loadAlertData(config, date);
    const defaults = normalizeAlertSchedule(DEFAULT_ALERT_SCHEDULE);
    for (const profile of data.profiles) {
      const profileKey = String(profile.id);
      const schedule = data.schedules.get(profileKey) || defaults;
      const minuteOfDay = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
      const waterStart = Number(schedule.agua_inicio.slice(0, 2)) * 60 + Number(schedule.agua_inicio.slice(3, 5));
      const waterEnd = Number(schedule.agua_fim.slice(0, 2)) * 60 + Number(schedule.agua_fim.slice(3, 5));
      if ((!data.schedules.get(profileKey)?.updated_at || new Date(data.schedules.get(profileKey).updated_at).getTime() <= value.getTime()) && schedule.agua_ativo && minuteOfDay >= waterStart && minuteOfDay <= waterEnd
        && (minuteOfDay - waterStart) % (schedule.agua_intervalo_horas * 60) === 0) {
        try {
          alertsSent += await dispatchWaterForProfile({ ...config, ownerId: profile.created_by || config.ownerId }, data, profile, date, time);
        } catch (error) {
          failures.push(error);
        }
      }
    }
    const dueTypes = new Set();
    const scheduleFor = diet => normalizeAlertSchedule(data.schedules.get(String(diet.perfil_id)));
    const configuredBeforeSlot = diet => {
      const updatedAt = data.schedules.get(String(diet.perfil_id))?.updated_at;
      return !updatedAt || new Date(updatedAt).getTime() <= value.getTime();
    };
    for (const diet of data.diets) if (configuredBeforeSlot(diet) && diet.alerta_ativo !== false && scheduleFor(diet).dieta_ativa) {
      for (const meal of scheduleFor(diet).dieta_horarios) if (meal.horario === time) dueTypes.add(meal.tipo);
    }
    for (const type of dueTypes) {
      const meal = DIET_MEALS.find(entry => entry.tipo === type);
      const dueData = { ...data, diets: data.diets.filter(diet => configuredBeforeSlot(diet) && scheduleFor(diet).dieta_horarios.some(entry => entry.tipo === type && entry.horario === time)) };
      const messages = buildDietAlertMessages(dueData, meal, date, time);
      for (const [index, message] of messages.entries()) {
        try {
          alertsSent += Number(await sendAlert(config, {
            eventType: 'health.diet_menu', title: `Dietas · ${meal.titulo}`,
            message, dedupeKey: `dietas:${date}:${time}:todas:${dueTypes.size > 1 ? `${type}:` : ''}${index + 1}`,
          }));
        } catch (error) { failures.push(error); }
      }
    }
  } catch (error) {
    throw error;
  }
  return { failures, alertsSent };
}

export async function runSaudeAlertSlot(now = new Date(), {deadline = Date.now()+45000} = {}) {
  const config = await readAlertConfig(deadline);
  if (!config) return { skipped: true, reason: 'disabled_or_missing_config' };
  config.deadline = deadline;
  const { data: roles, error } = await config.client.from('app_user_roles').select('role').eq('user_id', config.ownerId);
  if (error || !roles?.some(row => ['owner', 'admin'].includes(row.role))) throw new Error('alerts_owner_invalid');
  const start = new Date(Math.floor(now.getTime() / 60000) * 60000);
  const failures = [];
  let alertsSent = 0;
  const dates = new Map();
  // Recover configured times from the last hour; persistent delivery keys prevent repeats.
  for (let offset = 60; offset >= 0; offset--) {
    const slot = new Date(start.getTime() - offset * 60000);
    const { date } = saoPauloClock(slot);
    try {
      if (!dates.has(date)) dates.set(date, await loadAlertData(config, date));
      const result = await dispatchCurrentSlot(config, slot, dates.get(date));
      alertsSent += result.alertsSent;
      failures.push(...result.failures);
    } catch (error) { failures.push(error); if (!dates.has(date)) break; }
  }
  // Continue processing the remaining profiles, then report failure to the trigger.
  if (failures.length) throw failures[0];
  return { processed: true, alerts_sent: alertsSent };
}
