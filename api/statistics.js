/**
 * Estatísticas do Super App (usada pelo index.html no Vercel).
 * totalApps = 4 (notas, finanças, lista de compras, saúde).
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
  return json(res, 200, {
    totalApps: 4,
    activeApps: 4,
    betaApps: 0,
    openApps: 0,
  });
}
