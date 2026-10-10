import {it,expect} from 'vitest';
import {validateDietAlertTimes,normalizeAlertSchedule,validateAlertSchedule} from '../../features/saude/service/alertScheduleConfig.js';
it('valida minutos livres, refeições, limite e duplicação',()=>{
 expect(validateDietAlertTimes([{tipo:'ceia',horario:'23:59'}]).data[0].horario).toBe('23:59');
 for(const horario of ['24:00','7:00','12:60',''])expect(validateDietAlertTimes([{tipo:'ceia',horario}]).error).toBeTruthy();
 expect(validateDietAlertTimes([{tipo:'invalido',horario:'12:00'}]).error).toBeTruthy();
 expect(validateDietAlertTimes(Array(13).fill({tipo:'ceia',horario:'12:00'})).error).toBeTruthy();
 expect(validateDietAlertTimes(Array(2).fill({tipo:'ceia',horario:'12:00'})).error).toBeTruthy();
 expect(normalizeAlertSchedule().dieta_horarios).toHaveLength(4);
 expect(validateAlertSchedule({agua_ativo:true,agua_intervalo_horas:3,dieta_ativa:true,dieta_horarios:[]}).error).toBeTruthy();
});
