/**
 * Roadmap do Super App (usada pelo index.html no Vercel).
 * Reflete o estado atual do ecossistema publicado.
 */
const ROADMAP = [
  {
    step: '1',
    title: 'Shell unico publicado na Vercel',
    description: 'Frontend estatico/PWA em index.html com catalogo central de apps e consumo de APIs serverless.',
  },
  {
    step: '2',
    title: 'Dominios integrados ao Supabase',
    description: 'Despesas Fixas, Financas, Lista de Compras, Saude, Agenda, Tarefas Jobson e Fluxograma persistem dados no Supabase.',
  },
  {
    step: '3',
    title: 'Automacao e notificacoes',
    description: 'GitHub Actions acorda a Vercel para notificacoes horarias no Telegram e para analise operacional agendada.',
  },
  {
    step: '4',
    title: 'Observabilidade tecnica',
    description: 'System analysis mede endpoints e conexao com banco, grava snapshots e alimenta dashboard operacional.',
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
  return json(res, 200, ROADMAP);
}
