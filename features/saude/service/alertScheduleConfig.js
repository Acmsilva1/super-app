export const WATER_ALERT_START = '07:30';
export const WATER_ALERT_END = '22:30';
export const WATER_ALERT_INTERVALS = Array.from({ length: 12 }, (_, index) => index + 1);
export const DIET_ALERT_MEALS = [
  { tipo: 'cafe_da_manha', titulo: 'Café da manhã', horario: '07:00' },
  { tipo: 'almoco', titulo: 'Almoço', horario: '11:00' },
  { tipo: 'lanche_da_tarde', titulo: 'Café da tarde', horario: '15:00' },
  { tipo: 'jantar', titulo: 'Jantar', horario: '19:00' },
];

export const DEFAULT_ALERT_SCHEDULE = {
  agua_ativo: true,
  agua_intervalo_horas: 3,
  dieta_ativa: true,
  dieta_id: null,
};

export function normalizeAlertSchedule(row = null) {
  return {
    agua_ativo: row?.agua_ativo !== false,
    agua_intervalo_horas: WATER_ALERT_INTERVALS.includes(Number(row?.agua_intervalo_horas))
      ? Number(row.agua_intervalo_horas)
      : DEFAULT_ALERT_SCHEDULE.agua_intervalo_horas,
    dieta_ativa: row?.dieta_ativa !== false,
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
  const interval = Number(payload.agua_intervalo_horas);
  if (!WATER_ALERT_INTERVALS.includes(interval)) return { error: 'Escolha um intervalo inteiro entre 1 e 12 horas.' };
  const dietId = payload.dieta_id == null || payload.dieta_id === '' ? null : Number(payload.dieta_id);
  if (dietId !== null && (!Number.isSafeInteger(dietId) || dietId <= 0)) return { error: 'Selecione uma dieta valida.' };
  return { data: { agua_ativo: payload.agua_ativo, agua_intervalo_horas: interval, dieta_ativa: payload.dieta_ativa, dieta_id: dietId } };
}
