-- Remocao definitiva de calendario e campos tecnicos de Telegram
DROP TABLE IF EXISTS tb_calendario CASCADE;

ALTER TABLE IF EXISTS tb_saude_familiar
  DROP COLUMN IF EXISTS telegram_sent,
  DROP COLUMN IF EXISTS telegram_sent_at;

-- Auditoria simples de colunas Telegram remanescentes
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('telegram_sent', 'telegram_sent_at')
ORDER BY table_name, column_name;
