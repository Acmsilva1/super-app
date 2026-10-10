import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ queries: [] }));
vi.mock('../../lib/alertServiceClient.js', () => ({
  getAlertServiceClient: () => ({ from(table) {
    const query = {
      select() { return query; }, order() { return query; }, range() { return query; },
      or(value) { state.queries.push({ table, filter: value }); return query; },
      eq(column, value) { state.queries.push({ table, column, value }); return query; },
      then(resolve, reject) {
        const data = table === 'tb_financas' ? [
          { valor: 100, metodo_pagamento: 'debito', tipo: 'despesa' },
          { valor: 25.5, metodo_pagamento: 'pix', tipo: 'despesa' },
          { valor: 200, metodo_pagamento: 'credito', tipo: 'despesa' },
          { valor: 400, metodo_pagamento: 'pix', tipo: 'receita' },
        ] : [{ fixas_pagas: 1500, fixas_pendentes: 300 }, { fixas_pagas: 500, fixas_pendentes: 200 }];
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  } }),
}));
import { previewFinanceiroDailySummaries } from '../../features/financeiro/service/financeiroTelegramScheduler.js';
afterEach(() => { state.queries = []; vi.unstubAllEnvs(); });

describe('Resumos financeiros no teste Telegram', () => {
  it('uses daily debit/Pix expenses and monthly fixed expenses with the Brasília date', async () => {
    vi.stubEnv('SAUDE_ALERTS_OWNER_USER_ID','f88a6351-317d-425b-afcd-9430c8a34f53');
    const summaries = await previewFinanceiroDailySummaries(new Date('2026-10-08T01:30:00Z'));
    expect(summaries).toHaveLength(2);
    expect(summaries.every((item) => item.event_type === 'financeiro.daily_summary')).toBe(true);
    const daily = summaries[0].message.replaceAll('\u00a0', ' ');
    const fixed = summaries[1].message.replaceAll('\u00a0', ' ');
    expect(daily).toBe('💳 Gastos de hoje com débito/Pix: R$ 125,50');
    expect(fixed).toContain('✅ Pago: R$ 2.000,00');
    expect(fixed).toContain('⏳ Pendente: R$ 500,00');
    expect(state.queries.find((query) => query.table === 'tb_financas' && query.filter).filter).toContain('data_lancamento.eq.2026-10-07');
    expect(state.queries.find((query) => query.table === 'vw_financeiro_resumo_mensal' && query.column==='mes_ano')).toMatchObject({ column: 'mes_ano', value: '2026-10' });
  });
});
