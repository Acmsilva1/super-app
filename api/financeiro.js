import {
  obterFinanceiroMes,
  criarRegistroFinanceiro,
  atualizarRegistroFinanceiro,
  removerRegistroFinanceiro,
} from './_financeiroShared.js';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const result = await obterFinanceiroMes(req.query || {});
    return json(res, result.status, result.data || { error: result.error || 'Erro ao carregar financeiro' });
  }
  if (req.method === 'POST') {
    const result = await criarRegistroFinanceiro(req);
    return json(res, result.status, result.data);
  }
  if (req.method === 'PATCH') {
    const result = await atualizarRegistroFinanceiro(req);
    return json(res, result.status, result.data);
  }
  if (req.method === 'DELETE') {
    const result = await removerRegistroFinanceiro(req);
    return json(res, result.status, result.data);
  }
  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return json(res, 405, { error: 'Method Not Allowed' });
}
