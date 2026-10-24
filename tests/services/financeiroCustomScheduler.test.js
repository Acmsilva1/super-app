import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({rules:[],claims:new Set(),queries:[],claimError:null}));
vi.mock('../../lib/alertServiceClient.js',()=>({getAlertServiceClient:()=>({from(table){
  const filters=[];let operation='select',body;
  const query={select(){return query;},eq(k,v){filters.push([k,v]);return query;},or(){return query;},gte(){return query;},lt(){return query;},range(){return query;},order(){return query;},limit(){return query;},maybeSingle(){return query;},insert(value){operation='insert';body=value;return query;},update(value){operation='update';body=value;return query;},then(resolve,reject){
    state.queries.push({table,filters,operation,body});
    let result={data:null,error:null};
    if(table==='tb_financeiro_alertas')result.data=state.rules;
    else if(table==='tb_financas')result.data=[{tipo:'receita',valor:15000},{tipo:'despesa',valor:200,metodo_pagamento:'pix'},{tipo:'despesa',valor:1000,metodo_pagamento:'credito'}];
    else if(table==='vw_financeiro_poupanca_resumo')result.data=[{total_acumulado:3000,nome_meta:'Reserva',valor_meta:10000}];
    else if(table==='tb_financeiro_simulacoes')result.data=[{id:'new',meta_id:'car',nome:'Carro',created_at:'2026-10-08T00:00:00Z'},{id:'old',meta_id:'car',nome:'Carro',created_at:'2026-10-01T00:00:00Z'}];
    else if(table==='tb_despesas_fixas')result.data=[{valor:5000}];
    else if(table==='vw_financeiro_resumo_mensal')result.data=[{fixas_pagas:4000,fixas_pendentes:1000}];
    else if(operation==='insert') {
      if(state.claimError)result.error=state.claimError;
      else if(state.claims.has(body.dedupe_key))result.error={code:'23505'};
      else state.claims.add(body.dedupe_key);
    } else if(operation==='select' && state.claims.has(filters.find(([key])=>key==='dedupe_key')?.[1])) result.data={dedupe_key:'existing'};
    return Promise.resolve(result).then(resolve,reject);
  }};return query;
}})}));
import {runFinanceiroDailySummary} from '../../features/financeiro/service/financeiroTelegramScheduler.js';
beforeEach(()=>{
  state.rules=[{id:'alert-one',nome:'Meu lembrete',tipo:'mensagem',mensagem:'Revisar gastos',cron:'0 13 * * *',created_at:'2026-10-01T00:00:00Z'}];state.claims.clear();state.queries=[];state.claimError=null;
  vi.stubEnv('NODE_ENV','development');vi.stubEnv('SAUDE_ALERTS_ENABLED','true');vi.stubEnv('SAUDE_ALERTS_OWNER_USER_ID','f88a6351-317d-425b-afcd-9430c8a34f53');vi.stubEnv('ALERTS_API_URL','http://localhost/api/telegram-alert');vi.stubEnv('ALERTS_API_TOKEN','test-only');
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({ok:true,telegram_message_id:123})})));
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it('dispara cron configurado com título, mensagem e dedupe persistente',async()=>{
  const now=new Date('2026-10-09T16:12:00Z');
  expect((await runFinanceiroDailySummary(now)).alerts_sent).toBe(1);
  const body=JSON.parse(fetch.mock.calls[0][1].body);expect(body).toMatchObject({title:'Meu lembrete',message:'Revisar gastos'});
  expect((await runFinanceiroDailySummary(now)).alerts_sent).toBe(0);expect(fetch).toHaveBeenCalledTimes(1);
  expect(state.queries[0].filters).toContainEqual(['user_id','f88a6351-317d-425b-afcd-9430c8a34f53']);
});
it('não envia quando outra execução já adquiriu a ocorrência',async()=>{
  state.claimError={code:'23505'};
  expect((await runFinanceiroDailySummary(new Date('2026-10-09T16:02:00Z'))).alerts_sent).toBe(0);expect(fetch).not.toHaveBeenCalled();
});
it('registra envio incerto e não reenvia após falha de rede',async()=>{
  fetch.mockRejectedValueOnce(new Error('network'));
  const now=new Date('2026-10-09T16:02:00Z');await expect(runFinanceiroDailySummary(now)).rejects.toThrow();
  expect(state.queries.some(q=>q.operation==='update'&&q.body.status==='uncertain')).toBe(true);
  expect((await runFinanceiroDailySummary(now)).alerts_sent).toBe(0);expect(fetch).toHaveBeenCalledTimes(1);
});
it('não dispara regras fora da janela ou criadas depois do horário',async()=>{
  state.rules[0].created_at='2026-10-09T16:05:00Z';
  expect((await runFinanceiroDailySummary(new Date('2026-10-09T16:12:00Z'))).alerts_sent).toBe(0);
  expect(fetch).not.toHaveBeenCalled();
});
it('calcula resumo mensal com fixas e extrato, isolados por proprietário',async()=>{
  state.rules[0].tipo='mensal';state.rules[0].mensagem='Resumo atualizado';
  await runFinanceiroDailySummary(new Date('2026-10-09T16:02:00Z'));
  const body=JSON.parse(fetch.mock.calls[0][1].body);const message=body.message.replaceAll('\u00a0',' ');
  expect(message).toContain('Receitas do mês: R$ 15.000,00');expect(message).toContain('Despesas (fixas + extrato): R$ 5.200,00');expect(message).toContain('Saldo: R$ 9.800,00');
  for(const query of state.queries.filter(q=>['tb_financas','tb_despesas_fixas'].includes(q.table)))expect(query.filters).toContainEqual(['user_id','f88a6351-317d-425b-afcd-9430c8a34f53']);
});

