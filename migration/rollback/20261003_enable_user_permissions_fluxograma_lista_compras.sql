-- Revoga acesso multiusuario aos modulos e restaura acesso somente ao admin.
-- Mantem user_id e dados para permitir reaplicar a migration sem perda.
begin;

do $$
declare
  t text;
  r record;
begin
  foreach t in array array['tb_lista_compras', 'tb_fluxograma_projetos'] loop
    if to_regclass(format('public.%I', t)) is null then continue; end if;
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;
    execute format('create policy %I on public.%I for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin())', t || '_admin_only', t);
  end loop;
end;
$$;

commit;
