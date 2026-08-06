-- Adiciona colunas para suportar o módulo de compras variadas na tabela tb_financas
ALTER TABLE tb_financas
  ADD COLUMN IF NOT EXISTS local text,
  ADD COLUMN IF NOT EXISTS metodo_pagamento text,
  ADD COLUMN IF NOT EXISTS tipo_gasto text;

COMMENT ON COLUMN tb_financas.local IS 'Local/estabelecimento onde foi feita a compra';
COMMENT ON COLUMN tb_financas.metodo_pagamento IS 'Forma de pagamento da compra (debito ou credito)';
COMMENT ON COLUMN tb_financas.tipo_gasto IS 'Subtipo de gasto para diferenciacao (gasto_variado ou compra_variada)';
