-- Executar apenas se for necessário reverter a migration de meta calórica.
-- O rollback remove valores preenchidos em meta_calorias.
begin;

alter table public.tb_saude_dietas
  drop constraint if exists tb_saude_dietas_meta_calorias_check;
alter table public.tb_saude_dietas
  drop column if exists meta_calorias;

commit;
