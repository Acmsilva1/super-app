-- Analista financeiro em modo single-user
-- O app nao possui autenticacao de usuario neste fluxo, entao o user_id nao pode bloquear o insert.

ALTER TABLE tb_financeiro_analises
  ALTER COLUMN user_id DROP NOT NULL;

COMMENT ON COLUMN tb_financeiro_analises.user_id IS
  'Campo opcional no modo single-user do analista financeiro. Quando houver auth, pode voltar a ser obrigatorio.';
