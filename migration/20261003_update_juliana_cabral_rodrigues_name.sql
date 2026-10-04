-- Atualiza o nome exibido para a conta identificada pelo e-mail.
-- Executar no SQL Editor do Supabase; aborta se nao encontrar exatamente uma conta.
begin;

do $$
declare
  affected_rows integer;
begin
  update auth.users
  set raw_user_meta_data = jsonb_set(
    coalesce(raw_user_meta_data, '{}'::jsonb),
    '{name}',
    to_jsonb('Juliana Cabral Rodrigues'::text),
    true
  )
  where lower(email) = lower('julianacrv25@gmail.com');

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'Esperava atualizar exatamente 1 conta para julianacrv25@gmail.com; atualizacoes: %', affected_rows;
  end if;
end;
$$;

commit;
