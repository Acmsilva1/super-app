-- Resgates da poupanca como movimentos negativos no mesmo livro-caixa.
-- A funcao serializa resgates por usuario e impede saldo negativo.

begin;

alter table public.tb_poupanca
  add column if not exists motivo_resgate text;

alter table public.tb_poupanca
  drop constraint if exists tb_poupanca_resgate_motivo_check;

alter table public.tb_poupanca
  add constraint tb_poupanca_resgate_motivo_check
  check (
    (valor >= 0 and motivo_resgate is null)
    or (
      valor < 0
      and char_length(trim(coalesce(motivo_resgate, ''))) between 1 and 240
    )
  ) not valid;

create or replace function public.resgatar_poupanca(
  p_user_id uuid,
  p_valor numeric,
  p_motivo text,
  p_data_lancamento date default current_date
)
returns setof public.tb_poupanca
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_valor numeric(12,2);
  v_motivo text;
  v_saldo numeric(12,2);
  v_row public.tb_poupanca%rowtype;
begin
  if p_user_id is null then
    raise exception 'usuario obrigatorio para resgate';
  end if;

  v_valor := round(p_valor, 2);
  v_motivo := trim(coalesce(p_motivo, ''));

  if v_valor is null or v_valor <= 0 then
    raise exception 'valor do resgate deve ser maior que zero';
  end if;
  if char_length(v_motivo) not between 1 and 240 then
    raise exception 'motivo do resgate deve ter entre 1 e 240 caracteres';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select coalesce(sum(valor), 0)::numeric(12,2)
    into v_saldo
  from public.tb_poupanca
  where user_id = p_user_id;

  if v_valor > v_saldo then
    raise exception 'saldo insuficiente para este resgate';
  end if;

  insert into public.tb_poupanca (
    user_id, descricao, valor, motivo_resgate, data_lancamento
  ) values (
    p_user_id, 'Resgate', -v_valor, v_motivo, coalesce(p_data_lancamento, current_date)
  )
  returning * into v_row;

  return next v_row;
end;
$$;

revoke all on function public.resgatar_poupanca(uuid, numeric, text, date) from public, anon, authenticated;
grant execute on function public.resgatar_poupanca(uuid, numeric, text, date) to service_role;

comment on column public.tb_poupanca.motivo_resgate is
  'Motivo obrigatorio apenas para movimentos negativos de resgate.';

commit;
