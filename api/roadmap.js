/**
 * Roadmap do Super App (usado pelo index.html no Vercel).
 * Reflete o estado atual do ecossistema publicado.
 */
const ROADMAP = [
  {
    step: '1',
    title: 'Shell único publicado na Vercel',
    description: 'Frontend estático/PWA em index.html com catálogo central de apps e consumo de APIs serverless.',
  },
  {
    step: '2',
    title: 'Domínios integrados ao Supabase',
    description: 'Despesas Fixas, Finanças, Lista de Compras, Saúde e Fluxograma persistem dados no Supabase.',
  },
  {
    step: '3',
    title: 'Automação operacional',
    description: 'GitHub Actions acorda a Vercel para análise operacional agendada.',
  },
  {
    step: '4',
    title: 'Evolução contínua',
    description: 'Base está pronta para evolução incremental de módulos e melhorias de confiabilidade.',
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

