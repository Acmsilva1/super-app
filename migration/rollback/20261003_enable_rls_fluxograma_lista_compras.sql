-- Reverte a concessao multiusuario, mantendo user_id e os dados existentes.
begin;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('tb_lista_compras', 'tb_fluxograma_projetos')
  loop
    execute format('drop policy %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end $$;

create policy tb_lista_compras_admin_only
  on public.tb_lista_compras for all to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());
create policy tb_fluxograma_projetos_admin_only
  on public.tb_fluxograma_projetos for all to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());

update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
  || jsonb_build_object('name', 'Jobson Cabral Rodrigues')
where lower(email) = lower('julianacrv35@gmail.com');

commit;
