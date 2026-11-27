import { supabase } from '../lib/supabase.js';
import { requireUser } from '../lib/auth.js';
import {
  TABLE_NAME,
  CATEGORIAS_LISTA,
  payloadInsert,
  payloadUpdate,
  toggleComprado,
  resetChecksPayload,
  ordenarPorPosicao,
  parseRowsSupabase,
  proximaPosicao,
  calcularReordenacao,
} from '../features/lista_compras/index.js';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

function isOfflineDev() {
  return process.env.OFFLINE_DEV === 'true';
}

function isValidCategoria(value, { allowEmpty = true } = {}) {
  if (value == null || String(value).trim() === '') return allowEmpty;
  return CATEGORIAS_LISTA.includes(String(value).trim());
}

const offlineStore = { nextId: 1, rows: [] };
['Arroz', 'Feijao', 'Leite', 'Pasta de dente', 'Detergente'].forEach((item, index) => {
  offlineStore.rows.push({
    id: offlineStore.nextId++,
    created_at: new Date(Date.now() - (index + 1) * 60000).toISOString(),
    ...payloadInsert(item, 1, null, index === 4, null, index + 1),
  });
});

function handleOffline(req, res) {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const findIndex = (id) => offlineStore.rows.findIndex((r) => String(r.id) === String(id));
  if (req.method === 'GET') {
    const ordenados = ordenarPorPosicao(offlineStore.rows);
    return json(res, 200, { rows: ordenados, itens: parseRowsSupabase(ordenados), categorias: CATEGORIAS_LISTA });
  }
  if (req.method === 'POST') {
    if (!body.item) return json(res, 400, { error: 'item obrigatorio' });
    if (!isValidCategoria(body.categoria)) return json(res, 400, { error: 'categoria invalida' });
    const row = {
      id: offlineStore.nextId++,
      created_at: new Date().toISOString(),
      ...payloadInsert(
        body.item,
        body.quantidade,
        body.unidade_medida,
        body.comprado,
        body.categoria,
        body.posicao ?? proximaPosicao(offlineStore.rows)
      ),
    };
    offlineStore.rows.push(row);
    return json(res, 201, row);
  }
  if (req.method === 'PATCH') {
    if (body.reset_checks) {
      offlineStore.rows.forEach((r) => Object.assign(r, resetChecksPayload()));
      return json(res, 200, { updated: offlineStore.rows.length });
    }
    if (Array.isArray(body.reorder)) {
      const orderedIds = body.reorder.map((entry) => entry?.id ?? entry).filter((id) => id != null);
      const updates = calcularReordenacao(offlineStore.rows, orderedIds);
      for (const update of updates) {
        const index = findIndex(update.id);
        if (index >= 0) offlineStore.rows[index].posicao = update.posicao;
      }
      return json(res, 200, { updated: updates.length, rows: ordenarPorPosicao(offlineStore.rows) });
    }
    const index = findIndex(body.id);
    if (index < 0) return json(res, 404, { error: 'item não encontrado' });
    if (Object.hasOwn(body, 'categoria') && !isValidCategoria(body.categoria)) {
      return json(res, 400, { error: 'categoria invalida' });
    }
    const payload = body.toggle
      ? toggleComprado(offlineStore.rows, body.id)
      : payloadUpdate(body.item, body.quantidade, body.unidade_medida, body.comprado, body.categoria, body.posicao);
    Object.assign(offlineStore.rows[index], payload);
    return json(res, 200, offlineStore.rows[index]);
  }
  if (req.method === 'DELETE') {
    if (body.delete_all === true || req.query?.delete_all === 'true') {
      const deleted = offlineStore.rows.length;
      offlineStore.rows = [];
      return json(res, 200, { deleted });
    }
    const index = findIndex(body.id ?? req.query?.id);
    if (index < 0) return json(res, 400, { error: 'id ou delete_all obrigatorio' });
    offlineStore.rows.splice(index, 1);
    return json(res, 200, { ok: true });
  }
  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return json(res, 405, { error: 'Method Not Allowed' });
}

