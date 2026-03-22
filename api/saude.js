import { supabase } from '../lib/supabase.js';
import {
  TABLE_NAME,
  payloadInsert,
  payloadUpdate,
  renderizarResumo,
  parseRowsSupabase,
} from '../modulos/saude/index.js';
import { markTelegramPending } from '../lib/telegramAlertState.js';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from(TABLE_NAME).select('*').order('created_at', { ascending: false });
    if (error) return json(res, 500, { error: error.message });
    const query = req.query || {};
    const result = { rows: data, registros: parseRowsSupabase(data) };
    if (query.membro) {
      result.resumo = renderizarResumo(data, query.membro);
    }
    return json(res, 200, result);
  }
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { membro_familia, tipo_registro, detalhes, data_evento, hora_evento, anexo_url } = body;
    if (!membro_familia || !tipo_registro) return json(res, 400, { error: 'membro_familia e tipo_registro obrigatórios' });
    const payload = markTelegramPending(payloadInsert(membro_familia, tipo_registro, detalhes, data_evento, hora_evento, anexo_url));
    const { data, error } = await supabase.from(TABLE_NAME).insert(payload).select().single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 201, data);
  }
  if (req.method === 'PATCH') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { id, membro_familia, tipo_registro, detalhes, data_evento, hora_evento, anexo_url } = body;
    if (!id) return json(res, 400, { error: 'id obrigatório' });
    const payload = markTelegramPending(payloadUpdate(membro_familia, tipo_registro, detalhes, data_evento, hora_evento, anexo_url));
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
