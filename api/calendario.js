import { supabase } from '../lib/supabase.js';
import { calendarService, payloadInsertEvent, payloadUpdateEvent } from '../modulos/calendario/index.js';
import { markTelegramPending } from '../lib/telegramAlertState.js';

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

    if (query.action === 'sync_status') {
      try {
        const { data, error } = await supabase
          .from('tb_calendario')
          .select('id, check_status, check_updated_at')
          .limit(5);

        if (error) throw error;

        const rows = Array.isArray(data) ? data : [];
        const checkedCount = rows.filter((row) => row?.check_status === 'confirmado' || row?.check_status === 'nao_confirmado').length;
        return json(res, 200, {
          db_columns_ready: true,
          sample_size: rows.length,
          sample_checked: checkedCount,
          status: 'synced'
        });
      } catch (error) {
        const message = String(error?.message || error);
        const missingColumns =
          message.includes("Could not find the 'check_status' column") ||
          message.includes("check_status") ||
          message.includes("check_updated_at");

        return json(res, 200, {
          db_columns_ready: false,
          sample_size: 0,
          sample_checked: 0,
          status: missingColumns ? 'schema_missing' : 'error',
          error: message
        });
      }
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
    const payload = markTelegramPending(payloadInsertEvent(title, date, start_time, end_time, category));
    const { data, error } = await supabase.from('tb_calendario').insert(payload).select().single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 201, data);
  }

  if (req.method === 'PATCH') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { id, title, date, start_time, end_time, category, check_status, check_updated_at } = body;
    if (!id) return json(res, 400, { error: 'id obrigatorio' });
    const eventPayload = payloadUpdateEvent(title, date, start_time, end_time, category);
    let payload = Object.keys(eventPayload).length > 0 ? markTelegramPending(eventPayload) : {};
    if (check_status !== undefined) {
      if (check_status !== 'confirmado' && check_status !== 'nao_confirmado' && check_status !== null) {
        return json(res, 400, { error: 'check_status invalido' });
      }
      payload.check_status = check_status;
    }
    if (check_updated_at !== undefined) payload.check_updated_at = check_updated_at;
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
