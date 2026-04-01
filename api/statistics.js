import { APPS } from './apps.js';

/**
 * Estatisticas do Super App (usada pelo index.html no Vercel).
 * Deriva os totais do catalogo compartilhado para evitar divergencia.
 */
function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method Not Allowed' });
  }

  const totalApps = APPS.length;
  const activeApps = APPS.filter((app) => app.status === 'active').length;
  const betaApps = APPS.filter((app) => app.status === 'beta').length;
  const openApps = APPS.filter((app) => app.status === 'open').length;

  return json(res, 200, {
    totalApps,
    activeApps,
    betaApps,
    openApps,
  });
}
