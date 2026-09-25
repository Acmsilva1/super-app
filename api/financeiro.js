import {
  obterFinanceiroMes,
  garantirDespesasFixasMes,
  criarRegistroFinanceiro,
  atualizarRegistroFinanceiro,
  removerRegistroFinanceiro,
} from './_financeiroShared.js';
import { requireUser } from '../lib/auth.js';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

function getBody(req) {
  if (typeof req.body !== 'string') return req.body || {};
  const raw = String(req.body || '').trim();
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function isOfflineDev() {
  return process.env.OFFLINE_DEV === 'true';
}

async function handleOfflineMutation(req) {
  const body = getBody(req);
  await new Promise((resolve) => setTimeout(resolve, 700));
  if (req.method === 'DELETE') return { status: 200, data: { ok: true } };
  if (req.method === 'POST' && body.acao === 'materializar_despesas_fixas') {
    return { status: 200, data: { ok: true, mes_ano: body.mes_ano } };
  }
  const id = body.id || `mock-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const isSavingsWithdrawal = body.tipo_registro === 'resgate_poupanca';
  return {
    status: req.method === 'POST' ? 201 : 200,
    data: {
      ...body,
      ...(isSavingsWithdrawal ? { descricao: 'Resgate', valor: -Math.abs(Number(body.valor || 0)) } : {}),
      id,
      created_at: body.created_at || new Date().toISOString(),
      tipo_registro: body.tipo_registro || 'gasto_variado',
    },
  };
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET' && req.query?.health === '1') {
      return json(res, 200, { ok: true, service: 'financeiro' });
    }

    const auth = await requireUser(req, { appId: 'financeiro' });
    if (!auth.ok) return json(res, auth.status, auth.data);
    const context = { userId: auth.user.id, isAdmin: auth.isAdmin };

    if (isOfflineDev() && ['POST', 'PATCH', 'DELETE'].includes(req.method)) {
      const result = await handleOfflineMutation(req);
      return json(res, result.status, result.data);
    }

    // ── Rotas padrão CRUD ──────────────────────────────────────────────────
    if (req.method === 'GET') {
      const result = await obterFinanceiroMes(req.query || {}, context);
      return json(res, result.status, result.data || { error: result.error || 'Erro ao carregar financeiro' });
    }
    if (req.method === 'POST') {
      const body = getBody(req);
      if (body.acao === 'materializar_despesas_fixas') {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(body.mes_ano || ''))) {
          return json(res, 400, { error: 'mes_ano invalido' });
        }
        await garantirDespesasFixasMes(body.mes_ano, context);
        return json(res, 200, { ok: true, mes_ano: body.mes_ano });
      }
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
