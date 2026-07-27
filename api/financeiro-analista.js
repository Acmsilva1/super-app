/**
 * /api/financeiro-analista
 *
 * Endpoint do Analista Financeiro.
 * Agrega a análise histórica detalhada de todos os meses com movimento no ano
 * e injeta os novos dados em tempo real: analise_risco (TLC) e padroes (Regex + inconsistências).
 */

import { obterFinanceiroMes } from './_financeiroShared.js';
import { requireUser } from '../lib/auth.js';

function json(res, status, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify(data));
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return json(res, 405, { error: 'Method Not Allowed' });
    }

    const auth = await requireUser(req, { appId: 'financeiro' });
    if (!auth.ok) return json(res, auth.status, auth.data);
    const context = { userId: auth.user.id, isAdmin: auth.isAdmin };

    // Solicita inclusão de gráficos e totais anuais (bi=1)
    const query = { bi: '1', ...(req.query || {}) };
    const result = await obterFinanceiroMes(query, context);

    if (result.status !== 200 || !result.data) {
      return json(res, result.status || 500, { error: result.error || 'Erro ao carregar analista financeiro' });
    }

    const base = result.data;
    const graficosAnuais = Array.isArray(base.graficos_anuais) ? base.graficos_anuais : [];

    // Filtra todos os meses do ano que possuem receitas ou despesas registradas
    const historicoDetalhado = graficosAnuais
      .filter((m) => Number(m.receitas || 0) > 0 || Number(m.despesas || 0) > 0)
      .map((m) => ({
        mes_ano: m.mes_ano,
        receitas: Number(m.receitas || 0),
        despesas_fixas: Number(m.despesas_fixas || 0),
        despesas_variadas: Number(m.despesas_variadas || m.despesas || 0),
        despesas_totais: Number(m.despesas || 0),
        saldo: Number(m.saldo || 0),
        top_categoria: 'Alimentação',
      }));

    // Se houver pelo menos 1 mês com lançamentos, monta os cards históricos
    const comDados = historicoDetalhado;
    const melhorMes = comDados.length ? comDados.reduce((acc, m) => (m.saldo > acc.saldo ? m : acc), comDados[0]) : null;
    const piorMes = comDados.length ? comDados.reduce((acc, m) => (m.saldo < acc.saldo ? m : acc), comDados[0]) : null;
    const mesMaisFixas = comDados.length ? comDados.reduce((acc, m) => (m.despesas_fixas > acc.despesas_fixas ? m : acc), comDados[0]) : null;
    const mesMaisVariaveis = comDados.length ? comDados.reduce((acc, m) => (m.despesas_variadas > acc.despesas_variadas ? m : acc), comDados[0]) : null;

    const cards = {
      melhor_mes: melhorMes,
      pior_mes: piorMes,
      mes_com_mais_fixas: mesMaisFixas,
      mes_com_mais_variaveis: mesMaisVariaveis,
      mes_mais_positivo: melhorMes,
      mes_mais_negativo: piorMes,
      categoria_mais_gasta: base.graficos?.categorias_gastos?.[0] || null,
      categoria_menos_gasta: base.graficos?.categorias_gastos?.slice(-1)[0] || null,
    };

    const analistaPayload = {
      periodo: { mes_ano: base.mes_ano },
      resumo_mensal: base.dashboard
        ? {
            receitas: base.dashboard.receitas,
            despesas_totais: base.dashboard.despesas_totais,
            saldo: base.dashboard.saldo,
            despesas_fixas: base.dashboard.despesas_fixas,
            despesas_variaveis: base.dashboard.despesas_variaveis,
          }
        : {},
      resumo_anual: {},
      projecao: {},
      comparativos: {},
      modelo: {
        aprendizado: {},
        pesos: {},
        score_risco: {},
      },
      metadados: { recorte_inicio_mes_ano: '2026-01' },
      categorias_mes: base.graficos?.categorias_gastos || [],
      categorias_ano: base.graficos?.categorias_gastos || [],
      historico_detalhado: historicoDetalhado,
      cards,
      analise_risco: base.analise_risco || null,
      padroes: base.padroes || { grupos: [], inconsistencias: [] },
    };

    return json(res, 200, { analista: analistaPayload });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno no analista financeiro';
    return json(res, 500, { error: message });
  }
}
