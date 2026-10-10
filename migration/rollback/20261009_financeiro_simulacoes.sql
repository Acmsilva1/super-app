-- Reversão sem apagar metas ou resultados. Desabilita o acesso pela aplicação.
begin;
revoke select, insert on public.tb_financeiro_simulacoes from authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke select, insert on public.tb_financeiro_simulacoes from service_role;
  end if;
end $$;
drop policy if exists financeiro_simulacoes_select on public.tb_financeiro_simulacoes;
drop policy if exists financeiro_simulacoes_insert on public.tb_financeiro_simulacoes;
commit;
