-- =============================================================================
-- Migration: Remover 100% o modo Analista ML do Supabase (Produção)
-- Deixa o módulo financeiro mais leve, eliminando tabelas de histórico e modelos.
-- Execute no SQL Editor do Supabase oficial.
-- =============================================================================

BEGIN;

-- 1. Drop da View do Analista
DROP VIEW IF EXISTS public.vw_financeiro_ultimos_5_meses CASCADE;

-- 2. Drop das Tabelas do Analista ML
DROP TABLE IF EXISTS public.tb_financeiro_analises CASCADE;
DROP TABLE IF EXISTS public.tb_financeiro_features_mensais CASCADE;
DROP TABLE IF EXISTS public.tb_financeiro_analise_runs CASCADE;
DROP TABLE IF EXISTS public.tb_financeiro_modelo_estado CASCADE;

COMMIT;
