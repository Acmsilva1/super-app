-- Republicar o código anterior junto com este rollback. Preserva histórico e lançamentos.
begin;
do $$ begin
 if exists(select 1 from public.tb_telegram_compras where status='pending' and payload ? 'items' and created_at >= now()-interval '15 minutes') then
  raise exception 'Existem lotes pendentes: confirme ou cancele antes do rollback';
 end if;
end; $$;
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
