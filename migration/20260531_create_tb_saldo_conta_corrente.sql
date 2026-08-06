-- Saldo manual da conta corrente do modulo financeiro
CREATE TABLE IF NOT EXISTS tb_saldo_conta_corrente (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  valor numeric(14,2) NOT NULL DEFAULT 0,
  negativo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE tb_saldo_conta_corrente IS 'Saldo manual da conta corrente, usado pelo modulo financeiro para refletir saldo real e cheque especial.';
COMMENT ON COLUMN tb_saldo_conta_corrente.valor IS 'Valor absoluto do saldo manual da conta corrente.';
COMMENT ON COLUMN tb_saldo_conta_corrente.negativo IS 'Indica se o saldo deve ser exibido como negativo.';
COMMENT ON COLUMN tb_saldo_conta_corrente.updated_at IS 'Momento da ultima atualizacao manual ou automatica do saldo.';
