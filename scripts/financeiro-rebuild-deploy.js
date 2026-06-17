import { rebuildFinanceiroAnalises } from '../features/financeiro/service/financeiroRebuildService.js';

const isVercelProduction = String(process.env.VERCEL || '') === '1'
  && String(process.env.VERCEL_ENV || '') === 'production';

if (!isVercelProduction) {
  console.log('financeiro-rebuild-deploy: skip (nao e deploy de producao na Vercel)');
  process.exit(0);
}

try {
  const result = await rebuildFinanceiroAnalises();
  console.log(`financeiro-rebuild-deploy: ${result.months_processed} mes(es) recalculados`);
  process.exit(0);
} catch (error) {
  console.error('financeiro-rebuild-deploy: falha ao recalcular o financeiro');
  console.error(error);
  process.exit(1);
}
