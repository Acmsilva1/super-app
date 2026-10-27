-- Remove tipo carne e tabela de pagos do carnê. Converta alertas tipo=carne antes.
begin;
do $$
begin
  if exists (select 1 from public.tb_financeiro_alertas where tipo = 'carne') then
    raise exception 'Converta ou exclua alertas do tipo carne antes do rollback';
  end if;
end $$;
alter table public.tb_financeiro_alertas drop constraint if exists tb_financeiro_alertas_tipo_check;
alter table public.tb_financeiro_alertas add constraint tb_financeiro_alertas_tipo_check
  check (tipo in ('diario','fixas','mensal','mensagem','receitas','poupanca','simulador','geral'));
alter table public.tb_financeiro_alertas drop constraint if exists financeiro_alertas_resumo_padrao_check;
alter table public.tb_financeiro_alertas add constraint financeiro_alertas_resumo_padrao_check
  check (horarios is null or (tipo in ('diario','fixas','receitas','poupanca','simulador','geral') and mensagem = ''));
drop table if exists public.tb_financeiro_carne_pago;
commit;
