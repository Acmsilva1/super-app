import { supabase } from '../lib/supabase.js';
import {
  TABLE_NAME,
  payloadInsert,
  processarBi,
  renderizarExtratoTotais,
  parseRowsSupabase,
} from '../financas/index.js';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from(TABLE_NAME).select('*').order('created_at', { ascending: false });
    if (error) return json(res, 500, { error: error.message });
    const query = req.query || {};
    const result = {
      rows: data,
      lancamentos: parseRowsSupabase(data),
      totais: renderizarExtratoTotais(data),
    };
    if (query.bi === '1' || query.bi === 'true') {
      result.bi = processarBi(data, query.mes || 'mes_atual');
    }
    return json(res, 200, result);
  }
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { descricao, valor, tipo, categoria, data_lancamento, metodo_pagamento } = body;
    if (descricao == null || valor == null) return json(res, 400, { error: 'descricao e valor obrigatórios' });
    const payload = payloadInsert(descricao, valor, tipo, categoria, data_lancamento, metodo_pagamento);
    const { data, error } = await supabase.from(TABLE_NAME).insert(payload).select().single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 201, data);
  }
  res.setHeader('Allow', 'GET, POST');
  return json(res, 405, { error: 'Method Not Allowed' });
}
