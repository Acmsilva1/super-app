import { MAPA_CATEGORIAS, LancamentoFinanca } from '../model/lancamento.js';

export function payloadInsert(
  descricao,
  valor,
  tipo,
  categoria = null,
  data_lancamento = null,
  metodo_pagamento = null
) {
  const payload = {
    descricao: (descricao || '').trim(),
    valor: Math.round(Number(valor) * 100) / 100,
    tipo: tipo === 'receita' || tipo === 'despesa' ? tipo : 'despesa',
  };
  if (categoria) payload.categoria = categoria;
  if (data_lancamento) payload.data_lancamento = data_lancamento;
  if (metodo_pagamento) payload.metodo_pagamento = metodo_pagamento;
  return payload;
}

export function payloadUpdate(
  descricao = undefined,
  valor = undefined,
  tipo = undefined,
  categoria = undefined,
  data_lancamento = undefined,
  metodo_pagamento = undefined
) {
  const out = {};
  if (descricao !== undefined) out.descricao = String(descricao).trim();
  if (valor !== undefined) out.valor = Math.round(Number(valor) * 100) / 100;
  if (tipo !== undefined) out.tipo = tipo === 'receita' || tipo === 'despesa' ? tipo : 'despesa';
  if (categoria !== undefined) out.categoria = categoria || null;
  if (data_lancamento !== undefined) out.data_lancamento = data_lancamento || null;
  if (metodo_pagamento !== undefined) out.metodo_pagamento = metodo_pagamento || null;
  return out;
}

function dataParaMesBr(row) {
  const d = row?.data_lancamento ?? row?.created_at;
  if (!d) return null;
  let s = typeof d === 'string' ? d : String(d);
  if (s.includes('T')) s = s.split('T')[0];
  const partes = s.split('-');
  if (partes.length >= 2)
    return partes[0].length === 4 ? `${partes[1]}/${partes[0]}` : `${partes[1]}/${partes[2]}`;
  const partesSlash = s.split('/');
  if (partesSlash.length >= 2)
    return partesSlash[2]?.length === 4 ? `${partesSlash[1]}/${partesSlash[2]}` : s;
  return null;
}

function dataParaDia(row) {
  const d = row?.data_lancamento ?? row?.created_at;
  if (!d) return null;
  const s = typeof d === 'string' ? d : String(d);
  if (s.includes('-')) return s.split('-')[2]?.slice(0, 2) ?? null;
  if (s.includes('/')) return s.split('/')[0] ?? null;
  return null;
}

export function categorizarBi(categoriaOriginal) {
  const catLower = (categoriaOriginal || 'Geral').toLowerCase();
  for (const [macro, subs] of Object.entries(MAPA_CATEGORIAS)) {
    if (subs.some((s) => catLower.includes(s))) return macro;
  }
  return categoriaOriginal || 'Geral';
}

export function processarBi(rows, filtroMes = null, mesAtual = null) {
  if (!mesAtual && filtroMes === 'mes_atual') {
    const now = new Date();
    mesAtual = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  }
  const filtrados = (rows || []).filter((r) => {
    if ((r?.tipo || '').toLowerCase() !== 'despesa') return false;
    const mesItem = dataParaMesBr(r);
    if (filtroMes === 'mes_atual' && mesAtual) return mesItem === mesAtual;
    if (filtroMes && mesItem === filtroMes) return true;
    return false;
  });

  const catAgrupada = {};
  const diaMap = {};
  for (const r of filtrados) {
    const v = Number(r?.valor ?? 0);
    const catOriginal = r?.categoria || 'Geral';
    const catFinal = categorizarBi(catOriginal);
    catAgrupada[catFinal] = (catAgrupada[catFinal] ?? 0) + v;
    const dia = dataParaDia(r);
    if (dia) diaMap[dia] = (diaMap[dia] ?? 0) + v;
  }

  const entradasOrdenadas = Object.entries(catAgrupada).sort((a, b) => b[1] - a[1]);
  const top5Labels = entradasOrdenadas.slice(0, 5).map((x) => x[0]);
  const top5Valores = entradasOrdenadas.slice(0, 5).map((x) => x[1]);
  const outros = entradasOrdenadas.slice(5).reduce((acc, [, v]) => acc + v, 0);
  if (outros > 0) {
    top5Labels.push('Outros');
    top5Valores.push(outros);
  }
  const dias = Object.keys(diaMap).sort((a, b) => Number(a) - Number(b));
  let acc = 0;
  const tendenciaAcumulada = dias.map((d) => (acc += diaMap[d], Math.round(acc * 100) / 100));

  return {
    maiores_gastos: top5Labels.map((l, i) => [l, top5Valores[i]]),
    tabela_gastos: entradasOrdenadas,
    dias,
    tendencia_acumulada: tendenciaAcumulada,
  };
}

export function renderizarExtratoTotais(rows) {
  let totalEntrada = 0;
  let totalSaida = 0;
  for (const r of rows || []) {
    const v = Number(r?.valor ?? 0);
    const t = (r?.tipo || 'despesa').toLowerCase().trim();
    if (t === 'receita') totalEntrada += v;
    else totalSaida += v;
  }
  return {
    receitas: Math.round(totalEntrada * 100) / 100,
    despesas: Math.round(totalSaida * 100) / 100,
    liquido: Math.round((totalEntrada - totalSaida) * 100) / 100,
  };
}

export function parseRowsSupabase(rows) {
  return (rows || []).map((r) => LancamentoFinanca.fromRow(r));
}
