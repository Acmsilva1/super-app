-- ============================================================
-- SEED: Módulo Financeiro — 60 dias de dados mock
-- Usuário: f88a6351-317d-425b-afcd-9430c8a34f53
-- ============================================================

DO $$
DECLARE
  uid UUID := 'f88a6351-317d-425b-afcd-9430c8a34f53';
  serie TEXT := gen_random_uuid()::text;
BEGIN

-- ============================================================
-- LIMPA DADOS ANTERIORES DO USUÁRIO
-- ============================================================
DELETE FROM superapp.tb_financas       WHERE user_id = uid;
DELETE FROM superapp.tb_despesas_fixas WHERE user_id = uid;
DELETE FROM superapp.tb_poupanca       WHERE user_id = uid;

-- ============================================================
-- tb_financas — RECEITAS (salário + freelas + extras)
-- ============================================================
INSERT INTO superapp.tb_financas (user_id, descricao, valor, tipo, categoria, data_lancamento) VALUES
  (uid, 'Salário Junho',          6500.00, 'receita', 'Salário',     CURRENT_DATE - 60),
  (uid, 'Freela Design Web',       900.00, 'receita', 'Freelancer',  CURRENT_DATE - 52),
  (uid, 'Salário Julho',          6500.00, 'receita', 'Salário',     CURRENT_DATE - 30),
  (uid, 'Venda Notebook Antigo',  1200.00, 'receita', 'Venda',       CURRENT_DATE - 22),
  (uid, 'Freela Backend API',     1500.00, 'receita', 'Freelancer',  CURRENT_DATE - 14),
  (uid, 'Rendimento CDB',          180.00, 'receita', 'Investimento', CURRENT_DATE - 7),
  (uid, 'Reembolso Empresa',       350.00, 'receita', 'Reembolso',   CURRENT_DATE - 3);

