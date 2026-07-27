const STOPWORDS = new Set([
  'de', 'da', 'do', 'em', 'para', 'com', 'no', 'na', 'e', 'ou', 'a', 'o', 'um', 'uma', 'os', 'as', 'ao', 'aos'
]);

/**
 * Normaliza o texto removendo acentos, caracteres especiais e convertendo para minúsculas.
 * @param {string} text 
 * @returns {string[]}
 */
export function normalizeAndTokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9\s]/g, ' ') // remove caracteres especiais
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2 && !STOPWORDS.has(t));
}

/**
 * Dicionário estático para fallback inicial de classificação (Cold Start).
 */
const FALLBACK_HEURISTICS = [
  { keywords: ['uber', 'taxi', '99taxis', 'cabify', 'indrive', 'posto', 'gasolina', 'combustivel', 'pedagio'], category: 'Transporte' },
  { keywords: ['ifood', 'restaurante', 'almoço', 'jantar', 'padaria', 'pao', 'mcdonald', 'burger', 'bk', 'pizza', 'sushi', 'cafe'], category: 'Alimentação' },
  { keywords: ['mercado', 'supermercado', 'mercadinho', 'sacolao', 'hortifruti', 'feira', 'carrefour', 'pao de acucar'], category: 'Alimentação' },
  { keywords: ['aluguel', 'condominio', 'luz', 'agua', 'energia', 'gas', 'internet', 'net', 'claro', 'vivo', 'tim'], category: 'Contas' },
  { keywords: ['farmacia', 'drogaria', 'drogasil', 'droga', 'medico', 'consulta', 'dentista', 'hospital', 'remedio'], category: 'Saúde' },
  { keywords: ['cinema', 'show', 'teatro', 'viagem', 'hotel', 'airbnb', 'bar', 'cerveja', 'festa', 'balada', 'jogos', 'games', 'steam'], category: 'Lazer' },
  { keywords: ['salario', 'pagamento', 'provento', 'recebimento', 'pix recebido', 'transferencia recebida'], category: 'Salário' }
];

/**
 * Classifica uma descrição usando Heurísticas Estáticas simples.
 * @param {string} description 
 * @returns {string|null}
 */
export function classifyByHeuristics(description) {
  const tokens = normalizeAndTokenize(description);
  if (!tokens.length) return null;

  for (const rule of FALLBACK_HEURISTICS) {
    if (tokens.some(t => rule.keywords.includes(t))) {
      return rule.category;
    }
  }
  return null;
}

/**
 * Calcula pesos estatísticos Naive Bayes a partir de uma lista de transações categorizadas.
 * @param {Array<{ descricao: string, categoria: string }>} transactions 
 * @returns {object}
 */
export function calcularNaiveBayesWeights(transactions) {
  const dataset = (transactions || []).filter(t => t.descricao && t.categoria);
  
  const categoryCounts = {};
  const wordCounts = {};
  const totalTokensPerCategory = {};
  const vocabulary = new Set();
  let totalDocs = 0;

  for (const tx of dataset) {
    const category = tx.categoria;
    const tokens = normalizeAndTokenize(tx.descricao);
    if (!tokens.length) continue;

    totalDocs++;
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;

    for (const token of tokens) {
      vocabulary.add(token);
      totalTokensPerCategory[category] = (totalTokensPerCategory[category] || 0) + 1;

      if (!wordCounts[token]) {
        wordCounts[token] = {};
      }
      wordCounts[token][category] = (wordCounts[token][category] || 0) + 1;
    }
  }

  return {
    category_counts: categoryCounts,
    total_tokens_per_category: totalTokensPerCategory,
    word_counts: wordCounts,
    vocab_size: vocabulary.size,
    total_docs: totalDocs
  };
}

/**
 * Classifica uma descrição usando o modelo Naive Bayes treinado (e fallback para heurísticas se necessário).
 * @param {string} description 
 * @param {object} weights 
 * @returns {string}
 */
