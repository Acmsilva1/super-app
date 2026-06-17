import financeiroAnalistaHandler from './financeiro-analista.js';
import { getBrazilTodayIso } from '../features/financeiro/index.js';

export default async function handler(req, res) {
  const mesAnoAtual = getBrazilTodayIso().slice(0, 7);
  const cronReq = {
    ...req,
    query: {
      ...(req.query || {}),
      mes_ano: mesAnoAtual,
      learn: '1',
      cron: '1',
    },
  };

  return financeiroAnalistaHandler(cronReq, res);
}
