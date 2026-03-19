import { calendarService } from '../modulos/calendario/index.js';

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
      return json(res, 200, { month: gMonth + 1, year: 2026, days: grid });
    }

    return json(res, 400, { error: 'Invalid action or missing parameters' });
  }

  res.setHeader('Allow', 'GET');
  return json(res, 405, { error: 'Method Not Allowed' });
}
