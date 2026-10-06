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

function safeText(value, max = 90) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function monthStart(date) {
  return `${date.slice(0, 7)}-01`;
}

function nextMonthStart(date) {
  const [year, month] = date.slice(0, 7).split('-').map(Number);
  return `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`;
}

async function readConfig() {
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
  return { ownerId, url, token, client: getAlertServiceClient() };
}

async function sendDailySummary(config, date, message) {
  const dedupeKey = `financeiro:resumo-diario:${date}`;
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
        title: `Resumo financeiro - ${date.split('-').reverse().join('/')}`, message,
        dedupe_key: dedupeKey, occurred_at: new Date().toISOString() }),
      signal: AbortSignal.timeout(20000),
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

async function loadSummary(config, date) {
  const client = config.client;
  const month = date.slice(0, 7);
  const { start: dayStart, end: dayEnd } = dateRange(date);
  const [monthlyResult, fixedResult, pendingResult, debitResult, savingsResult] = await Promise.all([
    client.from('vw_financeiro_resumo_mensal').select('receitas,despesas_variadas,despesas_fixas,saldo,fixas_pagas,fixas_pendentes')
      .eq('mes_ano', month),
    client.from('tb_despesas_fixas').select('descricao,valor,conta_fixa').gte('created_at', `${monthStart(date)}T00:00:00-03:00`)
      .lt('created_at', `${nextMonthStart(date)}T00:00:00-03:00`)
      .eq('conta_fixa', true).order('created_at', { ascending: true }),
    client.from('tb_despesas_fixas').select('descricao,valor').eq('status', 'pendente')
      .gte('created_at', `${monthStart(date)}T00:00:00-03:00`).lt('created_at', `${nextMonthStart(date)}T00:00:00-03:00`)
      .order('created_at', { ascending: true }),
    client.from('tb_financas').select('descricao,valor,metodo_pagamento,data_lancamento,created_at,tipo')
      .or(`data_lancamento.eq.${date},and(data_lancamento.is.null,created_at.gte.${dayStart},created_at.lt.${dayEnd})`),
    client.from('vw_financeiro_poupanca_resumo').select('total_acumulado,nome_meta,valor_meta,progresso,status_meta'),
  ]);
  for (const result of [monthlyResult, fixedResult, pendingResult, debitResult, savingsResult]) {
    if (result.error) throw new Error(`financeiro_alerts_data_${result.error.code || 'unavailable'}`);
  }

  const monthlyRows = monthlyResult.data || [];
  const sum = (rows, key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  const monthData = Object.fromEntries(['receitas', 'despesas_variadas', 'despesas_fixas', 'saldo']
    .map((key) => [key, sum(monthlyRows, key)]));
  const savingsRows = savingsResult.data || [];
  const savingsTotal = sum(savingsRows, 'total_acumulado');
  const debitRows = (debitResult.data || []).filter((row) => String(row.tipo || 'despesa').toLowerCase() !== 'receita'
    && String(row.metodo_pagamento || '').toLowerCase().includes('debito'));
  const debitTotal = debitRows.reduce((sum, row) => sum + (Number(row.valor) || 0), 0);
  const fixedRows = fixedResult.data || [];
  const pendingRows = pendingResult.data || [];
  const pendingTotal = pendingRows.reduce((sum, row) => sum + (Number(row.valor) || 0), 0);

  const lines = [
    `📊 Finanças de ${month.split('-').reverse().join('/')}`,
    `Receitas: ${money(monthData.receitas)}`,
    `Despesas fixas: ${money(monthData.despesas_fixas)} · variáveis: ${money(monthData.despesas_variadas)}`,
    `Saldo do mês: ${money(monthData.saldo)}`,
    `🏠 Contas fixas cadastradas: ${fixedRows.length ? fixedRows.slice(0, 8).map((row) => `${safeText(row.descricao)} (${money(row.valor)})`).join('; ') : 'nenhuma'}`,
    `⏳ Pendências do mês: ${pendingRows.length} · ${money(pendingTotal)}`,
  ];
  if (pendingRows.length) {
    lines.push(`Pendentes: ${pendingRows.slice(0, 8).map((row) => `${safeText(row.descricao)} (${money(row.valor)})`).join('; ')}`);
    if (pendingRows.length > 8) lines.push(`… mais ${pendingRows.length - 8} pendências`);
  }
  lines.push(`💳 Débito/Pix lançado hoje (${date.split('-').reverse().join('/')}): ${money(debitTotal)} em ${debitRows.length} lançamento(s)`);
  lines.push(`🐷 Poupança total da família: ${money(savingsTotal)}`);
  const metas = savingsRows.filter((row) => row.nome_meta);
  if (metas.length) {
    lines.push(`Metas: ${metas.slice(0, 4).map((row) => `${safeText(row.nome_meta)} (${Math.round(Number(row.progresso || 0) * 100)}%)`).join('; ')}`);
    if (metas.length > 4) lines.push(`… mais ${metas.length - 4} metas`);
  } else {
    lines.push('Metas de poupança: nenhuma configurada');
  }
  return lines.join('\n').slice(0, 2900);
}

export async function runFinanceiroDailySummary(now = new Date()) {
  const { date, time } = saoPauloClock(now);
  // The 5-minute GitHub poll first arrives around :02. Send once during the 19h hour.
  if (time < '19:00' || time >= '20:00') return { skipped: true, reason: 'outside_daily_window' };
  const config = await readConfig();
  if (!config) return { skipped: true, reason: 'disabled_or_missing_config' };
  const { data: roles, error } = await config.client.from('app_user_roles').select('role').eq('user_id', config.ownerId);
  if (error || !roles?.some((row) => ['owner', 'admin'].includes(row.role))) throw new Error('financeiro_alerts_owner_invalid');
  const message = await loadSummary(config, date);
  const sent = await sendDailySummary(config, date, message);
  return { processed: true, alerts_sent: Number(sent), date, slot: time };
}
