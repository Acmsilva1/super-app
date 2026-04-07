import { supabase } from '../lib/supabase.js';

const TABLE_MISSOES = 'tb_missoes_treino';
const TABLE_ITENS = 'tb_missoes_treino_itens';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

function parseBody(req) {
  if (!req?.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch (_err) {
      return {};
    }
  }
  return req.body;
}

function getTodayBrazilIsoDate() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date());
}

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function normalizeNome(value) {
  return String(value ?? '').trim().slice(0, 120);
}

function normalizeReps(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseRows(rows) {
  return (rows || []).map((row) => ({
    id: row.id,
    missao_id: row.missao_id,
    name: row.nome || '',
    reps: Number(row.reps || 0),
    completed: Boolean(row.concluida),
    ordem: Number(row.ordem || 0),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  }));
}

async function ensureMissionForDate(dateRef) {
  const { data: existing, error: findErr } = await supabase
    .from(TABLE_MISSOES)
    .select('id, data_referencia')
    .eq('data_referencia', dateRef)
    .limit(1);
  if (findErr) throw new Error(findErr.message);
  if (existing && existing[0]?.id) return existing[0].id;

  const { data: inserted, error: insertErr } = await supabase
    .from(TABLE_MISSOES)
    .insert({ data_referencia: dateRef, titulo: 'Missao diaria', origem: 'app' })
    .select('id')
    .single();
  if (insertErr) {
    const duplicate = String(insertErr.message || '').toLowerCase().includes('duplicate');
    if (!duplicate) throw new Error(insertErr.message);
    const { data: retried, error: retryErr } = await supabase
      .from(TABLE_MISSOES)
      .select('id')
      .eq('data_referencia', dateRef)
      .limit(1);
    if (retryErr || !retried?.[0]?.id) throw new Error(retryErr?.message || insertErr.message);
    return retried[0].id;
  }
  return inserted.id;
}

async function getNextOrdem(missaoId) {
  const { data, error } = await supabase
    .from(TABLE_ITENS)
    .select('ordem')
    .eq('missao_id', missaoId)
    .order('ordem', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const atual = Number(data?.[0]?.ordem || 0);
  return atual + 1;
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const queryDate = req.query?.date;
      const dateRef = isIsoDate(queryDate) ? String(queryDate) : getTodayBrazilIsoDate();
      const { data: missions, error: mErr } = await supabase
        .from(TABLE_MISSOES)
        .select('id')
        .eq('data_referencia', dateRef);
      if (mErr) return json(res, 500, { error: mErr.message });

      const missionIds = (missions || []).map((m) => m.id).filter(Boolean);
      if (!missionIds.length) return json(res, 200, { date: dateRef, rows: [], missions: [] });

      const { data: rows, error: rErr } = await supabase
        .from(TABLE_ITENS)
        .select('*')
        .in('missao_id', missionIds)
        .order('ordem', { ascending: true })
        .order('created_at', { ascending: true });
      if (rErr) return json(res, 500, { error: rErr.message });
      const parsed = parseRows(rows);
      return json(res, 200, { date: dateRef, rows, missions: parsed });
    }

    if (req.method === 'POST') {
      const body = parseBody(req);
      const dateRef = isIsoDate(body.date) ? String(body.date) : getTodayBrazilIsoDate();
      const name = normalizeNome(body.name);
      const reps = normalizeReps(body.reps);
      if (!name || !reps) return json(res, 400, { error: 'name e reps validos sao obrigatorios' });

      const missaoId = await ensureMissionForDate(dateRef);
      const ordem = await getNextOrdem(missaoId);
      const payload = {
        missao_id: missaoId,
        nome: name,
        reps,
        concluida: false,
        ordem,
      };

      const { data, error } = await supabase.from(TABLE_ITENS).insert(payload).select().single();
      if (error) return json(res, 500, { error: error.message });
      return json(res, 201, { item: parseRows([data])[0] });
    }

    if (req.method === 'PATCH') {
      const body = parseBody(req);
      const id = String(body.id || '').trim();
      if (!id) return json(res, 400, { error: 'id obrigatorio' });

      const payload = {};
      if (body.name != null) payload.nome = normalizeNome(body.name);
      if (body.reps != null) {
        const reps = normalizeReps(body.reps);
        if (!reps) return json(res, 400, { error: 'reps invalido' });
        payload.reps = reps;
      }
      if (body.completed != null) payload.concluida = Boolean(body.completed);
      if (Object.keys(payload).length === 0) return json(res, 400, { error: 'nada para atualizar' });

      const { data, error } = await supabase
        .from(TABLE_ITENS)
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { item: parseRows([data])[0] });
    }

    if (req.method === 'DELETE') {
      const body = parseBody(req);
      const id = String(body.id ?? req.query?.id ?? '').trim();
      if (!id) return json(res, 400, { error: 'id obrigatorio' });
      const { error } = await supabase.from(TABLE_ITENS).delete().eq('id', id);
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return json(res, 405, { error: 'Method Not Allowed' });
  } catch (err) {
    return json(res, 500, { error: err?.message || 'Falha no modulo de missoes de treino' });
  }
}
