-- Only removes executable entry point; keeps purchase history for recovery.
begin;
drop function if exists public.telegram_confirm_purchase(uuid,text,text,uuid,boolean);
commit;