export function inferCategory(description, weights) {
  const fallback = classifyByHeuristics(description) || 'Outros';
  if (!weights || !weights.category_counts || Object.keys(weights.category_counts).length === 0) {
    return fallback;
  }

  const tokens = normalizeAndTokenize(description);
  if (!tokens.length) return fallback;

  let bestCategory = null;
  let bestScore = -Infinity;

  const categories = Object.keys(weights.category_counts);
  const totalDocs = weights.total_docs || 1;
  const vocabSize = weights.vocab_size || 1;

  for (const category of categories) {
    const docCount = weights.category_counts[category] || 0;
    // Log-prior probability: ln(P(C))
    let score = Math.log((docCount + 1) / (totalDocs + categories.length));

    const totalTokens = weights.total_tokens_per_category[category] || 0;

    for (const token of tokens) {
      const tokenCountInCat = (weights.word_counts[token] && weights.word_counts[token][category]) || 0;
      // Log-likelihood of word: ln(P(w|C)) com suavização de Laplace
      const prob = (tokenCountInCat + 1) / (totalTokens + vocabSize);
      score += Math.log(prob);
    }

    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory || fallback;
}

/**
 * Função de Distribuição Acumulada (CDF) de uma Normal Padrão N(0, 1).
 * Implementa a aproximação racional de Abramowitz & Stegun (fórmula 7.1.26), com precisão de 7 casas decimais.
 * @param {number} x 
 * @returns {number}
 */
export function calculateProbabilityCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804; // 1 / Math.sqrt(2 * Math.PI)
  const l = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const prob = 1 - d * Math.exp(-x * x / 2) * l;
  return x >= 0 ? prob : 1 - prob;
}

/**
 * Executa a análise de consumo diário e riscos probabilísticos de estouro de orçamento pelo TLC.
 * @param {object} params
 * @param {number} params.receitas
 * @param {number} params.despesasFixas
 * @param {Array<{ valor: number, data_lancamento: string }>} params.gastosVariados
 * @param {number} params.diaAtual
 * @param {number} params.totalDias
 * @returns {object}
 */
