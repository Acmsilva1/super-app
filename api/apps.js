/**
 * Lista de aplicações do Super App (usada pelo index.html no Vercel).
 * Cada app costuma ter uma API, exceto fluxograma (só front + localStorage).
 */
const APPS = [
  {
    id: 'notas',
    icon: 'fa-book',
    status: 'active',
    title: 'Despesas Fixas',
    description: 'Registro de despesas fixas: descrição, valor, status pago/pendente e soma no final.',
    category: 'Produtividade',
  },
  {
    id: 'financas',
    icon: 'fa-wallet',
    status: 'active',
    title: 'Finanças',
    description: 'Registro de receitas e despesas com categorias e BI.',
    category: 'Financeiro',
  },
  {
    id: 'lista_compras',
    icon: 'fa-list',
    status: 'active',
    title: 'Lista de Compras',
    description: 'Lista de compras com prioridade e controle do que já foi comprado.',
    category: 'Produtividade',
  },
  {
    id: 'saude',
    icon: 'fa-heart-pulse',
    status: 'active',
    title: 'Saúde Familiar',
    description: 'Vacinas, consultas, exames e medicamentos por membro da família.',
    category: 'Saúde',
  },
  {
    id: 'calendario',
    icon: 'fa-calendar-days',
    status: 'active',
    title: 'Agenda',
    description: 'Módulo de agendamento integrado ao ecossistema 2026',
    category: 'Produtividade',
  },
  {
    id: 'fluxograma',
    icon: 'fa-diagram-project',
    status: 'active',
    title: 'Fluxograma',
    description: 'Crie fluxogramas com nós e conexões; rascunho local e projetos salvos na nuvem (Supabase).',
    category: 'Produtividade',
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
