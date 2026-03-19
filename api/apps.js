/**
 * Lista de aplicações do Super App (usada pelo index.html no Vercel).
 * Cada app corresponde a uma API: /api/despesas-fixas (Bloco de Notas), /api/financas, /api/lista-compras, /api/saude.
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
    title: 'Calendário 2026',
    description: 'Módulo de agendamento integrado ao ecossistema 2026',
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