export function calcularAnaliseRiscoConsumo({ receitas, despesasFixas, gastosVariados, diaAtual, totalDias }) {
  const totalReceitas = Number(receitas) || 0;
  const totalFixas = Number(despesasFixas) || 0;
  const gastosVariadosList = gastosVariados || [];

  const totalVariadasAcumulado = gastosVariadosList.reduce((acc, g) => acc + (Number(g.valor) || 0), 0);
  const totalDespesasAtual = totalFixas + totalVariadasAcumulado;

  // Orçamento máximo disponível para variáveis sem fechar em déficit
  const orcamentoVariavel = Math.max(0, totalReceitas - totalFixas);
  const saldoLiquidoAtual = totalReceitas - totalDespesasAtual;

  // Dias restantes
  const diasRestantes = Math.max(0, totalDias - diaAtual);

  // Agrupar gastos por dia para calcular média e desvio padrão
  const gastosPorDia = Array.from({ length: diaAtual }, () => 0);
  for (const g of gastosVariadosList) {
    const data = g.data_lancamento || '';
    const match = data.match(/-(\d{2})$/);
    const dia = match ? Number(match[1]) : null;
    if (dia && dia >= 1 && dia <= diaAtual) {
      gastosPorDia[dia - 1] += Number(g.valor) || 0;
    }
  }

  // Média Diária Real do Mês Corrente
  const mediaDiaria = diaAtual > 0 ? totalVariadasAcumulado / diaAtual : 0;

  // Desvio Padrão Real
  let somaDiferencasQuadradas = 0;
  for (const gastoDia of gastosPorDia) {
    somaDiferencasQuadradas += Math.pow(gastoDia - mediaDiaria, 2);
  }
  const variancia = diaAtual > 1 ? somaDiferencasQuadradas / (diaAtual - 1) : 0;
  let desvioPadrao = Math.sqrt(variancia);

  // Fallback para desvio padrão caso seja zero ou muito pequeno para evitar divisões inválidas
  if (desvioPadrao < 10) {
    desvioPadrao = mediaDiaria > 0 ? mediaDiaria * 0.5 : 30; // 50% da média ou R$ 30 fixo
  }

  // Ritmo de Consumo
  const ritmoRecomendado = totalDias > 0 ? orcamentoVariavel / totalDias : 0;
  const ritmoStatus = mediaDiaria > ritmoRecomendado ? 'acelerado' : 'sob_controle';

  // Projeção Linear Simples
  const despesaVariavelProjetada = mediaDiaria * totalDias;
  const despesaTotalProjetada = totalFixas + despesaVariavelProjetada;
  const saldoLiquidoProjetado = totalReceitas - despesaTotalProjetada;

  // Probabilidade de Estouro de Orçamento pelo Teorema do Limite Central (TLC)
  let probabilidadeEstouro = 0;
  
  if (totalReceitas === 0) {
    probabilidadeEstouro = totalDespesasAtual > 0 ? 100 : 0;
  } else if (totalVariadasAcumulado > orcamentoVariavel) {
    probabilidadeEstouro = 100; // Já estourou
  } else if (diasRestantes === 0) {
    probabilidadeEstouro = totalVariadasAcumulado > orcamentoVariavel ? 100 : 0;
  } else {
    // Gastos acumulados + gastos futuros projetados
    // S_futuro ~ N(diasRestantes * mediaDiaria, sqrt(diasRestantes) * desvioPadrao)
    const mediaFutura = diasRestantes * mediaDiaria;
    const desvioFuturo = Math.sqrt(diasRestantes) * desvioPadrao;

    // Queremos P(totalVariadasAcumulado + S_futuro > orcamentoVariavel)
    // P(S_futuro > orcamentoVariavel - totalVariadasAcumulado)
    const limiteS = orcamentoVariavel - totalVariadasAcumulado;
    const z = (limiteS - mediaFutura) / desvioFuturo;
    
    // P(Z > z) = 1 - Phi(z)
    probabilidadeEstouro = (1 - calculateProbabilityCDF(z)) * 100;
  }

  probabilidadeEstouro = Math.round(Math.max(0, Math.min(100, probabilidadeEstouro)) * 10) / 10;

  // Classificação do Risco de Estouro
  let riscoClassificacao = 'Baixo';
  if (probabilidadeEstouro >= 70) riscoClassificacao = 'Crítico';
  else if (probabilidadeEstouro >= 40) riscoClassificacao = 'Alto';
  else if (probabilidadeEstouro >= 15) riscoClassificacao = 'Moderado';

  return {
    dia_atual: diaAtual,
    dias_totais: totalDias,
    dias_restantes: diasRestantes,
    total_receitas: totalReceitas,
    total_despesas_fixas: totalFixas,
    total_despesas_variaveis: totalVariadasAcumulado,
    ritmo_diario_atual: Math.round(mediaDiaria * 100) / 100,
    ritmo_diario_recomendado: Math.round(ritmoRecomendado * 100) / 100,
    ritmo_status: ritmoStatus,
    despesa_projetada_total: Math.round(despesaTotalProjetada * 100) / 100,
    saldo_projetado_liquido: Math.round(saldoLiquidoProjetado * 100) / 100,
    probabilidade_estouro: probabilidadeEstouro,
    risco_classificacao: riscoClassificacao,
    saldo_liquido_atual: Math.round(saldoLiquidoAtual * 100) / 100
  };
}

/**
 * Mapeamentos Regex para agrupar e analisar estabelecimentos frequentes.
 */
