-- Parcelamento opcional em despesas fixas (parcela atual / total).
-- Execute no Supabase SQL Editor antes de usar o recurso no app.

ALTER TABLE tb_despesas_fixas
  ADD COLUMN IF NOT EXISTS parcela_atual integer,
  ADD COLUMN IF NOT EXISTS parcela_total integer;

COMMENT ON COLUMN tb_despesas_fixas.parcela_atual IS 'Numero da parcela corrente (1..N), quando parcelamento ativo';
COMMENT ON COLUMN tb_despesas_fixas.parcela_total IS 'Total de parcelas (N), quando parcelamento ativo';
