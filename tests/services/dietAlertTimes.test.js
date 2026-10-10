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

it('valida janela diária da água sem alterar os padrões antigos',()=>{
 const base={agua_ativo:true,agua_intervalo_horas:3,dieta_ativa:false,dieta_horarios:[]};
 expect(validateAlertSchedule(base).data).toMatchObject({agua_inicio:'07:30',agua_fim:'22:30'});
 expect(validateAlertSchedule({...base,agua_inicio:'08:17',agua_fim:'20:00'}).data.agua_inicio).toBe('08:17');
 for(const [agua_inicio,agua_fim] of [['20:00','08:00'],['08:00','08:00'],['','22:00'],['08:00','24:00']])expect(validateAlertSchedule({...base,agua_inicio,agua_fim}).error).toBeTruthy();
});
