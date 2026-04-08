-- Ajusta chamas para serem por card/missao (nao global do dia)
ALTER TABLE public.tb_missoes_treino_chamas
  ADD COLUMN IF NOT EXISTS mission_id uuid REFERENCES public.tb_missoes_treino(id) ON DELETE CASCADE;

-- Remove unicidade antiga (global)
DROP INDEX IF EXISTS public.uq_tb_missoes_treino_chamas_mes_dia;

-- Nova unicidade por missao + mes + dia
CREATE UNIQUE INDEX IF NOT EXISTS uq_tb_missoes_treino_chamas_missao_mes_dia
  ON public.tb_missoes_treino_chamas (mission_id, mes_ref, dia);

CREATE INDEX IF NOT EXISTS idx_tb_missoes_treino_chamas_missao
  ON public.tb_missoes_treino_chamas (mission_id);
