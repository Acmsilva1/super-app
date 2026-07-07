import { supabase } from '../lib/supabase.js';
import {
  TABLE_NAME,
  CATEGORIAS_LISTA,
  payloadInsert,
  payloadUpdate,
  toggleComprado,
  resetChecksPayload,
  ordenarPorCategoria,
  parseRowsSupabase,
} from '../features/lista_compras/index.js';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    if (req.query?.health === '1') {
      return json(res, 200, { ok: true, service: 'lista_compras' });
    }
    const { data, error } = await supabase.from(TABLE_NAME).select('*').order('categoria').order('created_at', { ascending: false });
    if (error) return json(res, 500, { error: error.message });
    const ordenados = ordenarPorCategoria(data);
    return json(res, 200, { rows: ordenados, itens: parseRowsSupabase(ordenados) });
  }
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { item, quantidade, unidade_medida, comprado, categoria } = body;
    if (!item) return json(res, 400, { error: 'item obrigatorio' });
    const payload = payloadInsert(item, quantidade, unidade_medida, comprado, categoria);
    const { data, error } = await supabase.from(TABLE_NAME).insert(payload).select().single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 201, data);
  }
  if (req.method === 'PATCH') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { id, toggle, reset_checks, item, quantidade, unidade_medida, comprado, categoria } = body;
    if (!id && !reset_checks) return json(res, 400, { error: 'id ou reset_checks obrigatorio' });
    if (reset_checks) {
      const categoriaRaw = body.categoria != null ? String(body.categoria).trim() : '';
      if (categoriaRaw && !CATEGORIAS_LISTA.includes(categoriaRaw)) {
        return json(res, 400, { error: 'categoria invalida' });
      }
      const payload = resetChecksPayload();
      const query = supabase.from(TABLE_NAME).update(payload);
      if (categoriaRaw) {
        const { data, error } = await query.eq('categoria', categoriaRaw).select();
        if (error) return json(res, 500, { error: error.message });
        return json(res, 200, { updated: data?.length ?? 0 });
      }
      const { data: rows } = await supabase.from(TABLE_NAME).select('id');
      const ids = (rows || []).map((r) => r.id).filter(Boolean);
      if (ids.length === 0) return json(res, 200, { updated: 0 });
      const { data, error } = await query.in('id', ids).select();
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
    const payload = payloadUpdate(item, quantidade, unidade_medida, comprado, categoria);
    if (Object.keys(payload).length === 0) return json(res, 400, { error: 'nada para atualizar' });
    const { data, error } = await supabase.from(TABLE_NAME).update(payload).eq('id', id).select().single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, data);
  }
  if (req.method === 'DELETE') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const id = body.id ?? req.query?.id;
    const deleteAll = body.delete_all === true || body.delete_all === 'true' || req.query?.delete_all === 'true';
    if (deleteAll) {
      const { data: rows } = await supabase.from(TABLE_NAME).select('id');
      const ids = (rows || []).map((r) => r.id).filter(Boolean);
      if (ids.length === 0) return json(res, 200, { deleted: 0 });
      const { error } = await supabase.from(TABLE_NAME).delete().in('id', ids);
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { deleted: ids.length });
    }
    if (!id) return json(res, 400, { error: 'id ou delete_all obrigatorio' });
    const { error } = await supabase.from(TABLE_NAME).delete().eq('id', id);
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { ok: true });
  }
  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return json(res, 405, { error: 'Method Not Allowed' });
}
