import { DIET_MEALS } from './dietasService.js';
import { DEFAULT_ALERT_SCHEDULE, DIET_ALERT_MEALS, normalizeAlertSchedule, WATER_ALERT_END, WATER_ALERT_START } from './alertScheduleConfig.js';

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

async function readAlertConfig() {
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
  return { ownerId, url, token, client: getAlertServiceClient() };
}

async function sendAlert(config, { eventType, title, message, dedupeKey }) {
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
      signal: AbortSignal.timeout(20000),
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

async function loadOwnedData(config, today) {
  const supabase = config.client;
  const [profilesResult, goalsResult, logsResult, dietsResult, schedulesResult] = await Promise.all([
    supabase.from('tb_saude_perfis')
      .select('id,nome').eq('created_by', config.ownerId).order('created_at', { ascending: true }),
    supabase.from('tb_saude_agua_metas')
      .select('perfil_id,nome,meta_doses').eq('created_by', config.ownerId),
    supabase.from('tb_saude_agua_logs')
      .select('perfil_id,data_local,meta_doses,realizado_doses')
      .eq('created_by', config.ownerId).eq('data_local', today),
    supabase.from('tb_saude_dietas')
      .select('id,perfil_id,titulo,refeicoes,meta_calorias,updated_at')
      .eq('created_by', config.ownerId).order('updated_at', { ascending: false }),
    supabase.from('tb_saude_alertas_agenda')
      .select('perfil_id,agua_ativo,agua_intervalo_horas,dieta_ativa,dieta_id')
      .eq('created_by', config.ownerId),
  ]);
  const scheduleTableMissing = schedulesResult.error && ['42P01', 'PGRST205'].includes(String(schedulesResult.error.code));
  const failed = [profilesResult, goalsResult, logsResult, dietsResult, ...(scheduleTableMissing ? [] : [schedulesResult])].find((result) => result.error);
  if (failed) throw new Error(`saude_data_${failed.error.code || 'unavailable'}`);

  const profiles = profilesResult.data || [];
  const ownedProfileIds = new Set(profiles.map((profile) => String(profile.id)));
  const goals = new Map((goalsResult.data || []).map((row) => [String(row.perfil_id), row]));
  const logs = new Map((logsResult.data || []).map((row) => [String(row.perfil_id), row]));
  const diets = new Map();
  const dietsById = new Map();
  for (const diet of dietsResult.data || []) {
    const key = String(diet.perfil_id);
    if (ownedProfileIds.has(key)) {
      if (!diets.has(key)) diets.set(key, diet);
      dietsById.set(String(diet.id), diet);
    }
  }
  const schedules = new Map((scheduleTableMissing ? [] : (schedulesResult.data || []))
    .map((row) => [String(row.perfil_id), normalizeAlertSchedule(row)]));
  return { profiles, goals, logs, diets, dietsById, schedules };
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

function itemCalories(item) {
  if (item?.calorias === null || item?.calorias === undefined || item?.calorias === '') return null;
  const value = Number(item.calorias);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function calorieSummary(diet) {
  const meals = Array.isArray(diet?.refeicoes) ? diet.refeicoes : [];
  const items = meals.flatMap((meal) => Array.isArray(meal?.itens) ? meal.itens : []);
  const target = Number(diet?.meta_calorias);
  const hasTarget = Number.isInteger(target) && target > 0;
  const hasAllCalories = items.length > 0 && items.every((item) => itemCalories(item) !== null);
  if (!hasTarget || !hasAllCalories) {
    return {
      meta_diaria_kcal: hasTarget ? target : null,
      total_planejado_kcal: null,
      situacao: !hasTarget ? 'meta_nao_informada' : 'calorias_incompletas',
    };
  }
  const total = items.reduce((sum, item) => sum + Number(item.calorias), 0);
  return {
    meta_diaria_kcal: target,
    total_planejado_kcal: total,
    diferenca_kcal: total - target,
    situacao: total < target ? 'abaixo_da_meta' : total === target ? 'meta_atingida' : 'acima_da_meta',
  };
}

function dietProfileReport(profile, diet, meal, date, time) {
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
    dieta: diet ? { id: diet.id, titulo: diet.titulo } : null,
    menu: items.map((item) => ({
      alimento: String(item?.nome || ''),
      quantidade: String(item?.quantidade || ''),
      calorias_kcal: itemCalories(item),
    })),
    calorias_planejadas: calorieSummary(diet),
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
  const menu = Array.isArray(report.menu) ? report.menu.slice(0, 12) : [];
  if (menu.length) {
    lines.push('🥗 Menu:');
    for (const item of menu) {
      const food = readablePart(item.alimento, 90);
      const quantity = readablePart(item.quantidade, 40);
      if (!food) continue;
      const hasCalories = item.calorias_kcal !== null && item.calorias_kcal !== undefined
        && item.calorias_kcal !== '' && Number.isFinite(Number(item.calorias_kcal));
      const calories = hasCalories ? ` · ${Number(item.calorias_kcal)} kcal` : '';
      lines.push(`• ${food}${quantity ? ` — ${quantity}` : ''}${calories}`);
    }
    if (report.menu.length > menu.length) lines.push(`… e mais ${report.menu.length - menu.length} itens`);
  } else {
    lines.push('🥗 O menu desta refeição ainda não foi cadastrado.');
  }

  const calories = report.calorias_planejadas || {};
  if (calories.situacao === 'meta_nao_informada') {
    lines.push('🎯 Meta calórica ainda não informada; o aviso da refeição funciona normalmente.');
  } else if (calories.situacao === 'calorias_incompletas') {
    lines.push(`🔥 Meta: ${calories.meta_diaria_kcal} kcal. Preencha as calorias dos alimentos para comparar.`);
  } else {
    lines.push(`🔥 Planejado: ${calories.total_planejado_kcal} / ${calories.meta_diaria_kcal} kcal.`);
    if (calories.situacao === 'meta_atingida') lines.push('✅ O plano está na meta calórica.');
    else if (calories.situacao === 'abaixo_da_meta') lines.push(`ℹ️ ${Math.abs(calories.diferenca_kcal)} kcal abaixo da meta.`);
    else if (calories.situacao === 'acima_da_meta') lines.push(`ℹ️ ${calories.diferenca_kcal} kcal acima da meta.`);
  }
  return lines.join('\n').slice(0, 3000);
}

async function dispatchWaterForProfile(config, data, profile, date, time) {
  const key = `agua:${date}:${time}:${profile.id}`;
  const report = waterProfileReport(profile, data.goals.get(String(profile.id)), data.logs.get(String(profile.id)), date, time);
  try {
    return Number(await sendAlert(config, { eventType: 'health.water_progress', title: `Progresso de agua - ${profile.nome}`, message: formatWaterAlert(report), dedupeKey: key }));
  } catch (error) {
    throw error;
  }
}

async function dispatchDietForProfile(config, data, profile, diet, meal, date, time) {
  const key = `dieta:${date}:${time}:${profile.id}`;
  const report = dietProfileReport(profile, diet, meal, date, time);
  try {
    return Number(await sendAlert(config, { eventType: 'health.diet_menu', title: `Cardapio ${meal.titulo} - ${profile.nome}`, message: formatDietAlert(report), dedupeKey: key }));
  } catch (error) {
    throw error;
  }
}

async function dispatchCurrentSlot(config, value) {
  const { date, time } = saoPauloClock(value);
  if (!['00', '30'].includes(time.slice(-2))) return { failures: [], alertsSent: 0 };
  const failures = [];
  let alertsSent = 0;
  try {
    const data = await loadOwnedData(config, date);
    const defaults = normalizeAlertSchedule(DEFAULT_ALERT_SCHEDULE);
    for (const profile of data.profiles) {
      const profileKey = String(profile.id);
      const hasCustomSchedule = data.schedules.has(profileKey);
      const schedule = data.schedules.get(profileKey) || defaults;
      const minuteOfDay = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
      const waterStart = Number(WATER_ALERT_START.slice(0, 2)) * 60 + Number(WATER_ALERT_START.slice(3, 5));
      const waterEnd = Number(WATER_ALERT_END.slice(0, 2)) * 60 + Number(WATER_ALERT_END.slice(3, 5));
      if (schedule.agua_ativo && minuteOfDay >= waterStart && minuteOfDay <= waterEnd
        && (minuteOfDay - waterStart) % (schedule.agua_intervalo_horas * 60) === 0) {
        try {
          alertsSent += await dispatchWaterForProfile(config, data, profile, date, time);
        } catch (error) {
          failures.push(error);
        }
      }
      if (schedule.dieta_ativa && (schedule.dieta_id || !hasCustomSchedule)) {
        const meal = DIET_ALERT_MEALS.find((entry) => entry.horario === time);
        const selectedDiet = schedule.dieta_id
          ? data.dietsById.get(String(schedule.dieta_id)) || null
          : data.diets.get(profileKey) || null;
        if (meal && selectedDiet && String(selectedDiet.perfil_id) === profileKey) {
          try {
            alertsSent += await dispatchDietForProfile(config, data, profile, selectedDiet, meal, date, time);
          } catch (error) {
            failures.push(error);
          }
        }
      }
    }
  } catch (error) {
    throw error;
  }
  return { failures, alertsSent };
}

export async function runSaudeAlertSlot(now = new Date()) {
  const config = await readAlertConfig();
  if (!config) return { skipped: true, reason: 'disabled_or_missing_config' };
  const { data: roles, error } = await config.client.from('app_user_roles').select('role').eq('user_id', config.ownerId);
  if (error || !roles?.some(row => ['owner', 'admin'].includes(row.role))) throw new Error('alerts_owner_invalid');
  const start = new Date(Math.floor(now.getTime() / 1800000) * 1800000);
  // A delayed trigger can recover the previous half-hour; keys persist in Supabase.
  const failures = [];
  let alertsSent = 0;
  for (const slot of [new Date(start.getTime() - 1800000), start]) {
    try {
      const result = await dispatchCurrentSlot(config, slot);
      alertsSent += result.alertsSent;
      failures.push(...result.failures);
    } catch (error) {
      failures.push(error);
    }
  }
  // Continue processing the remaining profiles, then report failure to the trigger.
  if (failures.length) throw failures[0];
  return { processed: true, alerts_sent: alertsSent };
}
