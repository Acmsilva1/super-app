import { requireUser } from '../lib/auth.js';
import {
  getRegisterOptions,
  getFactorOptions,
  verifyFactor,
  revokeCredential,
  verifyRegistration,
} from '../lib/webauthnService.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.end(JSON.stringify(body));
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body || '{}'); } catch { return {}; }
  }
  return {};
}

export default async function handler(req, res) {
  try {
    const action = String(req.query?.action || req.query?.resource || '').trim();
    const body = readBody(req);

    const auth = await requireUser(req);
    if (!auth.ok) return json(res, auth.status || 401, auth.data || { error: 'Login obrigatório' });

    if (req.method === 'POST' && action === 'factor-options') {
      const result = await getFactorOptions(req, auth.user, body);
      return result.options
        ? json(res, 200, result)
        : json(res, 400, { error: result.error || 'Biometria indisponível.' });
    }

    if (req.method === 'POST' && action === 'factor-verify') {
      const result = await verifyFactor(req, auth.user, body);
      return result.ok
        ? json(res, 200, result)
        : json(res, 401, { error: result.error || 'Não foi possível confirmar a biometria.' });
    }

    if (req.method === 'POST' && action === 'register-options') {
      const result = await getRegisterOptions(req, auth.user);
      return result.options
        ? json(res, 200, result)
        : json(res, 400, { error: result.error || 'Biometria indisponível.' });
    }

    if (req.method === 'POST' && action === 'register') {
      const result = await verifyRegistration(req, auth.user, body);
      return result.ok
        ? json(res, 200, result)
        : json(res, 400, { error: result.error || 'Não foi possível ativar a biometria.' });
    }

    if (req.method === 'POST' && action === 'revoke') {
      const result = await revokeCredential(auth.user, body);
      return result.ok
        ? json(res, 200, result)
        : json(res, 400, { error: result.error || 'Não foi possível desativar a biometria.' });
    }

    return json(res, 405, { error: 'Ação não disponível.' });
  } catch (error) {
    console.error('[webauthn]', error);
    return json(res, 500, { error: 'Falha interna de biometria.' });
  }
}
