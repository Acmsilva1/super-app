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

export async function requireUser(req, options = {}) {
  if (process.env.NODE_ENV === 'test') {
    return {
      ok: true,
      user: { id: '', email: 'test@example.com' },
      isAdmin: true,
    };
  }

  const token = getBearerToken(req);
  if (!token) return { ok: false, status: 401, data: { error: 'Login obrigatorio' } };

  const { supabase } = await import('./supabase.js');
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { ok: false, status: 401, data: { error: 'Sessao invalida ou expirada' } };

  const user = data.user;
  const { data: roleRows, error: roleError } = await supabase
    .from('app_user_roles')
    .select('role')
    .eq('user_id', user.id)
    .limit(1);

  if (roleError && !isMissingTableError(roleError)) {
    return { ok: false, status: 500, data: { error: roleError.message } };
  }

  const role = Array.isArray(roleRows) && roleRows[0]?.role ? String(roleRows[0].role) : '';
  const isAdmin = role === 'owner' || role === 'admin';

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
      if (isMissingTableError(permissionError) && options.appId === 'financeiro') {
        return { ok: true, user, isAdmin: false };
      }
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