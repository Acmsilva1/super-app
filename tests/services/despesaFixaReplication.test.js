import { describe, expect, it } from 'vitest';

import {
  buildReplicationSlotsFromStart,
  seriesDefinitionsFromYearRows,
  slotsNeededForMonth,
  rowMatchesReplicationSlot,
} from '../../features/financeiro/service/despesaFixaReplication.js';

describe('buildReplicationSlotsFromStart', () => {
  it('conta fixa replica do mês informado até dezembro do mesmo ano', () => {
    const slots = buildReplicationSlotsFromStart('2024-03', { contaFixa: true });
    expect(slots.map((s) => s.mes_ano)).toEqual([
      '2024-03', '2024-04', '2024-05', '2024-06', '2024-07', '2024-08',
      '2024-09', '2024-10', '2024-11', '2024-12',
    ]);
    expect(slots.every((s) => s.conta_fixa === true)).toBe(true);
  });

  it('parcelas geram sequência contínua sem depender de cópia mês a mês', () => {
    const slots = buildReplicationSlotsFromStart('2024-03', { parcelaAtual: 1, parcelaTotal: 5 });
    expect(slots).toEqual([
      { mes_ano: '2024-03', conta_fixa: false, parcela_atual: 1, parcela_total: 5 },
      { mes_ano: '2024-04', conta_fixa: false, parcela_atual: 2, parcela_total: 5 },
      { mes_ano: '2024-05', conta_fixa: false, parcela_atual: 3, parcela_total: 5 },
      { mes_ano: '2024-06', conta_fixa: false, parcela_atual: 4, parcela_total: 5 },
      { mes_ano: '2024-07', conta_fixa: false, parcela_atual: 5, parcela_total: 5 },
    ]);
  });

  it('parcelas podem cruzar o ano quando necessário', () => {
    const slots = buildReplicationSlotsFromStart('2024-11', { parcelaAtual: 1, parcelaTotal: 3 });
    expect(slots.map((s) => s.mes_ano)).toEqual(['2024-11', '2024-12', '2025-01']);
    expect(slots.map((s) => s.parcela_atual)).toEqual([1, 2, 3]);
  });

  it('lançamento avulso permanece só no mês informado', () => {
    const slots = buildReplicationSlotsFromStart('2024-05', {});
    expect(slots).toEqual([{
      mes_ano: '2024-05',
      conta_fixa: false,
      parcela_atual: null,
      parcela_total: null,
    }]);
  });
});

describe('seriesDefinitionsFromYearRows + slotsNeededForMonth', () => {
  it('materializa parcela correta no mês alvo a partir da série do ano', () => {
    const rows = [
      {
        descricao: 'Notebook',
        valor: 500,
        conta_fixa: false,
        parcela_atual: 1,
        parcela_total: 4,
        created_at: '2024-02-01T12:00:00.000Z',
      },
    ];
    const series = seriesDefinitionsFromYearRows(rows);
    expect(series).toHaveLength(1);
    expect(slotsNeededForMonth(series[0], '2024-05')).toEqual([{
      mes_ano: '2024-05',
      conta_fixa: false,
      parcela_atual: 4,
      parcela_total: 4,
    }]);
  });

  it('conta fixa aparece em qualquer mês restante do ano', () => {
    const rows = [{
      descricao: 'Aluguel',
      valor: 1200,
      conta_fixa: true,
      parcela_atual: null,
      parcela_total: null,
      created_at: '2024-01-01T12:00:00.000Z',
    }];
    const series = seriesDefinitionsFromYearRows(rows);
    expect(slotsNeededForMonth(series[0], '2024-08')).toEqual([{
      mes_ano: '2024-08',
      conta_fixa: true,
      parcela_atual: null,
      parcela_total: null,
    }]);
  });
});

describe('rowMatchesReplicationSlot', () => {
  it('diferencia parcelas pelo número corrente', () => {
    const slot = { mes_ano: '2024-04', conta_fixa: false, parcela_atual: 2, parcela_total: 5 };
    expect(rowMatchesReplicationSlot({
      descricao: 'TV',
      parcela_atual: 2,
      parcela_total: 5,
    }, slot, 'TV')).toBe(true);
    expect(rowMatchesReplicationSlot({
      descricao: 'TV',
      parcela_atual: 1,
      parcela_total: 5,
    }, slot, 'TV')).toBe(false);
  });
});
