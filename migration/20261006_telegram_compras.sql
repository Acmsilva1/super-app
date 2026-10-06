begin;
create table if not exists public.tb_telegram_compras (
  id uuid primary key,
  update_id bigint not null unique,
  chat_id text not null,
  sender_id text not null,
  owner_id uuid not null references auth.users(id),
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','saved','cancelled')),
  created_at timestamptz not null default now()
);
alter table public.tb_telegram_compras enable row level security;
revoke all on public.tb_telegram_compras from anon, authenticated;
grant select, insert, update, delete on public.tb_telegram_compras to service_role;

create or replace function public.telegram_confirm_purchase(p_id uuid, p_chat_id text, p_sender_id text, p_owner_id uuid, p_cancel boolean)
returns text language plpgsql security invoker set search_path = public as $$
declare purchase public.tb_telegram_compras%rowtype;
begin
  select * into purchase from public.tb_telegram_compras where id = p_id for update;
  if not found or purchase.chat_id <> p_chat_id or purchase.sender_id <> p_sender_id
    or purchase.owner_id <> p_owner_id then return 'unavailable'; end if;
  if purchase.status <> 'pending' then return purchase.status; end if;
  if purchase.created_at < now() - interval '15 minutes' then return 'expired'; end if;
  if p_cancel then
    update public.tb_telegram_compras set status = 'cancelled' where id = p_id;
    return 'cancelled';
  end if;
  if (purchase.payload->>'valor')::numeric <= 0
    or purchase.payload->>'metodo_pagamento' <> 'debito_pix'
    or purchase.payload->>'tipo' <> 'despesa' then raise exception 'invalid_purchase'; end if;
  insert into public.tb_financas(user_id, descricao, valor, tipo, categoria, data_lancamento, metodo_pagamento)
    values (purchase.owner_id, purchase.payload->>'descricao', (purchase.payload->>'valor')::numeric,
      'despesa', 'Outros', (purchase.payload->>'data_lancamento')::date, 'debito_pix');
  update public.tb_telegram_compras set status = 'saved' where id = p_id;
  return 'saved';
end;
$$;
revoke all on function public.telegram_confirm_purchase(uuid,text,text,uuid,boolean) from public, anon, authenticated;
grant execute on function public.telegram_confirm_purchase(uuid,text,text,uuid,boolean) to service_role;
commit;
