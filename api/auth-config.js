function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method Not Allowed' });
  }

  if (process.env.OFFLINE_DEV === 'true') {
    return json(res, 200, {
      offlineMode: true,
      fakeToken: 'offline-dev-token',
      user: { id: 'f88a6351-317d-425b-afcd-9430c8a34f53', email: 'andre@local.dev' },
    });
  }

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return json(res, 500, { error: 'Supabase Auth nao configurado' });
  }

  return json(res, 200, { url, anonKey });
}