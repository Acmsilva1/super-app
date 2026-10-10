import crypto from 'node:crypto';
import { requireUser } from '../lib/auth.js';
import { supabase } from '../lib/supabase.js';
import { aggregateHistory, brazilMonth, monthOffset, simulate } from '../features/financeiro/service/simulador.js';

const TABLE = 'tb_financeiro_simulacoes';
const snapshots = new Map();
const columns = 'id,meta_id,nome,parametros,resultado,created_at';
const missingTable = error => ['42P01', 'PGRST205'].includes(error?.code);
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
async function loadRows(table, fields, userId) {
  const rows = [];
  for (let page = 0; page < 100; page++) {
    const { data, error } = await supabase.from(table).select(fields).eq('user_id', userId).order('id').range(page * 1000, page * 1000 + 999);
    if (error) throw new Error('Não foi possível consultar o histórico financeiro.');
    rows.push(...(data || []));
    if ((data || []).length < 1000) return rows;
  }
  throw new Error('Histórico excedeu o limite do protótipo. Nenhuma análise parcial foi realizada.');
}
export function demoHistory(month) {
  const expenses = [9000, 10000, 11000, 9500, 10500, 10000, 7000, 14500, 8000, 16000, 6000, 8500];
  return expenses.map((gastos, i) => ({ mes: monthOffset(month, i - 12), receitas: 15000, gastos }));
}
export default async function handler(req, res) {
  const send = (status, body) => { res.setHeader('Cache-Control', 'no-store'); return res.status(status).json(body); };
  try {
    const auth = await requireUser(req, { appId: 'financeiro' });
    if (!auth.ok) return send(auth.status, auth.data);
    const userId = auth.user.id, demo = process.env.OFFLINE_DEV === 'true';
    if (req.method === 'GET') {
      if (demo) return send(200, { demo, persistencia: false, registros: snapshots.get(userId) || [] });
      const { data, error } = await supabase.from(TABLE).select(columns).eq('user_id', userId).order('created_at', { ascending: false }).limit(100);
      if (missingTable(error)) return send(200, { demo: false, persistencia: false, registros: [], aviso: 'Persistência indisponível: aplique a migration do Simulador para salvar metas.' });
      if (error) return send(500, { error: 'Não foi possível carregar as simulações.' });
      return send(200, { demo: false, persistencia: true, registros: data || [] });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(405, { error: 'Método não permitido.' }); }
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; } catch { return send(400, { error: 'JSON inválido.' }); }
    if (!['simular', 'salvar', 'repetir'].includes(body.acao)) return send(400, { error: 'Ação inválida.' });
    let proposal = body.parametros, metaId = crypto.randomUUID();
    if (body.acao === 'repetir') {
      if (!uuid(body.id)) return send(400, { error: 'Simulação inválida.' });
      let previous;
      if (demo) previous = (snapshots.get(userId) || []).find(r => r.id === body.id);
      else {
        const { data, error } = await supabase.from(TABLE).select('id,meta_id,parametros').eq('user_id', userId).eq('id', body.id).maybeSingle();
        if (error) return send(500, { error: 'Não foi possível consultar a simulação.' });
        previous = data;
      }
      if (!previous) return send(404, { error: 'Simulação não encontrada.' });
      proposal = previous.parametros; metaId = previous.meta_id;
    }
    const month = brazilMonth();
    let history;
    if (demo) history = demoHistory(month);
    else {
      const [financas, fixas] = await Promise.all([
        loadRows('tb_financas', 'id,valor,tipo,data_lancamento,created_at', userId),
        loadRows('tb_despesas_fixas', 'id,valor,created_at', userId),
      ]);
      history = aggregateHistory(financas, fixas, month);
    }
    let resultado;
    try { resultado = simulate(proposal, history, month); } catch (error) { return send(400, { error: error.message }); }
    if (body.acao === 'simular') return send(200, { demo, resultado });
    const record = { id: crypto.randomUUID(), meta_id: metaId, nome: resultado.proposal.nome, parametros: resultado.proposal, resultado, created_at: new Date().toISOString() };
    if (demo) {
      const records = snapshots.get(userId) || [];
      snapshots.set(userId, [record, ...records].slice(0, 100));
      return send(201, { demo, registro: record, resultado });
    }
    const { error } = await supabase.from(TABLE).insert({ ...record, user_id: userId });
    if (error) return send(missingTable(error) ? 503 : 500, { error: missingTable(error) ? 'A migration do Simulador ainda não foi aplicada. O resultado não foi salvo.' : 'Não foi possível salvar a simulação.' });
    return send(201, { demo, registro: record, resultado });
  } catch { return send(500, { error: 'Não foi possível executar a análise. Tente novamente.' }); }
}
