import { describe,it,expect } from 'vitest';
import { parseCron,cronMatches,latestOccurrence,nextOccurrences,validateAlert } from '../../features/financeiro/service/alertSchedule.js';
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
