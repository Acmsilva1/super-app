import {
  obterFinanceiroMes,
  criarRegistroFinanceiro,
  atualizarRegistroFinanceiro,
  removerRegistroFinanceiro,
  treinarModeloUsuario,
  classificarTransacao,
  carregarPesosModelo,
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

export default async function handler(req, res) {
  try {
    if (req.method === 'GET' && req.query?.health === '1') {
      return json(res, 200, { ok: true, service: 'financeiro' });
    }

    const auth = await requireUser(req, { appId: 'financeiro' });
    if (!auth.ok) return json(res, auth.status, auth.data);
    const context = { userId: auth.user.id, isAdmin: auth.isAdmin };

    // ── Rotas de Modelo Analítico ──────────────────────────────────────────
    // GET /api/financeiro?modelo=1  → retorna status atual do modelo
    if (req.method === 'GET' && req.query?.modelo === '1') {
      const state = await carregarPesosModelo(context);
      return json(res, 200, {
        modelo_treinado: state !== null,
        vocab_size: state?.pesos?.vocab_size || 0,
        total_docs: state?.pesos?.total_docs || 0,
        aprendizado_percentual: state?.aprendizado_percentual || 0,
        treinado_em: state?.created_at || null,
      });
    }

    // POST /api/financeiro?acao=classificar  → classifica uma descrição
    if (req.method === 'POST' && req.query?.acao === 'classificar') {
      const body = getBody(req);
      const descricao = String(body.descricao || '').trim();
      if (!descricao) return json(res, 400, { error: 'descricao obrigatoria' });
      const result = await classificarTransacao(descricao, context);
      if (result.error) return json(res, 400, { error: result.error });
      return json(res, 200, result);
    }

    // POST /api/financeiro?acao=treinar  → dispara re-treinamento com histórico completo
    if (req.method === 'POST' && req.query?.acao === 'treinar') {
      const result = await treinarModeloUsuario(context);
      if (result.error) return json(res, 400, { error: result.error });
      return json(res, 200, result);
    }

    // ── Rotas padrão CRUD ──────────────────────────────────────────────────
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
