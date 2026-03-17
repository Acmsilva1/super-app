-- Remove a tabela antiga (bloco de notas com titulo/conteudo/tags) e usa só a de despesas fixas.
-- Rodar no SQL Editor do Supabase.

-- 1) Apagar a tabela antiga (e seus índices)
DROP TABLE IF EXISTS public.tb_notas;

-- 2) Garantir que a tabela nova existe (despesas fixas: descrição, valor, status)
CREATE TABLE IF NOT EXISTS public.tb_despesas_fixas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  valor NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pago', 'pendente'))
);

COMMENT ON TABLE public.tb_despesas_fixas IS 'Bloco de Notas – despesas fixas (descrição, valor, pago/pendente)';

-- 3) Índices (ignora erro se já existirem)
CREATE INDEX IF NOT EXISTS idx_tb_despesas_fixas_created_at ON public.tb_despesas_fixas (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tb_despesas_fixas_status ON public.tb_despesas_fixas (status);
