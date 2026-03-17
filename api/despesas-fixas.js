import { supabase } from '../lib/supabase.js';
import {
  TABLE_NAME,
  payloadInsert,
  payloadUpdate,
  calcularSomasPorStatus,
  parseRowsSupabase,
} from '../despesas_fixas/index.js';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from(TABLE_NAME).select('*').order('created_at', { ascending: false });
    if (error) return json(res, 500, { error: error.message });
    const somas = calcularSomasPorStatus(data);
    return json(res, 200, {
      rows: data,
      despesas: parseRowsSupabase(data),
      soma: somas.soma,
      somaPago: somas.somaPago,
      somaPendente: somas.somaPendente,
    });
  }
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { descricao, valor, status } = body;
    if (!(descricao != null && descricao !== '')) return json(res, 400, { error: 'descricao obrigatória' });
    const payload = payloadInsert(descricao, valor ?? 0, status);
    const { data, error } = await supabase.from(TABLE_NAME).insert(payload).select().single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 201, data);
  }
  if (req.method === 'PATCH') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { id, descricao, valor, status } = body;
    if (!id) return json(res, 400, { error: 'id obrigatório' });
    const payload = payloadUpdate(descricao, valor, status);
    if (Object.keys(payload).length === 0) return json(res, 400, { error: 'nada para atualizar' });
    const { data, error } = await supabase.from(TABLE_NAME).update(payload).eq('id', id).select().single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, data);
  }
  if (req.method === 'DELETE') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const id = body.id ?? req.query?.id;
    if (!id) return json(res, 400, { error: 'id obrigatório' });
    const { error } = await supabase.from(TABLE_NAME).delete().eq('id', id);
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { ok: true });
  }
  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return json(res, 405, { error: 'Method Not Allowed' });
}
