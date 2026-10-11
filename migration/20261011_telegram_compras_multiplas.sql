-- Executar após 20261006_telegram_compras.sql, antes de publicar o bot de texto.
-- Mantém rascunhos antigos e confirma um lote inteiro na mesma transação.
begin;
create or replace function public.telegram_confirm_purchase(p_id uuid, p_chat_id text, p_sender_id text, p_owner_id uuid, p_cancel boolean)
returns text language plpgsql security invoker set search_path = public as $$
declare purchase public.tb_telegram_compras%rowtype; items jsonb; item jsonb; amount numeric;
begin
  select id,update_id,chat_id,sender_id,owner_id,payload,status,created_at into purchase
    from public.tb_telegram_compras where id = p_id for update;
  if not found or purchase.chat_id is distinct from p_chat_id
    or purchase.sender_id is distinct from p_sender_id or purchase.owner_id is distinct from p_owner_id then
    return 'unavailable';
  end if;
  if purchase.status <> 'pending' then return purchase.status; end if;
  if purchase.created_at < now() - interval '15 minutes' then return 'expired'; end if;
  if p_cancel then
    update public.tb_telegram_compras set status = 'cancelled' where id = p_id;
    return 'cancelled';
  end if;
  if jsonb_typeof(purchase.payload) is distinct from 'object' then raise exception 'invalid_purchase'; end if;
  items := case when purchase.payload ? 'items' then purchase.payload->'items' else jsonb_build_array(purchase.payload) end;
  if jsonb_typeof(items) is distinct from 'array' then raise exception 'invalid_purchase'; end if;
  if jsonb_array_length(items) not between 1 and 20 then raise exception 'invalid_purchase'; end if;
  for item in select jsonb_array_elements(items) loop
    if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'valor') is distinct from 'number'
      or jsonb_typeof(item->'descricao') is distinct from 'string'
      or item->>'metodo_pagamento' is distinct from 'debito_pix'
      or item->>'tipo' is distinct from 'despesa'
      or jsonb_typeof(item->'data_lancamento') is distinct from 'string' then raise exception 'invalid_purchase'; end if;
    amount := (item->>'valor')::numeric;
    if amount <= 0 or amount >= 10000000 or amount <> round(amount,2)
      or char_length(trim(item->>'descricao')) not between 1 and 120
      or (item->>'descricao') ~ '[[:cntrl:]]'
      or (item->>'data_lancamento') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'invalid_purchase'; end if;
    insert into public.tb_financas(user_id,descricao,valor,tipo,categoria,data_lancamento,metodo_pagamento)
      values(purchase.owner_id,item->>'descricao',amount,'despesa','Outros',(item->>'data_lancamento')::date,'debito_pix');
  end loop;
  update public.tb_telegram_compras set status = 'saved' where id = p_id;
  return 'saved';
end;
$$;
revoke all on function public.telegram_confirm_purchase(uuid,text,text,uuid,boolean) from public,anon,authenticated;
grant execute on function public.telegram_confirm_purchase(uuid,text,text,uuid,boolean) to service_role;
notify pgrst, 'reload schema';
commit;
