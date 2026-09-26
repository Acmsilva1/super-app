-- Seed idempotente: perfis (se faltarem) + histórico de consumo de água.
-- Execute DEPOIS de migration/20260926_reset_modulo_saude.sql
--
-- Ajuste uid pelo auth.users.id do dono (SQL Editor: select id, email from auth.users;).

begin;

do $$
declare
  uid uuid := 'f88a6351-317d-425b-afcd-9430c8a34f53'; -- troque se necessário
  andre_id bigint;
  juliana_id bigint;
begin
  if not exists (select 1 from auth.users u where u.id = uid) then
    raise exception 'UID % não existe em auth.users — ajuste a variável uid no seed', uid;
  end if;

  insert into public.tb_saude_perfis (
    created_by, nome, sexo, data_nascimento, peso_kg, altura_cm, data_medicao
  )
  select uid, 'André', 'masculino', date '1985-06-15', 80.00, 175.00, current_date
  where not exists (
    select 1
    from public.tb_saude_perfis p
    where p.created_by = uid
      and lower(trim(p.nome)) in ('andré', 'andre')
  );

  insert into public.tb_saude_perfis (
    created_by, nome, sexo, data_nascimento, peso_kg, altura_cm, data_medicao
  )
  select uid, 'Juliana', 'feminino', date '1988-03-20', 65.00, 165.00, current_date
  where not exists (
    select 1
    from public.tb_saude_perfis p
    where p.created_by = uid
      and lower(trim(p.nome)) = 'juliana'
  );

  select p.id into andre_id
  from public.tb_saude_perfis p
  where p.created_by = uid
    and lower(trim(p.nome)) in ('andré', 'andre')
  order by p.id
  limit 1;

  select p.id into juliana_id
  from public.tb_saude_perfis p
  where p.created_by = uid
    and lower(trim(p.nome)) = 'juliana'
  order by p.id
  limit 1;

  if andre_id is null or juliana_id is null then
    raise exception 'Falha ao resolver perfis (André %, Juliana %)', andre_id, juliana_id;
  end if;

  insert into public.tb_saude_agua_metas (created_by, perfil_id, nome, meta_doses)
  values
    (uid, andre_id, 'Água', 16),
    (uid, juliana_id, 'Água', 9)
  on conflict (created_by, perfil_id) do update
  set nome = excluded.nome,
      meta_doses = excluded.meta_doses,
      updated_at = now();

  insert into public.tb_saude_agua_logs (created_by, perfil_id, data_local, meta_doses, realizado_doses)
  values
    (uid, andre_id, date '2026-09-23', 20, 8),
    (uid, andre_id, date '2026-09-24', 18, 9),
    (uid, andre_id, date '2026-09-25', 16, 6),
    (uid, juliana_id, date '2026-09-23', 11, 11),
    (uid, juliana_id, date '2026-09-24', 9, 9),
    (uid, juliana_id, date '2026-09-25', 9, 7)
  on conflict (created_by, perfil_id, data_local) do update
  set meta_doses = excluded.meta_doses,
      realizado_doses = excluded.realizado_doses,
      updated_at = now();

  insert into public.tb_saude_agua_logs (created_by, perfil_id, data_local, meta_doses, realizado_doses)
  values
    (uid, andre_id, date '2026-09-26', 16, 0),
    (uid, juliana_id, date '2026-09-26', 9, 0)
  on conflict (created_by, perfil_id, data_local) do update
  set meta_doses = excluded.meta_doses,
      realizado_doses = excluded.realizado_doses,
      updated_at = now();

  raise notice 'Seed água OK — uid %, André id %, Juliana id % (peso/altura são placeholders; ajuste no app se quiser)', uid, andre_id, juliana_id;
end $$;

commit;
