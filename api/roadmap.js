/**
 * Roadmap do Super App (usada pelo index.html no Vercel).
 */
const ROADMAP = [
  { step: '1', title: 'Aplicações no Vercel', description: 'Notas, Finanças, Lista de Compras e Saúde integrados via API.' },
  { step: '2', title: 'Dados no Supabase', description: 'Persistência em tb_despesas_fixas, tb_financas, tb_lista_compras, tb_saude_familiar.' },
  { step: '3', title: 'Input manual Finanças', description: 'Formulário com descrição, valor, tipo (receita/despesa) e categorias.' },
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
