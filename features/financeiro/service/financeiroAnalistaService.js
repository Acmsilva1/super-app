import {
  calcularDashboard,
  getBrazilTodayIso,
  parseMesAno,
} from './financeiroService.js';

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeCategory(value) {
  const raw = String(value || 'Sem categoria').trim();
  return raw || 'Sem categoria';
}

function groupByCategory(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const categoria = normalizeCategory(row?.categoria);
    map.set(categoria, round2((map.get(categoria) || 0) + safeNumber(row?.valor)));
  }
  return [...map.entries()]
    .map(([categoria, valor]) => ({ categoria, valor: round2(valor) }))
    .sort((a, b) => b.valor - a.valor);
}

function average(values) {
  if (!values.length) return 0;
  return round2(values.reduce((acc, value) => acc + value, 0) / values.length);
}

function coefficientOfVariation(values) {
  if (!values || values.length < 2) return 0;
  const avg = average(values);
  if (!avg) return 0;
  const variance = average(values.map((value) => (value - avg) ** 2));
  return round2(Math.sqrt(variance) / Math.abs(avg));
}

function buildSignal(tipo, titulo, descricao, meta = {}) {
  return {
    tipo,
    titulo,
    descricao,
    ...meta,
  };
}

function monthLabel(ano, mes) {
  return `${ano}-${String(mes).padStart(2, '0')}`;
}

function monthsElapsedInYear(mes) {
  return Math.max(1, Math.min(12, Number(mes) || 1));
}

function projectMonth(total, diasDecorridos, diasNoMes) {
  if (!(diasDecorridos > 0) || !(diasNoMes > 0)) return 0;
  return round2((safeNumber(total) / diasDecorridos) * diasNoMes);
}

function formatPct(value) {
  return `${round2(value * 100).toFixed(1)}%`;
}

function baseFinanceiroPesos() {
  return {
    saldo_negativo: 0.28,
    despesas_fixas: 0.18,
    despesas_variaveis: 0.16,
    concentracao_gasto: 0.14,
    desvio_receita: 0.12,
    desvio_despesa: 0.1,
    ritmo_diario: 0.08,
    estabilidade: 0.04,
  };
}

export function defaultFinanceiroPesos() {
  return normalizarFinanceiroPesos(baseFinanceiroPesos());
}

export function normalizarFinanceiroPesos(weights = {}) {
  const allowedKeys = Object.keys(baseFinanceiroPesos());
  const merged = {
    ...baseFinanceiroPesos(),
    ...weights,
  };
  const cleaned = {};
  let sum = 0;
  for (const key of allowedKeys) {
    const value = merged[key];
    const safe = clamp(Number(value) || 0, 0.01, 0.5);
    cleaned[key] = safe;
    sum += safe;
  }
  if (!(sum > 0)) return defaultFinanceiroPesos();
  for (const key of Object.keys(cleaned)) {
    cleaned[key] = round2(cleaned[key] / sum);
  }
  return cleaned;
}

export function extrairFinanceiroFeatures({
  resumo_mensal = {},
  resumo_anual = {},
  projecao = {},
  top_category = null,
} = {}) {
  const topCategoriaValor = safeNumber(top_category?.valor);
  const despesasTotais = safeNumber(resumo_mensal?.despesas_totais);
  const topCategoriaPct = despesasTotais > 0 ? round2((topCategoriaValor / despesasTotais) * 100) : 0;
  return {
    receitas: safeNumber(resumo_mensal?.receitas),
    despesas_fixas: safeNumber(resumo_mensal?.despesas_fixas),
    despesas_variadas: safeNumber(resumo_mensal?.despesas_variadas),
    despesas_totais: despesasTotais,
    saldo: safeNumber(resumo_mensal?.saldo),
    fixas_ratio_receitas: safeNumber(resumo_mensal?.fixas_ratio_receitas),
    variaveis_ratio_receitas: safeNumber(resumo_mensal?.variaveis_ratio_receitas),
    receitas_medias_ano: safeNumber(resumo_anual?.media_receitas_mensais),
    despesas_medias_ano: safeNumber(resumo_anual?.media_despesas_mensais),
    saldo_medio_ano: safeNumber(resumo_anual?.media_saldo_mensal),
    dias_decorridos: safeNumber(projecao?.dias_decorridos),
    dias_no_mes: safeNumber(projecao?.dias_no_mes),
    ritmo_receitas_diario: safeNumber(projecao?.ritmo_receitas_diario),
    ritmo_despesas_diario: safeNumber(projecao?.ritmo_despesas_diario),
    ritmo_saldo_diario: safeNumber(projecao?.ritmo_saldo_diario),
    receitas_projetadas: safeNumber(projecao?.receitas_projetadas),
    despesas_projetadas: safeNumber(projecao?.despesas_projetadas),
    saldo_projetado: safeNumber(projecao?.saldo_projetado),
    top_categoria_valor: topCategoriaValor,
    top_categoria_pct: topCategoriaPct,
    concentracao_top3_pct: round2((resumo_mensal?.top_categorias || []).slice(0, 3).reduce((acc, item) => acc + safeNumber(item?.valor), 0) / Math.max(1, despesasTotais) * 100),
  };
}