const ESTABELECIMENTO_RULES = [
  { id: 'padarias', label: 'Padarias & Confeitarias', regex: /\b(padaria|panificadora|pao|confeitaria|paes|padarias)\b/i },
  { id: 'mercados', label: 'Mercados & Compras', regex: /\b(mercado|mercadinho|supermercado|condominio|hortifruti|sacolao|mini\s*mercado|compras|atacadao|assai|carrefour|extra)\b/i },
  { id: 'transporte', label: 'Transporte por App / Posto', regex: /\b(uber|99taxis|99\s*app|cabify|taxi|indrive|posto|gasolina|combustivel|shell|petrobras|ipiranga|diesel)\b/i },
  { id: 'delivery', label: 'Delivery / Fast-Food', regex: /\b(ifood|delivery|rappi|ubereats|mcdonald|mc\s*donalds|burger\s*king|bk|pizza|habibs|giraffas)\b/i },
  { id: 'saude', label: 'Saúde & Farmácias', regex: /\b(farmacia|drogaria|pague\s*menos|drogasil|droga\s*raia|ultrafarma|medico|dentista|exame|consulta)\b/i },
  { id: 'lazer', label: 'Lazer & Entretenimento', regex: /\b(cinema|cine|show|teatro|ingressos|bar|cerveja|chope|festa|balada|jogos|games|steam|spotify|netflix|disney)\b/i }
];

/**
 * Analisa os gastos diários/variados para encontrar padrões de recorrência e inconsistências de categoria.
 * @param {Array<{ id: any, descricao: string, categoria: string, valor: number }>} gastosVariados 
 * @returns {object}
 */
export function detectarPadroesEInconsistencias(gastosVariados) {
  const list = gastosVariados || [];
  
  // 1. Agrupar gastos por regras de Regex
  const grupos = ESTABELECIMENTO_RULES.map(rule => ({
    id: rule.id,
    label: rule.label,
    regex: rule.regex,
    items: [],
    total: 0,
    contagem: 0
  }));

  const outrosGrupo = {
    id: 'outros',
    label: 'Outros Estabelecimentos',
    items: [],
    total: 0,
    contagem: 0
  };

  for (const g of list) {
    const desc = g.descricao || '';
    const valor = Number(g.valor) || 0;
    
    let matched = false;
    for (const grupo of grupos) {
      if (grupo.regex.test(desc)) {
        grupo.items.push(g);
        grupo.total += valor;
        grupo.contagem++;
        matched = true;
        break;
      }
    }

    if (!matched) {
      outrosGrupo.items.push(g);
      outrosGrupo.total += valor;
      outrosGrupo.contagem++;
    }
  }

  // Filtrar grupos que de fato tiveram gastos e ordenar pelo total gasto decrescente
  const gruposAnalise = grupos
    .filter(g => g.contagem > 0)
    .map(g => ({
      id: g.id,
      label: g.label,
      total: Math.round(g.total * 100) / 100,
      contagem: g.contagem,
      media_por_lancamento: Math.round((g.total / g.contagem) * 100) / 100
    }))
    .sort((a, b) => b.total - a.total);

  // 2. Encontrar inconsistências de categorias em descrições semelhantes
  const inconsistencias = [];
  const processedPairs = new Set();

  for (const grupo of [...grupos, outrosGrupo]) {
    const items = grupo.items;
    if (items.length < 2) continue;

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const itemA = items[i];
        const itemB = items[j];

        if (itemA.categoria !== itemB.categoria) {
          // Extrair palavras chave principais
          const tokensA = normalizeAndTokenize(itemA.descricao);
          const tokensB = normalizeAndTokenize(itemB.descricao);

          // Verificar se compartilham pelo menos uma palavra chave relevante
          const inter = tokensA.filter(t => tokensB.includes(t));
          if (inter.length > 0) {
            const pairKey = [itemA.id, itemB.id].sort().join('-');
            if (!processedPairs.has(pairKey)) {
              processedPairs.add(pairKey);
              inconsistencias.push({
                termo_comum: inter.join(', '),
                estabelecimentoA: itemA.descricao,
                categoriaA: itemA.categoria || 'Sem categoria',
                valorA: Number(itemA.valor) || 0,
                estabelecimentoB: itemB.descricao,
                categoriaB: itemB.categoria || 'Sem categoria',
                valorB: Number(itemB.valor) || 0,
                grupo: grupo.label
              });
            }
          }
        }
      }
    }
  }

  return {
    grupos: gruposAnalise,
    inconsistencias: inconsistencias.slice(0, 10) // limita a 10 para não sobrecarregar
  };
}
