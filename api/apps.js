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
    description: 'Dashboard financeiro completo com despesas fixas, gastos variaveis e receitas.',
    category: 'Financeiro',
  },
  {
    id: 'lista_compras',
    icon: 'fa-list',
    status: 'active',
    title: 'Lista de Compras',
    description: 'Lista de compras com prioridade e controle do que ja foi comprado.',
    category: 'Produtividade',
  },
  {
    id: 'fluxograma',
    icon: 'fa-diagram-project',
    status: 'active',
    title: 'Fluxograma',
    description: 'Crie fluxogramas com nos e conexoes; rascunho local e projetos salvos na nuvem (Supabase).',
    category: 'Produtividade',
  },
  {
    id: 'missoes_treino',
    icon: 'fa-dumbbell',
    status: 'active',
    title: 'Missoes de Treino',
    description: 'Controle diario de missoes com progresso local, sem dependencia de API backend.',
    category: 'Saude',
  },
];

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method Not Allowed' });
  }
  return json(res, 200, APPS);
}