export function construirFinanceiroFeedback({ previousState = null, features = {} } = {}) {
  const previousProjectedSaldo = safeNumber(previousState?.saldo_projetado ?? previousState?.projecao?.saldo_projetado);
  const previousProjectedReceitas = safeNumber(previousState?.receitas_projetadas ?? previousState?.projecao?.receitas_projetadas);
  const previousProjectedDespesas = safeNumber(previousState?.despesas_projetadas ?? previousState?.projecao?.despesas_projetadas);
  const actualSaldo = safeNumber(features?.saldo);
  const actualReceitas = safeNumber(features?.receitas);
  const actualDespesas = safeNumber(features?.despesas_totais);
  const saldoErro = round2(actualSaldo - previousProjectedSaldo);
  const saldoErroPct = previousProjectedSaldo !== 0 ? round2((saldoErro / Math.abs(previousProjectedSaldo)) * 100) : 0;
  const receitaErro = round2(actualReceitas - previousProjectedReceitas);
  const despesaErro = round2(actualDespesas - previousProjectedDespesas);
  const direcao = saldoErro >= 0 ? 'melhor_que_previsto' : 'pior_que_previsto';
  return {
    tem_feedback: Boolean(previousState),
    direcao,
    saldo_erro: saldoErro,
    saldo_erro_pct: saldoErroPct,
    receita_erro: receitaErro,
    despesa_erro: despesaErro,
    projected: {
      saldo: previousProjectedSaldo,
      receitas: previousProjectedReceitas,
      despesas: previousProjectedDespesas,
    },
    actual: {
      saldo: actualSaldo,
      receitas: actualReceitas,
      despesas: actualDespesas,
    },
  };
}

