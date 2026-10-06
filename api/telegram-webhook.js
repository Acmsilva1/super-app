import { telegramWebhookAuthorized, processTelegramPurchase } from '../lib/telegramPurchase.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ ok: false }); }
  if (!telegramWebhookAuthorized(req)) return res.status(401).json({ ok: false });
  try {
    const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!update || !Number.isSafeInteger(update.update_id)) return res.status(400).json({ ok: false });
    const { supabase } = await import('../lib/supabase.js');
    await processTelegramPurchase(update, supabase);
    return res.status(200).json({ ok: true });
  } catch { return res.status(503).json({ ok: false, error: 'telegram_processing_failed' }); }
}
