-- =============================================================================
-- Schema Completo para o Banco Local PostgreSQL / Supabase Dev (OFFLINE_DEV)
-- Cria todas as tabelas, índices e views necessárias para o Super App local.
-- =============================================================================

BEGIN;

-- 1. Módulo Financeiro (Tabelas Base)
CREATE TABLE IF NOT EXISTS public.tb_financas (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID,
  descricao TEXT NOT NULL,
  valor NUMERIC(12,2) NOT NULL,
  tipo TEXT NOT NULL,
  categoria TEXT,
  data_lancamento DATE DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS public.tb_despesas_fixas (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID,
  descricao TEXT NOT NULL,
  valor NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  conta_fixa BOOLEAN DEFAULT FALSE,
  parcela_atual INT,
  parcela_total INT,
  serie_id UUID
);

CREATE TABLE IF NOT EXISTS public.tb_poupanca (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID,
  descricao TEXT NOT NULL,
  valor NUMERIC(12,2) NOT NULL,
  tipo TEXT NOT NULL,
  data_lancamento DATE DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS public.tb_poupanca_metas (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID,
  nome_meta TEXT NOT NULL,
  valor_meta NUMERIC(12,2) NOT NULL,
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  ativa BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS public.tb_compras (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID,
  descricao TEXT NOT NULL,
  valor NUMERIC(12,2) NOT NULL,
  metodo TEXT NOT NULL DEFAULT 'a_vista',
  parcelas INT DEFAULT 1,
  data_compra DATE DEFAULT CURRENT_DATE,
  data_lancamento DATE DEFAULT CURRENT_DATE
);

-- 2. Lista de Compras
CREATE TABLE IF NOT EXISTS public.tb_lista_compras (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID,
  item TEXT NOT NULL,
  quantidade NUMERIC(10,2) DEFAULT 1,
  categoria TEXT,
  comprado BOOLEAN NOT NULL DEFAULT FALSE
);

-- 3. Fluxograma
CREATE TABLE IF NOT EXISTS public.tb_fluxograma_projetos (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID,
  nome TEXT NOT NULL,
  dados JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 4. Missões de Treino
CREATE TABLE IF NOT EXISTS public.tb_missoes_treino (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID,
  data DATE NOT NULL,
  concluido BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS public.tb_missoes_treino_itens (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID,
  missao_id BIGINT REFERENCES public.tb_missoes_treino(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  concluido BOOLEAN NOT NULL DEFAULT FALSE,
  tipo TEXT
);

CREATE TABLE IF NOT EXISTS public.tb_missoes_treino_chamas (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID,
  data DATE NOT NULL UNIQUE
);

-- 5. Módulos & Permissões App
CREATE TABLE IF NOT EXISTS public.app_modules (
  app_id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  beta_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.app_modules (app_id, label, beta_default)
VALUES
  ('financeiro', 'Financeiro', true),
  ('lista_compras', 'Lista de compras', false),
  ('fluxograma', 'Fluxograma', false),
  ('missoes_treino', 'Missoes de treino', false),
  ('admin', 'Administracao', false)
ON CONFLICT (app_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.app_user_roles (
  user_id UUID PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.app_user_permissions (
  user_id UUID NOT NULL,
  app_id TEXT NOT NULL REFERENCES public.app_modules(app_id) ON DELETE CASCADE,
  can_access BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, app_id)
);

CREATE TABLE IF NOT EXISTS public.app_user_profiles (
  user_id UUID PRIMARY KEY,
  nome TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Índices Financeiros
CREATE INDEX IF NOT EXISTS idx_tb_financas_user_data ON public.tb_financas (user_id, data_lancamento);
CREATE INDEX IF NOT EXISTS idx_tb_despesas_fixas_user_created ON public.tb_despesas_fixas (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tb_poupanca_user_data ON public.tb_poupanca (user_id, data_lancamento);
CREATE INDEX IF NOT EXISTS idx_tb_poupanca_metas_user_ativa ON public.tb_poupanca_metas (user_id, ativa);
CREATE INDEX IF NOT EXISTS idx_tb_compras_user_data ON public.tb_compras (user_id, data_lancamento);

-- 7. Views Financeiras
DROP VIEW IF EXISTS public.vw_financeiro_resumo_mensal CASCADE;
CREATE VIEW public.vw_financeiro_resumo_mensal AS
WITH financas_agrupadas AS (
  SELECT
    user_id,
    to_char(coalesce(data_lancamento::date, created_at::date), 'YYYY-MM') AS mes_ano,
    round(sum(CASE WHEN tipo = 'receita' THEN valor ELSE 0 END)::numeric, 2) AS receitas,
    round(sum(CASE WHEN tipo = 'despesa' THEN valor ELSE 0 END)::numeric, 2) AS despesas_variadas
  FROM public.tb_financas
  GROUP BY user_id, to_char(coalesce(data_lancamento::date, created_at::date), 'YYYY-MM')
),
fixas_agrupadas AS (
  SELECT
    user_id,
    to_char(created_at, 'YYYY-MM') AS mes_ano,
    round(sum(valor)::numeric, 2) AS despesas_fixas,
    round(sum(CASE WHEN status = 'pago'     THEN valor ELSE 0 END)::numeric, 2) AS fixas_pagas,
    round(sum(CASE WHEN status = 'pendente' THEN valor ELSE 0 END)::numeric, 2) AS fixas_pendentes
  FROM public.tb_despesas_fixas
  GROUP BY user_id, to_char(created_at, 'YYYY-MM')
)
SELECT
  coalesce(fa.user_id, fx.user_id) AS user_id,
  coalesce(fa.mes_ano, fx.mes_ano) AS mes_ano,
  coalesce(fa.receitas, 0) AS receitas,
  coalesce(fa.despesas_variadas, 0) AS despesas_variadas,
  coalesce(fx.despesas_fixas, 0) AS despesas_fixas,
  round((coalesce(fa.receitas, 0) - coalesce(fa.despesas_variadas, 0) - coalesce(fx.despesas_fixas, 0))::numeric, 2) AS saldo,
  coalesce(fx.fixas_pagas, 0) AS fixas_pagas,
  coalesce(fx.fixas_pendentes, 0) AS fixas_pendentes
FROM financas_agrupadas fa
FULL OUTER JOIN fixas_agrupadas fx
  ON fx.user_id = fa.user_id
 AND fx.mes_ano = fa.mes_ano;

DROP VIEW IF EXISTS public.vw_financeiro_categoria_mensal CASCADE;
CREATE VIEW public.vw_financeiro_categoria_mensal AS
SELECT
  user_id,
  to_char(coalesce(data_lancamento::date, created_at::date), 'YYYY-MM') AS mes_ano,
  coalesce(categoria, 'Outros') AS categoria,
  round(sum(valor)::numeric, 2) AS valor_total,
  count(*)::integer AS quantidade_lancamentos,
  round(avg(valor)::numeric, 2) AS media_lancamento,
  row_number() OVER (PARTITION BY user_id, to_char(coalesce(data_lancamento::date, created_at::date), 'YYYY-MM') ORDER BY sum(valor) DESC) AS ranking_maior,
  row_number() OVER (PARTITION BY user_id, to_char(coalesce(data_lancamento::date, created_at::date), 'YYYY-MM') ORDER BY sum(valor) ASC) AS ranking_menor
FROM public.tb_financas
WHERE tipo = 'despesa'
GROUP BY user_id, to_char(coalesce(data_lancamento::date, created_at::date), 'YYYY-MM'), coalesce(categoria, 'Outros');

DROP VIEW IF EXISTS public.vw_financeiro_historico_anual CASCADE;
CREATE VIEW public.vw_financeiro_historico_anual AS
SELECT
  user_id,
  mes_ano,
  substring(mes_ano FROM 1 FOR 4)::integer AS ano,
  receitas,
  despesas_fixas,
  despesas_variadas,
  round((despesas_fixas + despesas_variadas)::numeric, 2) AS despesas_totais,
  saldo
FROM public.vw_financeiro_resumo_mensal;

DROP VIEW IF EXISTS public.vw_financeiro_poupanca_resumo CASCADE;
CREATE VIEW public.vw_financeiro_poupanca_resumo AS
WITH acumulado AS (
  SELECT
    user_id,
    round(sum(CASE WHEN tipo = 'deposito' THEN valor ELSE -valor END)::numeric, 2) AS total_acumulado
  FROM public.tb_poupanca
  GROUP BY user_id
),
meta_ativa AS (
  SELECT DISTINCT ON (user_id)
    id AS meta_id,
    user_id,
    nome_meta,
    valor_meta,
    data_inicio,
    ativa
  FROM public.tb_poupanca_metas
  WHERE ativa = true
  ORDER BY user_id, created_at DESC
)
SELECT
  coalesce(a.user_id, m.user_id) AS user_id,
  coalesce(a.total_acumulado, 0) AS total_acumulado,
  m.meta_id,
  m.nome_meta,
  m.valor_meta,
  m.data_inicio,
  CASE
    WHEN m.valor_meta IS NULL OR m.valor_meta = 0 THEN 0
    ELSE round(least(100.0, greatest(0.0, (coalesce(a.total_acumulado, 0) / m.valor_meta) * 100))::numeric, 2)
  END AS progresso,
  CASE
    WHEN m.meta_id IS NULL THEN 'sem_meta'
    WHEN coalesce(a.total_acumulado, 0) >= m.valor_meta THEN 'concluida'
    ELSE 'em_andamento'
  END AS status_meta
FROM acumulado a
FULL OUTER JOIN meta_ativa m ON m.user_id = a.user_id;

DROP VIEW IF EXISTS public.vw_financeiro_compras_mensal CASCADE;
CREATE VIEW public.vw_financeiro_compras_mensal AS
SELECT
  user_id,
  to_char(coalesce(data_compra, data_lancamento, created_at::date), 'YYYY-MM') AS mes_ano,
  round(sum(valor)::numeric, 2) AS valor_total,
  count(*)::integer AS quantidade_compras,
  round(avg(valor)::numeric, 2) AS ticket_medio
FROM public.tb_compras
GROUP BY user_id, to_char(coalesce(data_compra, data_lancamento, created_at::date), 'YYYY-MM');

COMMIT;