export function ajustarFinanceiroPesos(baseWeights = defaultFinanceiroPesos(), feedback = null, features = {}) {
  const next = { ...normalizarFinanceiroPesos(baseWeights) };
  const motivos = [];
  const lr = 0.08;
  const saldoErroPct = safeNumber(feedback?.saldo_erro_pct) / 100;
  const fixasRatio = safeNumber(features?.fixas_ratio_receitas) / 100;
  const variaveisRatio = safeNumber(features?.variaveis_ratio_receitas) / 100;
  const concentracao = safeNumber(features?.top_categoria_pct) / 100;
  const desvioReceita = features?.receitas_medias_ano > 0
    ? clamp(Math.abs(safeNumber(features?.receitas) - safeNumber(features?.receitas_medias_ano)) / Math.max(1, safeNumber(features?.receitas_medias_ano)), 0, 1)
    : 0;
  const desvioDespesa = features?.despesas_medias_ano > 0
    ? clamp(Math.abs(safeNumber(features?.despesas_totais) - safeNumber(features?.despesas_medias_ano)) / Math.max(1, safeNumber(features?.despesas_medias_ano)), 0, 1)
    : 0;
  const ritmoPressao = safeNumber(features?.saldo_projetado) < 0 ? 1 : clamp(Math.abs(safeNumber(features?.ritmo_saldo_diario)) / Math.max(1, Math.abs(safeNumber(features?.receitas) / Math.max(1, safeNumber(features?.dias_decorridos) || 1))), 0, 1);

  const strengthen = (key, amount, reason) => {
    next[key] = clamp(safeNumber(next[key]) + amount, 0.01, 0.5);
    motivos.push(reason);
  };

  const weaken = (key, amount, reason) => {
    next[key] = clamp(safeNumber(next[key]) - amount, 0.01, 0.5);
    motivos.push(reason);
  };

  if (feedback?.tem_feedback) {
    if (saldoErroPct < -0.05) {
      strengthen('saldo_negativo', lr * Math.abs(saldoErroPct), 'Saldo real pior que a previsao anterior');
      strengthen('despesas_fixas', lr * Math.abs(saldoErroPct) * 0.6, 'Aumentar peso das despesas fixas');
      strengthen('despesas_variaveis', lr * Math.abs(saldoErroPct) * 0.6, 'Aumentar peso das despesas variaveis');
      strengthen('concentracao_gasto', lr * Math.abs(saldoErroPct) * 0.5, 'Aumentar peso de concentracao de gasto');
      weaken('desvio_receita', lr * Math.abs(saldoErroPct) * 0.35, 'Reduzir excesso de otimismo em receita');
    } else if (saldoErroPct > 0.05) {
      strengthen('desvio_receita', lr * Math.abs(saldoErroPct) * 0.5, 'Receita real ficou acima da previsao');
      weaken('saldo_negativo', lr * Math.abs(saldoErroPct) * 0.25, 'Reduzir cautela excessiva');
    }

    if (safeNumber(feedback?.despesa_erro) > 0) {
      strengthen('despesas_fixas', lr * clamp(Math.abs(feedback.despesa_erro) / Math.max(1, safeNumber(feedback?.projected?.despesas)), 0, 1), 'Despesas vieram acima do previsto');
    }

    if (safeNumber(feedback?.receita_erro) < 0) {
      strengthen('desvio_receita', lr * clamp(Math.abs(feedback.receita_erro) / Math.max(1, safeNumber(feedback?.projected?.receitas)), 0, 1), 'Receita real veio abaixo do previsto');
    }
  }

  if (fixasRatio >= 0.5) strengthen('despesas_fixas', lr * fixasRatio * 0.5, 'Peso alto de despesas fixas no mes');
  if (variaveisRatio >= 0.35) strengthen('despesas_variaveis', lr * variaveisRatio * 0.4, 'Peso alto de despesas variaveis no mes');
  if (concentracao >= 0.35) strengthen('concentracao_gasto', lr * concentracao * 0.5, 'Concentracao alta em uma categoria');
  if (desvioReceita >= 0.2) strengthen('desvio_receita', lr * desvioReceita * 0.4, 'Receita muito distante da media anual');
  if (desvioDespesa >= 0.2) strengthen('desvio_despesa', lr * desvioDespesa * 0.4, 'Despesa muito distante da media anual');
  if (ritmoPressao >= 0.5) strengthen('ritmo_diario', lr * ritmoPressao * 0.45, 'Ritmo diario pressionando o fechamento');

  next.estabilidade = clamp(safeNumber(next.estabilidade) + (feedback?.tem_feedback ? (saldoErroPct > 0 ? 0.01 : 0.015) : 0.02), 0.01, 0.2);
  const normalized = normalizarFinanceiroPesos(next);
  normalized.ajuste_motivos = motivos;
  return normalized;
}

