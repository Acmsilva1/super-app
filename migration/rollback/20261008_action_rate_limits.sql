begin;
drop function if exists public.consume_action_limit(text,integer,integer);
drop table if exists public.tb_action_rate_limits;
commit;
