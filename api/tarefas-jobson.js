import { supabase } from '../lib/supabase.js';
import {
  TABLE_NAME,
  payloadInsert,
  payloadUpdate,
  parseRowsSupabase,
  ordenarPorDataHora,
} from '../modulos/tarefas_jobson/index.js';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

function parseMesAno(mesAno) {
  if (!mesAno || !/^\d{4}-\d{2}$/.test(String(mesAno))) return null;
  const [ano, mes] = String(mesAno).split('-').map(Number);
  if (!ano || !mes || mes < 1 || mes > 12) return null;
  return { ano, mes };
}

function rangeMes(ano, mes) {
  const lastDay = new Date(ano, mes, 0).getDate();
  const mm = String(mes).padStart(2, '0');
  return {
    start: `${ano}-${mm}-01`,
    end: `${ano}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const query = req.query || {};
    const month = parseMesAno(query.mes_ano);
    let q = supabase
      .from(TABLE_NAME)
      .select('*')
      .order('data', { ascending: false })
      .order('slot_hora', { ascending: false })
      .order('created_at', { ascending: false });
    if (month) {
      const { start, end } = rangeMes(month.ano, month.mes);
      q = q.gte('data', start).lte('data', end);
    }
    const { data, error } = await q;
    if (error) return json(res, 500, { error: error.message });
    const rows = ordenarPorDataHora(data || []);
    return json(res, 200, { rows, tarefas: parseRowsSupabase(rows) });
  }

  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { descricao, data, slot_hora, status, notificado } = body;
    if (!descricao || !data || !slot_hora) {
      return json(res, 400, { error: 'descricao, data e slot_hora sao obrigatorios' });
    }
    const payload = payloadInsert(descricao, data, slot_hora, status, notificado);
    const { data: inserted, error } = await supabase.from(TABLE_NAME).insert(payload).select().single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 201, inserted);
  }

  if (req.method === 'PATCH') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    if (body.action === 'upsert_day_slots') {
      const dia = String(body.data || '').trim();
      const slots = Array.isArray(body.slots) ? body.slots : [];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return json(res, 400, { error: 'data invalida' });
      const { data: existentes, error: fetchError } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .eq('data', dia);
      if (fetchError) return json(res, 500, { error: fetchError.message });
      const byHora = new Map((existentes || []).map((r) => [String(r.slot_hora || '').slice(0, 5), r]));
      let inserted = 0;
      let updated = 0;
      let deleted = 0;
      for (const slot of slots) {
        const hora = String(slot?.slot_hora || '').slice(0, 5);
        if (!hora) continue;
        const descricao = String(slot?.descricao || '').trim();
        const status = slot?.status === 'concluida' ? 'concluida' : 'pendente';
        const notificado = Boolean(slot?.notificado);
        const atual = byHora.get(hora);
        if (!descricao) {
          if (atual?.id) {
            const { error: delError } = await supabase.from(TABLE_NAME).delete().eq('id', atual.id);
            if (delError) return json(res, 500, { error: delError.message });
            deleted += 1;
          }
          continue;
        }
        if (atual?.id) {
          const payload = payloadUpdate(descricao, dia, hora, status, notificado);
          const { error: upError } = await supabase.from(TABLE_NAME).update(payload).eq('id', atual.id);
          if (upError) return json(res, 500, { error: upError.message });
          updated += 1;
        } else {
          const payload = payloadInsert(descricao, dia, hora, status, notificado);
          const { error: inError } = await supabase.from(TABLE_NAME).insert(payload);
          if (inError) return json(res, 500, { error: inError.message });
          inserted += 1;
        }
      }
      return json(res, 200, { ok: true, inserted, updated, deleted });
    }

    const { id, descricao, data, slot_hora, status, notificado } = body;
    if (!id) return json(res, 400, { error: 'id obrigatorio' });
    const payload = payloadUpdate(descricao, data, slot_hora, status, notificado);
    if (Object.keys(payload).length === 0) return json(res, 400, { error: 'nada para atualizar' });
    const { data: updated, error } = await supabase.from(TABLE_NAME).update(payload).eq('id', id).select().single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, updated);
  }

  if (req.method === 'DELETE') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const id = body.id ?? req.query?.id;
    if (!id) return json(res, 400, { error: 'id obrigatorio' });
    const { error } = await supabase.from(TABLE_NAME).delete().eq('id', id);
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { ok: true });
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return json(res, 405, { error: 'Method Not Allowed' });
}
