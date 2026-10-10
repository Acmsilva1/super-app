import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
it('migration é reaplicável e RLS isola execuções em banco efêmero', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon; create role service_role bypassrls; create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated;
      insert into auth.users values ('00000000-0000-4000-8000-000000000001'), ('00000000-0000-4000-8000-000000000002');`);
    const migration = await readFile(new URL('../../migration/20261009_create_financeiro_simulacoes.sql', import.meta.url), 'utf8');
    await db.exec(migration); await db.exec(migration);
    await db.exec('set role service_role;');
    expect((await db.query('select id from public.tb_financeiro_simulacoes')).rows).toHaveLength(0);
    await db.exec('reset role;');
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
      insert into public.tb_financeiro_simulacoes(user_id,meta_id,nome,parametros,resultado) values
      ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','Carro','{}','{}');`);
    expect((await db.query('select id from public.tb_financeiro_simulacoes')).rows).toHaveLength(1);
    await db.exec(`set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';`);
    expect((await db.query('select id from public.tb_financeiro_simulacoes')).rows).toHaveLength(0);
    await expect(db.exec(`insert into public.tb_financeiro_simulacoes(user_id,meta_id,nome,parametros,resultado) values
      ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003','Outra','{}','{}');`)).rejects.toThrow();
    await db.exec('reset role;');
    await db.exec(await readFile(new URL('../../migration/rollback/20261009_financeiro_simulacoes.sql', import.meta.url), 'utf8'));
    expect((await db.query('select id from public.tb_financeiro_simulacoes')).rows).toHaveLength(1);
    await db.exec('set role service_role;');
    await expect(db.query('select id from public.tb_financeiro_simulacoes')).rejects.toThrow();
    await db.exec('reset role;');
    await db.exec(migration);
  } finally { await db.close(); }
}, 15000);
