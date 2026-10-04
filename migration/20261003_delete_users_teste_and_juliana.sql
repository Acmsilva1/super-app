-- Exclui exclusivamente as duas contas mostradas na tela de administracao.
-- ATENCAO: remover auth.users pode apagar sessoes/identidades e dados vinculados
-- por FKs com ON DELETE CASCADE. Esta exclusao nao e reversivel por rollback SQL.
begin;

do $$
declare
  matched_rows integer;
  deleted_rows integer;
begin
  -- Preflight: exige exatamente as duas contas e confere os nomes exibidos.
  select count(*)
  into matched_rows
  from auth.users
  where (
      lower(email) = 'teste@gmail.com'
      and lower(coalesce(nullif(trim(raw_user_meta_data ->> 'name'), ''), raw_user_meta_data ->> 'nome', '')) = 'teste'
    )
    or (
      lower(email) = 'julianacrv25@gmail.com'
      and lower(coalesce(nullif(trim(raw_user_meta_data ->> 'name'), ''), raw_user_meta_data ->> 'nome', '')) = 'juliana cabral rodrigues'
    );

  if matched_rows <> 2 then
    raise exception 'Esperava encontrar exatamente as contas Teste e Juliana Cabral Rodrigues; encontradas: %', matched_rows;
  end if;

  -- Protecao adicional: nunca permitir que a conta proprietaria seja atingida.
  if exists (
    select 1
    from auth.users
    where id = 'f88a6351-317d-425b-afcd-9430c8a34f53'::uuid
      and lower(email) in ('teste@gmail.com', 'julianacrv25@gmail.com')
  ) then
    raise exception 'A conta proprietaria do Super App corresponde a um dos alvos; exclusao cancelada.';
  end if;

  delete from auth.users
  where (
      lower(email) = 'teste@gmail.com'
      and lower(coalesce(nullif(trim(raw_user_meta_data ->> 'name'), ''), raw_user_meta_data ->> 'nome', '')) = 'teste'
    )
    or (
      lower(email) = 'julianacrv25@gmail.com'
      and lower(coalesce(nullif(trim(raw_user_meta_data ->> 'name'), ''), raw_user_meta_data ->> 'nome', '')) = 'juliana cabral rodrigues'
    );

  get diagnostics deleted_rows = row_count;
  if deleted_rows <> 2 then
    raise exception 'Esperava excluir exatamente 2 contas; excluidas: %', deleted_rows;
  end if;
end;
$$;

commit;
