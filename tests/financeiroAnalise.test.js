import { describe, it, expect } from 'vitest';
import {
  normalizeAndTokenize,
  classifyByHeuristics,
  calcularNaiveBayesWeights,
  inferCategory,
  calculateProbabilityCDF,
  calcularAnaliseRiscoConsumo,
  detectarPadroesEInconsistencias,
} from '../features/financeiro/service/financeiroAnaliseService.js';

describe('financeiroAnaliseService', () => {
  it('executa suíte de análise financeira', () => {
    let passed = 0;
    let failed = 0;

function assert(description, condition, extra = '') {
  if (condition) {
    console.log(`  ✅ ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FALHOU: ${description}${extra ? ` → ${extra}` : ''}`);
    failed++;
  }
}

function approximately(a, b, tolerance = 0.01) {
  return Math.abs(a - b) <= tolerance;
}

// ──────────────────────────────────────────────────────────────────────────────
console.log('\n📦 [1] normalizeAndTokenize');
const tokens1 = normalizeAndTokenize('Uber Trip Viagem São Paulo');
assert('Remove acentos e converte para minúsculas', tokens1.includes('sao'));
assert('Remove stopwords curtas', !tokens1.includes('a'));
assert('Mantém termos relevantes', tokens1.includes('uber'));
assert('Mantém termos relevantes (viagem)', tokens1.includes('viagem'));

const tokens2 = normalizeAndTokenize('Padaria do Condomínio');
assert('Tokeniza padaria', tokens2.includes('padaria'));
assert('Tokeniza condominio sem acento', tokens2.includes('condominio'));

assert('String vazia retorna array vazio', normalizeAndTokenize('').length === 0);
assert('Null retorna array vazio', normalizeAndTokenize(null).length === 0);

// ──────────────────────────────────────────────────────────────────────────────
console.log('\n🏷️  [2] classifyByHeuristics');
assert('Classifica Uber como Transporte', classifyByHeuristics('Uber Trip') === 'Transporte');
assert('Classifica Padaria como Alimentação', classifyByHeuristics('Padaria Central') === 'Alimentação');
assert('Classifica Mercado como Alimentação', classifyByHeuristics('Mercadinho do bairro') === 'Alimentação');
assert('Classifica Farmácia como Saúde', classifyByHeuristics('Drogaria São Paulo') === 'Saúde');
assert('Classifica Cinema como Lazer', classifyByHeuristics('Cinema ingresso') === 'Lazer');
assert('Retorna null para descrição não reconhecida', classifyByHeuristics('XYZ Desconhecido 1234') === null);

// ──────────────────────────────────────────────────────────────────────────────
console.log('\n🧠 [3] calcularNaiveBayesWeights + inferCategory');
const trainingData = [
  { descricao: 'Uber Trip', categoria: 'Transporte' },
  { descricao: 'Uber Viagem', categoria: 'Transporte' },
  { descricao: '99 App corrida', categoria: 'Transporte' },
  { descricao: 'Padaria Central pao', categoria: 'Alimentação' },
  { descricao: 'Supermercado Compras', categoria: 'Alimentação' },
  { descricao: 'Mercado compras semanais', categoria: 'Alimentação' },
  { descricao: 'Drogaria remedio', categoria: 'Saúde' },
];

const weights = calcularNaiveBayesWeights(trainingData);
assert('Vocab não vazio após treino', weights.vocab_size > 0);
assert('Contagem de categorias correta', Object.keys(weights.category_counts).length === 3);
assert('Total de documentos correto', weights.total_docs === 7);
assert('Categoria Transporte com 3 docs', weights.category_counts['Transporte'] === 3);

const cat1 = inferCategory('Uber corrida recente', weights);
assert('Classifica Uber como Transporte (treinado)', cat1 === 'Transporte');

const cat2 = inferCategory('padaria condominio', weights);
assert('Classifica padaria como Alimentação (treinado)', cat2 === 'Alimentação');

// Fallback com model vazio
const catFallback = inferCategory('Posto Ipiranga gasolina', {});
assert('Fallback para Transporte com pesos vazios', catFallback === 'Transporte');

// ──────────────────────────────────────────────────────────────────────────────
console.log('\n📊 [4] calculateProbabilityCDF');
// Phi(0) = 0.5
assert('CDF(0) ≈ 0.5', approximately(calculateProbabilityCDF(0), 0.5, 0.001));
// Phi(1.96) ≈ 0.975
assert('CDF(1.96) ≈ 0.975', approximately(calculateProbabilityCDF(1.96), 0.975, 0.005));
// Phi(-1.96) ≈ 0.025
assert('CDF(-1.96) ≈ 0.025', approximately(calculateProbabilityCDF(-1.96), 0.025, 0.005));
// Phi(3) ≈ 0.9987
assert('CDF(3.0) ≈ 0.9987', approximately(calculateProbabilityCDF(3.0), 0.9987, 0.001));
// Symmetry: Phi(x) + Phi(-x) = 1
assert('Simetria: CDF(2) + CDF(-2) = 1', approximately(calculateProbabilityCDF(2) + calculateProbabilityCDF(-2), 1, 0.001));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\n⚠️  [5] calcularAnaliseRiscoConsumo');

// Cenário 1: gasto controlado no meio do mês
const gastos1 = [
  { valor: 50, data_lancamento: '2026-07-05' },
  { valor: 80, data_lancamento: '2026-07-10' },
  { valor: 60, data_lancamento: '2026-07-15' },
];
const analise1 = calcularAnaliseRiscoConsumo({
  receitas: 5000,
  despesasFixas: 2000,
  gastosVariados: gastos1,
  diaAtual: 15,
  totalDias: 31,
});
assert('Saldo líquido atual correto', approximately(analise1.saldo_liquido_atual, 2810, 1));
assert('Risco baixo em cenário controlado', analise1.probabilidade_estouro < 40);
assert('ritmo_status: sob_controle', analise1.ritmo_status === 'sob_controle');

// Cenário 2: já estourou o orçamento variável
const analise2 = calcularAnaliseRiscoConsumo({
  receitas: 3000,
  despesasFixas: 2800,
  gastosVariados: [{ valor: 500, data_lancamento: '2026-07-01' }],
  diaAtual: 5,
  totalDias: 31,
});
assert('Probabilidade 100% se já estourou', analise2.probabilidade_estouro === 100);
assert('Risco crítico ao estourar', analise2.risco_classificacao === 'Crítico');

// Cenário 3: sem receitas
const analise3 = calcularAnaliseRiscoConsumo({
  receitas: 0,
  despesasFixas: 0,
  gastosVariados: [],
  diaAtual: 10,
  totalDias: 31,
});
assert('Sem receitas e sem gastos → risco zero', analise3.probabilidade_estouro === 0);

// ──────────────────────────────────────────────────────────────────────────────
console.log('\n🔍 [6] detectarPadroesEInconsistencias');
const gastosMixtos = [
  { id: 1, descricao: 'Padaria Real café', categoria: 'Alimentação', valor: 15 },
  { id: 2, descricao: 'Padaria do Condomínio', categoria: 'Lazer', valor: 20 },
  { id: 3, descricao: 'Uber Trip', categoria: 'Transporte', valor: 25 },
  { id: 4, descricao: 'Uber Ida trabalho', categoria: 'Transporte', valor: 18 },
  { id: 5, descricao: 'Mercadinho bairro compras', categoria: 'Alimentação', valor: 120 },
];

const { grupos, inconsistencias } = detectarPadroesEInconsistencias(gastosMixtos);
assert('Detectou grupo Padarias', grupos.some(g => g.id === 'padarias'));
assert('Detectou grupo Transporte', grupos.some(g => g.id === 'transporte'));
assert('Detectou grupo Mercados', grupos.some(g => g.id === 'mercados'));

const padariasGrupo = grupos.find(g => g.id === 'padarias');
assert('Total correto do grupo padarias', approximately(padariasGrupo?.total || 0, 35, 0.01));
assert('Contagem correta do grupo padarias', padariasGrupo?.contagem === 2);

assert('Detectou inconsistência entre padarias', inconsistencias.length > 0);
const inc = inconsistencias[0];
assert('Inconsistência possui termo_comum', typeof inc?.termo_comum === 'string' && inc.termo_comum.length > 0);
assert('As categorias são diferentes na inconsistência', inc?.categoriaA !== inc?.categoriaB);

// ──────────────────────────────────────────────────────────────────────────────
const total = passed + failed;
console.log(`\n${'─'.repeat(50)}`);
console.log(`🏁 Resultado: ${passed}/${total} testes passaram`);
if (failed > 0) {
  console.error(`❌ ${failed} testes falharam.`);
} else {
  console.log('✅ Todos os testes passaram!');
}
expect(failed).toBe(0);
  });
});
