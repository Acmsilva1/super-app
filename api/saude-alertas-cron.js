import { isCronAuthorized } from '../lib/cronAuth.js';
import { runSaudeAlertSlot } from '../features/saude/service/alertasSaudeScheduler.js';
import { runTelegramManualTest } from '../lib/telegramManualTest.js';

async function startRun() {
  try {
    const { supabase } = await import('../lib/supabase.js');
    const { data } = await supabase.from('tb_saude_alertas_runs')
      .insert({ status: 'running' }).select('id').single();
    await supabase.from('tb_saude_alertas_runs')
      .delete().lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());
    return data?.id || null;
  } catch {}
  return null;
}

async function finishRun(runId, status, errorCode = null, alertsSent = 0) {
  if (!runId) return;
  try {
    const { supabase } = await import('../lib/supabase.js');
    await supabase.from('tb_saude_alertas_runs').update({ status, error_code: errorCode, alerts_sent: alertsSent }).eq('id', runId);
  } catch {}
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (!isCronAuthorized(req)) return res.status(401).json({ error: 'Não autorizado.' });
  if (req.query?.mode === 'telegram_test') {
    const result = await runTelegramManualTest();
    return res.status(result.status).json(result.body);
  }
  const runId = await startRun();
  try {
    const result = await runSaudeAlertSlot();
    await finishRun(runId, result.skipped ? 'skipped' : 'processed', null, result.alerts_sent || 0);
    return res.status(200).json({ ok: true, ...result });
  } catch {
    await finishRun(runId, 'failed', 'scheduler_failed');
    return res.status(503).json({ ok: false, error: 'Falha ao processar os alertas. Confira a configuração e as migrations.' });
  }
}
