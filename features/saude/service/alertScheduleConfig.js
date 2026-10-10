import { DIET_MEALS } from './dietasService.js';
export const WATER_ALERT_START = '07:30';
export const WATER_ALERT_END = '22:30';
export const WATER_ALERT_INTERVALS = Array.from({ length: 12 }, (_, index) => index + 1);
export const DIET_ALERT_MEALS = [
  { tipo: 'cafe_da_manha', titulo: 'Café da manhã', horario: '07:00' },
  { tipo: 'almoco', titulo: 'Almoço', horario: '11:00' },
  { tipo: 'lanche_da_tarde', titulo: 'Café da tarde', horario: '15:00' },
  { tipo: 'jantar', titulo: 'Jantar', horario: '19:00' },
];

export function validateDietAlertTimes(value) {
  if (!Array.isArray(value) || value.length > 12) return { error: 'Configure até 12 horários de dieta.' };
  const seen = new Set();
  const rows = [];
  for (const entry of value) {
    const meal = DIET_MEALS.find(meal => meal.tipo === entry?.tipo);
    if (!meal || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(entry?.horario))) return { error: 'Escolha a refeição e um horário válido (HH:MM).' };
    const key = `${meal.tipo}:${entry.horario}`;
    if (seen.has(key)) return { error: 'Não repita a mesma refeição no mesmo horário.' };
    seen.add(key); rows.push({ tipo: meal.tipo, titulo: meal.titulo, horario: entry.horario });
  }
  return { data: rows.sort((a,b) => a.horario.localeCompare(b.horario) || a.tipo.localeCompare(b.tipo)) };
}

export const DEFAULT_ALERT_SCHEDULE = {
  agua_ativo: true,
  agua_intervalo_horas: 3,
  agua_inicio: WATER_ALERT_START,
  agua_fim: WATER_ALERT_END,
  dieta_ativa: true,
  dieta_id: null,
  dieta_horarios: DIET_ALERT_MEALS.map(entry => ({ ...entry })),
};

export function normalizeAlertSchedule(row = null) {
  return {
    agua_ativo: row?.agua_ativo !== false,
    agua_inicio: row?.agua_inicio ?? WATER_ALERT_START,
    agua_fim: row?.agua_fim ?? WATER_ALERT_END,
    agua_intervalo_horas: WATER_ALERT_INTERVALS.includes(Number(row?.agua_intervalo_horas))
      ? Number(row.agua_intervalo_horas)
      : DEFAULT_ALERT_SCHEDULE.agua_intervalo_horas,
    dieta_ativa: row?.dieta_ativa !== false,
    dieta_horarios: validateDietAlertTimes(row?.dieta_horarios ?? DEFAULT_ALERT_SCHEDULE.dieta_horarios).data ?? [],
    dieta_id: Number.isSafeInteger(Number(row?.dieta_id)) && Number(row?.dieta_id) > 0
      ? Number(row.dieta_id)
      : null,
  };
}

export function validateAlertSchedule(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { error: 'Configuracao invalida.' };
  if (typeof payload.agua_ativo !== 'boolean' || typeof payload.dieta_ativa !== 'boolean') {
    return { error: 'Informe se cada alerta esta ativo.' };
  }
  const agua_inicio = payload.agua_inicio ?? WATER_ALERT_START;
  const agua_fim = payload.agua_fim ?? WATER_ALERT_END;
  const validTime = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (!validTime(agua_inicio) || !validTime(agua_fim) || agua_fim <= agua_inicio) return { error: 'Informe início e fim válidos; o fim deve ser depois do início, no mesmo dia.' };
  const interval = Number(payload.agua_intervalo_horas);
  if (!WATER_ALERT_INTERVALS.includes(interval)) return { error: 'Escolha um intervalo inteiro entre 1 e 12 horas.' };
  const dietId = payload.dieta_id == null || payload.dieta_id === '' ? null : Number(payload.dieta_id);
  if (dietId !== null && (!Number.isSafeInteger(dietId) || dietId <= 0)) return { error: 'Selecione uma dieta valida.' };
  const times = validateDietAlertTimes(payload.dieta_horarios ?? DEFAULT_ALERT_SCHEDULE.dieta_horarios);
  if (times.error) return times;
  if (payload.dieta_ativa && !times.data.length) return { error: 'Adicione um horário antes de ligar os alertas de dieta.' };
  return { data: { agua_inicio, agua_fim, dieta_horarios: times.data, agua_ativo: payload.agua_ativo, agua_intervalo_horas: interval, dieta_ativa: payload.dieta_ativa, dieta_id: dietId } };
}
