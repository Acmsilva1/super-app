begin;
create table if not exists public.tb_admin_alert_channels (
  id text primary key check (id = 'alerts'),
  telegram_enabled boolean not null default true,
  whatsapp_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.tb_admin_alert_channels (id, telegram_enabled, whatsapp_enabled)
values ('alerts', true, true)
on conflict (id) do nothing;
alter table public.tb_admin_alert_channels enable row level security;
revoke all on public.tb_admin_alert_channels from anon, authenticated;
grant select, insert, update on public.tb_admin_alert_channels to service_role;
commit;