export function calcularFinanceiroRiscoScore(features = {}, pesos = defaultFinanceiroPesos()) {
  const w = normalizarFinanceiroPesos(pesos);
  const receita = Math.max(1, safeNumber(features?.receitas));
  const saldoAtual = safeNumber(features?.saldo);
  const saldoProjetado = safeNumber(features?.saldo_projetado);
  const fixas = clamp(safeNumber(features?.fixas_ratio_receitas) / 100, 0, 1);
  const variaveis = clamp(safeNumber(features?.variaveis_ratio_receitas) / 100, 0, 1);
  const concentracao = clamp(safeNumber(features?.top_categoria_pct) / 100, 0, 1);
  const desvioReceita = features?.receitas_medias_ano > 0
    ? clamp(Math.abs(safeNumber(features?.receitas) - safeNumber(features?.receitas_medias_ano)) / Math.max(1, safeNumber(features?.receitas_medias_ano)), 0, 1)
    : 0.2;
  const desvioDespesa = features?.despesas_medias_ano > 0
    ? clamp(Math.abs(safeNumber(features?.despesas_totais) - safeNumber(features?.despesas_medias_ano)) / Math.max(1, safeNumber(features?.despesas_medias_ano)), 0, 1)
    : 0.2;
  const ritmo = clamp(Math.abs(safeNumber(features?.ritmo_saldo_diario)) / Math.max(1, receita / Math.max(1, safeNumber(features?.dias_decorridos) || 1)), 0, 1);
  const saldoNegativo = saldoAtual < 0 ? clamp(Math.abs(saldoAtual) / receita, 0, 1) : saldoProjetado < 0 ? clamp(Math.abs(saldoProjetado) / receita, 0, 1) : 0;
  const score = round2(
    saldoNegativo * w.saldo_negativo
    + fixas * w.despesas_fixas
    + variaveis * w.despesas_variaveis
    + concentracao * w.concentracao_gasto
    + desvioReceita * w.desvio_receita
    + desvioDespesa * w.desvio_despesa
    + ritmo * w.ritmo_diario
    + (1 - clamp(features?.saldo ? (Math.max(0, safeNumber(features?.saldo)) / receita) : 0, 0, 1)) * w.estabilidade
  ) * 100;
  const normalized = clamp(score, 0, 100);
  const riscoClassificado = normalized >= 75 ? 'critico' : normalized >= 55 ? 'alto' : normalized >= 30 ? 'medio' : 'baixo';
  return {
    score: round2(normalized),
    classificado: riscoClassificado,
  };
}

function calcularOscilacaoHistorica(historico = []) {
  const receitas = historico.map((item) => safeNumber(item?.receitas_total ?? item?.payload?.resumo_mensal?.receitas));
  const despesas = historico.map((item) => safeNumber(item?.despesas_totais ?? item?.payload?.resumo_mensal?.despesas_totais));
  const saldos = historico.map((item) => safeNumber(item?.saldo_real ?? item?.payload?.resumo_mensal?.saldo));
  return {
    coef_receitas: coefficientOfVariation(receitas),
    coef_despesas: coefficientOfVariation(despesas),
    coef_saldos: coefficientOfVariation(saldos),
    meses: historico.length,
  };
}

