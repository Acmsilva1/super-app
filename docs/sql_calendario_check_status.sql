ALTER TABLE tb_calendario
  ADD COLUMN IF NOT EXISTS check_status text,
  ADD COLUMN IF NOT EXISTS check_updated_at timestamptz;

ALTER TABLE tb_calendario
  DROP CONSTRAINT IF EXISTS tb_calendario_check_status_chk;

ALTER TABLE tb_calendario
  ADD CONSTRAINT tb_calendario_check_status_chk
  CHECK (check_status IS NULL OR check_status IN ('confirmado', 'nao_confirmado'));

CREATE INDEX IF NOT EXISTS idx_tb_calendario_check_status ON tb_calendario (check_status);
