import { supabase } from '../lib/supabase.js';
import { calendarService, payloadInsertEvent, payloadUpdateEvent } from '../modulos/calendario/index.js';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // If the path was /api/calendario/config or /api/calendario/view/3, Vercel standard api/[route] won't work automatically here
    // unless they use api/calendario/[action].js, BUT we know they use a single file since the instruction says "o index é unico".
    // We can infer action from queries or URL path.
    const url = req.url || ''; // e.g., /api/calendario?action=config OR /api/calendario/config
    const query = req.query || {};

    // Handling specific cases requested:
    // "router.get('/config')" -> "?action=config" or "/config"
    // "router.get('/view/:month')" -> "?action=view&month=X" or "/view/X"
    
    // As Vercel passes req.query for standard query params:
    if (query.action === 'config' || url.includes('/config')) {
      return json(res, 200, {
        now: calendarService.getBrazilTime(),
        year: 2026,
        status: "active"
      });
    }

    const monthMatch = url.match(/\/view\/(\d+)/);
    const month = query.month || (monthMatch ? monthMatch[1] : null);
    
    if ((query.action === 'view' || monthMatch) && month) {
      const gMonth = parseInt(month) - 1;
      const grid = calendarService.generateCalendarGrid(gMonth);
      
      const validDays = grid.filter(d => !d.empty);
      const startDate = validDays[0].fullDate;
      const endDate = validDays[validDays.length - 1].fullDate;
      
      const { data: events, error } = await supabase
        .from('tb_calendario')
        .select('*')
        .gte('date', startDate)
        .lte('date', endDate)
        .order('start_time', { ascending: true });
        
      if (error) return json(res, 500, { error: error.message });
      
      return json(res, 200, { month: gMonth + 1, year: 2026, days: grid, events: events || [] });
    }

    return json(res, 400, { error: 'Invalid action or missing parameters' });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { title, date, start_time, end_time, category } = body;
    if (!title || !date) return json(res, 400, { error: 'title e date são obrigatórios' });
    const payload = payloadInsertEvent(title, date, start_time, end_time, category);
    const { data, error } = await supabase.from('tb_calendario').insert(payload).select().single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 201, data);
  }

  if (req.method === 'PATCH') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { id, title, date, start_time, end_time, category } = body;
    if (!id) return json(res, 400, { error: 'id obrigatório' });
    const payload = payloadUpdateEvent(title, date, start_time, end_time, category);
    if (Object.keys(payload).length === 0) return json(res, 400, { error: 'nada para atualizar' });
    const { data, error } = await supabase.from('tb_calendario').update(payload).eq('id', id).select().single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, data);
  }

  if (req.method === 'DELETE') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const id = body.id ?? req.query?.id;
    if (!id) return json(res, 400, { error: 'id obrigatório' });
    const { error } = await supabase.from('tb_calendario').delete().eq('id', id);
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { ok: true });
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return json(res, 405, { error: 'Method Not Allowed' });
}
