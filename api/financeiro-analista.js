/**
 * /api/financeiro-analista
 *
 * Endpoint do Analista Financeiro.
 * Agrega a análise histórica (já existente) com os novos dados calculados em
 * tempo real: analise_risco (TLC) e padroes (grupos Regex + inconsistências).
 *
 * Esses campos extras são injetados na chave `analista` da resposta para que o
 * frontend possa acessá-los via  payload?.analista?.analise_risco  e
 * payload?.analista?.padroes  sem quebrar a estrutura existente.
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

    // Busca o mês completo com analise_risco e padroes já calculados
    const query = { ...(req.query || {}) };
    const result = await obterFinanceiroMes(query, context);

    if (result.status !== 200 || !result.data) {
      return json(res, result.status || 500, { error: result.error || 'Erro ao carregar analista financeiro' });
    }

    const base = result.data;

    // Monta a estrutura esperada pelo renderFinanceiroAnalista:
    // payload.analista → aqui ficam todos os campos que o render acessa via `analise`
    const analistaPayload = {
      // ── campos históricos (mantidos pelo endpoint legado) ──────────────────
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
      metadados: { recorte_inicio_mes_ano: '2026-02' },
      categorias_mes: base.graficos?.categorias_gastos || [],
      categorias_ano: [],
      historico_detalhado: [],
      cards: {},

      // ── NOVOS CAMPOS: risco TLC + padrões ────────────────────────────────
      analise_risco: base.analise_risco || null,
      padroes: base.padroes || { grupos: [], inconsistencias: [] },
    };

    return json(res, 200, { analista: analistaPayload });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno no analista financeiro';
    return json(res, 500, { error: message });
  }
}
