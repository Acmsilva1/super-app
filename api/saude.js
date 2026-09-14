import { requireUser } from '../lib/auth.js';
import { TABELAS_NUTRICIONAIS } from '../features/saude/data/tabelasNutricionais.js';
import { DIETAS_INICIAIS } from '../features/saude/data/dietas.js';
import { opcoesTabelaNutricional } from '../features/saude/service/tabelaNutricionalService.js';

const TABELA_NUTRICIONAL = 'tb_saude_tabela_nutricional';
const RESOURCE_TABELA_NUTRICIONAL = 'tabelas-nutricionais';
const TABELA_DIETAS = 'tb_saude_dietas';
const RESOURCE_DIETAS = 'dietas';
let offlineNutritionRows = bundledNutritionRows();
let offlineDiets = DIETAS_INICIAIS.map((diet) => structuredClone(diet));

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

function isMissingTableError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01'
    || code === 'PGRST205'
    || message.includes('does not exist')
    || message.includes('schema cache');
}

function bundledNutritionRows() {
  return TABELAS_NUTRICIONAIS.map((row) => ({ ...row }));
}

function isOfflineMode() {
  return process.env.NODE_ENV === 'test' || process.env.OFFLINE_DEV === 'true';
}

function readBody(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try {
    return JSON.parse(req.body || '{}');
  } catch {
    return null;
  }
}

function validateNutritionPayload(body) {
  const categoria = String(body?.categoria || '').trim();
  const item = String(body?.item || '').trim();
  const porcao = String(body?.porcao ?? body?.porcao_equivalente ?? '').trim();

  if (!categoria || !item || !porcao) {
    return { error: 'Nome do item, tipo da tabela e quantidade da porcao sao obrigatorios.' };
  }
  if (categoria.length > 80) return { error: 'Tipo da tabela deve ter no maximo 80 caracteres.' };
  if (item.length > 200) return { error: 'Nome do item deve ter no maximo 200 caracteres.' };
  if (porcao.length > 2000) return { error: 'Quantidade da porcao deve ter no maximo 2000 caracteres.' };

  return { data: { categoria, item, porcao } };
}

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

function validateDietPayload(body) {
  const titulo = String(body?.titulo || '').trim();
  const objetivo = String(body?.objetivo || '').trim();
  const descricao = String(body?.descricao || '').trim();
  const orientacoes_gerais = String(body?.orientacoes_gerais || '').trim();
  const ritual_diario = String(body?.ritual_diario || '').trim();
  const observacoes = String(body?.observacoes || '').trim();
  const duracao_dias = Number(body?.duracao_dias);
  const dias = Array.isArray(body?.dias) ? body.dias : [];

  if (!titulo || !objetivo || !Number.isInteger(duracao_dias) || duracao_dias < 1 || duracao_dias > 31) {
    return { error: 'Titulo, objetivo e duracao entre 1 e 31 dias sao obrigatorios.' };
  }
  if (titulo.length > 160 || objetivo.length > 120 || descricao.length > 2000 || orientacoes_gerais.length > 12000 || ritual_diario.length > 12000 || observacoes.length > 4000) {
    return { error: 'Um ou mais campos ultrapassam o limite permitido.' };
  }
  if (dias.length !== duracao_dias) return { error: 'O plano deve conter exatamente um registro para cada dia.' };

  const normalizedDays = [];
  for (let index = 0; index < dias.length; index += 1) {
    const day = dias[index] || {};
    const tituloDia = String(day.titulo || '').trim();
    const carboidrato = String(day.carboidrato || '').trim();
    const conteudo = String(day.conteudo || '').trim();
    const jejum_horas = Number(day.jejum_horas);
    const quantidade_refeicoes = Number(day.quantidade_refeicoes);
    if (!tituloDia || !conteudo || !Number.isInteger(jejum_horas) || jejum_horas < 0 || jejum_horas > 24 || !Number.isInteger(quantidade_refeicoes) || quantidade_refeicoes < 1 || quantidade_refeicoes > 12) {
      return { error: `Dados invalidos no dia ${index + 1}.` };
    }
    normalizedDays.push({ numero: index + 1, titulo: tituloDia.slice(0, 160), jejum_horas, quantidade_refeicoes, carboidrato: carboidrato.slice(0, 1000), conteudo: conteudo.slice(0, 12000) });
  }

  return { data: { titulo, objetivo, duracao_dias, descricao, orientacoes_gerais, ritual_diario, dias: normalizedDays, observacoes } };
}

