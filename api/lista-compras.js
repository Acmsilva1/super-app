import { supabase } from '../lib/supabase.js';
import {
  TABLE_NAME,
  payloadInsert,
  payloadUpdate,
  toggleComprado,
  resetChecksPayload,
  ordenarPorPrioridade,
  parseRowsSupabase,
} from '../lista_compras/index.js';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from(TABLE_NAME).select('*').order('prioridade', { ascending: false });
    if (error) return json(res, 500, { error: error.message });
    const ordenados = ordenarPorPrioridade(data, true);
    return json(res, 200, { rows: ordenados, itens: parseRowsSupabase(ordenados) });
  }
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { item, quantidade, unidade_medida, comprado, prioridade } = body;
    if (!item) return json(res, 400, { error: 'item obrigatório' });
    const payload = payloadInsert(item, quantidade, unidade_medida, comprado, prioridade);
    const { data, error } = await supabase.from(TABLE_NAME).insert(payload).select().single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 201, data);
  }
  if (req.method === 'PATCH') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { id, toggle, reset_checks, item, quantidade, unidade_medida, comprado, prioridade } = body;
    if (!id && !reset_checks) return json(res, 400, { error: 'id ou reset_checks obrigatório' });
    if (reset_checks) {
      const payload = resetChecksPayload();
      const { data, error } = await supabase.from(TABLE_NAME).update(payload).select();
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { updated: data?.length ?? 0 });
    }
    if (toggle && id) {
      const { data: rows } = await supabase.from(TABLE_NAME).select('*');
      const payload = toggleComprado(rows ?? [], id);
      if (!payload) return json(res, 404, { error: 'item não encontrado' });
      const { data, error } = await supabase.from(TABLE_NAME).update(payload).eq('id', id).select().single();
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, data);
    }
    const payload = payloadUpdate(item, quantidade, unidade_medida, comprado, prioridade);
    if (Object.keys(payload).length === 0) return json(res, 400, { error: 'nada para atualizar' });
    const { data, error } = await supabase.from(TABLE_NAME).update(payload).eq('id', id).select().single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, data);
  }
  res.setHeader('Allow', 'GET, POST, PATCH');
  return json(res, 405, { error: 'Method Not Allowed' });
}
