-- View util para leitura rapida dos ultimos 5 meses do analista financeiro.

CREATE OR REPLACE VIEW public.vw_financeiro_ultimos_5_meses AS
SELECT
  id,
  mes_ano,
  escopo,
  created_at,
  receitas_total,
  despesas_fixas_total,
  despesas_variaveis_total,
  despesas_totais,
  saldo_real,
  risco_score,
  risco_classificado,
  COALESCE(
    NULLIF((payload->'modelo'->'aprendizado'->>'percentual'), '')::numeric,
    0
  ) AS aprendizado_percentual
FROM public.tb_financeiro_features_mensais
WHERE escopo = 'financeiro'
ORDER BY mes_ano DESC, created_at DESC, id DESC
LIMIT 5;
