import { runSystemAnalysis } from "../monitoring/system-analysis/run-system-analysis.js";

function json(res, status, data) {
  res.setHeader("Content-Type", "application/json");
  res.status(status).end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Use POST" });
  }

  try {
    const appBaseUrl = process.env.APP_BASE_URL || `https://${req.headers.host}`;
    const snapshot = await runSystemAnalysis({ appBaseUrl });
    return json(res, 200, {
      ok: true,
      message: "Analise executada com sucesso.",
      measured_at: snapshot.measured_at,
      status: snapshot.status,
      checks_total: snapshot.checks_total,
      checks_failed: snapshot.checks_failed,
      p95_latency_ms: snapshot.p95_latency_ms,
    });
  } catch (error) {
    return json(res, 500, { error: error.message || "Falha na analise" });
  }
}
