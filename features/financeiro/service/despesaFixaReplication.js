import { parseMesAno } from './financeiroService.js';

/** @param {string} mesAno YYYY-MM */
export function mesAnoFromRow(row) {
  const raw = String(row?.created_at || '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(raw) ? raw : '';
}

function monthIndexFromMesAno(mesAno) {
  const { ano, mes } = parseMesAno(mesAno);
  return ano * 12 + (mes - 1);
}

function mesAnoFromMonthIndex(idx) {
  const ano = Math.floor(idx / 12);
  const mes = (idx % 12) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

function extractBrazilDateTimeParts(dateLike) {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const map = {};
  parts.forEach((p) => { map[p.type] = p.value; });
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/**
 * Gera os meses em que um lançamento deve existir a partir do mês de criação.
 * - conta fixa: do mês informado até dezembro do mesmo ano
 * - parcelas: sequência contínua de parcela_atual até parcela_total (pode cruzar anos)
 * - demais: apenas o mês informado
 *
 * @param {string} mesAno
 * @param {{ contaFixa?: boolean, parcelaAtual?: number|null, parcelaTotal?: number|null }} options
 */
export function buildReplicationSlotsFromStart(mesAno, options = {}) {
  const { contaFixa = false, parcelaAtual = null, parcelaTotal = null } = options;
  const { ano, mes } = parseMesAno(mesAno);
  const startMesAno = `${ano}-${String(mes).padStart(2, '0')}`;

  if (contaFixa) {
    const slots = [];
    for (let m = mes; m <= 12; m += 1) {
      slots.push({
        mes_ano: `${ano}-${String(m).padStart(2, '0')}`,
        conta_fixa: true,
        parcela_atual: null,
        parcela_total: null,
      });
    }
    return slots;
  }

  const pa = Number(parcelaAtual);
  const pt = Number(parcelaTotal);
  if (Number.isFinite(pa) && Number.isFinite(pt) && pa >= 1 && pt >= pa) {
    const startIdx = monthIndexFromMesAno(startMesAno);
    const slots = [];
    for (let i = 0; pa + i <= pt; i += 1) {
      slots.push({
        mes_ano: mesAnoFromMonthIndex(startIdx + i),
        conta_fixa: false,
        parcela_atual: pa + i,
        parcela_total: pt,
      });
    }
    return slots;
  }

  return [{
    mes_ano: startMesAno,
    conta_fixa: false,
    parcela_atual: null,
    parcela_total: null,
  }];
}

/**
 * Agrupa lançamentos recorrentes do ano em séries (conta fixa ou parcelas).
 * @param {Array<Record<string, unknown>>} rows
 */
export function seriesDefinitionsFromYearRows(rows = []) {
  /** @type {Map<string, { type: 'conta_fixa'|'parcelas', descricao: string, valor: number, startMesAno: string, startCreatedAt?: string, parcelaAtual?: number, parcelaTotal?: number }>} */
  const series = new Map();

  for (const row of rows) {
    const startMesAno = mesAnoFromRow(row);
    if (!startMesAno) continue;

    const descricao = String(row.descricao || '').trim();
    const descNorm = descricao.toLowerCase();
    if (!descNorm) continue;

    const valor = Number(row.valor || 0);
    const isContaFixa = row.conta_fixa === true || row.conta_fixa === 'true';
    const pt = Number(row.parcela_total);
    const pa = Number(row.parcela_atual);

    if (isContaFixa) {
      const key = `cf:${descNorm}`;
      const existing = series.get(key);
      if (!existing || startMesAno < existing.startMesAno) {
        series.set(key, { type: 'conta_fixa', descricao, valor, startMesAno, startCreatedAt: String(row?.created_at || '') });
      }
      continue;
    }

    if (Number.isFinite(pt) && Number.isFinite(pa) && pt >= 1 && pa >= 1) {
      const key = `par:${descNorm}:${pt}`;
      const existing = series.get(key);
      if (
        !existing
        || pa < existing.parcelaAtual
        || (pa === existing.parcelaAtual && startMesAno < existing.startMesAno)
      ) {
        series.set(key, {
          type: 'parcelas',
          descricao,
          valor,
          startMesAno,
          startCreatedAt: String(row?.created_at || ''),
          parcelaAtual: pa,
          parcelaTotal: pt,
        });
      }
    }
  }

  return [...series.values()];
}

/** @param {ReturnType<typeof seriesDefinitionsFromYearRows>[number]} series */
export function slotsForSeries(series) {
  return buildReplicationSlotsFromStart(series.startMesAno, {
    contaFixa: series.type === 'conta_fixa',
    parcelaAtual: series.parcelaAtual ?? null,
    parcelaTotal: series.parcelaTotal ?? null,
  });
}

/** @param {ReturnType<typeof seriesDefinitionsFromYearRows>[number]} series @param {string} targetMesAno */
export function slotsNeededForMonth(series, targetMesAno) {
  return slotsForSeries(series).filter((slot) => slot.mes_ano === targetMesAno);
}

export function rowMatchesReplicationSlot(row, slot, descricao) {
  const descNorm = String(descricao || '').trim().toLowerCase();
  if (String(row?.descricao || '').trim().toLowerCase() !== descNorm) return false;

  if (slot.conta_fixa) {
    return row?.conta_fixa === true || row?.conta_fixa === 'true';
  }

  if (slot.parcela_atual != null && slot.parcela_total != null) {
    return Number(row?.parcela_atual) === slot.parcela_atual
      && Number(row?.parcela_total) === slot.parcela_total;
  }

  return true;
}

export function createdAtForMesAno(mesAno, templateCreatedAt = null) {
  const { ano, mes } = parseMesAno(mesAno);
  const template = extractBrazilDateTimeParts(templateCreatedAt);
  if (template) {
    const maxDay = new Date(ano, mes, 0).getDate();
    const day = Math.min(template.day || 1, maxDay);
    return new Date(Date.UTC(
      ano,
      mes - 1,
      day,
      (template.hour || 0) + 3,
      template.minute || 0,
      template.second || 0,
      0,
    )).toISOString();
  }
  return new Date(ano, mes - 1, 1, 12, 0, 0, 0).toISOString();
}

export function buildInsertPayloadFromSlot(series, slot, status = 'pendente') {
  return {
    descricao: series.descricao,
    valor: series.valor,
    status,
    conta_fixa: slot.conta_fixa === true,
    parcela_atual: slot.parcela_atual,
    parcela_total: slot.parcela_total,
    created_at: createdAtForMesAno(slot.mes_ano, series.startCreatedAt || null),
  };
}
