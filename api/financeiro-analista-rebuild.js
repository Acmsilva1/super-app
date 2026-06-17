import { rebuildFinanceiroAnalises } from '../features/financeiro/service/financeiroRebuildService.js';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

function isAuthorized(req) {
  const expected = String(process.env.FINANCEIRO_REBUILD_TOKEN || '').trim();
  if (!expected) return false;
  const provided = String(req.headers?.['x-rebuild-token'] || req.query?.token || '').trim();
  return provided === expected;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return json(res, 405, { error: 'Method Not Allowed' });
    }

    if (!isAuthorized(req)) {
      return json(res, 403, {
        error: 'Acesso negado. Configure FINANCEIRO_REBUILD_TOKEN e envie em x-rebuild-token ou ?token=.',
      });
    }
    const result = await rebuildFinanceiroAnalises();
    return json(res, 200, result);
  } catch (error) {
    return json(res, 500, {
      error: error?.message || 'Erro ao recalcular o analista financeiro',
    });
  }
}
