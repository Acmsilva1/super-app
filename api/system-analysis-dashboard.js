import { createClient } from "@supabase/supabase-js";

const TABLE_NAME = process.env.SYSTEM_ANALYSIS_TABLE || "system_analysis_logs";
const STORAGE_TABLES = [
  { app: "Despesas Fixas", table: "tb_despesas_fixas" },
  { app: "Financas", table: "tb_financas" },
  { app: "Lista de Compras", table: "tb_lista_compras" },
  { app: "Saúde Familiar", table: "tb_saude_familiar" },
  { app: "Agenda", table: "tb_calendario" },
  { app: "Fluxograma", table: "tb_fluxograma_projetos" },
];

function json(res, status, data) {
  res.setHeader("Content-Type", "application/json");
  res.status(status).end(JSON.stringify(data));
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, decimals = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function getSupabaseServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL e chave do Supabase nao configuradas.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function getProfile(req) {
  const profile = String(req.query?.profile || "").toLowerCase();
  if (profile === "monthly") return "monthly";
  if (profile === "total") return "total";
  return "weekly";
}

function getProfileWindow(profile) {
  if (profile === "monthly") {
    return { rangeDays: 30, fromIso: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() };
  }
  if (profile === "total") {
    return { rangeDays: null, fromIso: null };
  }
  return { rangeDays: 7, fromIso: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() };
}

function normalizeLabel(endpoint) {
  if (!endpoint?.endpoint_name) return "desconhecido";
  return String(endpoint.endpoint_name).replace(/_/g, " ");
}

function buildDashboardPayload(rows) {
  if (!rows.length) {
    return {
      generated_at: new Date().toISOString(),
      latest_at: null,
      summary: { status: "no_data", uptime_percent: 0, error_rate_percent: 0, p95_latency_ms: 0 },
      health: { healthy: 0, attention: 100 },
      services: { labels: ["Total", "Saudaveis", "Falhas"], values: [0, 0, 0] },
      latency_current: { labels: [], values: [] },
      storage_by_app: { labels: [], values: [] },
      db: { connected: 0, unstable: 100 },
      history: [],
    };
  }

  const latest = rows[0];
  const latestEndpoints = Array.isArray(latest.endpoints) ? latest.endpoints : [];
  const latestApiEndpoints = latestEndpoints.filter((x) => x.endpoint_name !== "db_connection");

  const dbRows = rows
    .map((row) => {
      const endpoints = Array.isArray(row.endpoints) ? row.endpoints : [];
      return endpoints.find((x) => x.endpoint_name === "db_connection");
    })
    .filter(Boolean);
  const dbSuccessCount = dbRows.filter((x) => x.success).length;
  const dbConnected = dbRows.length ? round((dbSuccessCount / dbRows.length) * 100, 2) : 100;

  return {
    generated_at: new Date().toISOString(),
    latest_at: latest.measured_at,
    summary: {
      status: latest.status || "unknown",
      uptime_percent: toNumber(latest.uptime_percent, 0),
      error_rate_percent: toNumber(latest.error_rate_percent, 0),
      p95_latency_ms: toNumber(latest.p95_latency_ms, 0),
      checks_total: toNumber(latest.checks_total, 0),
      checks_success: toNumber(latest.checks_success, 0),
      checks_failed: toNumber(latest.checks_failed, 0),
    },
    health: {
      healthy: toNumber(latest.uptime_percent, 0),
      attention: Math.max(0, round(100 - toNumber(latest.uptime_percent, 0), 2)),
    },
    services: {
      labels: ["Total", "Saudaveis", "Falhas"],
      values: [
        toNumber(latest.checks_total, 0),
        toNumber(latest.checks_success, 0),
        toNumber(latest.checks_failed, 0),
      ],
    },
    latency_current: {
      labels: latestApiEndpoints.map((x) => normalizeLabel(x)),
      values: latestApiEndpoints.map((x) => toNumber(x.latency_ms, 0)),
    },
    storage_by_app: { labels: [], values: [] },
    db: {
      connected: dbConnected,
      unstable: Math.max(0, round(100 - dbConnected, 2)),
    },
    history: rows
      .slice()
      .reverse()
      .map((row) => ({
        measured_at: row.measured_at,
        uptime_percent: toNumber(row.uptime_percent, 0),
        error_rate_percent: toNumber(row.error_rate_percent, 0),
        p95_latency_ms: toNumber(row.p95_latency_ms, 0),
      })),
  };
}

async function fetchStorageByApp(supabase, fromIso = null) {
  const counts = await Promise.all(
    STORAGE_TABLES.map(async (item) => {
      let query = supabase.from(item.table).select("id", { count: "exact", head: true });
      if (fromIso) query = query.gte("created_at", fromIso);
      const { count, error } = await query;
      if (error) {
        return { label: item.app, value: 0 };
      }
      return { label: item.app, value: toNumber(count, 0) };
    })
  );

  counts.sort((a, b) => b.value - a.value);
  return {
    labels: counts.map((x) => x.label),
    values: counts.map((x) => x.value),
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "Use GET" });
  }

  try {
    const supabase = getSupabaseServerClient();
    const profile = getProfile(req);
    const { rangeDays, fromIso } = getProfileWindow(profile);
    const limit = rangeDays ? Math.max(24, Math.min(rangeDays * 24, 500)) : 1000;

    let query = supabase
      .from(TABLE_NAME)
      .select(
        "measured_at,status,checks_total,checks_success,checks_failed,uptime_percent,error_rate_percent,p95_latency_ms,endpoints"
      )
      .order("measured_at", { ascending: false })
      .limit(limit);
    if (fromIso) query = query.gte("measured_at", fromIso);

    const { data, error } = await query;

    if (error) throw new Error(error.message);

    const payload = buildDashboardPayload(data || []);
    payload.profile = profile;
    payload.storage_by_app = await fetchStorageByApp(supabase, fromIso);
    return json(res, 200, payload);
  } catch (error) {
    return json(res, 500, { error: error.message || "Falha ao carregar dashboard de analise." });
  }
}
