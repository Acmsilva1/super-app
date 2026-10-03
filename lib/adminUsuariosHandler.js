import { createClient } from '@supabase/supabase-js';
import { requireUser } from './auth.js';

const GRANTABLE_APP_IDS = new Set(['financeiro', 'saude']);

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

function getBody(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    db: { schema: process.env.SUPABASE_SCHEMA || 'public' },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

export default async function adminUsuariosHandler(req, res, APPS) {
  const auth = await requireUser(req, { adminOnly: true });
  if (!auth.ok) return json(res, auth.status, auth.data);

  if (req.method === 'HEAD') {
    res.status(204).end();
    return;
  }

  const supabase = createAdminClient();
  if (!supabase) return json(res, 503, { error: 'Gestao de usuarios requer SUPABASE_SERVICE_ROLE_KEY no servidor.' });

  if (req.method === 'GET') {
    const users = [];
    for (let page = 1; ; page += 1) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
      if (error) return json(res, 502, { error: 'Nao foi possivel listar usuarios.' });
      users.push(...(data?.users || []));
      if (!data?.users?.length || data.users.length < 100) break;
    }

    const { data: permissions, error } = await supabase
      .from('app_user_permissions')
      .select('user_id,app_id,can_access');
    if (error) return json(res, 502, { error: 'Nao foi possivel carregar permissoes.' });

    return json(res, 200, {
      apps: APPS.filter(({ id }) => GRANTABLE_APP_IDS.has(id)).map(({ id, title }) => ({ id, title })),
      restricted_apps: APPS.filter(({ id }) => !GRANTABLE_APP_IDS.has(id)).map(({ id, title }) => ({ id, title })),
      users: users.map((user) => ({
        id: user.id,
        email: user.email || '',
        name: String(user.user_metadata?.name || user.user_metadata?.nome || ''),
        created_at: user.created_at,
        is_banned: Boolean(user.banned_until && Date.parse(user.banned_until) > Date.now()),
        is_admin: user.id === auth.user.id,
        permissions: (permissions || [])
          .filter((permission) => permission.user_id === user.id && permission.can_access)
          .map((permission) => permission.app_id),
      })),
    });
  }

  if (req.method === 'PATCH') {
    const body = getBody(req);
    const userId = String(body.user_id || '');
    if (body.action === 'status') {
      if (!isUuid(userId) || typeof body.blocked !== 'boolean') {
        return json(res, 400, { error: 'Usuario ou status invalido.' });
      }
      if (userId === auth.user.id) {
        return json(res, 400, { error: 'A conta administradora nao pode ser bloqueada aqui.' });
      }
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        ban_duration: body.blocked ? '876000h' : 'none',
      });
      if (error) return json(res, 502, { error: 'Nao foi possivel atualizar o status da conta.' });
      return json(res, 200, { ok: true, user_id: userId, is_banned: body.blocked });
    }

    const appId = String(body.app_id || '');
    if (!isUuid(userId) || !GRANTABLE_APP_IDS.has(appId) || typeof body.can_access !== 'boolean') {
      return json(res, 400, { error: 'Usuario, modulo ou permissao invalida.' });
    }
    if (userId === auth.user.id) {
      return json(res, 400, { error: 'As permissoes da conta administradora nao podem ser alteradas aqui.' });
    }

    const { error } = await supabase
      .from('app_user_permissions')
      .upsert({ user_id: userId, app_id: appId, can_access: body.can_access }, { onConflict: 'user_id,app_id' });
    if (error) return json(res, 502, { error: 'Nao foi possivel salvar a permissao.' });
    return json(res, 200, { ok: true, user_id: userId, app_id: appId, can_access: body.can_access });
  }

  res.setHeader('Allow', 'GET, HEAD, PATCH');
  return json(res, 405, { error: 'Method Not Allowed' });
}
