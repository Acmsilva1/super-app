-- Reversão preserva agendas e histórico. Reimplante o scheduler anterior
-- para restaurar os três horários fixos. Nenhum dado é apagado.
begin;
update public.tb_financeiro_alertas set ativo=false, updated_at=now();
revoke all on public.tb_financeiro_alertas from anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname='service_role') then
    revoke all on public.tb_financeiro_alertas from service_role;
  end if;
end $$;
commit;
