import { describe, expect, it } from 'vitest';

import {
  calcularDashboard,
  classificarFinancas,
  inferTipoRegistro,
  payloadInsertFinanceiro,
  payloadUpdateFinanceiro,
} from '../../features/financeiro/service/financeiroService.js';

describe('financeiroService', () => {
  it('infere tipo_registro por status e por tipo', () => {
    expect(inferTipoRegistro({ status: 'pago' })).toBe('despesa_fixa');
    expect(inferTipoRegistro({ tipo: 'receita' })).toBe('receita');
    expect(inferTipoRegistro({ tipo: 'despesa' })).toBe('gasto_variado');
  });

  it('classifica linhas entre receitas e gastos', () => {
    const { receitas, gastosVariados } = classificarFinancas([
      { tipo: 'receita', valor: 100 },
      { tipo: 'despesa', valor: 40 },
    ]);
    expect(receitas).toHaveLength(1);
    expect(gastosVariados).toHaveLength(1);
  });

  it('calcula dashboard consolidado', () => {
    const out = calcularDashboard({
      receitasRows: [{ valor: 200 }],
      gastosRows: [{ valor: 50 }],
      despesasFixasRows: [{ valor: 30 }],
    });
    expect(out).toEqual({
      receitas: 200,
      despesas_fixas: 30,
      despesas_variadas: 50,
      liquido: 120,
    });
  });

  it('valida payload de insert para meta de poupanca', () => {
    const ok = payloadInsertFinanceiro({
      tipo_registro: 'meta_poupanca',
      nome_meta: 'Reserva',
      valor_meta: 500,
    });
    expect(ok.error).toBeUndefined();
    expect(ok.payload.valor_meta).toBe(500);

    const fail = payloadInsertFinanceiro({
      tipo_registro: 'meta_poupanca',
      nome_meta: '',
      valor_meta: 0,
    });
    expect(fail.error).toBeTruthy();
  });

  it('exige id no update', () => {
    const out = payloadUpdateFinanceiro({ tipo_registro: 'receita', valor: 10 });
    expect(out.error).toBe('id obrigatorio');
  });

  it('inclui parcelas em despesa fixa no insert e no update', () => {
    const ins = payloadInsertFinanceiro({
      tipo_registro: 'despesa_fixa',
      descricao: 'Avenida',
      valor: 10,
      parcelas: true,
      parcela_atual: 1,
      parcela_total: 4,
    });
    expect(ins.error).toBeUndefined();
    expect(ins.payload.parcela_atual).toBe(1);
    expect(ins.payload.parcela_total).toBe(4);

    const upd = payloadUpdateFinanceiro({
      id: 'x',
      tipo_registro: 'despesa_fixa',
      parcelas: false,
    });
    expect(upd.error).toBeUndefined();
    expect(upd.payload.parcela_atual).toBeNull();
    expect(upd.payload.parcela_total).toBeNull();
  });

  it('inclui conta_fixa em despesa fixa no insert e no update', () => {
    const ins = payloadInsertFinanceiro({
      tipo_registro: 'despesa_fixa',
      descricao: 'Internet',
      valor: 99.90,
      conta_fixa: true,
    });
    expect(ins.error).toBeUndefined();
    expect(ins.payload.conta_fixa).toBe(true);

    const upd = payloadUpdateFinanceiro({
      id: 'y',
      tipo_registro: 'despesa_fixa',
      conta_fixa: false,
    });
    expect(upd.error).toBeUndefined();
    expect(upd.payload.conta_fixa).toBe(false);
  });
});
