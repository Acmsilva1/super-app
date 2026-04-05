import { supabase } from '../lib/supabase.js';

const TABLE = 'tb_fluxograma_projetos';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

function normalizeDados(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  return {};
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const id = req.query?.id;
    if (id) {
      const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
      if (error) return json(res, 500, { error: error.message });
      if (!data) return json(res, 404, { error: 'Projeto nao encontrado' });
      return json(res, 200, { project: data });
    }
    const { data, error } = await supabase
      .from(TABLE)
      .select('id, nome, created_at, updated_at')
      .order('updated_at', { ascending: false });
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { projects: data || [] });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const nome = typeof body.nome === 'string' && body.nome.trim() ? body.nome.trim() : 'Novo Fluxograma';
    const dados = normalizeDados(body.dados);
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from(TABLE)
      .insert({ nome, dados, updated_at: now })
      .select()
      .single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 201, data);
  }

  if (req.method === 'PATCH') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { id } = body;
    if (!id) return json(res, 400, { error: 'id obrigatorio' });
    const payload = { updated_at: new Date().toISOString() };
    if (typeof body.nome === 'string' && body.nome.trim()) payload.nome = body.nome.trim();
    if (body.dados !== undefined) payload.dados = normalizeDados(body.dados);
    if (Object.keys(payload).length <= 1) return json(res, 400, { error: 'nome ou dados obrigatorio' });
    const { data, error } = await supabase.from(TABLE).update(payload).eq('id', id).select().single();
    if (error) return json(res, 500, { error: error.message });
    if (!data) return json(res, 404, { error: 'Projeto nao encontrado' });
    return json(res, 200, data);
  }

  if (req.method === 'DELETE') {
    const id = req.query?.id;
    if (!id) return json(res, 400, { error: 'id obrigatorio (query)' });
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { ok: true });
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return json(res, 405, { error: 'Method Not Allowed' });
}