async function loadDiets() {
  if (isOfflineMode()) return { rows: offlineDiets.map((diet) => structuredClone(diet)), storage: 'bundled-fallback' };
  const { supabase } = await import('../lib/supabase.js');
  const { data, error } = await supabase
    .from(TABELA_DIETAS)
    .select('id,slug,titulo,objetivo,duracao_dias,descricao,orientacoes_gerais,ritual_diario,dias,observacoes,source_file,created_at,updated_at')
    .order('created_at', { ascending: false });
  if (error && isMissingTableError(error)) return { rows: DIETAS_INICIAIS.map((diet) => structuredClone(diet)), storage: 'bundled-fallback' };
  return error ? { error } : { rows: data || [], storage: 'supabase' };
}

async function createDiet(payload, userId) {
  const slug = slugify(payload.titulo);
  if (isOfflineMode()) {
    const id = Math.max(0, ...offlineDiets.map((diet) => Number(diet.id) || 0)) + 1;
    const row = { id, slug, ...payload, source_file: 'Cadastro manual' };
    offlineDiets.unshift(row);
    return { row: structuredClone(row), storage: 'memory' };
  }
  const { supabase } = await import('../lib/supabase.js');
  const { data, error } = await supabase
    .from(TABELA_DIETAS)
    .insert({ slug, ...payload, source_file: 'Cadastro manual', created_by: userId })
    .select('id,slug,titulo,objetivo,duracao_dias,descricao,orientacoes_gerais,ritual_diario,dias,observacoes,source_file,created_at,updated_at')
    .single();
  return error ? { error } : { row: data, storage: 'supabase' };
}

async function updateDiet(id, payload) {
  if (isOfflineMode()) {
    const index = offlineDiets.findIndex((diet) => Number(diet.id) === id);
    if (index < 0) return { notFound: true };
    offlineDiets[index] = { ...offlineDiets[index], ...payload, slug: slugify(payload.titulo) };
    return { row: structuredClone(offlineDiets[index]), storage: 'memory' };
  }
  const { supabase } = await import('../lib/supabase.js');
  const { data, error } = await supabase
    .from(TABELA_DIETAS)
    .update({ slug: slugify(payload.titulo), ...payload })
    .eq('id', id)
    .select('id,slug,titulo,objetivo,duracao_dias,descricao,orientacoes_gerais,ritual_diario,dias,observacoes,source_file,created_at,updated_at')
    .maybeSingle();
  if (error) return { error };
  return data ? { row: data, storage: 'supabase' } : { notFound: true };
}

async function deleteDiet(id) {
  if (isOfflineMode()) {
    const previousLength = offlineDiets.length;
    offlineDiets = offlineDiets.filter((diet) => Number(diet.id) !== id);
    return previousLength === offlineDiets.length ? { notFound: true } : { storage: 'memory' };
  }
  const { supabase } = await import('../lib/supabase.js');
  const { data, error } = await supabase.from(TABELA_DIETAS).delete().eq('id', id).select('id').maybeSingle();
  if (error) return { error };
  return data ? { storage: 'supabase' } : { notFound: true };
}

function apiRow(row) {
  return {
    id: row.id,
    categoria: row.categoria,
    protocolo: row.protocolo ?? null,
    item: row.item,
    porcao: row.porcao ?? row.porcao_equivalente,
  };
}

