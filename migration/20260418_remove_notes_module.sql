-- 20260418_remove_notes_module.sql
-- Remocao completa do modulo de notas (Neon Keep)
-- Executar no Supabase SQL Editor para remover estrutura e dados.

BEGIN;

-- Remove dependencias de trigger/policy antes das tabelas, quando existirem.
DROP TRIGGER IF EXISTS tr_update_neon_notes_updated_at ON public.neon_notes;
DROP TRIGGER IF EXISTS update_tb_notes_updated_at ON public.tb_notes;

DROP POLICY IF EXISTS "Permitir todos os acessos publicos" ON public.tb_notes;

-- Remove as tabelas e todos os dados.
DROP TABLE IF EXISTS public.neon_notes CASCADE;
DROP TABLE IF EXISTS public.tb_notes CASCADE;

COMMIT;

