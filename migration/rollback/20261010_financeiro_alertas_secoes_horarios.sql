-- Reverter o código junto com o schema. Não descarta novos agendamentos.
begin;
do $$ begin
  if exists (select 1 from public.tb_financeiro_alertas where horarios is not null or tipo not in ('diario','fixas','mensal','mensagem')) then
    raise exception 'Converta os novos alertas para cron legado antes do rollback; nenhum dado foi removido.';
  end if;
end $$;
alter table public.tb_financeiro_alertas drop constraint if exists financeiro_alertas_resumo_padrao_check;
alter table public.tb_financeiro_alertas drop constraint if exists financeiro_alertas_horarios_check;
alter table public.tb_financeiro_alertas drop constraint if exists tb_financeiro_alertas_tipo_check;
alter table public.tb_financeiro_alertas add constraint tb_financeiro_alertas_tipo_check check(tipo in ('diario','fixas','mensal','mensagem'));
alter table public.tb_financeiro_alertas drop column if exists horarios;
drop function if exists public.financeiro_alertas_horarios_validos(jsonb);
commit;