async function loadNutritionRows() {
  if (isOfflineMode()) {
    return { rows: offlineNutritionRows.map((row) => ({ ...row })), storage: 'bundled-fallback' };
  }

  const { supabase } = await import('../lib/supabase.js');
  const { data, error } = await supabase
    .from(TABELA_NUTRICIONAL)
    .select('id,source_order,categoria,protocolo,item,porcao_equivalente')
    .order('source_order', { ascending: true });

  if (error && isMissingTableError(error)) {
    return { rows: bundledNutritionRows(), storage: 'bundled-fallback' };
  }
  if (error) return { error };

  return {
    storage: 'supabase',
    rows: (data || []).map(apiRow),
  };
}

async function createNutritionRow(payload) {
  if (isOfflineMode()) {
    const nextId = Math.max(0, ...offlineNutritionRows.map((row) => Number(row.id) || 0)) + 1;
    const nextOrder = Math.max(0, ...offlineNutritionRows.map((row) => Number(row.source_order || row.id) || 0)) + 1;
    const row = { id: nextId, source_order: nextOrder, protocolo: null, ...payload };
    offlineNutritionRows.unshift(row);
    return { row: apiRow(row), storage: 'memory' };
  }

  const { supabase } = await import('../lib/supabase.js');
  const { data: latest, error: orderError } = await supabase
    .from(TABELA_NUTRICIONAL)
    .select('source_order')
    .order('source_order', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (orderError) return { error: orderError };

  const { data, error } = await supabase
    .from(TABELA_NUTRICIONAL)
    .insert({
      source_order: Number(latest?.source_order || 0) + 1,
      categoria: payload.categoria,
      protocolo: null,
      item: payload.item,
      porcao_equivalente: payload.porcao,
      source_file: 'Cadastro manual',
    })
    .select('id,categoria,protocolo,item,porcao_equivalente')
    .single();
  return error ? { error } : { row: apiRow(data), storage: 'supabase' };
}

async function updateNutritionRow(id, payload) {
  if (isOfflineMode()) {
    const index = offlineNutritionRows.findIndex((row) => Number(row.id) === id);
    if (index < 0) return { notFound: true };
    offlineNutritionRows[index] = { ...offlineNutritionRows[index], ...payload };
    return { row: apiRow(offlineNutritionRows[index]), storage: 'memory' };
  }

  const { supabase } = await import('../lib/supabase.js');
  const { data, error } = await supabase
    .from(TABELA_NUTRICIONAL)
    .update({ categoria: payload.categoria, item: payload.item, porcao_equivalente: payload.porcao })
    .eq('id', id)
    .select('id,categoria,protocolo,item,porcao_equivalente')
    .maybeSingle();
  if (error) return { error };
  return data ? { row: apiRow(data), storage: 'supabase' } : { notFound: true };
}

async function deleteNutritionRow(id) {
  if (isOfflineMode()) {
    const previousLength = offlineNutritionRows.length;
    offlineNutritionRows = offlineNutritionRows.filter((row) => Number(row.id) !== id);
    return previousLength === offlineNutritionRows.length ? { notFound: true } : { storage: 'memory' };
  }

  const { supabase } = await import('../lib/supabase.js');
  const { data, error } = await supabase
    .from(TABELA_NUTRICIONAL)
    .delete()
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) return { error };
  return data ? { storage: 'supabase' } : { notFound: true };
}

