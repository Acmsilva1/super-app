-- Controle das 30 chamas mensais (Solo Leveling)
CREATE TABLE IF NOT EXISTS public.tb_missoes_treino_chamas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mes_ref text NOT NULL, -- YYYY-MM
  dia integer NOT NULL CHECK (dia >= 1 AND dia <= 30),
  concluida boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tb_missoes_treino_chamas_mes_dia
  ON public.tb_missoes_treino_chamas (mes_ref, dia);

CREATE INDEX IF NOT EXISTS idx_tb_missoes_treino_chamas_mes
  ON public.tb_missoes_treino_chamas (mes_ref);

DROP TRIGGER IF EXISTS trg_tb_missoes_treino_chamas_updated_at ON public.tb_missoes_treino_chamas;
CREATE TRIGGER trg_tb_missoes_treino_chamas_updated_at
BEFORE UPDATE ON public.tb_missoes_treino_chamas
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tb_missoes_treino_chamas TO anon, authenticated;
ALTER TABLE public.tb_missoes_treino_chamas DISABLE ROW LEVEL SECURITY;
