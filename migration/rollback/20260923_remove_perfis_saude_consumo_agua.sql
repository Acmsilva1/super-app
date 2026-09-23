-- Reversao segura somente quando nao existem varios perfis por usuario.

begin;

do $$
begin
  if exists (
    select 1 from public.tb_saude_agua_perfis group by created_by having count(*) > 1
  ) then
    raise exception 'Rollback cancelado: existem usuarios com varios perfis de agua.';
  end if;
end $$;

alter table public.tb_saude_agua_metas drop constraint if exists tb_saude_agua_metas_perfil_usuario_fkey;
alter table public.tb_saude_agua_logs drop constraint if exists tb_saude_agua_logs_perfil_usuario_fkey;
alter table public.tb_saude_agua_metas drop constraint if exists tb_saude_agua_metas_pkey;
alter table public.tb_saude_agua_metas add constraint tb_saude_agua_metas_pkey primary key (created_by);
alter table public.tb_saude_agua_logs drop constraint if exists tb_saude_agua_logs_usuario_perfil_dia_key;
alter table public.tb_saude_agua_logs add constraint tb_saude_agua_logs_usuario_dia_key unique (created_by, data_local);
alter table public.tb_saude_agua_metas drop column if exists perfil_id;
alter table public.tb_saude_agua_logs drop column if exists perfil_id;
drop index if exists public.idx_saude_agua_logs_usuario_perfil_data;
create index if not exists idx_saude_agua_logs_usuario_data
  on public.tb_saude_agua_logs (created_by, data_local desc);
drop table if exists public.tb_saude_agua_perfis;

commit;
