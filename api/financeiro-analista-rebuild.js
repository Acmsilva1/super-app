import { supabase } from '../lib/supabase.js';
import financeiroAnalistaHandler from './financeiro-analista.js';
import {
  TABLE_DESPESAS_FIXAS,
  TABLE_FINANCAS,
  TABLE_FINANCEIRO_ANALISES,
  TABLE_FINANCEIRO_ANALISE_RUNS,
  TABLE_FINANCEIRO_FEATURES_MENSAIS,
  TABLE_FINANCEIRO_MODELO_ESTADO,
} from '../features/financeiro/index.js';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

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

async function fetchAllRows(table, columns = 'created_at,data_lancamento') {
  const pageSize = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    const query = supabase
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

async function clearDerivedTable(table) {
  const { error } = await supabase.from(table).delete().not('id', 'is', null);
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

async function runAnalistaForMonth(mesAno) {
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

function isAuthorized(req) {
  const expected = String(process.env.FINANCEIRO_REBUILD_TOKEN || '').trim();
  if (!expected) return false;
  const provided = String(req.headers?.['x-rebuild-token'] || req.query?.token || '').trim();
  return provided === expected;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return json(res, 405, { error: 'Method Not Allowed' });
    }

    if (!isAuthorized(req)) {
      return json(res, 403, {
        error: 'Acesso negado. Configure FINANCEIRO_REBUILD_TOKEN e envie em x-rebuild-token ou ?token=.',
      });
    }

    const [financasRows, fixasRows] = await Promise.all([
      fetchAllRows(TABLE_FINANCAS),
      fetchAllRows(TABLE_DESPESAS_FIXAS),
    ]);

    const months = [...new Set([
      ...financasRows.map(rowMesAno),
      ...fixasRows.map(rowMesAno),
    ].filter(Boolean))].sort();

    await Promise.all([
      clearDerivedTable(TABLE_FINANCEIRO_ANALISE_RUNS),
      clearDerivedTable(TABLE_FINANCEIRO_MODELO_ESTADO),
      clearDerivedTable(TABLE_FINANCEIRO_ANALISES),
      clearDerivedTable(TABLE_FINANCEIRO_FEATURES_MENSAIS),
    ]);

    const processed = [];
    for (const mesAno of months) {
      const result = await runAnalistaForMonth(mesAno);
      processed.push({
        mes_ano: mesAno,
        feature_id: result?.aprendizado?.feature_id ?? null,
        analysis_id: result?.aprendizado?.analysis_id ?? null,
        run_id: result?.aprendizado?.run_id ?? null,
        model_state_id: result?.aprendizado?.model_state_id ?? null,
      });
    }

    return json(res, 200, {
      ok: true,
      months_processed: processed.length,
      months: processed,
    });
  } catch (error) {
    return json(res, 500, {
      error: error?.message || 'Erro ao recalcular o analista financeiro',
    });
  }
}
