-- Execute no Supabase (SQL Editor) se a coluna ainda não existir:
ALTER TABLE tb_saude_familiar ADD COLUMN IF NOT EXISTS hora_evento text;
