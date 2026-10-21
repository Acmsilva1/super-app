import { describe, expect, it } from 'vitest';

import {
  buildReplicationSlotsFromStart,
  buildInsertPayloadFromSlot,
  seriesDefinitionsFromYearRows,
  slotsNeededForMonth,
  rowMatchesReplicationSlot,
} from '../../features/financeiro/service/despesaFixaReplication.js';

describe('buildReplicationSlotsFromStart', () => {
  it('conta fixa replica do mês informado até dezembro do ano seguinte', () => {
    const slots = buildReplicationSlotsFromStart('2024-03', { contaFixa: true });
    expect(slots[0].mes_ano).toBe('2024-03');
    expect(slots[slots.length - 1].mes_ano).toBe('2025-12');
    expect(slots).toHaveLength(22);
    expect(slots.every((s) => s.conta_fixa === true)).toBe(true);
  });

  it('conta fixa criada no fim do ano atravessa para o ano seguinte', () => {
    const slots = buildReplicationSlotsFromStart('2026-10', { contaFixa: true, serieId: 'serie-aluguel' });
    expect(slots.map((s) => s.mes_ano)).toContain('2026-12');
    expect(slots.map((s) => s.mes_ano)).toContain('2027-01');
    expect(slots.map((s) => s.mes_ano)).toContain('2027-12');
    expect(slots.every((s) => s.serie_id === 'serie-aluguel')).toBe(true);
  });

  it('parcelas geram sequência contínua sem depender de cópia mês a mês', () => {
    const slots = buildReplicationSlotsFromStart('2024-03', { parcelaAtual: 1, parcelaTotal: 5 });
    expect(slots).toEqual([
      { mes_ano: '2024-03', conta_fixa: false, parcela_atual: 1, parcela_total: 5, serie_id: null },
      { mes_ano: '2024-04', conta_fixa: false, parcela_atual: 2, parcela_total: 5, serie_id: null },
      { mes_ano: '2024-05', conta_fixa: false, parcela_atual: 3, parcela_total: 5, serie_id: null },
      { mes_ano: '2024-06', conta_fixa: false, parcela_atual: 4, parcela_total: 5, serie_id: null },
      { mes_ano: '2024-07', conta_fixa: false, parcela_atual: 5, parcela_total: 5, serie_id: null },
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
      serie_id: null,
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
      serie_id: null,
    }]);
  });

  it('conta fixa com serie_id aparece em qualquer mês a partir do início', () => {
    const rows = [{
      descricao: 'Aluguel',
      valor: 1200,
      conta_fixa: true,
      parcela_atual: null,
      parcela_total: null,
      serie_id: 'serie-aluguel',
      created_at: '2024-01-01T12:00:00.000Z',
    }];
    const series = seriesDefinitionsFromYearRows(rows);
    expect(slotsNeededForMonth(series[0], '2024-08')).toEqual([{
      mes_ano: '2024-08',
      conta_fixa: true,
      parcela_atual: null,
      parcela_total: null,
      serie_id: 'serie-aluguel',
    }]);
    expect(slotsNeededForMonth(series[0], '2025-02')).toEqual([{
      mes_ano: '2025-02',
      conta_fixa: true,
      parcela_atual: null,
      parcela_total: null,
      serie_id: 'serie-aluguel',
    }]);
  });

  it('conta fixa sem serie_id não entra na série recorrente', () => {
    const rows = [{
      descricao: 'Aluguel',
      valor: 1200,
      conta_fixa: true,
      created_at: '2024-01-01T12:00:00.000Z',
    }];
    expect(seriesDefinitionsFromYearRows(rows)).toHaveLength(0);
  });

  it('usa nome/valor do mês mais recente da mesma serie_id', () => {
    const rows = [
      {
        descricao: 'Aluguel antigo',
        valor: 1000,
        conta_fixa: true,
        serie_id: 'serie-aluguel',
        created_at: '2024-01-01T12:00:00.000Z',
      },
      {
        descricao: 'Aluguel novo',
        valor: 1200,
        conta_fixa: true,
        serie_id: 'serie-aluguel',
        created_at: '2024-06-01T12:00:00.000Z',
      },
    ];
    const series = seriesDefinitionsFromYearRows(rows);
    expect(series).toHaveLength(1);
    expect(series[0].startMesAno).toBe('2024-01');
    expect(series[0].descricao).toBe('Aluguel novo');
    expect(series[0].valor).toBe(1200);
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

  it('separa séries de nomes idênticos quando possuem serie_id diferentes', () => {
    const rows = [
      {
        descricao: 'Internet',
        valor: 100,
        conta_fixa: true,
        serie_id: 'casa-123',
        created_at: '2024-01-01T12:00:00.000Z',
      },
      {
        descricao: 'Internet',
        valor: 250,
        conta_fixa: true,
        serie_id: 'escritorio-456',
        created_at: '2024-01-01T12:00:00.000Z',
      },
    ];
    const series = seriesDefinitionsFromYearRows(rows);
    expect(series).toHaveLength(2);
    expect(series[0].serieId).toBe('casa-123');
    expect(series[1].serieId).toBe('escritorio-456');

    const slotCasa = { mes_ano: '2024-05', conta_fixa: true, serie_id: 'casa-123' };
    expect(rowMatchesReplicationSlot(rows[0], slotCasa, 'Internet')).toBe(true);
    expect(rowMatchesReplicationSlot(rows[1], slotCasa, 'Internet')).toBe(false);
  });
});
