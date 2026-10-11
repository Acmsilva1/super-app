import { describe,it,expect } from 'vitest';
import { parseCron,cronMatches,latestOccurrence,nextOccurrences,validateAlert,validateAlertTimes,alertOccurrences } from '../../features/financeiro/service/alertSchedule.js';
describe('cron financeiro em Brasília',()=>{
  it('interpreta horas locais, listas e dias úteis',()=>{
    const cron=parseCron('0 9,13 * * 1-5');
    expect(cronMatches(cron,new Date('2026-10-09T12:00:00Z'))).toBe(true);
    expect(cronMatches(cron,new Date('2026-10-10T12:00:00Z'))).toBe(false);
    expect(cronMatches(cron,new Date('2026-10-09T09:00:00Z'))).toBe(false);
  });
  it('mantém semântica OR de dia do mês e dia da semana',()=>{
    expect(cronMatches(parseCron('0 9 1 * 1'),new Date('2026-10-05T12:00:00Z'))).toBe(true);
    expect(cronMatches(parseCron('0 9 1 * 1'),new Date('2026-10-01T12:00:00Z'))).toBe(true);
  });
  it('não aceita frequências excessivas ou sintaxe fora do contrato',()=>{
    for(const cron of ['* * * * *','*/2 * * * *','60 9 * * *','0 24 * * *','0 9 * * MON','0 9 * *','0 9 * * *;rm'])expect(()=>parseCron(cron)).toThrow();
    expect(()=>parseCron('*/5 * * * *')).not.toThrow();
  });
  it('recupera atraso dentro de uma hora e não dispara antes da criação',()=>{
    const now=new Date('2026-10-09T16:12:00Z');
    expect(latestOccurrence('0 13 * * *',now).time).toBe('13:00');
    expect(latestOccurrence('0 13 * * *',new Date('2026-10-09T17:00:00Z'))).toBeNull();
    expect(latestOccurrence('0 13 * * *',now,'2026-10-09T16:05:00Z')).toBeNull();
  });
  it('prevê mudança de mês e ano sem confundir UTC e horário local',()=>{
    expect(nextOccurrences('0 9 1 * *',new Date('2026-12-31T23:00:00Z'),2)).toEqual(['2027-01-01T12:00:00.000Z','2027-02-01T12:00:00.000Z']);
    expect(nextOccurrences('0 9 31 2 *',new Date('2026-01-01T00:00:00Z'))).toEqual([]);
  });
  it('valida mensagem e ignora campos não autorizados',()=>{
    expect(()=>validateAlert({nome:'teste',tipo:'mensagem',cron:'0 9 * * *',ativo:true,mensagem:''})).toThrow();
    expect(validateAlert({nome:'teste',tipo:'mensagem',cron:'0 9 * * *',ativo:false,mensagem:'Olá',user_id:'outro'})).not.toHaveProperty('user_id');
  });
});

it('normaliza seção e horários exatos sem combinar horas e minutos',()=>{
  const rule=validateAlert({tipo:'geral',horarios:['20:30','09:15'],ativo:true,mensagem:'ignorar',nome:'ignorar'});
  expect(rule).toMatchObject({nome:'Resumo · Geral',mensagem:'',horarios:['09:15','20:30']});
  expect(alertOccurrences(rule,new Date('2026-10-10T03:00:00Z'),{future:true,count:3})).toEqual(['2026-10-10T12:15:00.000Z','2026-10-10T23:30:00.000Z','2026-10-11T12:15:00.000Z']);
  for(const horarios of [[],['09:00','09:00'],['23:59','00:01'],['9:00'],['24:00'],['12:60'],Array(13).fill('09:00')]) expect(()=>validateAlertTimes(horarios)).toThrow();
});
it('recupera todos os horários recentes e respeita edição e virada do dia',()=>{
  const rule={horarios:['09:00','09:05'],created_at:'2026-10-01T00:00:00Z'};
  const now=new Date('2026-10-10T12:12:00Z');
  expect(alertOccurrences(rule,now).map(row=>row.time)).toEqual(['09:00','09:05']);
  expect(alertOccurrences({...rule,updated_at:'2026-10-10T12:03:00Z'},now).map(row=>row.time)).toEqual(['09:05']);
  expect(alertOccurrences({horarios:['23:55','00:05']},new Date('2026-10-11T03:12:00Z')).map(row=>[row.date,row.time])).toEqual([['2026-10-10','23:55'],['2026-10-11','00:05']]);
});
