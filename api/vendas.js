import { supabase } from '../lib/supabase.js';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

export default async function handler(req, res) {
  const { type } = req.query; // 'receitas' ou 'historico'

  if (!type || (type !== 'receitas' && type !== 'historico')) {
    return json(res, 400, { error: 'Tipo (type) inválido ou ausente. Use receitas ou historico.' });
  }

  const tableName = type === 'receitas' ? 'vendas_receitas' : 'vendas_historico';

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, data);
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    
    // Validação básica baseada no tipo
    if (type === 'receitas') {
      const { nome, ingredientes, custo_total, margem_lucro, preco_final } = body;
      if (!nome) return json(res, 400, { error: 'nome é obrigatório' });
      
      const { data, error } = await supabase.from(tableName).insert({
        nome, ingredientes, custo_total, margem_lucro, preco_final
      }).select().single();
      
      if (error) return json(res, 500, { error: error.message });
      return json(res, 201, data);
    } else {
      const { cliente, sabor, valor } = body;
      if (!cliente || !sabor) return json(res, 400, { error: 'cliente e sabor são obrigatórios' });
      
      const { data, error } = await supabase.from(tableName).insert({
        cliente, sabor, valor
      }).select().single();
      
      if (error) return json(res, 500, { error: error.message });
      return json(res, 201, data);
    }
  }

  if (req.method === 'DELETE') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const id = body.id || req.query.id;

    if (!id) return json(res, 400, { error: 'id é obrigatório para exclusão' });

    const { error } = await supabase.from(tableName).delete().eq('id', id);
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { ok: true });
  }

  if (req.method === 'PATCH') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { id, ...updates } = body;
    if (!id) return json(res, 400, { error: 'id é obrigatório para atualização' });

    const { data, error } = await supabase.from(tableName).update(updates).eq('id', id).select().single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, data);
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return json(res, 405, { error: 'Method Not Allowed' });
}
