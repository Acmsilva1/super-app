import { supabase } from '../lib/supabase.js';

const TABLE_NAME = 'neon_notes';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .order('created_at', { ascending: true });

      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, data);
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const { title, content, x_pos, y_pos, color } = body;

      const { data, error } = await supabase
        .from(TABLE_NAME)
        .insert({
          title: title || '',
          content: content || '',
          x_pos: x_pos ?? 50,
          y_pos: y_pos ?? 50,
          color: color || '#00ffbb'
        })
        .select()
        .single();

      if (error) return json(res, 500, { error: error.message });
      return json(res, 201, data);
    }

    if (req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const { id, title, content, x_pos, y_pos, color, is_pinned } = body;

      if (!id) return json(res, 400, { error: 'ID é obrigatório' });

      const updateData = {};
      if (title !== undefined) updateData.title = title;
      if (content !== undefined) updateData.content = content;
      if (x_pos !== undefined) updateData.x_pos = x_pos;
      if (y_pos !== undefined) updateData.y_pos = y_pos;
      if (color !== undefined) updateData.color = color;
      if (is_pinned !== undefined) updateData.is_pinned = is_pinned;

      const { data, error } = await supabase
        .from(TABLE_NAME)
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, data);
    }

    if (req.method === 'DELETE') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const id = body.id ?? req.query?.id;

      if (!id) return json(res, 400, { error: 'ID é obrigatório' });

      const { error } = await supabase
        .from(TABLE_NAME)
        .delete()
        .eq('id', id);

      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return json(res, 405, { error: 'Method Not Allowed' });
  } catch (err) {
    console.error('API Notes Error:', err);
    return json(res, 500, { error: 'Internal Server Error' });
  }
}
