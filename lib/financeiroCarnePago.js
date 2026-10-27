import { requireUser } from './auth.js';
import { supabase } from './supabase.js';
import { CARNES_PARA_ALERTA } from '../features/financeiro/service/carneNextBoleto.js';

const table = 'tb_financeiro_carne_pago';
const mock = new Map();
const missing = (error) => ['42P01', 'PGRST205', '42703', 'PGRST204'].includes(error?.code);
const knownCarne = new Set(CARNES_PARA_ALERTA.map((row) => row.id));

function mockKey(userId) {
  return String(userId);
}

function readMock(userId) {
  return mock.get(mockKey(userId)) || [];
}

function writeMock(userId, rows) {
  mock.set(mockKey(userId), rows);
}

function parseBody(req) {
  try {
    return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch {
    return null;
  }
}

function validateMutation(body) {
  const carneId = String(body?.carne_id || '').trim();
  const numero = Number(body?.parcela_numero);
  if (!knownCarne.has(carneId)) throw new Error('Carnê inválido.');
  if (!Number.isInteger(numero) || numero < 1 || numero > 999) throw new Error('Parcela inválida.');
  if (typeof body?.pago !== 'boolean') throw new Error('Informe pago true ou false.');
  return { carne_id: carneId, parcela_numero: numero, pago: body.pago };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const send = (status, body) => res.status(status).json(body);
  try {
    const auth = await requireUser(req, { appId: 'financeiro' });
    if (!auth.ok) return send(auth.status, auth.data);
    const demo = process.env.OFFLINE_DEV === 'true' || process.env.NODE_ENV === 'test';
    const userId = auth.user.id;

    if (req.method === 'GET') {
      if (demo) return send(200, { rows: readMock(userId), persistencia: false, demo: true });
      const result = await supabase.from(table)
        .select('carne_id,parcela_numero,updated_at')
        .eq('user_id', userId)
        .order('carne_id')
        .order('parcela_numero');
      if (missing(result.error)) {
        return send(200, {
          rows: [],
          persistencia: false,
          aviso: 'Aplique a migration do carnê para sincronizar parcelas pagas com os alertas.',
        });
      }
      if (result.error) return send(500, { error: 'Não foi possível carregar as parcelas pagas.' });
      return send(200, { rows: result.data || [], persistencia: true });
    }

    if (req.method !== 'POST' && req.method !== 'PATCH') {
      res.setHeader('Allow', 'GET, POST, PATCH');
      return send(405, { error: 'Método não permitido.' });
    }

    const body = parseBody(req);
    if (!body) return send(400, { error: 'JSON inválido.' });
    let payload;
    try { payload = validateMutation(body); }
    catch (error) { return send(400, { error: error.message }); }

    if (demo) {
      const rows = readMock(userId).filter(
        (row) => !(row.carne_id === payload.carne_id && row.parcela_numero === payload.parcela_numero),
      );
      if (payload.pago) {
        rows.push({
          carne_id: payload.carne_id,
          parcela_numero: payload.parcela_numero,
          updated_at: new Date().toISOString(),
        });
      }
      writeMock(userId, rows);
      return send(200, { ok: true, demo: true, rows });
    }

    if (payload.pago) {
      const result = await supabase.from(table).upsert({
        user_id: userId,
        carne_id: payload.carne_id,
        parcela_numero: payload.parcela_numero,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,carne_id,parcela_numero' }).select('carne_id,parcela_numero').maybeSingle();
      if (missing(result.error)) {
        return send(503, { error: 'A migration do carnê ainda não foi aplicada.' });
      }
      if (result.error) return send(500, { error: 'Não foi possível marcar a parcela.' });
      return send(200, { ok: true });
    }

    const result = await supabase.from(table)
      .delete()
      .eq('user_id', userId)
      .eq('carne_id', payload.carne_id)
      .eq('parcela_numero', payload.parcela_numero)
      .select('carne_id');
    if (missing(result.error)) {
      return send(503, { error: 'A migration do carnê ainda não foi aplicada.' });
    }
    if (result.error) return send(500, { error: 'Não foi possível desmarcar a parcela.' });
    return send(200, { ok: true });
  } catch {
    return send(500, { error: 'Não foi possível processar o carnê.' });
  }
}