it('Geral reúne todas as seções e usa a mensagem padrão com escopo do proprietário',async()=>{
  state.rules[0]={...state.rules[0],tipo:'geral',horarios:['13:00'],mensagem:'texto antigo não permitido'};
  await runFinanceiroDailySummary(new Date('2026-10-09T16:12:00Z'));
  const message=JSON.parse(fetch.mock.calls[0][1].body).message.replaceAll('\u00a0',' ');
  for(const text of ['Resumo geral','Receitas do mês: R$ 15.000,00','Gastos de hoje','Despesas fixas','Poupança acumulada: R$ 3.000,00','Simulador: 1 meta(s)','Carro'])expect(message).toContain(text);
  expect(message).not.toContain('texto antigo');
  expect(message).toMatch(/^Sua visão financeira completa, em um só resumo\.\nResumo · Geral/);
  for(const query of state.queries.filter(q=>q.table!=='tb_saude_alertas_envios'))expect(query.filters).toContainEqual(['user_id','f88a6351-317d-425b-afcd-9430c8a34f53']);
});
it.each([
  ['diario','Extrato diário','Gastos de hoje','Confira os gastos do dia e acompanhe suas movimentações.'],
  ['fixas','Despesas fixas','Despesas fixas deste mês','Mantenha suas contas em dia: veja o que foi pago e o que está pendente.'],
  ['receitas','Receitas','Receitas do mês','Acompanhe as entradas do mês e a evolução das suas receitas.'],
  ['poupanca','Poupança','Poupança acumulada','Veja o saldo da sua poupança e acompanhe sua meta.'],
  ['simulador','Simulador','Simulador: 1 meta(s)','Confira suas metas e as últimas simulações salvas.'],
])('envia apenas a seção %s',async(tipo,label,content,intro)=>{
  state.rules[0]={...state.rules[0],tipo,horarios:['13:00'],mensagem:''};
  expect((await runFinanceiroDailySummary(new Date('2026-10-09T16:12:00Z'))).alerts_sent).toBe(1);
  const message=JSON.parse(fetch.mock.calls[0][1].body).message;
  expect(message.startsWith(`${intro}\nResumo · ${label}`)).toBe(true);
  expect(message).toContain(content);
  expect(message).not.toContain('Resumo geral');
  const tables={diario:['tb_financas'],fixas:['vw_financeiro_resumo_mensal'],receitas:['tb_financas'],poupanca:['vw_financeiro_poupanca_resumo'],simulador:['tb_financeiro_simulacoes']};
  expect([...new Set(state.queries.filter(q=>!['tb_saude_alertas_envios','tb_financeiro_alertas'].includes(q.table)).map(q=>q.table))]).toEqual(tables[tipo]);
});
it('envia horários próximos separadamente e não os repete no próximo polling',async()=>{
  state.rules[0]={...state.rules[0],tipo:'diario',horarios:['13:00','13:05'],mensagem:''};
  const now=new Date('2026-10-09T16:12:00Z');
  expect((await runFinanceiroDailySummary(now)).alerts_sent).toBe(2);
  expect(new Set(fetch.mock.calls.map(call=>JSON.parse(call[1].body).dedupe_key)).size).toBe(2);
  expect((await runFinanceiroDailySummary(now)).alerts_sent).toBe(0);
});
