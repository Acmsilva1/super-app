import { describe, expect, it } from 'vitest';

import {
  calcularDashboard,
  calcularGraficosAnuais,
  classificarFinancas,
  inferTipoRegistro,
  montarTabelaFinanceiroRows,
  payloadInsertFinanceiro,
  payloadUpdateFinanceiro,
  sortCronologiaDesc,
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

  it('ordena tabelas em ordem cronologica', () => {
    const sorted = sortCronologiaDesc([
      { valor: 10, descricao: 'A', created_at: '2026-05-01T09:00:00.000Z' },
      { valor: 50, descricao: 'B', created_at: '2026-05-03T09:00:00.000Z' },
      { valor: 25, descricao: 'C', created_at: '2026-05-02T09:00:00.000Z' },
    ]);
    expect(sorted.map((r) => r.descricao)).toEqual(['B', 'C', 'A']);
    const tabela = montarTabelaFinanceiroRows([
      { valor: 15, descricao: 'X', created_at: '2026-05-02T10:00:00.000Z' },
      { valor: 80, descricao: 'Y', created_at: '2026-05-03T10:00:00.000Z' },
    ], 'receita');
    expect(tabela.map((r) => r.descricao)).toEqual(['Y', 'X']);
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

  it('calcula graficos anuais por mes sem repetir meses fora do ano', () => {
    const out = calcularGraficosAnuais({
      ano: 2026,
      rows: [
        { tipo: 'receita', valor: 100, data_lancamento: '2026-01-10' },
        { tipo: 'despesa', valor: 30, data_lancamento: '2026-01-20' },
        { tipo: 'receita', valor: 200, data_lancamento: '2026-02-05' },
        { tipo: 'despesa', valor: 80, data_lancamento: '2026-02-12' },
        { tipo: 'receita', valor: 999, data_lancamento: '2025-12-12' },
      ],
      despesasFixasRows: [
        { valor: 20, created_at: '2026-01-01T12:00:00.000Z' },
        { valor: 10, created_at: '2026-02-01T12:00:00.000Z' },
      ],
    });

    expect(out).toHaveLength(12);
    expect(out[0]).toMatchObject({ mes_ano: '2026-01', receitas: 100, despesas: 50, saldo: 50 });
    expect(out[1]).toMatchObject({ mes_ano: '2026-02', receitas: 200, despesas: 90, saldo: 110 });
    expect(out[11]).toMatchObject({ mes_ano: '2026-12', receitas: 0, despesas: 0, saldo: 0 });
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
      created_at: '2026-05-28T14:30:00.000Z',
    });
    expect(ins.error).toBeUndefined();
    expect(ins.payload.conta_fixa).toBe(true);
    expect(ins.payload.created_at).toBe('2026-05-28T14:30:00.000Z');

    const upd = payloadUpdateFinanceiro({
      id: 'y',
      tipo_registro: 'despesa_fixa',
      conta_fixa: false,
      created_at: '2026-05-29T08:15:00.000Z',
    });
    expect(upd.error).toBeUndefined();
    expect(upd.payload.conta_fixa).toBe(false);
    expect(upd.payload.created_at).toBe('2026-05-29T08:15:00.000Z');
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

  it('grava compra com metodo a_vista ou parcelado', () => {
    const ins = payloadInsertFinanceiro({
      tipo_registro: 'compra',
      descricao: 'Notebook',
      valor: 3200.5,
      metodo_pagamento: 'parcelado',
      data_lancamento: '2026-07-10',
    });
    expect(ins.error).toBeUndefined();
    expect(ins.tipo_registro).toBe('compra');
    expect(ins.payload).toMatchObject({
      descricao: 'Notebook',
      valor: 3200.5,
      metodo_pagamento: 'parcelado',
      data_lancamento: '2026-07-10',
    });
    expect(ins.payload.tipo).toBeUndefined();
    expect(ins.payload.categoria).toBeUndefined();

    const upd = payloadUpdateFinanceiro({
      id: 7,
      tipo_registro: 'compra',
      metodo_pagamento: 'à vista',
      valor: 100,
    });
    expect(upd.error).toBeUndefined();
    expect(upd.payload.metodo_pagamento).toBe('a_vista');
    expect(upd.payload.valor).toBe(100);
  });

  it('rejeita metodo_pagamento invalido em compra', () => {
    const out = payloadInsertFinanceiro({
      tipo_registro: 'compra',
      descricao: 'Sofá',
      valor: 900,
      metodo_pagamento: 'credito',
    });
    expect(out.error).toBe('metodo_pagamento invalido');
  });

  it('rejeita saldo de conta corrente como tipo invalido', () => {
    const insert = payloadInsertFinanceiro({
      tipo_registro: 'saldo_conta_corrente',
      valor: 800,
      negativo: true,
    });
    expect(insert.error).toBe('tipo_registro invalido');

    const update = payloadUpdateFinanceiro({
      tipo_registro: 'saldo_conta_corrente',
      id: 1,
      valor: 250,
      negativo: false,
    });
    expect(update.error).toBe('tipo_registro invalido');
  });
});
