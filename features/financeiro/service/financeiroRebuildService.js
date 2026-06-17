import {
  TABLE_DESPESAS_FIXAS,
  TABLE_FINANCAS,
  TABLE_FINANCEIRO_ANALISES,
  TABLE_FINANCEIRO_ANALISE_RUNS,
  TABLE_FINANCEIRO_FEATURES_MENSAIS,
  TABLE_FINANCEIRO_MODELO_ESTADO,
} from '../index.js';

function rowMesAno(row) {
  const rawValue = String(row?.data_lancamento || row?.created_at || '').trim();
  if (!rawValue) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) return rawValue.slice(0, 7);
  const date = new Date(rawValue);
  if (Number.isNaN(date.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(date);
  const map = {};
  parts.forEach((p) => { map[p.type] = p.value; });
  const raw = `${map.year}-${map.month}-${map.day}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.slice(0, 7) : null;
}

function isJanuaryMesAno(mesAno) {
  const raw = String(mesAno || '').trim();
  const match = raw.match(/^(\d{4})[-/](\d{2})(?:[-/]\d{2})?/);
  if (!match) return false;
  return match[2] === '01';
}

async function fetchAllRows(supabaseClient, table, columns = 'created_at,data_lancamento') {
  const pageSize = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    const query = supabaseClient
      .from(table)
      .select(columns)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    const { data, error } = await query;
    if (error) throw error;
    const batch = Array.isArray(data) ? data : [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function clearDerivedTable(supabaseClient, table) {
  const { error } = await supabaseClient.from(table).delete().not('id', 'is', null);
  if (error) throw error;
}

function createMockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    end(payload) {
      this.body = payload || '';
      return this;
    },
  };
}

async function runAnalistaForMonth(financeiroAnalistaHandler, mesAno) {
  const req = {
    method: 'GET',
    query: {
      mes_ano: mesAno,
      learn: '1',
      cron: '1',
    },
  };
  const res = createMockRes();
  await financeiroAnalistaHandler(req, res);
  let data = {};
  try {
    data = res.body ? JSON.parse(res.body) : {};
  } catch {
    data = { raw: res.body };
  }
  if (res.statusCode >= 400) {
    throw new Error(data?.error || `Falha ao recalcular ${mesAno}`);
  }
  return data;
}

export async function rebuildFinanceiroAnalises() {
  const hasSupabaseSecrets = Boolean(process.env.SUPABASE_URL)
    && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);
  if (!hasSupabaseSecrets) {
    return {
      ok: true,
      skipped: true,
      reason: 'missing_supabase_secrets',
      months_processed: 0,
      months: [],
    };
  }

  const { supabase } = await import('../../../lib/supabase.js');
  const { default: financeiroAnalistaHandler } = await import('../../../api/financeiro-analista.js');

  const [financasRows, fixasRows] = await Promise.all([
    fetchAllRows(supabase, TABLE_FINANCAS),
    fetchAllRows(supabase, TABLE_DESPESAS_FIXAS),
  ]);

  const months = [...new Set([
    ...financasRows.map(rowMesAno),
    ...fixasRows.map(rowMesAno),
  ].filter((mesAno) => Boolean(mesAno) && !isJanuaryMesAno(mesAno)))].sort();

  await Promise.all([
    clearDerivedTable(supabase, TABLE_FINANCEIRO_ANALISE_RUNS),
    clearDerivedTable(supabase, TABLE_FINANCEIRO_MODELO_ESTADO),
    clearDerivedTable(supabase, TABLE_FINANCEIRO_ANALISES),
    clearDerivedTable(supabase, TABLE_FINANCEIRO_FEATURES_MENSAIS),
  ]);

  const processed = [];
  for (const mesAno of months) {
    const result = await runAnalistaForMonth(financeiroAnalistaHandler, mesAno);
    processed.push({
      mes_ano: mesAno,
      feature_id: result?.aprendizado?.feature_id ?? null,
      analysis_id: result?.aprendizado?.analysis_id ?? null,
      run_id: result?.aprendizado?.run_id ?? null,
      model_state_id: result?.aprendizado?.model_state_id ?? null,
    });
  }

  return {
    ok: true,
    months_processed: processed.length,
    months: processed,
  };
}
