import { describe, expect, it } from 'vitest';

import {
  calcularDashboard,
  classificarFinancas,
  inferTipoRegistro,
  isSaldoContaCorrenteAffectingRow,
  montarTabelaFinanceiroRows,
  payloadInsertFinanceiro,
  payloadUpdateFinanceiro,
  saldoContaCorrenteDeltaFromRow,
  saldoContaCorrenteValueFromBody,
  sortByValorDesc,
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

  it('ordena tabelas do maior para o menor valor', () => {
    const sorted = sortByValorDesc([
      { valor: 10, descricao: 'A' },
      { valor: 50, descricao: 'B' },
      { valor: 25, descricao: 'C' },
    ]);
    expect(sorted.map((r) => r.valor)).toEqual([50, 25, 10]);
    const tabela = montarTabelaFinanceiroRows([
      { valor: 15, descricao: 'X' },
      { valor: 80, descricao: 'Y' },
    ], 'receita');
    expect(tabela.map((r) => r.valor)).toEqual([80, 15]);
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

  it('grava metodo_pagamento em gasto variavel no insert e no update', () => {
    const ins = payloadInsertFinanceiro({
      tipo_registro: 'gasto_variado',
      descricao: 'Mercado',
      valor: 120,
      metodo_pagamento: 'credito',
    });
    expect(ins.error).toBeUndefined();
    expect(ins.payload.metodo_pagamento).toBe('credito');

    const upd = payloadUpdateFinanceiro({
      id: 'm1',
      tipo_registro: 'gasto_variado',
      metodo_pagamento: 'debito_pix',
    });
    expect(upd.error).toBeUndefined();
    expect(upd.payload.metodo_pagamento).toBe('debito_pix');
  });

  it('rejeita conta_fixa e parcelas simultaneamente no insert', () => {
    const out = payloadInsertFinanceiro({
      tipo_registro: 'despesa_fixa',
      descricao: 'Conflito',
      valor: 100,
      conta_fixa: true,
      parcelas: true,
      parcela_atual: 1,
      parcela_total: 3,
    });
    expect(out.error).toBe('conta_fixa e parcelas nao podem coexistir');
  });

  it('rejeita conta_fixa e parcelas simultaneamente no update', () => {
    const out = payloadUpdateFinanceiro({
      id: 'z',
      tipo_registro: 'despesa_fixa',
      conta_fixa: true,
      parcelas: true,
      parcela_atual: 1,
      parcela_total: 2,
    });
    expect(out.error).toBe('conta_fixa e parcelas nao podem coexistir');
  });

  it('classifica registros legados de compra variada como gastos variados', () => {
    const rows = [
      { id: 1, tipo: 'despesa', tipo_gasto: 'compra_variada', metodo_pagamento: 'debito', valor: 100 },
      { id: 2, tipo: 'despesa', tipo_gasto: 'compra_variada', metodo_pagamento: 'credito', valor: 200 },
      { id: 3, tipo: 'despesa', valor: 50 },
    ];
    const { gastosVariados } = classificarFinancas(rows);
    expect(gastosVariados).toHaveLength(3);
    expect(gastosVariados.map((g) => g.id)).toEqual([1, 2, 3]);
  });

  it('rejeita tipo_registro compra_variada no insert', () => {
    const out = payloadInsertFinanceiro({
      tipo_registro: 'compra_variada',
      descricao: 'Televisão',
      valor: 1500,
    });
    expect(out.error).toBe('tipo_registro invalido');
  });

  it('prepara e calcula saldo de conta corrente', () => {
    expect(saldoContaCorrenteValueFromBody({ valor: 1000, negativo: false })).toBe(1000);
    expect(saldoContaCorrenteValueFromBody({ valor: 1000, negativo: true })).toBe(-1000);
    expect(isSaldoContaCorrenteAffectingRow({ tipo_registro: 'despesa_fixa', status: 'pago', valor: 150 })).toBe(true);
    expect(saldoContaCorrenteDeltaFromRow({ tipo_registro: 'despesa_fixa', status: 'pago', valor: 150 })).toBe(-150);
    expect(isSaldoContaCorrenteAffectingRow({ tipo_registro: 'despesa_fixa', status: 'pendente', valor: 150 })).toBe(false);
    expect(isSaldoContaCorrenteAffectingRow({ tipo_registro: 'gasto_variado', metodo_pagamento: 'pix' })).toBe(true);
    expect(isSaldoContaCorrenteAffectingRow({ tipo_registro: 'gasto_variado', metodo_pagamento: 'credito' })).toBe(false);
    expect(saldoContaCorrenteDeltaFromRow({ tipo_registro: 'gasto_variado', metodo_pagamento: 'debito_pix', valor: 200 })).toBe(-200);

    const ins = payloadInsertFinanceiro({
      tipo_registro: 'saldo_conta_corrente',
      valor: 800,
      negativo: true,
    });
    expect(ins.error).toBeUndefined();
    expect(ins.payload.id).toBe(1);
    expect(ins.payload.valor).toBe(-800);
    expect(ins.payload.negativo).toBe(true);

    const upd = payloadUpdateFinanceiro({
      tipo_registro: 'saldo_conta_corrente',
      id: 1,
      valor: 250,
      negativo: false,
    });
    expect(upd.error).toBeUndefined();
    expect(upd.payload.valor).toBe(250);
    expect(upd.payload.negativo).toBe(false);
  });
});
