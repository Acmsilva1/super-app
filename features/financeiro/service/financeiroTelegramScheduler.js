import { alertOccurrences, FINANCIAL_ALERT_INTRO, FINANCIAL_ALERT_SECTIONS } from './alertSchedule.js';
const TIME_ZONE = 'America/Sao_Paulo';

function saoPauloClock(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` };
}

function dateRange(date) {
  const start = new Date(`${date}T00:00:00-03:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function money(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
}

async function readConfig(deadline) {
  const ownerId = String(process.env.SAUDE_ALERTS_OWNER_USER_ID || '').trim();
  const configuredUrl = String(process.env.ALERTS_API_URL || '').trim();
  const deploymentHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const url = configuredUrl || (deploymentHost ? `https://${deploymentHost}/api/telegram-alert` : '');
  const token = String(process.env.ALERTS_API_TOKEN || '').trim();
  if (process.env.SAUDE_ALERTS_ENABLED !== 'true' || !ownerId || !url || !token) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ownerId)) {
    throw new Error('financeiro_alerts_owner_invalid');
  }
  const gateway = new URL(url);
  if (gateway.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(gateway.hostname))) {
    throw new Error('alerts_gateway_https_required');
  }
  const { getAlertServiceClient } = await import('../../../lib/alertServiceClient.js');
  return { ownerId, url, token, deadline, client: getAlertServiceClient({deadline}) };
}

