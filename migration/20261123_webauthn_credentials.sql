-- Credenciais WebAuthn (biometria de plataforma) para login no SUPERAPP.
create table if not exists public.superapp_webauthn_credentials (
  credential_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  public_key text not null,
  counter bigint not null default 0,
  device_type text,
  backed_up boolean not null default false,
  transports text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists superapp_webauthn_credentials_user_idx
  on public.superapp_webauthn_credentials (user_id);

comment on table public.superapp_webauthn_credentials is
  'Credenciais WebAuthn de plataforma para login biométrico neste aparelho.';

alter table public.superapp_webauthn_credentials enable row level security;
alter table public.superapp_webauthn_credentials force row level security;

revoke all on public.superapp_webauthn_credentials from anon, authenticated;
grant select, insert, update, delete on public.superapp_webauthn_credentials to service_role;