function identificarPossiveisErros({ features, projection, historico = [], previousState = null } = {}) {
  const errors = [];
  const meses = historico.length;
  const dias = safeNumber(projection?.dias_decorridos);
  const diasNoMes = safeNumber(projection?.dias_no_mes);
  const fixas = safeNumber(features?.fixas_ratio_receitas) / 100;
  const saldoProjetado = safeNumber(features?.saldo_projetado);
  const concentracao = safeNumber(features?.top_categoria_pct) / 100;
  const oscilacao = calcularOscilacaoHistorica(historico);
  const temBaseFraca = meses < 3;
  const receitasMes = safeNumber(features?.receitas);
  const despesasMes = safeNumber(features?.despesas_totais);

  if (temBaseFraca) {
    errors.push({
      tipo: 'base_fraca',
      severidade: 'media',
      titulo: 'Pouco histórico para aprender',
      descricao: 'Com menos de 3 meses de base, o ajuste de pesos ainda tende a oscilar.',
    });
  }

  if (!(receitasMes > 0) && !(despesasMes > 0)) {
    errors.push({
      tipo: 'dados_vazios',
      severidade: 'alta',
      titulo: 'Dados insuficientes para analisar',
      descricao: 'Sem receita e despesa registradas, o modelo não consegue separar ruído de comportamento financeiro.',
    });
  }

  if (meses < 6) {
    errors.push({
      tipo: 'janela_curta',
      severidade: 'media',
      titulo: 'Janela histórica curta',
      descricao: 'O histórico ainda é pequeno para confirmar tendência anual com segurança.',
    });
  }

  if (dias < 7 && projection?.ativa) {
    errors.push({
      tipo: 'amostra_curta',
      severidade: 'media',
      titulo: 'Amostra diária curta',
      descricao: 'A projeção pode ficar instável com poucos dias do mês processados.',
    });
  }

  if (fixas >= 0.55) {
    errors.push({
      tipo: 'despesa_fixa_alta',
      severidade: 'alta',
      titulo: 'Despesas fixas muito pesadas',
      descricao: 'A interpretação do mês pode exagerar o risco porque a base fixa consome grande parte da receita.',
    });
  }

  if (concentracao >= 0.45) {
    errors.push({
      tipo: 'concentracao_alta',
      severidade: 'media',
      titulo: 'Concentração alta em uma categoria',
      descricao: 'Uma única categoria domina a leitura do mês e pode distorcer a análise geral.',
    });
  }

  if (oscilacao.coef_saldos >= 0.35 || oscilacao.coef_despesas >= 0.35) {
    errors.push({
      tipo: 'oscilacao_alta',
      severidade: 'alta',
      titulo: 'Oscilação mensal elevada',
      descricao: 'Os últimos meses variam muito; o motor pode confundir sazonalidade com mudança estrutural.',
    });
  }

  if (previousState && Math.abs(safeNumber(previousState.saldo_projetado) - saldoProjetado) > Math.abs(safeNumber(previousState.saldo_projetado)) * 0.35) {
    errors.push({
      tipo: 'erro_previsao',
      severidade: 'alta',
      titulo: 'Erro de projeção relevante',
      descricao: 'O desvio entre projeção anterior e resultado atual foi alto o suficiente para recalibrar os pesos.',
    });
  }

  if (previousState && Math.abs(safeNumber(previousState.receitas_reais) - receitasMes) > Math.max(1, safeNumber(previousState.receitas_reais)) * 0.4) {
    errors.push({
      tipo: 'receita_volatil',
      severidade: 'media',
      titulo: 'Receita muito volátil',
      descricao: 'A queda ou alta brusca de receita pode ser evento pontual, não tendência estrutural.',
    });
  }

  if (saldoProjetado < 0 && safeNumber(features?.saldo) >= 0) {
    errors.push({
      tipo: 'falso_alerta',
      severidade: 'baixa',
      titulo: 'Projeção negativa evitada no fechamento',
      descricao: 'O mês pode parecer agressivo no meio do ciclo, mas ainda pode fechar positivo.',
    });
  }

  if (diasNoMes >= 1 && dias < Math.max(3, Math.round(diasNoMes * 0.15))) {
    errors.push({
      tipo: 'fase_inicial',
      severidade: 'baixa',
      titulo: 'Mês ainda muito no início',
      descricao: 'As leituras do começo do mês podem exagerar risco e projeção por falta de amostra.',
    });
  }

  return errors;
}

function calcularNivelAprendizado({ historico = [], feedback = null, adaptiveWeights = null } = {}) {
  const ciclos = historico.length;
  const coverage = clamp(ciclos / 12, 0, 1);
  const errorQuality = feedback?.tem_feedback ? clamp(1 - Math.min(1, Math.abs(safeNumber(feedback?.saldo_erro_pct)) / 0.75), 0, 1) : 0.35;
  const adaptation = adaptiveWeights?.ajuste_motivos ? clamp(adaptiveWeights.ajuste_motivos.length / 8, 0, 1) : 0.2;
  const percent = round2((coverage * 0.45 + errorQuality * 0.35 + adaptation * 0.2) * 100);
  return {
    percentual: clamp(percent, 0, 100),
    ciclos_processados: ciclos,
    cobertura: coverage,
    qualidade_erro: errorQuality,
    adaptacao: adaptation,
  };
}

