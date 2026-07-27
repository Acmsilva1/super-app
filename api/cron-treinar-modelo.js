/**
 * /api/cron-treinar-modelo
 *
 * Endpoint disparado automaticamente pelo Vercel Cron Jobs toda madrugada às 03:00 (horário de Brasília).
 * Executa o re-treinamento do modelo Naive Bayes para todos os usuários do sistema.
 */

import { treinarModeloTodosUsuarios } from './_financeiroShared.js';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

export default async function handler(req, res) {
  try {
    // Se CRON_SECRET estiver configurado no Vercel, valida o header de autorização
    const authHeader = req.headers.authorization;
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return json(res, 401, { error: 'Unauthorized' });
    }

    const resultado = await treinarModeloTodosUsuarios();
    return json(res, 200, {
      ok: true,
      executado_em: new Date().toISOString(),
      ...resultado,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro no cron de treinamento';
    return json(res, 500, { error: message });
  }
}
