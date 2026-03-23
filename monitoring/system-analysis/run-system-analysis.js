import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

const DEFAULT_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 12000);
const DEFAULT_TABLE = process.env.SYSTEM_ANALYSIS_TABLE || "system_analysis_logs";
const APP_BASE_URL = (process.env.APP_BASE_URL || "").replace(/\/+$/, "");
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const ENDPOINTS = [
  { name: "apps", path: "/api/apps", expectedStatus: 200, critical: true },
  { name: "statistics", path: "/api/statistics", expectedStatus: 200, critical: true },
  { name: "roadmap", path: "/api/roadmap", expectedStatus: 200, critical: false },
  { name: "saude", path: "/api/saude", expectedStatus: 200, critical: false },
];
const DEFAULT_DB_TABLE = process.env.SYSTEM_ANALYSIS_DB_TABLE || "tb_calendario";

function nowIso() {
  return new Date().toISOString();
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

async function testEndpoint(baseUrl, endpoint) {
  const url = `${baseUrl}${endpoint.path}`;
  const method = endpoint.method || "GET";
  const startedAt = nowIso();
  const hrStart = process.hrtime.bigint();

  try {
    const response = await fetchWithTimeout(url, { method });
    const latencyMs = msDiff(hrStart);
    const okStatus = response.status === endpoint.expectedStatus;

    return {
      endpoint_name: endpoint.name,
      endpoint_path: endpoint.path,
      method,
      started_at: startedAt,
      finished_at: nowIso(),
      latency_ms: Math.round(latencyMs),
      status_code: response.status,
      success: okStatus,
      critical: endpoint.critical,
      error_message: okStatus ? null : `Status inesperado: ${response.status}`,
    };
  } catch (error) {
    const latencyMs = msDiff(hrStart);
    return {
      endpoint_name: endpoint.name,
      endpoint_path: endpoint.path,
      method,
      started_at: startedAt,
      finished_at: nowIso(),
      latency_ms: Math.round(latencyMs),
      status_code: null,
      success: false,
      critical: endpoint.critical,
      error_message: error?.name === "AbortError" ? "Timeout" : String(error?.message || error),
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
      version: 1,
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

  if (!appBaseUrl) throw new Error("APP_BASE_URL nao definido.");
  if (!supabaseUrl) throw new Error("SUPABASE_URL nao definido.");
  if (!supabaseKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_ANON_KEY) nao definido.");

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
        message: "Analise concluida com sucesso.",
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
    console.error(`Falha na analise: ${error.message}`);
    process.exit(1);
  });
}
