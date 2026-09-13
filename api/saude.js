import { requireUser } from '../lib/auth.js';
import { TABELAS_NUTRICIONAIS } from '../features/saude/data/tabelasNutricionais.js';
import { opcoesTabelaNutricional } from '../features/saude/service/tabelaNutricionalService.js';

const TABELA_NUTRICIONAL = 'tb_saude_tabela_nutricional';

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

async function loadNutritionRows() {
  if (process.env.NODE_ENV === 'test' || process.env.OFFLINE_DEV === 'true') {
    return { rows: bundledNutritionRows(), storage: 'bundled-fallback' };
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
    rows: (data || []).map((row) => ({
      id: row.id,
      categoria: row.categoria,
      protocolo: row.protocolo,
      item: row.item,
      porcao: row.porcao_equivalente,
    })),
  };
}

export default async function handler(req, res) {
  if (req.method === 'GET' && req.query?.health === '1') {
    return json(res, 200, { ok: true, service: 'saude' });
  }

  const auth = await requireUser(req, { appId: 'saude', adminOnly: true });
  if (!auth.ok) return json(res, auth.status, auth.data);

  if (req.method === 'GET') {
    if (req.query?.resource === 'tabelas-nutricionais') {
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

    return json(res, 200, {
      module: 'saude',
      status: 'ready',
      configured: true,
      pages: [
        { id: 'tabela-nutricional', title: 'Tabela Nutricional' },
      ],
      message: 'Módulo de Saúde disponível.',
    });
  }

  res.setHeader('Allow', 'GET');
  return json(res, 405, { error: 'Method Not Allowed' });
}