function buildBucketSignals({
  month,
  year,
  projection,
  topCategory,
  totalReceitasMes,
  totalDespesasMes,
  totalReceitasAno,
  totalDespesasAno,
  totalDespesasFixasMes,
  pesos = defaultFinanceiroPesos(),
  riskScore = null,
}) {
  const signals = [];
  const saldoMes = round2(totalReceitasMes - totalDespesasMes);
  const saldoAno = round2(totalReceitasAno - totalDespesasAno);
  const fixasRatio = totalReceitasMes > 0 ? totalDespesasFixasMes / totalReceitasMes : 0;
  const projectionSaldo = projection?.saldo_projetado ?? null;
  const projectionDespesa = projection?.despesas_projetadas ?? null;
  const projectionReceita = projection?.receitas_projetadas ?? null;

  if (saldoMes < 0) {
    signals.push(buildSignal(
      'critico',
      'Mes no vermelho',
      `O mes fecha com saldo negativo de ${saldoMes.toFixed(2)}.`,
      { valor: saldoMes, peso: round2(pesos.saldo_negativo * 100) }
    ));
  }

  if (projection?.ativa && projectionSaldo !== null && projectionSaldo < 0) {
    signals.push(buildSignal(
      'critico',
      'Projecao negativa',
      `Mantido o ritmo atual, a projecao aponta saldo final de ${projectionSaldo.toFixed(2)}.`,
      { valor: projectionSaldo, peso: round2(pesos.ritmo_diario * 100) }
    ));
  }

  if (fixasRatio >= 50) {
    signals.push(buildSignal(
      'alerta',
      'Peso alto de despesas fixas',
      `As despesas fixas consomem ${(fixasRatio * 100).toFixed(1)}% das receitas do mes.`,
      { percentual: round2(fixasRatio * 100), peso: round2(pesos.despesas_fixas * 100) }
    ));
  }

  if (topCategory?.valor > 0 && totalDespesasMes > 0 && topCategory.valor / totalDespesasMes >= 0.35) {
    signals.push(buildSignal(
      'alerta',
      'Concentracao de gasto',
      `A categoria ${topCategory.categoria} responde por ${(topCategory.valor / totalDespesasMes * 100).toFixed(1)}% das despesas variaveis do mes.`,
      { categoria: topCategory.categoria, percentual: round2(topCategory.valor / totalDespesasMes * 100), peso: round2(pesos.concentracao_gasto * 100) }
    ));
  }

  if (year?.media_receitas_mensais > 0 && month?.receitas < year.media_receitas_mensais * 0.9) {
    signals.push(buildSignal(
      'observacao',
      'Receita abaixo da media',
      'A receita do mes esta abaixo da media mensal do ano ate agora.',
      { valor: month?.receitas, peso: round2(pesos.desvio_receita * 100) }
    ));
  }

  if (year?.media_despesas_mensais > 0 && month?.despesas_totais > year.media_despesas_mensais * 1.15) {
    signals.push(buildSignal(
      'observacao',
      'Despesa acima da media',
      'As despesas do mes estao acima da media mensal do ano ate agora.',
      { valor: month?.despesas_totais, peso: round2(pesos.desvio_despesa * 100) }
    ));
  }

  if (saldoAno < 0) {
    signals.push(buildSignal(
      'critico',
      'Ano acumulado pressionado',
      `No acumulado do ano, as despesas ja superam as receitas em ${Math.abs(saldoAno).toFixed(2)}.`,
      { valor: saldoAno, peso: round2(pesos.estabilidade * 100) }
    ));
  }

  if (projection?.ativa && projectionReceita !== null && projectionDespesa !== null && projectionReceita < projectionDespesa) {
    signals.push(buildSignal(
      'alerta',
      'Ritmo mensal apertado',
      'A velocidade de entrada de dinheiro esta abaixo do ritmo de saida previsto.',
      { receita: projectionReceita, despesa: projectionDespesa, peso: round2(pesos.ritmo_diario * 100) }
    ));
  }

  if (riskScore !== null) {
    signals.push(buildSignal(
      'observacao',
      'Score adaptativo',
      `O motor ajustou o risco do mes para ${riskScore.score.toFixed(1)} (${riskScore.classificado}).`,
      { score: riskScore.score, classe: riskScore.classificado, peso: round2(100 * Math.max(pesos.saldo_negativo, pesos.estabilidade)) }
    ));
  }

  return signals;
}

