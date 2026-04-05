import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

const DEFAULT_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 12000);
const DEFAULT_TABLE = process.env.SYSTEM_ANALYSIS_TABLE || "system_analysis_logs";
const APP_BASE_URL = (process.env.APP_BASE_URL || "").replace(/\/+$/, "");
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const TZ = "America/Sao_Paulo";

const ENDPOINTS = [
  {
    name: "apps",
    path: "/api/apps",
    expectedStatus: 200,
    critical: true,
    validateBody: (body) => Array.isArray(body) && body.length > 0 && body.every((item) => typeof item?.id === "string"),
    successHint: "catálogo carregado",
  },
  {
    name: "statistics",
    path: "/api/statistics",
    expectedStatus: 200,
    critical: true,
    validateBody: (body) => Number.isFinite(Number(body?.totalApps)) && Number(body?.totalApps) >= 1,
    successHint: "estatísticas carregadas",
  },
  {
    name: "roadmap",
    path: "/api/roadmap",
    expectedStatus: 200,
    critical: false,
    validateBody: (body) => Array.isArray(body) && body.length >= 1,
    successHint: "roadmap carregado",
  },
  {
    name: "despesas_fixas",
    path: "/api/despesas-fixas?mes_ano={{currentMonth}}",
    expectedStatus: 200,
    critical: true,
    validateBody: (body) => Array.isArray(body?.rows) && typeof body?.mes_ano === "string",
    successHint: "módulo de despesas fixas respondeu",
  },
  {
    name: "financas",
    path: "/api/financas?bi=1&mes_ano={{currentMonth}}",
    expectedStatus: 200,
    critical: true,
    validateBody: (body) => Array.isArray(body?.rows) && typeof body?.mes_ano === "string" && typeof body?.totais === "object",
    successHint: "módulo financeiro respondeu",
  },
  {
    name: "lista_compras",
    path: "/api/lista-compras",
    expectedStatus: 200,
    critical: true,
    validateBody: (body) => Array.isArray(body?.rows),
    successHint: "lista de compras respondeu",
  },
  {
    name: "saude",
    path: "/api/saude",
    expectedStatus: 200,
    critical: true,
    validateBody: (body) => Array.isArray(body?.rows),
    successHint: "módulo de saúde respondeu",
  },
  {
    name: "fluxograma",
    path: "/api/fluxograma",
    expectedStatus: 200,
    critical: false,
    validateBody: (body) => Array.isArray(body?.projects),
    successHint: "módulo de fluxograma respondeu",
  },
  {
    name: "system_analysis_dashboard",
    path: "/api/system-analysis-dashboard",
    expectedStatus: 200,
    critical: false,
    validateBody: (body) => typeof body?.summary === "object",
    successHint: "dashboard operacional respondeu",
  },
];
const DEFAULT_DB_TABLE = process.env.SYSTEM_ANALYSIS_DB_TABLE || "tb_financas";

function nowIso() {
  return new Date().toISOString();
}

function getBrazilDateParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
  };
}

function getCurrentMonthRef(date = new Date()) {
  const { year, month } = getBrazilDateParts(date);
  return `${year}-${month}`;
}

