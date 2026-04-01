/**
 * Lista de aplicacoes do Super App (usada pelo index.html no Vercel).
 * Cada app costuma ter uma API, exceto fluxograma (so front + localStorage).
 */
export const APPS = [
  {
    id: 'notas',
    icon: 'fa-book',
    status: 'active',
    title: 'Despesas Fixas',
    description: 'Registro de despesas fixas: descricao, valor, status pago/pendente e soma no final.',
    category: 'Produtividade',
  },
  {
    id: 'financas',
    icon: 'fa-wallet',
    status: 'active',
    title: 'Financas',
    description: 'Registro de receitas e despesas com categorias e BI.',
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
    id: 'saude',
    icon: 'fa-heart-pulse',
    status: 'active',
    title: 'Saude Familiar',
    description: 'Vacinas, consultas, exames e medicamentos por membro da familia.',
    category: 'Saude',
  },
  {
    id: 'calendario',
    icon: 'fa-calendar-days',
    status: 'active',
    title: 'Agenda',
    description: 'Modulo de agendamento integrado ao ecossistema 2026',
    category: 'Produtividade',
  },
  {
    id: 'tarefas_jobson',
    icon: 'fa-list-check',
    status: 'active',
    title: 'Tarefas Jobson',
    description: 'Planejamento de tarefas por data e horario com controle de status.',
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