export function buildFinanceiroAnalise({
  mesAno = getBrazilTodayIso().slice(0, 7),
  receitasMes = [],
  gastosMes = [],
  despesasFixasMes = [],
  receitasAno = [],
  gastosAno = [],
  despesasFixasAno = [],
  historico = [],
  todayIso = getBrazilTodayIso(),
  pesos = defaultFinanceiroPesos(),
  previousState = null,
} = {}) {
  const { ano, mes } = parseMesAno(mesAno);
  const monthKey = monthLabel(ano, mes);
  const diasNoMes = new Date(ano, mes, 0).getDate();
  const todayKey = String(todayIso || getBrazilTodayIso()).slice(0, 7);
  const isCurrentMonth = todayKey === monthKey;
  const diaReferencia = isCurrentMonth ? Math.max(1, Math.min(diasNoMes, Number(String(todayIso).slice(8, 10)) || 1)) : diasNoMes;
  const diasDecorridos = Math.max(1, diaReferencia);

  const monthDashboard = calcularDashboard({
    receitasRows: receitasMes,
    gastosRows: gastosMes,
    despesasFixasRows: despesasFixasMes,
  });
  const yearDashboard = calcularDashboard({
    receitasRows: receitasAno,
    gastosRows: gastosAno,
    despesasFixasRows: despesasFixasAno,
  });

  const monthGrossExpenses = round2(monthDashboard.despesas_fixas + monthDashboard.despesas_variadas);
  const yearGrossExpenses = round2(yearDashboard.despesas_fixas + yearDashboard.despesas_variadas);
  const monthsElapsed = monthsElapsedInYear(mes);
  const avgReceitasMensais = round2(yearDashboard.receitas / monthsElapsed);
  const avgDespesasMensais = round2(yearGrossExpenses / monthsElapsed);
  const avgSaldoMensal = round2(yearDashboard.liquido / monthsElapsed);
  const dailyReceitas = round2(monthDashboard.receitas / diasDecorridos);
  const dailyDespesas = round2(monthGrossExpenses / diasDecorridos);
  const dailySaldo = round2(dailyReceitas - dailyDespesas);
  const projectedReceitas = isCurrentMonth || diaReferencia > 0 ? projectMonth(monthDashboard.receitas, diasDecorridos, diasNoMes) : null;
  const projectedDespesas = isCurrentMonth || diaReferencia > 0 ? projectMonth(monthGrossExpenses, diasDecorridos, diasNoMes) : null;
  const projectedSaldo = projectedReceitas !== null && projectedDespesas !== null
    ? round2(projectedReceitas - projectedDespesas)
    : null;

  const monthCategoryTotals = groupByCategory(gastosMes);
  const topCategory = monthCategoryTotals[0] || null;
  const topCategories = monthCategoryTotals.slice(0, 3);
  const receitasMonth = monthDashboard.receitas;
  const despesasMonth = monthGrossExpenses;
  const saldoMonth = round2(receitasMonth - despesasMonth);
  const fixasRatio = receitasMonth > 0 ? round2((monthDashboard.despesas_fixas / receitasMonth) * 100) : 0;
  const variaveisRatio = receitasMonth > 0 ? round2((monthDashboard.despesas_variadas / receitasMonth) * 100) : 0;

  const monthSummary = {
    receitas: receitasMonth,
    despesas_fixas: monthDashboard.despesas_fixas,
    despesas_variadas: monthDashboard.despesas_variadas,
    despesas_totais: despesasMonth,
    saldo: saldoMonth,
    fixas_ratio_receitas: fixasRatio,
    variaveis_ratio_receitas: variaveisRatio,
    top_categorias: topCategories,
  };

  const yearSummary = {
    receitas: yearDashboard.receitas,
    despesas_fixas: yearDashboard.despesas_fixas,
    despesas_variadas: yearDashboard.despesas_variadas,
    despesas_totais: yearGrossExpenses,
    saldo: yearDashboard.liquido,
    media_receitas_mensais: avgReceitasMensais,
    media_despesas_mensais: avgDespesasMensais,
    media_saldo_mensal: avgSaldoMensal,
  };

  const projection = {
    ativa: isCurrentMonth,
    dias_decorridos: diasDecorridos,
    dias_no_mes: diasNoMes,
    ritmo_receitas_diario: dailyReceitas,
    ritmo_despesas_diario: dailyDespesas,
    ritmo_saldo_diario: dailySaldo,
    receitas_projetadas: projectedReceitas,
    despesas_projetadas: projectedDespesas,
    saldo_projetado: projectedSaldo,
  };

  const features = extrairFinanceiroFeatures({
    resumo_mensal: monthSummary,
    resumo_anual: yearSummary,
    projecao: projection,
    top_category: topCategory,
  });
  const feedback = construirFinanceiroFeedback({ previousState, features });
  const adaptiveWeights = ajustarFinanceiroPesos(pesos, feedback, features);
  const riskScore = calcularFinanceiroRiscoScore(features, adaptiveWeights);
  const oscilacaoHistorica = calcularOscilacaoHistorica(historico);
  const nivelAprendizado = calcularNivelAprendizado({ historico, feedback, adaptiveWeights });
  const possiveisErros = identificarPossiveisErros({
    features,
    projection,
    historico,
    previousState,
  });
  const monthVsYear = {
    receita_vs_media_ano_pct: yearSummary.media_receitas_mensais > 0 ? round2(((monthSummary.receitas - yearSummary.media_receitas_mensais) / yearSummary.media_receitas_mensais) * 100) : 0,
    despesa_vs_media_ano_pct: yearSummary.media_despesas_mensais > 0 ? round2(((monthSummary.despesas_totais - yearSummary.media_despesas_mensais) / yearSummary.media_despesas_mensais) * 100) : 0,
    saldo_vs_media_ano_pct: yearSummary.media_saldo_mensal !== 0 ? round2(((monthSummary.saldo - yearSummary.media_saldo_mensal) / Math.abs(yearSummary.media_saldo_mensal)) * 100) : 0,
  };
  const alivioMotivo = monthSummary.saldo >= 0
    ? (monthSummary.despesas_fixas <= yearSummary.media_despesas_mensais ? 'despesas_fixas_controladas' : 'receita_compensou')
    : 'sem_alivio';
  const signals = buildBucketSignals({
    month: monthSummary,
    year: yearSummary,
    projection,
    topCategory,
    totalReceitasMes: receitasMonth,
    totalDespesasMes: despesasMonth,
    totalReceitasAno: yearDashboard.receitas,
    totalDespesasAno: yearGrossExpenses,
    totalDespesasFixasMes: monthDashboard.despesas_fixas,
    pesos: adaptiveWeights,
    riskScore,
  });

  const recommendations = [];
  if (projection.saldo_projetado !== null && projection.saldo_projetado < 0) {
    recommendations.push('Reduza primeiro as categorias variaveis que concentram mais valor.');
  }
  if (fixasRatio >= 50) {
    recommendations.push('Reavalie contratos e assinaturas para aliviar o peso fixo do mes.');
  }
  if (topCategory?.categoria) {
    recommendations.push(`Revise a categoria ${topCategory.categoria} e defina um teto semanal.`);
  }
  if (!recommendations.length) {
    recommendations.push('Mantenha o ritmo atual e acompanhe a projecao ate o fechamento do mes.');
  }

  return {
    periodo: {
      mes_ano: monthKey,
      ano,
      mes,
      dias_no_mes: diasNoMes,
      dias_decorridos: diasDecorridos,
      referencia: isCurrentMonth ? 'mes_em_andamento' : 'mes_fechado',
    },
    resumo_mensal: monthSummary,
    resumo_anual: yearSummary,
    projecao: projection,
    comparativos: {
      mes_vs_ano: monthVsYear,
      oscilacao_historica: oscilacaoHistorica,
      alivio_motivo: alivioMotivo,
      media_ultimos_ciclos: {
        receitas: average(historico.map((item) => safeNumber(item?.receitas_total ?? item?.payload?.resumo_mensal?.receitas))),
        despesas: average(historico.map((item) => safeNumber(item?.despesas_totais ?? item?.payload?.resumo_mensal?.despesas_totais))),
        saldo: average(historico.map((item) => safeNumber(item?.saldo_real ?? item?.payload?.resumo_mensal?.saldo))),
      },
    },
    sinais: signals,
    recomendacoes: recommendations,
    modelo: {
      versao: 'financeiro-adaptive-v1',
      pesos: adaptiveWeights,
      feedback,
      score_risco: riskScore,
      aprendizado: nivelAprendizado,
    },
    possiveis_erros: possiveisErros,
    metadados: {
      category_count: monthCategoryTotals.length,
      top_category: topCategory,
      generated_at: todayIso,
      previous_cycle: Boolean(previousState),
    },
  };
}
