begin;
create table if not exists public.tb_action_rate_limits (
  action_key text primary key,
  window_started_at timestamptz not null,
  requests integer not null check(requests > 0)
);
alter table public.tb_action_rate_limits enable row level security;
revoke all on public.tb_action_rate_limits from anon,authenticated;
grant select,insert,update,delete on public.tb_action_rate_limits to service_role;
create or replace function public.consume_action_limit(p_key text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
declare count_used integer;
begin
  if p_key is null or length(p_key) > 100 or p_limit not between 1 and 1000 or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid_limit' using errcode='22023';
  end if;
  insert into public.tb_action_rate_limits(action_key,window_started_at,requests) values(p_key,clock_timestamp(),1)
    on conflict(action_key) do update
    set requests=case when tb_action_rate_limits.window_started_at <= clock_timestamp()-make_interval(secs=>p_window_seconds) then 1 else tb_action_rate_limits.requests+1 end,
        window_started_at=case when tb_action_rate_limits.window_started_at <= clock_timestamp()-make_interval(secs=>p_window_seconds) then clock_timestamp() else tb_action_rate_limits.window_started_at end
    returning requests into count_used;
  delete from public.tb_action_rate_limits where window_started_at < clock_timestamp()-interval '2 days';
  return count_used <= p_limit;
end;
$$;
revoke all on function public.consume_action_limit(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_action_limit(text,integer,integer) to service_role;
commit;
