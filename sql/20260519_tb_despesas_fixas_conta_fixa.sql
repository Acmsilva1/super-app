-- Coluna para indicar se a despesa fixa é recorrente (conta fixa)
ALTER TABLE tb_despesas_fixas
  ADD COLUMN IF NOT EXISTS conta_fixa boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN tb_despesas_fixas.conta_fixa IS 'Se verdadeiro, indica que a conta e fixa e sera copiada automaticamente para o proximo mes';
