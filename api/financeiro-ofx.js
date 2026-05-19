import { processarImportacaoOfx } from './_financeiroOfxShared.js';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const result = await processarImportacaoOfx(req);
    return json(res, result.status, result.data);
  }
  res.setHeader('Allow', 'POST');
  return json(res, 405, { error: 'Method Not Allowed' });
}
