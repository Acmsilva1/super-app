-- 20260408_add_notes_table.sql
-- Tabela para o sistema de notas gamer (NeonKeep)

CREATE TABLE IF NOT EXISTS public.tb_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL DEFAULT 'Nova Nota',
    content TEXT,
    items JSONB DEFAULT '[]', -- Para quando for checklist
    color TEXT DEFAULT '#00ffbb', -- Neon Emerald padrão
    x_pos INTEGER DEFAULT 100,
    y_pos INTEGER DEFAULT 100,
    is_pinned BOOLEAN DEFAULT false,
    is_archived BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ativar RLS
ALTER TABLE public.tb_notes ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso (Acesso público para simplicidade conforme padrão do app atual)
CREATE POLICY "Permitir todos os acessos publicos" ON public.tb_notes
    FOR ALL USING (true) WITH CHECK (true);

-- Gatilho para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tb_notes_updated_at
    BEFORE UPDATE ON public.tb_notes
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
