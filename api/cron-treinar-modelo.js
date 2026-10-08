/**
 * /api/cron-treinar-modelo
 *
 * Rota legada desativada: a classificacao financeira usa servicos locais.
 */

import { isCronAuthorized } from '../lib/cronAuth.js';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method Not Allowed' });
  }
  if (!isCronAuthorized(req)) return json(res, 401, { error: 'Unauthorized' });
  return json(res, 410, { error: 'Rota de treinamento descontinuada.' });
}
