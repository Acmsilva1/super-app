-- Penalidade por treino perdido (bloqueio ate cumprir missao extra)
CREATE TABLE IF NOT EXISTS public.tb_missoes_treino_penalidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  missed_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  penalty_title text NOT NULL DEFAULT 'MISSAO DE PENALIDADE',
  penalty_text text NOT NULL DEFAULT 'FACA 20 BURPEES',
  completed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tb_missoes_treino_penalidades_missed_date
  ON public.tb_missoes_treino_penalidades (missed_date);

DROP TRIGGER IF EXISTS trg_tb_missoes_treino_penalidades_updated_at ON public.tb_missoes_treino_penalidades;
CREATE TRIGGER trg_tb_missoes_treino_penalidades_updated_at
BEFORE UPDATE ON public.tb_missoes_treino_penalidades
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tb_missoes_treino_penalidades TO anon, authenticated;
ALTER TABLE public.tb_missoes_treino_penalidades DISABLE ROW LEVEL SECURITY;
