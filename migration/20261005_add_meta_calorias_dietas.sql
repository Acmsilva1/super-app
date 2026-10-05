-- Meta calorica diaria para o alerta de cardapio.
-- Os kcal de cada alimento ficam nos itens JSON de tb_saude_dietas.refeicoes.
begin;

alter table public.tb_saude_dietas
  add column if not exists meta_calorias integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tb_saude_dietas_meta_calorias_check'
      and conrelid = 'public.tb_saude_dietas'::regclass
  ) then
    alter table public.tb_saude_dietas
      add constraint tb_saude_dietas_meta_calorias_check
      check (meta_calorias is null or meta_calorias between 500 and 10000);
  end if;
end;
$$;

comment on column public.tb_saude_dietas.meta_calorias is
  'Meta diaria em kcal usada para comparar o total calorico informado no plano alimentar.';

commit;
