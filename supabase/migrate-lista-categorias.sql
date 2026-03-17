-- =============================================================================
-- ALTERAR TABELA EXISTENTE tb_lista_compras: trocar coluna prioridade por categoria
-- Rodar no SQL Editor do Supabase (uma vez) na tabela que já existe.
-- Categorias: 1-Mantimentos, 2-Higiene/limpeza, 3-Feira, 4-Carnes
-- =============================================================================

-- 1) Adicionar coluna categoria (valores existentes recebem 'Mantimentos')
ALTER TABLE public.tb_lista_compras
  ADD COLUMN IF NOT EXISTS categoria TEXT DEFAULT 'Mantimentos';

-- 2) Garantir que nenhuma linha fique com categoria nula ou inválida
UPDATE public.tb_lista_compras
SET categoria = 'Mantimentos'
WHERE categoria IS NULL
   OR categoria NOT IN ('Mantimentos', 'Higiene / limpeza', 'Feira', 'Carnes');

-- 3) Tornar a coluna obrigatória e definir default
ALTER TABLE public.tb_lista_compras
  ALTER COLUMN categoria SET NOT NULL,
  ALTER COLUMN categoria SET DEFAULT 'Mantimentos';

-- 4) Remover a coluna antiga prioridade
ALTER TABLE public.tb_lista_compras
  DROP COLUMN IF EXISTS prioridade;

-- 5) Constraint de valores permitidos (ignora se já existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tb_lista_compras'::regclass
      AND conname = 'tb_lista_compras_categoria_check'
  ) THEN
    ALTER TABLE public.tb_lista_compras
      ADD CONSTRAINT tb_lista_compras_categoria_check
      CHECK (categoria IN ('Mantimentos', 'Higiene / limpeza', 'Feira', 'Carnes'));
  END IF;
END $$;

-- 6) Índice para ordenação/filtro por categoria
CREATE INDEX IF NOT EXISTS idx_tb_lista_compras_categoria
  ON public.tb_lista_compras (categoria);

-- 7) Remover índice antigo de prioridade (se existir)
DROP INDEX IF EXISTS public.idx_tb_lista_compras_prioridade;
