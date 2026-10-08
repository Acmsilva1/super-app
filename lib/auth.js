import { getFixedUser, isFixedAuthMode } from './authMode.js';
import { unsafeAuthEnvironment } from './authEnvironment.js';

function getBearerToken(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function isMissingTableError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01' || message.includes('does not exist') || message.includes('nao existe');
}

const SUPERAPP_ADMIN_ID = 'f88a6351-317d-425b-afcd-9430c8a34f53';
const SUPERAPP_ADMIN_EMAIL = 'andrecarlos.miranda@gmail.com';

export async function requireUser(req, options = {}) {
  if (unsafeAuthEnvironment()) {
    return { ok: false, status: 503, data: { error: 'Configuracao de autenticacao insegura.' } };
  }
  if (process.env.NODE_ENV === 'test' || process.env.OFFLINE_DEV === 'true') {
    return {
      ok: true,
      user: { id: 'f88a6351-317d-425b-afcd-9430c8a34f53', email: 'andre@local.dev' },
      isAdmin: true,
    };
  }

  if (isFixedAuthMode()) {
    if (!req.fixedAuthVerified) return { ok: false, status: 401, data: { error: 'Login obrigatorio' } };
    return { ok: true, user: getFixedUser(), isAdmin: true };
  }

  const token = getBearerToken(req);
  if (!token) return { ok: false, status: 401, data: { error: 'Login obrigatorio' } };

  const { supabase } = await import('./supabase.js');
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { ok: false, status: 401, data: { error: 'Sessao invalida ou expirada' } };

  let user = data.user;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { data: account, error: accountError } = await supabase.auth.admin.getUserById(user.id);
    if (accountError || !account?.user) {
      return { ok: false, status: 500, data: { error: 'Nao foi possivel validar o status da conta.' } };
    }
    user = account.user;
  }
  if (user.banned_until && Date.parse(user.banned_until) > Date.now()) {
    return { ok: false, status: 403, data: { error: 'Conta bloqueada. Fale com o administrador do Super App.' } };
  }
  const { data: roleRows, error: roleError } = await supabase
    .from('app_user_roles')
    .select('role')
    .eq('user_id', user.id)
    .limit(1);

  if (roleError && !isMissingTableError(roleError)) {
    return { ok: false, status: 500, data: { error: roleError.message } };
  }

  const role = Array.isArray(roleRows) && roleRows[0]?.role ? String(roleRows[0].role) : '';
  const isAdmin = user.id === SUPERAPP_ADMIN_ID
    && String(user.email || '').trim().toLowerCase() === SUPERAPP_ADMIN_EMAIL
    && (role === 'owner' || role === 'admin');

  if (options.adminOnly && !isAdmin) {
    return { ok: false, status: 403, data: { error: 'Acesso restrito ao administrador' } };
  }

  if (options.appId && !isAdmin) {
    const { data: permissionRows, error: permissionError } = await supabase
      .from('app_user_permissions')
      .select('can_access')
      .eq('user_id', user.id)
      .eq('app_id', options.appId)
      .eq('can_access', true)
      .limit(1);

    if (permissionError) {
      if (isMissingTableError(permissionError)) {
        return { ok: false, status: 403, data: { error: 'Modulo indisponivel para este usuario' } };
      }
      return { ok: false, status: 500, data: { error: permissionError.message } };
    }

    if (!Array.isArray(permissionRows) || permissionRows.length === 0) {
      return { ok: false, status: 403, data: { error: 'Modulo indisponivel para este usuario' } };
    }
  }

  return { ok: true, user, isAdmin };
}
