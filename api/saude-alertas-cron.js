import { isCronAuthorized } from '../lib/cronAuth.js';
import { runSaudeAlertSlot } from '../features/saude/service/alertasSaudeScheduler.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }
  if (!isCronAuthorized(req)) return res.status(401).json({ error: 'Não autorizado.' });
  try {
    const result = await runSaudeAlertSlot();
    return res.status(200).json({ ok: true, ...result });
  } catch {
    return res.status(503).json({ ok: false, error: 'Falha ao processar os alertas. Confira a configuração e as migrations.' });
  }
}
