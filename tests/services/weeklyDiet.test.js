import { expect, it } from 'vitest';
import { DIET_WEEK, createEmptyDietMeals, todayDietDate, dietForDate } from '../../features/saude/service/dietasService.js';
import { buildDietAlertMessages } from '../../features/saude/service/alertasSaudeScheduler.js';
const semana=DIET_WEEK.map((titulo,index)=>({titulo,refeicoes:[{tipo:'almoco',itens:[{nome:`Alimento ${index}`,quantidade:'100 g',calorias:100}]}]}));
it('seleciona cada um dos sete dias sem misturar dietas únicas',()=>{
 for(let i=0;i<7;i++){
  const date=`2026-10-${String(5+i).padStart(2,'0')}`;
  const result=buildDietAlertMessages({profiles:[{id:1,nome:'Perfil'}],schedules:new Map(),foods:[],diets:[{id:1,perfil_id:1,titulo:'Semanal',semanal:true,semana},{id:2,perfil_id:1,titulo:'Única',refeicoes:[{tipo:'almoco',itens:[{nome:'Sempre',quantidade:'100 g'}]}]}]}, {tipo:'almoco',titulo:'Almoço'},date,'12:00').join('');
  expect(result).toContain(DIET_WEEK[i]);expect(result).toContain(`Alimento ${i}`);expect(result).toContain('Sempre');
  for(let j=0;j<7;j++)if(j!==i)expect(result).not.toContain(`Alimento ${j}`);
 }
});
it('usa Brasília na virada da meia-noite e não copia um menu para um dia vazio',()=>{
 expect(todayDietDate(new Date('2026-10-12T02:59:00Z'))).toBe('2026-10-11');
 expect(todayDietDate(new Date('2026-10-12T03:00:00Z'))).toBe('2026-10-12');
 const week=structuredClone(semana);week[1].refeicoes=createEmptyDietMeals();
 expect(dietForDate({semanal:true,semana:week},'2026-10-06').refeicoes.every(meal=>meal.itens.length===0)).toBe(true);
});

it('envia somente dietas ligadas e respeita também a pausa geral do perfil',()=>{
 const data={profiles:[{id:1,nome:'Perfil'}],schedules:new Map(),foods:[],diets:[{id:1,perfil_id:1,titulo:'Ligada',alerta_ativo:true,refeicoes:[{tipo:'almoco',itens:[{nome:'Sempre',quantidade:'100 g'}]}]},{id:2,perfil_id:1,titulo:'Desligada',alerta_ativo:false,semanal:true,semana}]};
 const meal={tipo:'almoco',titulo:'Almoço'};
 expect(buildDietAlertMessages(data,meal,'2026-10-05','12:00').join('')).toContain('Ligada');
 expect(buildDietAlertMessages(data,meal,'2026-10-05','12:00').join('')).not.toContain('Desligada');
 expect(buildDietAlertMessages(data,meal,'2026-10-05','12:00',{includeInactive:true}).join('')).not.toContain('Desligada');
 data.schedules.set('1',{dieta_ativa:false});expect(buildDietAlertMessages(data,meal,'2026-10-05','12:00')).toEqual([]);
});
