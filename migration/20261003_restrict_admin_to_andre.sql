-- Restringe os controles RLS administrativos a conta do proprietario do Super App.
-- A autorizacao no backend tambem valida UUID, email e papel administrativo.
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() = 'f88a6351-317d-425b-afcd-9430c8a34f53'::uuid
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'andrecarlos.miranda@gmail.com';
$$;

comment on function public.is_app_admin() is
  'True only for the Super App owner account (UUID and email verified).';
