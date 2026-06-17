function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).end(JSON.stringify(data));
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return json(res, 405, { error: 'Method Not Allowed' });
    }

    const token = String(process.env.FINANCEIRO_REBUILD_TOKEN || '').trim();
    if (!token) {
      return json(res, 404, {
        error: 'FINANCEIRO_REBUILD_TOKEN nao configurado.',
      });
    }

    return json(res, 200, { token });
  } catch (error) {
    return json(res, 500, {
      error: error?.message || 'Erro ao carregar token de rebuild',
    });
  }
}
