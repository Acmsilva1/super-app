-- Coluna para identificar a série única (crachá) de despesas fixas / parceladas
ALTER TABLE tb_despesas_fixas ADD COLUMN IF NOT EXISTS serie_id TEXT;

-- Índice para otimizar busca por série na limpeza em cascata e replicação
CREATE INDEX IF NOT EXISTS idx_tb_despesas_fixas_serie_id ON tb_despesas_fixas(serie_id);
