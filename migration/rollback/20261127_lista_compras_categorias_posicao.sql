-- Rollback: remove constraint e coluna posicao. Categorias novas permanecem como texto livre.
begin;
alter table public.tb_lista_compras drop constraint if exists tb_lista_compras_categoria_check;
drop index if exists public.idx_tb_lista_compras_user_posicao;
alter table public.tb_lista_compras drop column if exists posicao;
commit;
