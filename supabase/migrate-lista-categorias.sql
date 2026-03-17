-- Migração: Lista de Compras – trocar prioridade por categoria.
-- Rodar no SQL Editor do Supabase (se a tabela já existir com prioridade).

-- Adicionar coluna categoria (se não existir)
ALTER TABLE public.tb_lista_compras
  ADD COLUMN IF NOT EXISTS categoria TEXT DEFAULT 'Mantimentos';

-- Atualizar valores válidos para o CHECK
UPDATE public.tb_lista_compras SET categoria = 'Mantimentos' WHERE categoria IS NULL OR categoria NOT IN ('Mantimentos', 'Higiene / limpeza', 'Feira', 'Carnes');

-- Tornar NOT NULL
ALTER TABLE public.tb_lista_compras ALTER COLUMN categoria SET NOT NULL;
ALTER TABLE public.tb_lista_compras ALTER COLUMN categoria SET DEFAULT 'Mantimentos';

-- Remover coluna prioridade (se existir)
ALTER TABLE public.tb_lista_compras DROP COLUMN IF EXISTS prioridade;

-- CHECK (opcional; pode falhar se já existir constraint)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tb_lista_compras_categoria_check'
  ) THEN
    ALTER TABLE public.tb_lista_compras
      ADD CONSTRAINT tb_lista_compras_categoria_check
      CHECK (categoria IN ('Mantimentos', 'Higiene / limpeza', 'Feira', 'Carnes'));
  END IF;
END $$;

-- Índice
CREATE INDEX IF NOT EXISTS idx_tb_lista_compras_categoria ON public.tb_lista_compras (categoria);
DROP INDEX IF EXISTS public.idx_tb_lista_compras_prioridade;
