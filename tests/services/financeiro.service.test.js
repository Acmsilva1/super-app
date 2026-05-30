import { describe, expect, it } from 'vitest';

import {
  calcularDashboard,
  classificarFinancas,
  inferTipoRegistro,
  montarTabelaFinanceiroRows,
  payloadInsertFinanceiro,
  payloadUpdateFinanceiro,
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

  describe('compras_variadas', () => {
    it('classifica compras variadas e replica débitos para gastos variados', () => {
      const rows = [
        { id: 1, tipo: 'despesa', tipo_gasto: 'compra_variada', metodo_pagamento: 'debito', valor: 100 },
        { id: 2, tipo: 'despesa', tipo_gasto: 'compra_variada', metodo_pagamento: 'credito', valor: 200 },
        { id: 3, tipo: 'despesa', tipo_gasto: 'gasto_variado', valor: 50 },
      ];
      const { gastosVariados, comprasVariadas } = classificarFinancas(rows);

      // Compras variadas deve conter as duas compras
      expect(comprasVariadas).toHaveLength(2);
      expect(comprasVariadas.map(c => c.id)).toContain(1);
      expect(comprasVariadas.map(c => c.id)).toContain(2);

      // Gastos variados deve conter o gasto normal e a compra em débito, mas NÃO a compra em crédito
      expect(gastosVariados).toHaveLength(2);
      expect(gastosVariados.map(g => g.id)).toContain(1);
      expect(gastosVariados.map(g => g.id)).toContain(3);
      expect(gastosVariados.map(g => g.id)).not.toContain(2);
    });

    it('valida payload de insert para compra_variada', () => {
      const ok = payloadInsertFinanceiro({
        tipo_registro: 'compra_variada',
        descricao: 'Televisão',
        valor: 1500,
        local: 'Magazine Luiza',
        metodo_pagamento: 'credito',
        categoria: 'eletro',
      });
      expect(ok.error).toBeUndefined();
      expect(ok.payload.local).toBe('Magazine Luiza');
      expect(ok.payload.metodo_pagamento).toBe('credito');
      expect(ok.payload.tipo_gasto).toBe('compra_variada');
      expect(ok.payload.tipo).toBe('despesa');
      expect(ok.payload.categoria).toBe('eletro');
    });

    it('valida payload de update para compra_variada', () => {
      const ok = payloadUpdateFinanceiro({
        id: 'compra-123',
        tipo_registro: 'compra_variada',
        local: 'Casas Bahia',
        metodo_pagamento: 'debito',
      });
      expect(ok.error).toBeUndefined();
      expect(ok.payload.local).toBe('Casas Bahia');
      expect(ok.payload.metodo_pagamento).toBe('debito');
      expect(ok.payload.tipo_gasto).toBe('compra_variada');
    });
  });
});

