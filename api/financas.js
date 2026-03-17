import { supabase } from '../lib/supabase.js';
import {
  TABLE_NAME,
  payloadInsert,
  payloadUpdate,
  processarBi,
  renderizarExtratoTotais,
  parseRowsSupabase,
} from '../financas/index.js';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

function parseMesAno(mesAno) {
  const now = new Date();
  let ano = now.getFullYear();
  let mes = now.getMonth() + 1;
  if (mesAno && /^\d{4}-\d{2}$/.test(mesAno)) {
    const [a, m] = mesAno.split('-').map(Number);
    ano = a;
    mes = m;
  }
  return { ano, mes };
}

function filtrarPorMes(rows, ano, mes) {
  return (rows || []).filter((r) => {
    const d = r.data_lancamento || (r.created_at && r.created_at.slice(0, 10));
    if (!d) return false;
    const [y, m] = d.split('-').map(Number);
    return y === ano && m === mes;
  });
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data: allData, error } = await supabase.from(TABLE_NAME).select('*').order('created_at', { ascending: false });
    if (error) return json(res, 500, { error: error.message });
    const query = req.query || {};
    const { ano, mes } = parseMesAno(query.mes_ano);
    const data = filtrarPorMes(allData, ano, mes);
    const mesBr = `${String(mes).padStart(2, '0')}/${ano}`;
    const result = {
      mes_ano: `${ano}-${String(mes).padStart(2, '0')}`,
      rows: data,
      lancamentos: parseRowsSupabase(data),
      totais: renderizarExtratoTotais(data),
    };
    if (query.bi === '1' || query.bi === 'true') {
      result.bi = processarBi(data, mesBr);
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
  if (req.method === 'PATCH') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { id, descricao, valor, tipo, categoria, data_lancamento, metodo_pagamento } = body;
    if (!id) return json(res, 400, { error: 'id obrigatório' });
    const payload = payloadUpdate(descricao, valor, tipo, categoria, data_lancamento, metodo_pagamento);
    if (Object.keys(payload).length === 0) return json(res, 400, { error: 'nada para atualizar' });
    const { data, error } = await supabase.from(TABLE_NAME).update(payload).eq('id', id).select().single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, data);
  }
  if (req.method === 'DELETE') {
    const id = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {})?.id ?? req.query?.id;
    if (!id) return json(res, 400, { error: 'id obrigatório' });
    const { error } = await supabase.from(TABLE_NAME).delete().eq('id', id);
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { ok: true });
  }
  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return json(res, 405, { error: 'Method Not Allowed' });
}
