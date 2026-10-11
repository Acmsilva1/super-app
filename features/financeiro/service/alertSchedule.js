export const FINANCIAL_ALERT_SECTIONS = { geral: 'Geral', diario: 'Extrato diário', fixas: 'Despesas fixas', receitas: 'Receitas', poupanca: 'Poupança', simulador: 'Simulador' };
export const FINANCIAL_ALERT_INTRO = 'Bora dar um giro na grana? 💸';
export const FINANCIAL_ALERT_DESCRIPTIONS = {
  geral: 'Receitas, despesas e saldo do mês, gastos de hoje com débito/Pix, despesas fixas, poupança e metas do simulador.',
  diario: 'Gastos de hoje com débito/Pix.',
  fixas: 'Despesas fixas pagas e pendentes deste mês.',
  receitas: 'Total de receitas recebidas neste mês.',
  poupanca: 'Saldo acumulado e meta de poupança.',
  simulador: 'Metas salvas e data da última simulação.',
};
export const ALERT_TYPES = [...Object.keys(FINANCIAL_ALERT_SECTIONS), 'mensal', 'mensagem'];
export function validateAlertTimes(times) {
  if (!Array.isArray(times) || !times.length || times.length > 12 || times.some(time => typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw new Error('Informe de 1 a 12 horários válidos.');
  const sorted = [...times].sort();
  if (new Set(sorted).size !== sorted.length) throw new Error('Não repita horários.');
  const minutes = sorted.map(time => Number(time.slice(0,2))*60+Number(time.slice(3)));
  if (minutes.length > 1 && minutes.some((minute,index) => (minutes[(index+1)%minutes.length]-minute+1440)%1440 < 5)) throw new Error('Deixe pelo menos 5 minutos entre os horários.');
  return sorted;
}

export function parseCron(expression) {
  if (String(expression || '').length > 120) throw new Error('Use uma expressão cron de até 120 caracteres.');
  const fields = String(expression || '').trim().split(/\s+/);
  if (fields.length !== 5) throw new Error('Use cron com 5 campos: minuto hora dia mês dia-da-semana.');
  const limits = [[0,59],[0,23],[1,31],[1,12],[0,7]];
  const sets = fields.map((field,index) => {
    const [min,max] = limits[index], values = new Set();
    for (const part of field.split(',')) {
      const match = part.match(/^(\*|\d+|\d+-\d+)(?:\/(\d+))?$/);
      if (!match) throw new Error('Expressão cron inválida. Use números, *, listas, intervalos ou passos.');
      const step = Number(match[2] || 1);
      const range = match[1] === '*' ? [min,max] : match[1].includes('-') ? match[1].split('-').map(Number) : [Number(match[1]),match[2] ? max : Number(match[1])];
      if (step < 1 || step > max + 1 || range[0] < min || range[1] > max || range[0] > range[1]) throw new Error('Campo cron fora do intervalo.');
      for (let v = range[0]; v <= range[1]; v += step) values.add(index === 4 && v === 7 ? 0 : v);
    }
    return values;
  });
  const minutes = [...sets[0]].sort((a,b) => a-b);
  if (minutes.length > 1 && minutes.some((v,i) => ((minutes[(i+1)%minutes.length] - v + 60)%60) < 5)) throw new Error('Use intervalos de pelo menos 5 minutos.');
  return { fields, sets };
}
export function validateAlert(input) {
  if (input.horarios != null) {
    if (!Object.hasOwn(FINANCIAL_ALERT_SECTIONS, input.tipo)) throw new Error('Selecione uma seção do Financeiro.');
    if (typeof input.ativo !== 'boolean') throw new Error('Estado do alerta inválido.');
    const horarios = validateAlertTimes(input.horarios), [hour,minute] = horarios[0].split(':').map(Number);
    return { nome: `Resumo · ${FINANCIAL_ALERT_SECTIONS[input.tipo]}`, tipo: input.tipo, mensagem: '',
      cron: `${minute} ${hour} * * *`, horarios, ativo: input.ativo, timezone: 'America/Sao_Paulo' };
  }
  const nome = String(input.nome || '').trim(), mensagem = String(input.mensagem || '').trim();
  const cron = String(input.cron || '').trim().replace(/\s+/g,' ');
  if (!nome || nome.length > 120) throw new Error('Informe um nome de até 120 caracteres.');
  if (!ALERT_TYPES.includes(input.tipo)) throw new Error('Tipo de alerta inválido.');
  if (mensagem.length > 1500 || (input.tipo === 'mensagem' && !mensagem)) throw new Error('Informe uma mensagem de até 1.500 caracteres.');
  if (typeof input.ativo !== 'boolean') throw new Error('Estado do alerta inválido.');
  parseCron(cron);
  return { nome, tipo: input.tipo, mensagem, cron, ativo: input.ativo, timezone: 'America/Sao_Paulo' };
}
export function localClock(now) {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const p = Object.fromEntries(parts.map(v => [v.type,v.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  return { date, time: `${p.hour}:${p.minute}`, weekday: new Date(`${date}T12:00:00Z`).getUTCDay(), month: Number(p.month), day: Number(p.day), hour: Number(p.hour), minute: Number(p.minute) };
}
export function cronMatches(parsed, now) {
  const c = localClock(now), [minute,hour,day,month,week] = parsed.sets;
  const dom = day.has(c.day), dow = week.has(c.weekday);
  const dateMatch = parsed.fields[2] === '*' ? dow : parsed.fields[4] === '*' ? dom : dom || dow;
  return minute.has(c.minute) && hour.has(c.hour) && month.has(c.month) && dateMatch;
}
export function latestOccurrence(cron, now, createdAt = null) {
  const parsed = parseCron(cron), floor = Math.floor(now.getTime()/60000)*60000;
  const created = createdAt ? new Date(createdAt).getTime() : 0;
  for (let i=0;i<60;i++) {
    const date = new Date(floor-i*60000);
    if (date.getTime() < created) return null;
    if (cronMatches(parsed,date)) return { ...localClock(date), instant:date.toISOString() };
  }
  return null;
}
export function nextOccurrences(cron, now = new Date(), count = 3) {
  const parsed = parseCron(cron), results = [];
  // Avança por dias e apenas pelas combinações de hora/minuto permitidas.
  const clock = localClock(now), start = new Date(`${clock.date}T00:00:00-03:00`).getTime();
  const hours = [...parsed.sets[1]].sort((a,b)=>a-b), minutes = [...parsed.sets[0]].sort((a,b)=>a-b);
  for (let day=0;day<366*5 && results.length<count;day++) {
    const midnight = start + day*86400000;
    const c = localClock(new Date(midnight));
    const dom = parsed.sets[2].has(c.day), dow = parsed.sets[4].has(c.weekday);
    if (!parsed.sets[3].has(c.month) || !(parsed.fields[2]==='*' ? dow : parsed.fields[4]==='*' ? dom : dom || dow)) continue;
    for (const hour of hours) for (const minute of minutes) {
      const date = new Date(midnight+(hour*60+minute)*60000);
      if (date > now && results.length<count) results.push(date.toISOString());
    }
  }
  return results;
}

export function alertOccurrences(row, now = new Date(), { future = false, count = 3 } = {}) {
  if (row.horarios == null) {
    if (future) return nextOccurrences(row.cron, now, count);
    const occurrence = latestOccurrence(row.cron, now, row.updated_at || row.created_at);
    return occurrence ? [occurrence] : [];
  }
  const times = validateAlertTimes(row.horarios), clock = localClock(now);
  const midnight = new Date(`${clock.date}T00:00:00-03:00`).getTime();
  const results = [], updated = new Date(row.updated_at || row.created_at || 0).getTime();
  for (let day = future ? 0 : -1; day <= (future ? 4 : 0); day++) {
    for (const time of times) {
      const instant = midnight + day*86400000 + (Number(time.slice(0,2))*60+Number(time.slice(3)))*60000;
      if (future ? instant > now.getTime() : instant <= now.getTime() && instant > now.getTime()-3600000 && instant >= updated) {
        results.push(future ? new Date(instant).toISOString() : { ...localClock(new Date(instant)), instant: new Date(instant).toISOString() });
      }
    }
  }
  return future ? results.slice(0,count) : results;
}
