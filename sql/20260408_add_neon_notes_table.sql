-- Tabela para o modulo NeonKeep (Notas Draggable)
-- Author: Antigravity
-- Date: 2026-04-08

CREATE TABLE IF NOT EXISTS public.neon_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT DEFAULT '',
    content TEXT DEFAULT '',
    color TEXT DEFAULT '#00ffbb', -- Neon Emerald padrão
    x_pos INTEGER DEFAULT 50,
    y_pos INTEGER DEFAULT 50,
    is_pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Habilitar RLS (Row Level Security) caso necessário futuramente
-- ALTER TABLE public.neon_notes ENABLE ROW LEVEL SECURITY;

-- Trigger para atualizar o campo updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS tr_update_neon_notes_updated_at ON public.neon_notes;
CREATE TRIGGER tr_update_neon_notes_updated_at
    BEFORE UPDATE ON public.neon_notes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
