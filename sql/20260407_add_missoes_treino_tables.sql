-- Tabelas de missoes de treino (cabecalho + itens)
-- Execute no Supabase SQL Editor.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.tb_missoes_treino (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NULL,
  data_referencia date NOT NULL DEFAULT ((timezone('America/Sao_Paulo', now()))::date),
  origem text NOT NULL DEFAULT 'app',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tb_missoes_treino_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  missao_id uuid NOT NULL REFERENCES public.tb_missoes_treino(id) ON DELETE CASCADE,
  nome text NOT NULL,
  reps integer NOT NULL CHECK (reps > 0),
  concluida boolean NOT NULL DEFAULT false,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tb_missoes_treino_data_ref
  ON public.tb_missoes_treino (data_referencia DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tb_missoes_treino_data_ref
  ON public.tb_missoes_treino (data_referencia);

CREATE INDEX IF NOT EXISTS idx_tb_missoes_treino_itens_missao
  ON public.tb_missoes_treino_itens (missao_id);

CREATE INDEX IF NOT EXISTS idx_tb_missoes_treino_itens_concluida
  ON public.tb_missoes_treino_itens (concluida);

DROP TRIGGER IF EXISTS trg_tb_missoes_treino_updated_at ON public.tb_missoes_treino;
CREATE TRIGGER trg_tb_missoes_treino_updated_at
BEFORE UPDATE ON public.tb_missoes_treino
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tb_missoes_treino_itens_updated_at ON public.tb_missoes_treino_itens;
CREATE TRIGGER trg_tb_missoes_treino_itens_updated_at
BEFORE UPDATE ON public.tb_missoes_treino_itens
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Permissoes para uso pelas APIs serverless que estao com SUPABASE_ANON_KEY
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tb_missoes_treino TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tb_missoes_treino_itens TO anon, authenticated;

-- Mantem consistente com os outros modulos (sem RLS)
ALTER TABLE public.tb_missoes_treino DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tb_missoes_treino_itens DISABLE ROW LEVEL SECURITY;
