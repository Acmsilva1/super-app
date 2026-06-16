import financeiroAnalistaHandler from './financeiro-analista.js';

export default async function handler(req, res) {
  const mesAnoAtual = new Date().toISOString().slice(0, 7);
  const cronReq = {
    ...req,
    query: {
      ...(req.query || {}),
      mes_ano: mesAnoAtual,
      learn: '1',
    },
  };

  return financeiroAnalistaHandler(cronReq, res);
}