-- ============================================================
-- tb_financas — GASTOS VARIADOS (espalhados pelos 60 dias)
-- ============================================================
INSERT INTO superapp.tb_financas (user_id, descricao, valor, tipo, categoria, data_lancamento) VALUES
  -- Semana 1 (D-60 a D-53)
  (uid, 'Supermercado Pão de Açúcar',  320.00, 'gasto_variado', 'Alimentação',  CURRENT_DATE - 59),
  (uid, 'Uber ida ao aeroporto',        67.50, 'gasto_variado', 'Transporte',   CURRENT_DATE - 58),
  (uid, 'Farmácia Drogasil',            89.90, 'gasto_variado', 'Saúde',        CURRENT_DATE - 57),
  (uid, 'iFood — Pizza',                54.00, 'gasto_variado', 'Alimentação',  CURRENT_DATE - 56),
  (uid, 'Netflix',                       39.90, 'gasto_variado', 'Lazer',       CURRENT_DATE - 55),
  (uid, 'Posto Shell — Gasolina',       230.00, 'gasto_variado', 'Transporte',  CURRENT_DATE - 54),
  (uid, 'Padaria São Geraldo',           38.00, 'gasto_variado', 'Alimentação', CURRENT_DATE - 53),

  -- Semana 2 (D-52 a D-46)
  (uid, 'Restaurante Fogo de Chão',    195.00, 'gasto_variado', 'Alimentação',  CURRENT_DATE - 51),
  (uid, 'Mercado Extra',               280.00, 'gasto_variado', 'Alimentação',  CURRENT_DATE - 50),
  (uid, 'Cinema + Pipoca',              72.00, 'gasto_variado', 'Lazer',        CURRENT_DATE - 49),
  (uid, 'Academia SmartFit',            99.90, 'gasto_variado', 'Saúde',        CURRENT_DATE - 48),
  (uid, 'Shopee — Cabo USB',            24.90, 'gasto_variado', 'Eletrônicos',  CURRENT_DATE - 47),
  (uid, 'iFood — Sushi',                88.00, 'gasto_variado', 'Alimentação',  CURRENT_DATE - 46),

  -- Semana 3 (D-45 a D-39)
  (uid, 'Farmácia Pacheco',             45.00, 'gasto_variado', 'Saúde',        CURRENT_DATE - 45),
  (uid, 'Uber Corridas',                95.00, 'gasto_variado', 'Transporte',   CURRENT_DATE - 44),
  (uid, 'Supermercado Carrefour',      365.00, 'gasto_variado', 'Alimentação',  CURRENT_DATE - 43),
  (uid, 'Spotify Premium',             21.90, 'gasto_variado', 'Lazer',         CURRENT_DATE - 42),
  (uid, 'Lanches Semana',              145.00, 'gasto_variado', 'Alimentação',  CURRENT_DATE - 41),
  (uid, 'Estacionamento Shopping',      25.00, 'gasto_variado', 'Transporte',   CURRENT_DATE - 40),
  (uid, 'Amazon — Livro TI',            79.90, 'gasto_variado', 'Educação',     CURRENT_DATE - 39),

  -- Semana 4 (D-38 a D-32)
  (uid, 'Dentista Consulta',           250.00, 'gasto_variado', 'Saúde',        CURRENT_DATE - 37),
  (uid, 'Posto Ipiranga',              210.00, 'gasto_variado', 'Transporte',   CURRENT_DATE - 36),
  (uid, 'iFood — Hamburguer',           62.00, 'gasto_variado', 'Alimentação',  CURRENT_DATE - 35),
  (uid, 'Supermercado Zona Sul',       295.00, 'gasto_variado', 'Alimentação',  CURRENT_DATE - 34),
  (uid, 'Curso Udemy',                  39.90, 'gasto_variado', 'Educação',     CURRENT_DATE - 33),
  (uid, 'Presente Aniversário',        120.00, 'gasto_variado', 'Lazer',        CURRENT_DATE - 32),

  -- Semana 5 (D-31 a D-25)
  (uid, 'Supermercado Pão de Açúcar',  340.00, 'gasto_variado', 'Alimentação', CURRENT_DATE - 30),
  (uid, 'Bar com Amigos',               98.00, 'gasto_variado', 'Lazer',        CURRENT_DATE - 29),
  (uid, 'Uber — Semana',               112.00, 'gasto_variado', 'Transporte',   CURRENT_DATE - 28),
  (uid, 'Farmácia — Vitaminas',         67.80, 'gasto_variado', 'Saúde',        CURRENT_DATE - 27),
  (uid, 'HBO Max',                      34.90, 'gasto_variado', 'Lazer',        CURRENT_DATE - 26),
  (uid, 'Padaria Confeitaria',          52.00, 'gasto_variado', 'Alimentação',  CURRENT_DATE - 25),

  -- Semana 6 (D-24 a D-18)
  (uid, 'Manutenção Carro Mecânico',  480.00, 'gasto_variado', 'Transporte',   CURRENT_DATE - 23),
  (uid, 'Mercado Hortifruti',          165.00, 'gasto_variado', 'Alimentação',  CURRENT_DATE - 22),
  (uid, 'iFood — Japonês',              95.00, 'gasto_variado', 'Alimentação',  CURRENT_DATE - 21),
  (uid, 'Academia — Mensalidade',       99.90, 'gasto_variado', 'Saúde',        CURRENT_DATE - 20),
  (uid, 'Shopee — Fone Bluetooth',     149.00, 'gasto_variado', 'Eletrônicos',  CURRENT_DATE - 19),
  (uid, 'Churrasco Final de Semana',   220.00, 'gasto_variado', 'Alimentação',  CURRENT_DATE - 18),

  -- Semana 7 (D-17 a D-11)
  (uid, 'Supermercado Extra',          310.00, 'gasto_variado', 'Alimentação',  CURRENT_DATE - 17),
  (uid, 'Uber — Semana',               130.00, 'gasto_variado', 'Transporte',   CURRENT_DATE - 16),
  (uid, 'Farmácia São João',            38.50, 'gasto_variado', 'Saúde',        CURRENT_DATE - 15),
  (uid, 'Netflix',                       39.90, 'gasto_variado', 'Lazer',       CURRENT_DATE - 14),
  (uid, 'Restaurante Japonês',          175.00, 'gasto_variado', 'Alimentação', CURRENT_DATE - 13),
  (uid, 'Posto Shell',                  220.00, 'gasto_variado', 'Transporte',  CURRENT_DATE - 12),
  (uid, 'Lanches Semana',              118.00, 'gasto_variado', 'Alimentação',  CURRENT_DATE - 11),

  -- Semana 8 (D-10 a hoje)
  (uid, 'Supermercado Carrefour',      290.00, 'gasto_variado', 'Alimentação',  CURRENT_DATE - 10),
  (uid, 'Spotify',                      21.90, 'gasto_variado', 'Lazer',        CURRENT_DATE - 9),
  (uid, 'Amazon — Periférico',         199.00, 'gasto_variado', 'Eletrônicos',  CURRENT_DATE - 8),
  (uid, 'Bar Boteco do Zé',             75.00, 'gasto_variado', 'Lazer',        CURRENT_DATE - 7),
  (uid, 'Farmácia — Remédio',           55.00, 'gasto_variado', 'Saúde',        CURRENT_DATE - 6),
  (uid, 'iFood — Pizza',                68.00, 'gasto_variado', 'Alimentação',  CURRENT_DATE - 5),
  (uid, 'Uber',                          45.00, 'gasto_variado', 'Transporte',  CURRENT_DATE - 4),
  (uid, 'Padaria',                       32.00, 'gasto_variado', 'Alimentação', CURRENT_DATE - 3),
  (uid, 'Mercado Hortifruti',           145.00, 'gasto_variado', 'Alimentação', CURRENT_DATE - 2),
  (uid, 'Lanche Rápido',                28.00, 'gasto_variado', 'Alimentação',  CURRENT_DATE - 1),
  (uid, 'Supermercado Hoje',           185.00, 'gasto_variado', 'Alimentação',  CURRENT_DATE);

