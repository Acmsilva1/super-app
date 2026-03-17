import { supabase } from '../lib/supabase.js';
import {
  TABLE_NAME,
  validarTitulo,
  payloadInsert,
  payloadUpdate,
  parseRowsSupabase,
} from '../bloco_de_notas/index.js';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from(TABLE_NAME).select('*').order('created_at', { ascending: false });
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { rows: data, notas: parseRowsSupabase(data) });
  }
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { titulo, conteudo, tags, usuario_id } = body;
    if (!validarTitulo(titulo)) return json(res, 400, { error: 'titulo obrigatório' });
    const payload = payloadInsert(titulo, conteudo, tags, usuario_id);
    const { data, error } = await supabase.from(TABLE_NAME).insert(payload).select().single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 201, data);
  }
  if (req.method === 'PATCH') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { id, titulo, conteudo, tags } = body;
    if (!id) return json(res, 400, { error: 'id obrigatório' });
    const payload = payloadUpdate(titulo, conteudo, tags);
    if (Object.keys(payload).length === 0) return json(res, 400, { error: 'nada para atualizar' });
    const { data, error } = await supabase.from(TABLE_NAME).update(payload).eq('id', id).select().single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, data);
  }
  res.setHeader('Allow', 'GET, POST, PATCH');
  return json(res, 405, { error: 'Method Not Allowed' });
}
