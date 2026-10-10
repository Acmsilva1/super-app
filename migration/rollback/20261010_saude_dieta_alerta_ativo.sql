-- Reverter somente junto do código anterior; remover a seleção faria o bot enviar todas as dietas.
begin;
do $$ begin
 if exists(select 1 from public.tb_saude_dietas where not alerta_ativo) then
  raise exception 'Há dietas com alertas desligados. Revise a agenda antes de reverter a seleção.';
 end if;
end $$;
alter table public.tb_saude_dietas drop column if exists alerta_ativo;
notify pgrst, 'reload schema';
commit;