-- ============================================================
-- tb_despesas_fixas — contas fixas (2 meses)
-- ============================================================
INSERT INTO superapp.tb_despesas_fixas (user_id, descricao, valor, status, categoria, conta_fixa, parcela_atual, parcela_total, serie_id) VALUES
  -- Mês passado
  (uid, 'Aluguel Junho',      1800.00, 'pago',     'Moradia',      true,  NULL, NULL, serie || '-aluguel'),
  (uid, 'Energia Elétrica',    185.00, 'pago',     'Moradia',      true,  NULL, NULL, serie || '-energia'),
  (uid, 'Internet Fibra',      109.90, 'pago',     'Moradia',      true,  NULL, NULL, serie || '-internet'),
  (uid, 'Plano de Saúde',      450.00, 'pago',     'Saúde',        true,  NULL, NULL, serie || '-saude'),
  (uid, 'IPVA Parcela 5/12',   320.00, 'pago',     'Transporte',   false, 5,    12,   serie || '-ipva'),
  (uid, 'TV Samsung 55" 3/12', 299.00, 'pago',     'Eletrônicos',  false, 3,    12,   serie || '-tv'),
  (uid, 'Seguro Auto Junho',   220.00, 'pago',     'Transporte',   true,  NULL, NULL, serie || '-seguro'),
  -- Mês atual
  (uid, 'Aluguel Julho',      1800.00, 'pendente', 'Moradia',      true,  NULL, NULL, serie || '-aluguel'),
  (uid, 'Energia Elétrica',    172.00, 'pendente', 'Moradia',      true,  NULL, NULL, serie || '-energia'),
  (uid, 'Internet Fibra',      109.90, 'pago',     'Moradia',      true,  NULL, NULL, serie || '-internet'),
  (uid, 'Plano de Saúde',      450.00, 'pago',     'Saúde',        true,  NULL, NULL, serie || '-saude'),
  (uid, 'IPVA Parcela 6/12',   320.00, 'pendente', 'Transporte',   false, 6,    12,   serie || '-ipva'),
  (uid, 'TV Samsung 55" 4/12', 299.00, 'pendente', 'Eletrônicos',  false, 4,    12,   serie || '-tv'),
  (uid, 'Seguro Auto Julho',   220.00, 'pendente', 'Transporte',   true,  NULL, NULL, serie || '-seguro');

-- ============================================================
-- tb_poupanca — depósitos e resgates
-- ============================================================
INSERT INTO superapp.tb_poupanca (user_id, valor, tipo, data_lancamento) VALUES
  (uid,  500.00, 'deposito',  CURRENT_DATE - 58),
  (uid,  300.00, 'deposito',  CURRENT_DATE - 45),
  (uid, -150.00, 'resgate',   CURRENT_DATE - 38),
  (uid,  700.00, 'deposito',  CURRENT_DATE - 30),
  (uid,  400.00, 'deposito',  CURRENT_DATE - 15),
  (uid, -200.00, 'resgate',   CURRENT_DATE - 10),
  (uid,  600.00, 'deposito',  CURRENT_DATE - 2);

RAISE NOTICE 'Seed financeiro concluído para usuário %', uid;
END $$;