function msDiff(start) {
  return Number(process.hrtime.bigint() - start) / 1_000_000;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function buildEndpointUrl(baseUrl, endpoint) {
  const currentMonth = getCurrentMonthRef();
  const path = String(endpoint.path || "").replaceAll("{{currentMonth}}", currentMonth);
  return `${baseUrl}${path}`;
}

function summarizeBody(body) {
  if (Array.isArray(body)) return `array(${body.length})`;
  if (body && typeof body === "object") return Object.keys(body).slice(0, 6).join(",") || "object";
  if (body == null) return "empty";
  return String(body).slice(0, 80);
}

async function testEndpoint(baseUrl, endpoint) {
  const url = buildEndpointUrl(baseUrl, endpoint);
  const method = endpoint.method || "GET";
  const startedAt = nowIso();
  const hrStart = process.hrtime.bigint();

  try {
    const response = await fetchWithTimeout(url, { method });
    const latencyMs = msDiff(hrStart);
    let body = null;
    let bodySummary = null;
    let bodyError = null;

    try {
      body = await response.json();
      bodySummary = summarizeBody(body);
    } catch (error) {
      bodyError = `JSON inválido: ${String(error?.message || error)}`;
    }

    const okStatus = response.status === endpoint.expectedStatus;
    const okBody = typeof endpoint.validateBody === "function" ? endpoint.validateBody(body) : true;
    const success = okStatus && !bodyError && okBody;
    const failureReason = !okStatus
      ? `Status inesperado: ${response.status}`
      : bodyError
        ? bodyError
        : !okBody
          ? "Payload fora do contrato esperado"
          : null;

    return {
      endpoint_name: endpoint.name,
      endpoint_path: String(endpoint.path || ""),
      method,
      started_at: startedAt,
      finished_at: nowIso(),
      latency_ms: Math.round(latencyMs),
      status_code: response.status,
      success,
      critical: endpoint.critical,
      error_message: failureReason,
      response_summary: success ? endpoint.successHint || bodySummary : bodySummary,
    };
  } catch (error) {
    const latencyMs = msDiff(hrStart);
    return {
      endpoint_name: endpoint.name,
      endpoint_path: String(endpoint.path || ""),
      method,
      started_at: startedAt,
      finished_at: nowIso(),
      latency_ms: Math.round(latencyMs),
      status_code: null,
      success: false,
      critical: endpoint.critical,
      error_message: error?.name === "AbortError" ? "Timeout" : String(error?.message || error),
      response_summary: null,
    };
  }
}

async function testDatabaseConnection(supabase, tableName = DEFAULT_DB_TABLE) {
  const startedAt = nowIso();
  const hrStart = process.hrtime.bigint();

  try {
    const { error } = await supabase.from(tableName).select("id", { count: "exact", head: true }).limit(1);
    const latencyMs = msDiff(hrStart);
    const success = !error;

    return {
      endpoint_name: "db_connection",
      endpoint_path: `supabase:${tableName}`,
      method: "QUERY",
      started_at: startedAt,
      finished_at: nowIso(),
      latency_ms: Math.round(latencyMs),
      status_code: success ? 200 : 500,
      success,
      critical: true,
      error_message: success ? null : error.message,
      response_summary: success ? "consulta no Supabase executada" : null,
    };
  } catch (error) {
    const latencyMs = msDiff(hrStart);
    return {
      endpoint_name: "db_connection",
      endpoint_path: `supabase:${tableName}`,
      method: "QUERY",
      started_at: startedAt,
      finished_at: nowIso(),
      latency_ms: Math.round(latencyMs),
      status_code: null,
      success: false,
      critical: true,
      error_message: String(error?.message || error),
      response_summary: null,
    };
  }
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function buildSnapshot(results) {
  const totalChecks = results.length;
  const successCount = results.filter((r) => r.success).length;
  const failureCount = totalChecks - successCount;
  const criticalFailures = results.filter((r) => r.critical && !r.success).length;
  const latencies = results.map((r) => r.latency_ms).filter((x) => Number.isFinite(x));
  const failedEndpoints = results
    .filter((r) => !r.success)
    .map((r) => ({
      endpoint_name: r.endpoint_name,
      status_code: r.status_code,
      critical: r.critical,
      error_message: r.error_message,
    }));

  const uptimePercent = totalChecks ? Number(((successCount / totalChecks) * 100).toFixed(2)) : 0;
  const errorRatePercent = totalChecks ? Number(((failureCount / totalChecks) * 100).toFixed(2)) : 0;

  const status = criticalFailures > 0 ? "attention" : "healthy";

  return {
    measured_at: nowIso(),
    status,
    checks_total: totalChecks,
    checks_success: successCount,
    checks_failed: failureCount,
    critical_failures: criticalFailures,
    uptime_percent: uptimePercent,
    error_rate_percent: errorRatePercent,
    p50_latency_ms: percentile(latencies, 50),
    p95_latency_ms: percentile(latencies, 95),
    p99_latency_ms: percentile(latencies, 99),
    endpoints: results,
    metadata: {
      source: "github_actions",
      runtime: "nodejs",
      version: 2,
      failed_endpoints: failedEndpoints,
    },
  };
}

async function insertSnapshot(supabase, table, snapshot) {
  const { error } = await supabase.from(table).insert(snapshot);
  if (error) throw new Error(`Erro ao inserir snapshot no Supabase: ${error.message}`);
}

export async function runSystemAnalysis(options = {}) {
  const appBaseUrl = (options.appBaseUrl || APP_BASE_URL || "").replace(/\/+$/, "");
  const supabaseUrl = options.supabaseUrl || SUPABASE_URL;
  const supabaseKey =
    options.supabaseServiceRoleKey || SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
  const table = options.table || DEFAULT_TABLE;
  const endpoints = options.endpoints || ENDPOINTS;
  const dbTable = options.dbTable || DEFAULT_DB_TABLE;

  if (!appBaseUrl) throw new Error("APP_BASE_URL não definido.");
  if (!supabaseUrl) throw new Error("SUPABASE_URL não definido.");
  if (!supabaseKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_ANON_KEY) não definido.");

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const results = [];
  for (const endpoint of endpoints) {
    const result = await testEndpoint(appBaseUrl, endpoint);
    results.push(result);
  }
  results.push(await testDatabaseConnection(supabase, dbTable));

  const snapshot = buildSnapshot(results);
  await insertSnapshot(supabase, table, snapshot);

  return snapshot;
}

async function main() {
  const snapshot = await runSystemAnalysis();

  console.log(
    JSON.stringify(
      {
        message: "Análise concluída com sucesso.",
        measured_at: snapshot.measured_at,
        status: snapshot.status,
        checks_total: snapshot.checks_total,
        checks_failed: snapshot.checks_failed,
        p95_latency_ms: snapshot.p95_latency_ms,
      },
      null,
      2
    )
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((error) => {
    console.error(`Falha na análise: ${error.message}`);
    process.exit(1);
  });
}

