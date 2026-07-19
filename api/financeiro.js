import {
  obterFinanceiroMes,
  criarRegistroFinanceiro,
  atualizarRegistroFinanceiro,
  removerRegistroFinanceiro,
} from './_financeiroShared.js';
import { requireUser } from '../lib/auth.js';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET' && req.query?.health === '1') {
      return json(res, 200, { ok: true, service: 'financeiro' });
    }

    const auth = await requireUser(req, { appId: 'financeiro' });
    if (!auth.ok) return json(res, auth.status, auth.data);
    const context = { userId: auth.user.id, isAdmin: auth.isAdmin };

    if (req.method === 'GET') {
      const result = await obterFinanceiroMes(req.query || {}, context);
      return json(res, result.status, result.data || { error: result.error || 'Erro ao carregar financeiro' });
    }
    if (req.method === 'POST') {
      const result = await criarRegistroFinanceiro(req, context);
      return json(res, result.status, result.data);
    }
    if (req.method === 'PATCH') {
      const result = await atualizarRegistroFinanceiro(req, context);
      return json(res, result.status, result.data);
    }
    if (req.method === 'DELETE') {
      const result = await removerRegistroFinanceiro(req, context);
      return json(res, result.status, result.data);
    }
    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return json(res, 405, { error: 'Method Not Allowed' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno no módulo financeiro';
    return json(res, 500, { error: message });
  }
}
