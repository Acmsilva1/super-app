import { requireUser } from '../lib/auth.js';
import { getFixedUser, isFixedAuthMode } from '../lib/authMode.js';
import { unsafeAuthEnvironment } from '../lib/authEnvironment.js';

const ROADMAP = [
  { step: '1', title: 'Shell único publicado na Vercel', description: 'Frontend estático/PWA em index.html com catálogo central de apps e consumo de APIs serverless.' },
  { step: '2', title: 'Domínios integrados ao Supabase', description: 'Despesas Fixas, Finanças, Lista de Compras, Saúde e Fluxograma persistem dados no Supabase.' },
  { step: '3', title: 'Automação operacional', description: 'GitHub Actions acorda a Vercel para análise operacional agendada.' },
  { step: '4', title: 'Evolução contínua', description: 'Base está pronta para evolução incremental de módulos e melhorias de confiabilidade.' },
];

/**
 * Lista de aplicacoes do Super App (usada pelo index.html no Vercel).
 * Cada app costuma ter uma API, exceto fluxograma (so front + localStorage).
 */
export const APPS = [
  {
    id: 'financeiro',
    icon: 'fa-wallet',
    status: 'active',
    title: 'Financeiro',
    description: 'Despesas fixas, extrato diario, receitas e poupanca.',
    category: 'Financeiro',
    health_path: '/api/financeiro?health=1',
  },
  {
    id: 'lista_compras',
    icon: 'fa-list',
    status: 'active',
    title: 'Lista de Compras',
    description: 'Lista de compras com prioridade e controle do que ja foi comprado.',
    category: 'Produtividade',
    health_path: '/api/lista-compras?health=1',
  },
  {
    id: 'fluxograma',
    icon: 'fa-diagram-project',
    status: 'active',
    title: 'Fluxograma',
    description: 'Crie fluxogramas com nos e conexoes; rascunho local e projetos salvos na nuvem (Supabase).',
    category: 'Produtividade',
    health_path: '/api/fluxograma?health=1',
  },
  {
    id: 'saude',
    icon: 'fa-heart-pulse',
    status: 'active',
    title: 'Saúde',
    description: 'Módulo de saúde preparado para receber novas funcionalidades.',
    category: 'Saúde',
    health_path: '/api/saude?health=1',
  },
];

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

export default async function handler(req, res) {
  const route = String(req.query?.route || '');
  if (route === 'auth-config') {
    if (unsafeAuthEnvironment()) return json(res, 503, { error: 'Configuracao de autenticacao insegura.' });
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return json(res, 405, { error: 'Method Not Allowed' });
    }
    if (process.env.OFFLINE_DEV === 'true') {
      return json(res, 200, {
        offlineMode: true,
        fakeToken: 'offline-dev-token',
        user: { id: 'f88a6351-317d-425b-afcd-9430c8a34f53', email: 'andre@local.dev' },
      });
    }
    if (isFixedAuthMode()) {
      if (!req.fixedAuthVerified) return json(res, 401, { error: 'Login obrigatorio' });
      return json(res, 200, { authMode: 'fixed', user: getFixedUser() });
    }
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    if (!url || !anonKey) return json(res, 500, { error: 'Supabase Auth nao configurado' });
    return json(res, 200, { url, anonKey });
  }
  if (route === 'statistics') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return json(res, 405, { error: 'Method Not Allowed' });
    }
    return json(res, 200, {
      totalApps: APPS.length,
      activeApps: APPS.filter((app) => app.status === 'active').length,
      betaApps: APPS.filter((app) => app.status === 'beta').length,
      openApps: APPS.filter((app) => app.status === 'open').length,
    });
  }
  if (route === 'roadmap') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return json(res, 405, { error: 'Method Not Allowed' });
    }
    return json(res, 200, ROADMAP);
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method Not Allowed' });
  }

  const auth = await requireUser(req);
  if (!auth.ok) return json(res, auth.status, auth.data);

  if (auth.isAdmin) return json(res, 200, APPS);
  const { data: permissions, error } = await (await import('../lib/supabase.js')).supabase
    .from('app_user_permissions')
    .select('app_id')
    .eq('user_id', auth.user.id)
    .eq('can_access', true);
  if (error) return json(res, 500, { error: 'Nao foi possivel carregar os modulos autorizados.' });
  const allowed = new Set((permissions || []).map((permission) => String(permission.app_id)));
  return json(res, 200, APPS.filter((app) => allowed.has(app.id)));
}
