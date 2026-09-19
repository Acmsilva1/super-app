-- Modulo Saude: data escolhida para cada medicao do perfil.
-- Dependencia: 20260914_create_saude_perfis.sql.

begin;

alter table public.tb_saude_perfis
  add column if not exists data_medicao date;

update public.tb_saude_perfis perfil
set data_medicao = coalesce(
  (
    select (medida.registrado_em at time zone 'America/Sao_Paulo')::date
    from public.tb_saude_perfil_medidas medida
    where medida.perfil_id = perfil.id
    order by medida.id desc
    limit 1
  ),
  (perfil.created_at at time zone 'America/Sao_Paulo')::date
)
where perfil.data_medicao is null;

alter table public.tb_saude_perfis
  alter column data_medicao set default current_date,
  alter column data_medicao set not null;

create or replace function public.registrar_saude_perfil_medidas()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.tb_saude_perfil_medidas (
      perfil_id, created_by, peso_kg, altura_cm, cintura_cm, quadril_cm, peito_cm, braco_cm, coxa_cm, registrado_em
    ) values (
      new.id, new.created_by, new.peso_kg, new.altura_cm, new.cintura_cm, new.quadril_cm, new.peito_cm, new.braco_cm, new.coxa_cm,
      (new.data_medicao + time '12:00') at time zone 'America/Sao_Paulo'
    );
  elsif (new.peso_kg, new.altura_cm, new.cintura_cm, new.quadril_cm, new.peito_cm, new.braco_cm, new.coxa_cm)
       is distinct from
       (old.peso_kg, old.altura_cm, old.cintura_cm, old.quadril_cm, old.peito_cm, old.braco_cm, old.coxa_cm) then
    if not exists (
      select 1 from public.tb_saude_perfil_medidas medida
      where medida.id = (
        select id from public.tb_saude_perfil_medidas
        where perfil_id = new.id and created_by = new.created_by
        order by id desc limit 1
      )
      and (medida.peso_kg, medida.altura_cm, medida.cintura_cm, medida.quadril_cm, medida.peito_cm, medida.braco_cm, medida.coxa_cm)
        is not distinct from
        (new.peso_kg, new.altura_cm, new.cintura_cm, new.quadril_cm, new.peito_cm, new.braco_cm, new.coxa_cm)
      and (medida.registrado_em at time zone 'America/Sao_Paulo')::date = new.data_medicao
    ) then
      insert into public.tb_saude_perfil_medidas (
        perfil_id, created_by, peso_kg, altura_cm, cintura_cm, quadril_cm, peito_cm, braco_cm, coxa_cm, registrado_em
      ) values (
        new.id, new.created_by, new.peso_kg, new.altura_cm, new.cintura_cm, new.quadril_cm, new.peito_cm, new.braco_cm, new.coxa_cm,
        (new.data_medicao + time '12:00') at time zone 'America/Sao_Paulo'
      );
    end if;
  elsif new.data_medicao is distinct from old.data_medicao then
    update public.tb_saude_perfil_medidas
    set registrado_em = (new.data_medicao + time '12:00') at time zone 'America/Sao_Paulo'
    where id = (
      select id
      from public.tb_saude_perfil_medidas
      where perfil_id = new.id and created_by = new.created_by
      order by id desc
      limit 1
    );
  end if;
  return new;
end;
$$;

comment on column public.tb_saude_perfis.data_medicao is
  'Data escolhida para a medicao corporal atual e para seu registro na linha do tempo.';

grant update, delete on public.tb_saude_perfil_medidas to authenticated;

drop policy if exists tb_saude_perfil_medidas_own_update on public.tb_saude_perfil_medidas;
create policy tb_saude_perfil_medidas_own_update on public.tb_saude_perfil_medidas
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists tb_saude_perfil_medidas_own_delete on public.tb_saude_perfil_medidas;
create policy tb_saude_perfil_medidas_own_delete on public.tb_saude_perfil_medidas
  for delete to authenticated using (created_by = auth.uid());

commit;

-- Rollback manual (nao executar junto com a migration):
-- begin;
-- restaurar a funcao public.registrar_saude_perfil_medidas() da migration 20260914_create_saude_perfis.sql;
-- alter table public.tb_saude_perfis drop column if exists data_medicao;
-- commit;