export default async function handler(req, res) {
  if (req.method === 'GET' && req.query?.health === '1') {
    return json(res, 200, { ok: true, service: 'lista_compras' });
  }

  const auth = await requireUser(req, { appId: 'lista_compras' });
  if (!auth.ok) return json(res, auth.status, auth.data);
  if (['POST', 'PATCH'].includes(req.method)) {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; }
    catch { return json(res, 400, { error: 'JSON invalido.' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'Dados invalidos.' });
    if (Object.hasOwn(body, 'item') && (typeof body.item !== 'string' || !body.item.trim() || body.item.trim().length > 120)) return json(res, 400, { error: 'Informe um nome de ate 120 caracteres.' });
    if (Object.hasOwn(body, 'quantidade')) {
      const value = body.quantidade;
      const quantity = Number(value);
      if (!['number', 'string'].includes(typeof value) || !String(value).trim() || !Number.isInteger(quantity) || quantity < 1 || quantity > 999) return json(res, 400, { error: 'Informe uma quantidade inteira entre 1 e 999.' });
      body.quantidade = quantity;
    }
    if (Object.hasOwn(body, 'categoria') && !isValidCategoria(body.categoria)) {
      return json(res, 400, { error: 'categoria invalida' });
    }
    if (Object.hasOwn(body, 'posicao')) {
      const posicao = Number(body.posicao);
      if (!Number.isInteger(posicao) || posicao < 0) return json(res, 400, { error: 'posicao invalida' });
      body.posicao = posicao;
    }
    req.body = body;
  }
  if (isOfflineDev()) return handleOffline(req, res);

  const ownerScope = (query) => (auth.isAdmin ? query : query.eq('user_id', auth.user.id));
  const missingPosicao = (error) => /posicao/i.test(String(error?.message || '')) && /column|schema cache|does not exist/i.test(String(error?.message || ''));

  if (req.method === 'GET') {
    let { data, error } = await ownerScope(supabase.from(TABLE_NAME).select('*'))
      .order('posicao', { ascending: true })
      .order('id', { ascending: true });
    if (error && missingPosicao(error)) {
      ({ data, error } = await ownerScope(supabase.from(TABLE_NAME).select('*'))
        .order('created_at', { ascending: false })
        .order('id', { ascending: true }));
    }
    if (error) return json(res, 500, { error: error.message });
    const ordenados = ordenarPorPosicao(data);
    return json(res, 200, { rows: ordenados, itens: parseRowsSupabase(ordenados), categorias: CATEGORIAS_LISTA });
  }
  if (req.method === 'POST') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { item, quantidade, unidade_medida, comprado, categoria, posicao } = body;
    if (!item) return json(res, 400, { error: 'item obrigatorio' });
    let nextPos = posicao;
    if (nextPos == null) {
      const { data: existing, error: existingError } = await ownerScope(supabase.from(TABLE_NAME).select('posicao'));
      if (!existingError) nextPos = proximaPosicao(existing || []);
      else if (!missingPosicao(existingError)) return json(res, 500, { error: existingError.message });
    }
    const payload = payloadInsert(item, quantidade, unidade_medida, comprado, categoria, nextPos ?? 0);
    let insertPayload = { ...payload, user_id: auth.user.id };
    let { data, error } = await supabase.from(TABLE_NAME).insert(insertPayload).select().single();
    if (error && missingPosicao(error)) {
      delete insertPayload.posicao;
      ({ data, error } = await supabase.from(TABLE_NAME).insert(insertPayload).select().single());
    }
    if (error) return json(res, 500, { error: error.message });
    return json(res, 201, data);
  }
  if (req.method === 'PATCH') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const { id, toggle, reset_checks, item, quantidade, unidade_medida, comprado, categoria, posicao, reorder } = body;
    if (!id && !reset_checks && !Array.isArray(reorder)) return json(res, 400, { error: 'id, reset_checks ou reorder obrigatorio' });
    if (reset_checks) {
      const categoriaRaw = body.categoria != null ? String(body.categoria).trim() : '';
      if (categoriaRaw && !CATEGORIAS_LISTA.includes(categoriaRaw)) {
        return json(res, 400, { error: 'categoria invalida' });
      }
      const payload = resetChecksPayload();
      const query = ownerScope(supabase.from(TABLE_NAME).update(payload));
      if (categoriaRaw) {
        const { data, error } = await query.eq('categoria', categoriaRaw).select();
        if (error) return json(res, 500, { error: error.message });
        return json(res, 200, { updated: data?.length ?? 0 });
      }
      const { data: rows } = await ownerScope(supabase.from(TABLE_NAME).select('id'));
      const ids = (rows || []).map((r) => r.id).filter(Boolean);
      if (ids.length === 0) return json(res, 200, { updated: 0 });
      const { data, error } = await query.in('id', ids).select();
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { updated: data?.length ?? 0 });
    }
    if (Array.isArray(reorder)) {
      const orderedIds = reorder.map((entry) => entry?.id ?? entry).filter((value) => value != null);
      if (orderedIds.length < 2) return json(res, 400, { error: 'informe ao menos dois itens para reordenar' });
      let { data: rows, error: listError } = await ownerScope(supabase.from(TABLE_NAME).select('id,posicao'));
      if (listError && missingPosicao(listError)) {
        return json(res, 409, { error: 'Aplique a migration de posicao da lista de compras antes de reordenar.' });
      }
      if (listError) return json(res, 500, { error: listError.message });
      const owned = new Set((rows || []).map((row) => String(row.id)));
      if (orderedIds.some((value) => !owned.has(String(value)))) {
        return json(res, 404, { error: 'item não encontrado' });
      }
      const updates = calcularReordenacao(rows || [], orderedIds);
      for (const update of updates) {
        const { error } = await ownerScope(supabase.from(TABLE_NAME).update({ posicao: update.posicao })).eq('id', update.id);
        if (error) return json(res, 500, { error: error.message });
      }
      let { data: refreshed, error: refreshError } = await ownerScope(supabase.from(TABLE_NAME).select('*'))
        .order('posicao', { ascending: true })
        .order('id', { ascending: true });
      if (refreshError) return json(res, 500, { error: refreshError.message });
      return json(res, 200, { updated: updates.length, rows: ordenarPorPosicao(refreshed) });
    }
    if (toggle && id) {
      const { data: rows } = await ownerScope(supabase.from(TABLE_NAME).select('*'));
      const payload = toggleComprado(rows ?? [], id);
      if (!payload) return json(res, 404, { error: 'item não encontrado' });
      const { data, error } = await ownerScope(supabase.from(TABLE_NAME).update(payload)).eq('id', id).select().single();
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, data);
    }
    const payload = payloadUpdate(item, quantidade, unidade_medida, comprado, categoria, posicao);
    if (Object.keys(payload).length === 0) return json(res, 400, { error: 'nada para atualizar' });
    let { data, error } = await ownerScope(supabase.from(TABLE_NAME).update(payload)).eq('id', id).select().single();
    if (error && missingPosicao(error) && Object.hasOwn(payload, 'posicao')) {
      const fallback = { ...payload };
      delete fallback.posicao;
      if (Object.keys(fallback).length === 0) return json(res, 409, { error: 'Aplique a migration de posicao da lista de compras.' });
      ({ data, error } = await ownerScope(supabase.from(TABLE_NAME).update(fallback)).eq('id', id).select().single());
    }
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, data);
  }
  if (req.method === 'DELETE') {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
    const id = body.id ?? req.query?.id;
    const deleteAll = body.delete_all === true || body.delete_all === 'true' || req.query?.delete_all === 'true';
    if (deleteAll) {
      const { data: rows } = await ownerScope(supabase.from(TABLE_NAME).select('id'));
      const ids = (rows || []).map((r) => r.id).filter(Boolean);
      if (ids.length === 0) return json(res, 200, { deleted: 0 });
      const { error } = await ownerScope(supabase.from(TABLE_NAME).delete()).in('id', ids);
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { deleted: ids.length });
    }
    if (!id) return json(res, 400, { error: 'id ou delete_all obrigatorio' });
    const { error } = await ownerScope(supabase.from(TABLE_NAME).delete()).eq('id', id);
    if (error) return json(res, 500, { error: error.message });
    return json(res, 200, { ok: true });
  }
  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return json(res, 405, { error: 'Method Not Allowed' });
}
