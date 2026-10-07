begin;
drop function if exists public.save_saude_dieta_with_food(bigint, uuid, boolean, jsonb, jsonb, text, integer);
alter table public.tb_saude_alimentos alter column source_order drop default;
drop sequence if exists public.tb_saude_alimentos_source_order_seq;
alter table public.tb_saude_alimentos drop column if exists peso_unidade_g;
commit;
