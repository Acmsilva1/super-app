-- Remove a coluna e apaga permanentemente as datas de vencimento já salvas.
ALTER TABLE public.tb_despesas_fixas
  DROP COLUMN IF EXISTS data_vencimento;
