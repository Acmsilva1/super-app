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

    const query = { bi: '1', ...(req.query || {}) };
    const result = await obterFinanceiroMes(query, context);

    if (result.status !== 200 || !result.data) {
      return json(res, result.status || 500, { error: result.error || 'Erro ao carregar analista financeiro' });
    }

    const base = result.data;
    const graficosAnuais = Array.isArray(base.graficos_anuais) ? base.graficos_anuais : [];

    // Acumula categorias anuais independente do mês selecionado
    const categoriasAnoMap = new Map();
    for (const m of graficosAnuais) {
      for (const cat of m.categorias_gastos || []) {
        const key = String(cat.categoria || '').toLowerCase();
        const current = categoriasAnoMap.get(key) || { categoria: cat.categoria, valor: 0 };
        categoriasAnoMap.set(key, {
          categoria: current.categoria,
          valor: Math.round((current.valor + (Number(cat.valor) || 0)) * 100) / 100,
        });
      }
    }
    const categoriasAno = [...categoriasAnoMap.values()].sort((a, b) => b.valor - a.valor);

    const historicoDetalhado = graficosAnuais
      .filter((m) => Number(m.receitas || 0) > 0 || Number(m.despesas || 0) > 0)
      .map((m) => {
        const receitas = Number(m.receitas || 0);
        const despesasVariadas = Number(m.despesas_variadas || 0);
        const despesasFixas = Number(m.despesas_fixas || 0);
        const despesasTotais = Number(m.despesas || 0);
        const percentualComprometido = receitas > 0 ? (despesasTotais / receitas) * 100 : 0;

        const catsMes = Array.isArray(m.categorias_gastos) ? m.categorias_gastos : [];
        const topCat = catsMes.length > 0
          ? catsMes.reduce((acc, c) => (Number(c?.valor || 0) > Number(acc?.valor || 0) ? c : acc), catsMes[0])
          : null;

        return {
          mes_ano: m.mes_ano,
          receitas,
          despesas_fixas: despesasFixas,
          despesas_variadas: despesasVariadas,
          despesas_totais: despesasTotais,
          saldo: Number(m.saldo || 0),
          percentual: Math.round(percentualComprometido * 10) / 10,
          top_categoria: topCat?.categoria || null,
        };
      });

    const totalDespesasAno = Math.round(historicoDetalhado.reduce((acc, m) => acc + m.despesas_totais, 0) * 100) / 100;
    const totalReceitasAno = Math.round(historicoDetalhado.reduce((acc, m) => acc + m.receitas, 0) * 100) / 100;

    const comDados = historicoDetalhado;
    const melhorMes = comDados.length ? comDados.reduce((acc, m) => (m.saldo > acc.saldo ? m : acc), comDados[0]) : null;
    const piorMes = comDados.length ? comDados.reduce((acc, m) => (m.saldo < acc.saldo ? m : acc), comDados[0]) : null;

    const comReceitas = comDados.filter((m) => m.receitas > 0);
    const mesMaisPositivo = comReceitas.length
      ? comReceitas.reduce((acc, m) => (m.percentual < acc.percentual ? m : acc), comReceitas[0])
      : melhorMes;
    const mesMaisNegativo = comReceitas.length
      ? comReceitas.reduce((acc, m) => (m.percentual > acc.percentual ? m : acc), comReceitas[0])
      : piorMes;

    const comFixas = comDados.filter((m) => m.despesas_fixas > 0);
    const mesMaisFixas = comFixas.length
      ? comFixas.reduce((acc, m) => (m.despesas_fixas > acc.despesas_fixas ? m : acc), comFixas[0])
      : (comDados.length ? comDados[0] : null);

    const mesMaisVariaveis = comDados.length
      ? comDados.reduce((acc, m) => (m.despesas_variadas > acc.despesas_variadas ? m : acc), comDados[0])
      : null;

    const cards = {
      melhor_mes: melhorMes,
      pior_mes: piorMes,
      mes_com_mais_fixas: mesMaisFixas,
      mes_com_mais_variaveis: mesMaisVariaveis,
      mes_mais_positivo: mesMaisPositivo,
      mes_mais_negativo: mesMaisNegativo,
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
            despesas_variaveis: base.dashboard.despesas_variadas,
          }
        : {},
      resumo_anual: {
        receitas: totalReceitasAno,
        despesas_totais: totalDespesasAno,
        saldo: Math.round((totalReceitasAno - totalDespesasAno) * 100) / 100,
      },
      projecao: {},
      comparativos: {},
      modelo: {
        aprendizado: {},
        pesos: {},
        score_risco: {},
      },
      metadados: { recorte_inicio_mes_ano: '2000-01' },
      categorias_mes: base.graficos?.categorias_gastos || [],
      categorias_ano: categoriasAno,
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
