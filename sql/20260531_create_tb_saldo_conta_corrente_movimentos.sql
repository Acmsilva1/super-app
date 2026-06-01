-- Historico de movimentos do saldo manual da conta corrente
CREATE TABLE IF NOT EXISTS tb_saldo_conta_corrente_movimentos (
  id bigserial PRIMARY KEY,
  saldo_anterior numeric(14,2) NOT NULL DEFAULT 0,
  delta numeric(14,2) NOT NULL DEFAULT 0,
  saldo_atual numeric(14,2) NOT NULL DEFAULT 0,
  valor numeric(14,2) NOT NULL DEFAULT 0,
  negativo boolean NOT NULL DEFAULT false,
  tipo_movimento text NOT NULL DEFAULT 'manual',
  origem_tipo text,
  origem_id text,
  descricao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tb_saldo_conta_corrente_movimentos_created_at
  ON tb_saldo_conta_corrente_movimentos (created_at DESC, id DESC);

COMMENT ON TABLE tb_saldo_conta_corrente_movimentos IS 'Historico append-only do saldo manual da conta corrente.';
COMMENT ON COLUMN tb_saldo_conta_corrente_movimentos.saldo_anterior IS 'Saldo anterior ao movimento, em valor assinado.';
COMMENT ON COLUMN tb_saldo_conta_corrente_movimentos.delta IS 'Diferenca aplicada ao saldo, em valor assinado.';
COMMENT ON COLUMN tb_saldo_conta_corrente_movimentos.saldo_atual IS 'Saldo resultante do movimento, em valor assinado.';
COMMENT ON COLUMN tb_saldo_conta_corrente_movimentos.valor IS 'Valor absoluto do saldo resultante.';
COMMENT ON COLUMN tb_saldo_conta_corrente_movimentos.negativo IS 'Indica se o saldo resultante ficou negativo.';
COMMENT ON COLUMN tb_saldo_conta_corrente_movimentos.tipo_movimento IS 'Origem do movimento: manual, insercao, atualizacao, exclusao.';

INSERT INTO tb_saldo_conta_corrente_movimentos (
  saldo_anterior,
  delta,
  saldo_atual,
  valor,
  negativo,
  tipo_movimento,
  origem_tipo,
  origem_id,
  descricao,
  created_at,
  updated_at
)
SELECT
  0,
  CASE WHEN negativo THEN -ABS(valor) ELSE ABS(valor) END,
  CASE WHEN negativo THEN -ABS(valor) ELSE ABS(valor) END,
  ABS(valor),
  negativo,
  'manual',
  'saldo_conta_corrente',
  id::text,
  'Saldo inicial migrado',
  COALESCE(created_at, now()),
  COALESCE(updated_at, now())
FROM tb_saldo_conta_corrente
WHERE id = 1
  AND NOT EXISTS (
    SELECT 1
    FROM tb_saldo_conta_corrente_movimentos
    LIMIT 1
  );
