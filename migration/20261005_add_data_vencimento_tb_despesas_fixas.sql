ALTER TABLE tb_despesas_fixas
  ADD COLUMN IF NOT EXISTS data_vencimento date;

COMMENT ON COLUMN tb_despesas_fixas.data_vencimento IS 'Data de vencimento da despesa fixa no mês de competência';
