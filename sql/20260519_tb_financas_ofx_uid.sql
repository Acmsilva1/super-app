-- Identificador único de transação OFX (FITID + conta) para evitar duplicatas na reimportação
ALTER TABLE tb_financas
  ADD COLUMN IF NOT EXISTS ofx_uid TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tb_financas_ofx_uid_key
  ON tb_financas (ofx_uid)
  WHERE ofx_uid IS NOT NULL;
