-- Executar depois de 20261010_create_financeiro_alertas.sql.
-- Preserva cron e mensagens dos alertas antigos até sua edição no app.
begin;
alter table public.tb_financeiro_alertas add column if not exists horarios jsonb;
create or replace function public.financeiro_alertas_horarios_validos(value jsonb)
returns boolean language plpgsql immutable set search_path = public as $$
declare item jsonb; text_value text; minutes integer[] := '{}'; current_minute integer; gap integer; i integer;
begin
  if value is null then return true; end if;
  if jsonb_typeof(value) <> 'array' then return false; end if;
  if jsonb_array_length(value) not between 1 and 12 then return false; end if;
  for item in select jsonb_array_elements(value) loop
    if jsonb_typeof(item) <> 'string' then return false; end if;
    text_value := item #>> '{}';
    if text_value !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then return false; end if;
    current_minute := split_part(text_value,':',1)::integer*60 + split_part(text_value,':',2)::integer;
    if current_minute = any(minutes) then return false; end if;
    minutes := array_append(minutes,current_minute);
  end loop;
  select array_agg(n order by n) into minutes from unnest(minutes) n;
  if cardinality(minutes) > 1 then
    for i in 1..cardinality(minutes) loop
      gap := (minutes[(i % cardinality(minutes))+1]-minutes[i]+1440) % 1440;
      if gap < 5 then return false; end if;
    end loop;
  end if;
  return true;
end $$;
alter table public.tb_financeiro_alertas drop constraint if exists tb_financeiro_alertas_tipo_check;
alter table public.tb_financeiro_alertas add constraint tb_financeiro_alertas_tipo_check
  check (tipo in ('diario','fixas','mensal','mensagem','receitas','poupanca','simulador','geral'));
alter table public.tb_financeiro_alertas drop constraint if exists financeiro_alertas_horarios_check;
alter table public.tb_financeiro_alertas add constraint financeiro_alertas_horarios_check
  check (public.financeiro_alertas_horarios_validos(horarios));
alter table public.tb_financeiro_alertas drop constraint if exists financeiro_alertas_resumo_padrao_check;
alter table public.tb_financeiro_alertas add constraint financeiro_alertas_resumo_padrao_check
  check (horarios is null or (tipo in ('diario','fixas','receitas','poupanca','simulador','geral') and mensagem = ''));
commit;
