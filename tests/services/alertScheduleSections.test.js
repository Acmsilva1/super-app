import { expect, it } from 'vitest';
import { DEFAULT_ALERT_SCHEDULE, alertScheduleChanged } from '../../features/saude/service/alertScheduleConfig.js';

it('detecta alterações por seção e volta ao estado salvo ao desfazer', () => {
  const draft = structuredClone(DEFAULT_ALERT_SCHEDULE);
  expect(alertScheduleChanged(draft, DEFAULT_ALERT_SCHEDULE, 'agua')).toBe(false);
  draft.agua_inicio = '08:00';
  expect(alertScheduleChanged(draft, DEFAULT_ALERT_SCHEDULE, 'agua')).toBe(true);
  expect(alertScheduleChanged(draft, DEFAULT_ALERT_SCHEDULE, 'dieta')).toBe(false);
  draft.agua_inicio = DEFAULT_ALERT_SCHEDULE.agua_inicio;
  expect(alertScheduleChanged(draft, DEFAULT_ALERT_SCHEDULE, 'agua')).toBe(false);
  draft.dieta_horarios = draft.dieta_horarios.map(({ tipo, horario }) => ({ tipo, horario }));
  expect(alertScheduleChanged(draft, DEFAULT_ALERT_SCHEDULE, 'dieta')).toBe(false);
  draft.dieta_horarios[0].horario = '08:00';
  expect(alertScheduleChanged(draft, DEFAULT_ALERT_SCHEDULE, 'dieta')).toBe(true);
});