export default async function handler(req, res) {
  if (req.method === 'GET' && req.query?.health === '1') {
    return json(res, 200, { ok: true, service: 'saude' });
  }

  const auth = await requireUser(req, { appId: 'saude', adminOnly: true });
  if (!auth.ok) return json(res, auth.status, auth.data);

  if (req.method === 'GET') {
    if (req.query?.resource === RESOURCE_TABELA_NUTRICIONAL) {
      const result = await loadNutritionRows();
      if (result.error) return json(res, 500, { error: result.error.message });
      const options = opcoesTabelaNutricional(result.rows);
      return json(res, 200, {
        resource: 'tabelas-nutricionais',
        source: 'tabelas nutricionais dieta.xlsx',
        storage: result.storage,
        total: result.rows.length,
        ...options,
        rows: result.rows,
      });
    }
    if (req.query?.resource === RESOURCE_DIETAS) {
      const result = await loadDiets();
      if (result.error) return json(res, 500, { error: result.error.message });
      const id = req.query?.id ? parseId(req.query.id) : null;
      if (req.query?.id && !id) return json(res, 400, { error: 'ID invalido.' });
      if (id) {
        const row = result.rows.find((diet) => Number(diet.id) === id);
        return row ? json(res, 200, { resource: RESOURCE_DIETAS, storage: result.storage, row }) : json(res, 404, { error: 'Dieta nao encontrada.' });
      }
      return json(res, 200, { resource: RESOURCE_DIETAS, storage: result.storage, total: result.rows.length, rows: result.rows });
    }

    return json(res, 200, {
      module: 'saude',
      status: 'ready',
      configured: true,
      pages: [
        { id: 'tabela-nutricional', title: 'Tabela Nutricional' },
        { id: 'dietas', title: 'Dietas' },
      ],
      message: 'Módulo de Saúde disponível.',
    });
  }

  if (![RESOURCE_TABELA_NUTRICIONAL, RESOURCE_DIETAS].includes(req.query?.resource)) {
    return json(res, 400, { error: 'Recurso invalido.' });
  }

  if (req.query?.resource === RESOURCE_DIETAS && (req.method === 'POST' || req.method === 'PATCH')) {
    const body = readBody(req);
    if (!body) return json(res, 400, { error: 'JSON invalido.' });
    const validation = validateDietPayload(body);
    if (validation.error) return json(res, 400, { error: validation.error });
    if (req.method === 'POST') {
      const result = await createDiet(validation.data, auth.user.id);
      if (result.error) return json(res, 500, { error: result.error.message });
      return json(res, 201, result);
    }
    const id = parseId(body.id ?? req.query?.id);
    if (!id) return json(res, 400, { error: 'ID invalido.' });
    const result = await updateDiet(id, validation.data);
    if (result.error) return json(res, 500, { error: result.error.message });
    if (result.notFound) return json(res, 404, { error: 'Dieta nao encontrada.' });
    return json(res, 200, result);
  }

  if (req.query?.resource === RESOURCE_DIETAS && req.method === 'DELETE') {
    const body = readBody(req);
    if (!body) return json(res, 400, { error: 'JSON invalido.' });
    const id = parseId(body.id ?? req.query?.id);
    if (!id) return json(res, 400, { error: 'ID invalido.' });
    const result = await deleteDiet(id);
    if (result.error) return json(res, 500, { error: result.error.message });
    if (result.notFound) return json(res, 404, { error: 'Dieta nao encontrada.' });
    return json(res, 200, { ok: true, ...result });
  }

  if (req.method === 'POST' || req.method === 'PATCH') {
    const body = readBody(req);
    if (!body) return json(res, 400, { error: 'JSON invalido.' });
    const validation = validateNutritionPayload(body);
    if (validation.error) return json(res, 400, { error: validation.error });

    if (req.method === 'POST') {
      const result = await createNutritionRow(validation.data);
      if (result.error) return json(res, 500, { error: result.error.message });
      return json(res, 201, result);
    }

    const id = parseId(body.id ?? req.query?.id);
    if (!id) return json(res, 400, { error: 'ID invalido.' });
    const result = await updateNutritionRow(id, validation.data);
    if (result.error) return json(res, 500, { error: result.error.message });
    if (result.notFound) return json(res, 404, { error: 'Item nao encontrado.' });
    return json(res, 200, result);
  }

  if (req.method === 'DELETE') {
    const body = readBody(req);
    if (!body) return json(res, 400, { error: 'JSON invalido.' });
    const id = parseId(body.id ?? req.query?.id);
    if (!id) return json(res, 400, { error: 'ID invalido.' });
    const result = await deleteNutritionRow(id);
    if (result.error) return json(res, 500, { error: result.error.message });
    if (result.notFound) return json(res, 404, { error: 'Item nao encontrado.' });
    return json(res, 200, { ok: true, ...result });
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return json(res, 405, { error: 'Method Not Allowed' });
}
