import { supabase } from '../lib/supabase.js';
import {
  TABLE_NAME,
  payloadInsert,
  payloadUpdate,
  calcularSomasPorStatus,
  parseRowsSupabase,
} from '../modulos/despesas_fixas/index.js';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

function parseMesAno(mesAno) {
  const now = new Date();
  let ano = now.getFullYear();
  let mes = now.getMonth() + 1;
  if (mesAno && /^\d{4}-\d{2}$/.test(mesAno)) {
    const [a, m] = mesAno.split('-').map(Number);
    ano = a;
    mes = m;
  }
  return { ano, mes };
}

function rangeMes(ano, mes) {
  const start = new Date(ano, mes - 1, 1);
  const end = new Date(ano, mes, 0, 23, 59, 59, 999);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
    mes_ano: `${ano}-${String(mes).padStart(2, '0')}`,
  };
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const query = req.query || {};
    const { ano, mes } = parseMesAno(query.mes_ano);
    const { start, end, mes_ano } = rangeMes(ano, mes);
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false });
    if (error) return json(res, 500, { error: error.message });
    const somas = calcularSomasPorStatus(data);
    let receitasFinancas = 0;
    const { data: rowsFinancas } = await supabase.from('tb_financas').select('valor, tipo, data_lancamento, created_at');
    if (rowsFinancas && rowsFinancas.length > 0) {
      const startDate = new Date(ano, mes - 1, 1).toISOString().slice(0, 10);
      const endDate = new Date(ano, mes, 0).toISOString().slice(0, 10);
      for (const r of rowsFinancas) {
        if ((r.tipo || '').toLowerCase() !== 'receita') continue;
        const d = (r.data_lancamento || (r.created_at && r.created_at.slice(0, 10)) || '').toString().slice(0, 10);
        if (d >= startDate && d <= endDate) receitasFinancas += Number(r.valor) || 0;
      }
      receitasFinancas = Math.round(receitasFinancas * 100) / 100;
    }
    return json(res, 200, {
      mes_ano,
      rows: data,
      despesas: parseRowsSupabase(data),
      soma: somas.soma,
      somaPago: somas.somaPago,
      somaPendente: somas.somaPendente,
      receitas_financas: receitasFinancas,
    });
  }
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { exportar, from_mes_ano, to_mes_ano, descricao, valor, status } = body;
    if (exportar === true && from_mes_ano && to_mes_ano) {
      const { ano: aFrom, mes: mFrom } = parseMesAno(from_mes_ano);
      const { ano: aTo, mes: mTo } = parseMesAno(to_mes_ano);
      const { start, end } = rangeMes(aFrom, mFrom);
      const { data: rows } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .gte('created_at', start)
        .lte('created_at', end);
      if (!rows || rows.length === 0) return json(res, 200, { exported: 0, message: 'Nenhum registro no mês de origem' });
      const targetStart = new Date(aTo, mTo - 1, 1);
      let exported = 0;
      for (const r of rows) {
        const payload = { descricao: r.descricao, valor: Number(r.valor), status: r.status || 'pendente', created_at: targetStart.toISOString() };
        const { error } = await supabase.from(TABLE_NAME).insert(payload);
        if (!error) exported++;
      }
      return json(res, 200, { exported, to_mes_ano: `${aTo}-${String(mTo).padStart(2, '0')}` });
    }
    if (!(descricao != null && descricao !== '')) return json(res, 400, { error: 'descricao obrigatória' });
    const payload = payloadInsert(descricao, valor ?? 0, status);
    const { data, error } = await supabase.from(TABLE_NAME).insert(payload).select().single();
    if (error) return json(res, 500, { error: error.message });
    return json(res, 201, data);
  }
  if (req.method === 'PATCH') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { id, descricao, valor, status } = body;
    if (!id) return json(res, 400, { error: 'id obrigatório' });
    const payload = payloadUpdate(descricao, valor, status);
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