async function sendDailySummary(config, date, slot, message, title = null) {
  if (config.deadline && Date.now()+22000 > config.deadline) throw new Error('alerts_time_budget');
  const dedupeKey = `financeiro:resumo-diario:${date}:${slot}`;
  const { error: claimError } = await config.client.from('tb_saude_alertas_envios').insert({
    created_by: config.ownerId, dedupe_key: dedupeKey, status: 'sending',
  });
  if (claimError?.code === '23505') return false;
  if (claimError) throw new Error('financeiro_alerts_claim_failed');

  try {
    const headers = { 'Content-Type': 'application/json', 'X-Alert-Token': config.token };
    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    const response = await fetch(config.url, {
      method: 'POST', headers, redirect: 'error',
      body: JSON.stringify({ source: 'superapp-node', event_type: 'financeiro.daily_summary', severity: 'info',
        title: title || `Resumo financeiro - ${date.split('-').reverse().join('/')}`, message,
        dedupe_key: dedupeKey, occurred_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(Math.max(1,Math.min(20000,(config.deadline || Date.now()+21000)-Date.now()-1000))),
    });
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok || !payload?.ok || !Number.isSafeInteger(payload.telegram_message_id)) {
      await config.client.from('tb_saude_alertas_envios').update({ status: 'uncertain', updated_at: new Date().toISOString() })
        .eq('created_by', config.ownerId).eq('dedupe_key', dedupeKey);
      throw new Error('financeiro_alerts_delivery_failed');
    }
    const { error } = await config.client.from('tb_saude_alertas_envios').update({
      status: 'sent', telegram_message_id: payload.telegram_message_id, updated_at: new Date().toISOString(),
    }).eq('created_by', config.ownerId).eq('dedupe_key', dedupeKey);
    if (error) throw new Error('financeiro_alerts_delivery_record_failed');
    return true;
  } catch (error) {
    if (error?.message !== 'financeiro_alerts_delivery_failed') {
      await config.client.from('tb_saude_alertas_envios').update({ status: 'uncertain', updated_at: new Date().toISOString() })
        .eq('created_by', config.ownerId).eq('dedupe_key', dedupeKey);
    }
    throw error;
  }
}

async function loadSummary(config, date, slot) {
  const client = config.client;
  const sum = (rows, key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  if (slot === 'debitos-pix-13h' || slot === 'debitos-pix-20h') {
    const { start: dayStart, end: dayEnd } = dateRange(date);
    const data = [];
    for (let page=0;page<100;page++) {
      const result = await client.from('tb_financas')
        .select('id,valor,metodo_pagamento,data_lancamento,created_at,tipo').eq('user_id',config.ownerId)
        .or(`data_lancamento.eq.${date},and(data_lancamento.is.null,created_at.gte.${dayStart},created_at.lt.${dayEnd})`)
        .order('id').range(page*1000,page*1000+999);
      if (result.error) throw new Error(`financeiro_alerts_data_${result.error.code || 'unavailable'}`);
      data.push(...(result.data || []));
      if ((result.data || []).length<1000) break;
      if (page===99) throw new Error('financeiro_alerts_data_limit');
    }
    const total = (data || []).filter((row) => String(row.tipo || 'despesa').toLowerCase() !== 'receita'
      && /debito|pix/i.test(String(row.metodo_pagamento || '')))
      .reduce((amount, row) => amount + (Number(row.valor) || 0), 0);
    return `💳 Gastos de hoje com débito/Pix: ${money(total)}`;
  }

  const month = date.slice(0, 7);
  const { data, error } = await client.from('vw_financeiro_resumo_mensal')
    .select('fixas_pagas,fixas_pendentes').eq('user_id',config.ownerId).eq('mes_ano', month);
  if (error) throw new Error(`financeiro_alerts_data_${error.code || 'unavailable'}`);
  const rows = data || [];
  return [
    '🏠 Despesas fixas deste mês',
    `✅ Pago: ${money(sum(rows, 'fixas_pagas'))}`,
    `⏳ Pendente: ${money(sum(rows, 'fixas_pendentes'))}`,
  ].join('\n');
}

export async function previewFinanceiroDailySummaries(now = new Date()) {
  const { getAlertServiceClient } = await import('../../../lib/alertServiceClient.js');
  const { date } = saoPauloClock(now);
  const config = { client: getAlertServiceClient(), ownerId: process.env.SAUDE_ALERTS_OWNER_USER_ID };
  if (!config.ownerId) throw new Error('financeiro_alerts_owner_invalid');
  const [daily, fixed] = await Promise.all([
    loadSummary(config, date, 'debitos-pix-20h'),
    loadSummary(config, date, 'despesas-fixas-21h'),
  ]);
  return [
    { event_type: 'financeiro.daily_summary', title: '[TESTE MANUAL] Financeiro · Débito/Pix (13h e 20h)', message: daily },
    { event_type: 'financeiro.daily_summary', title: '[TESTE MANUAL] Financeiro · Despesas fixas (21h)', message: fixed },
  ];
}

async function runLegacyFinanceiroSummary(now = new Date(), {deadline = Date.now()+45000} = {}) {
  const { date, time } = saoPauloClock(now);
  // The workflow polls every five minutes; persistent keys prevent duplicate summaries.
  const hour = time.slice(0, 2);
  const slot = hour === '13' ? 'debitos-pix-13h'
    : hour === '20' ? 'debitos-pix-20h'
      : hour === '21' ? 'despesas-fixas-21h' : null;
  if (!slot) return { skipped: true, reason: 'outside_daily_window' };
  const config = await readConfig(deadline);
  if (!config) return { skipped: true, reason: 'disabled_or_missing_config' };
  const { data: roles, error } = await config.client.from('app_user_roles').select('role').eq('user_id', config.ownerId);
  if (error || !roles?.some((row) => ['owner', 'admin'].includes(row.role))) throw new Error('financeiro_alerts_owner_invalid');
  const message = await loadSummary(config, date, slot);
  const sent = await sendDailySummary(config, date, slot, message);
  return { processed: true, alerts_sent: Number(sent), date, slot };
}

export async function runFinanceiroDailySummary(now = new Date(), {deadline = Date.now()+45000} = {}) {
  const config = await readConfig(deadline);
  if (!config) return { skipped:true,reason:'disabled_or_missing_config' };
  const {data:rows,error} = await config.client.from('tb_financeiro_alertas')
    .select('id,nome,tipo,mensagem,cron,horarios,ativo,created_at,updated_at').eq('user_id',config.ownerId).eq('ativo',true).order('id').limit(51);
  // Compatibilidade durante o rollout: a migration habilita as regras persistidas.
  if (['42P01','PGRST205'].includes(error?.code)) return runLegacyFinanceiroSummary(now,{deadline});
  if (error || (rows || []).length>50) throw new Error('financeiro_alerts_schedule_unavailable');
  let sent=0,processed=0;
  for (const row of rows || []) {
    if (Date.now()+22000>deadline) break;
    for (const occurrence of alertOccurrences(row,now)) {
    if (Date.now()+22000>deadline) break;
    const slot=`custom:${row.id}:${occurrence.time}`;
    const {data:existing,error:readError}=await config.client.from('tb_saude_alertas_envios').select('dedupe_key')
      .eq('created_by',config.ownerId).eq('dedupe_key',`financeiro:resumo-diario:${occurrence.date}:${slot}`).maybeSingle();
    if (readError) throw new Error('financeiro_alerts_delivery_history_unavailable');
    if (existing) continue;
    const summary = row.tipo === 'mensagem' ? '' : await loadSectionSummary(config,occurrence.date,row.tipo);
    const introduction = row.horarios == null ? row.mensagem
      : `${FINANCIAL_ALERT_INTRO}\nResumo · ${FINANCIAL_ALERT_SECTIONS[row.tipo]}`;
    const message=[introduction,summary].filter(Boolean).join('\n\n');
    sent+=Number(await sendDailySummary(config,occurrence.date,slot,message,row.nome));processed++;
    }
  }
  return {processed:true,alerts_sent:sent,scheduled:rows?.length || 0,attempted:processed};
}
async function loadMonthlySummary(config,date) {
  const month=date.slice(0,7), start=`${month}-01T00:00:00-03:00`;
  const [year,number]=month.split('-').map(Number);
  const endMonth=new Date(Date.UTC(year,number,1)).toISOString().slice(0,7);
  const end=`${endMonth}-01T00:00:00-03:00`;
  const read=async(table,fields,filter)=>{
    const rows=[];
    for(let page=0;page<100;page++) {
      const {data,error}=await filter(config.client.from(table).select(fields).eq('user_id',config.ownerId)).order('id').range(page*1000,page*1000+999);
      if(error) throw new Error('financeiro_alerts_month_unavailable');
      rows.push(...(data || []));if((data || []).length<1000)return rows;
    }
    throw new Error('financeiro_alerts_month_limit');
  };
  const [financas,fixas]=await Promise.all([
    read('tb_financas','id,valor,tipo,metodo_pagamento',query=>query.or(`and(data_lancamento.gte.${month}-01,data_lancamento.lt.${endMonth}-01),and(data_lancamento.is.null,created_at.gte.${start},created_at.lt.${end})`)),
    read('tb_despesas_fixas','id,valor',query=>query.gte('created_at',start).lt('created_at',end)),
  ]);
  const income=financas.filter(r=>r.tipo==='receita').reduce((s,r)=>s+Number(r.valor || 0),0);
  const expenses=fixas.reduce((s,r)=>s+Number(r.valor || 0),0)+financas.filter(r=>r.tipo!=='receita' && /debito|pix/i.test(String(r.metodo_pagamento || ''))).reduce((s,r)=>s+Number(r.valor || 0),0);
  return `Receitas do mês: ${money(income)}\nDespesas (fixas + extrato): ${money(expenses)}\nSaldo: ${money(income-expenses)}`;
}

export async function loadSectionSummary(config,date,type) {
  if (type === 'diario') return loadSummary(config,date,'debitos-pix-20h');
  if (type === 'fixas') return loadSummary(config,date,'despesas-fixas-21h');
  if (type === 'mensal') return loadMonthlySummary(config,date);
  if (type === 'receitas') {
    const month = date.slice(0,7), [year,number] = month.split('-').map(Number);
    const next = new Date(Date.UTC(year,number,1)).toISOString().slice(0,7);
    const rows = await readSectionRows(config,'tb_financas','id,valor,tipo',query => query.eq('tipo','receita')
      .or(`and(data_lancamento.gte.${month}-01,data_lancamento.lt.${next}-01),and(data_lancamento.is.null,created_at.gte.${month}-01T00:00:00-03:00,created_at.lt.${next}-01T00:00:00-03:00)`));
    return `💰 Receitas do mês: ${money(rows.filter(row => row.tipo === 'receita').reduce((total,row) => total+Number(row.valor || 0),0))}`;
  }
  if (type === 'poupanca') {
    const {data,error} = await config.client.from('vw_financeiro_poupanca_resumo')
      .select('total_acumulado,nome_meta,valor_meta,status_meta').eq('user_id',config.ownerId);
    if (error) throw new Error('financeiro_alerts_savings_unavailable');
    const row = data?.[0] || {};
    return [`🐷 Poupança acumulada: ${money(row.total_acumulado)}`,
      row.nome_meta ? `Meta: ${String(row.nome_meta).slice(0,120)} · ${money(row.valor_meta)}` : 'Nenhuma meta de poupança cadastrada.'].join('\n');
  }
  if (type === 'simulador') {
    const rows = await readSectionRows(config,'tb_financeiro_simulacoes','id,meta_id,nome,created_at',query => query.order('created_at',{ascending:false}));
    const latest = new Map();
    for (const row of rows) if (!latest.has(row.meta_id)) latest.set(row.meta_id,row);
    const goals = [...latest.values()];
    return [`🚗 Simulador: ${goals.length} meta(s) salva(s)`,
      ...goals.slice(0,3).map(row => `• ${String(row.nome || 'Meta').slice(0,120)} · última simulação: ${String(row.created_at).slice(0,10).split('-').reverse().join('/')}`),
      goals.length ? 'Resultados salvos; repita a simulação no app para atualizar.' : 'Nenhuma simulação salva.'].join('\n');
  }
  if (type === 'geral') {
    const parts = await Promise.all([loadMonthlySummary(config,date),
      ...['diario','fixas','poupanca','simulador'].map(section => loadSectionSummary(config,date,section))]);
    return ['📊 Resumo geral do Financeiro',...parts].join('\n\n');
  }
  throw new Error('financeiro_alerts_type_invalid');
}
async function readSectionRows(config,table,fields,filter) {
  const rows = [];
  for (let page=0;page<100;page++) {
    const {data,error} = await filter(config.client.from(table).select(fields).eq('user_id',config.ownerId)).order('id').range(page*1000,page*1000+999);
    if (error) throw new Error('financeiro_alerts_section_unavailable');
    rows.push(...(data || []));
    if ((data || []).length < 1000) return rows;
  }
  throw new Error('financeiro_alerts_section_limit');
}
