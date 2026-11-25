import { it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
const self='00000000-0000-4000-8000-000000000001', other='00000000-0000-4000-8000-000000000002';
async function database() {
  const db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${self}'),('${other}');
    create table public.tb_saude_dietas(id int primary key, created_by uuid references auth.users(id), data text);
    create table public.app_user_permissions(user_id uuid references auth.users(id));
    insert into public.tb_saude_dietas values (1,'${self}','private'),(2,'${other}','private');
    insert into public.app_user_permissions values ('${self}'),('${other}');`);
  await db.exec(await readFile(new URL('../../migration/20261125_privacy_account_deletion.sql',import.meta.url),'utf8'));
  return db;
}
it('real SQL removes only self-owned Super App records and retains shared Auth identities', async () => {
  const db=await database();
  try {
    await db.query('select public.delete_superapp_account_data($1)',[self]);
    expect((await db.query('select created_by from public.tb_saude_dietas')).rows).toEqual([{created_by:other}]);
    expect((await db.query('select user_id from public.app_user_permissions')).rows).toEqual([{user_id:other}]);
    expect((await db.query('select count(*)::int as n from auth.users')).rows[0].n).toBe(2);
  } finally {await db.close();}
}, 30000);
it('a blocking FK rolls the whole deletion back instead of partially removing diet data', async () => {
  const db=await database();
  try {
    await db.exec('create table public.external_reference(diet_id int references public.tb_saude_dietas(id)); insert into public.external_reference values(1);');
    await expect(db.query('select public.delete_superapp_account_data($1)',[self])).rejects.toThrow();
    expect((await db.query('select count(*)::int as n from public.tb_saude_dietas')).rows[0].n).toBe(2);
    expect((await db.query('select count(*)::int as n from public.app_user_permissions')).rows[0].n).toBe(2);
  } finally {await db.close();}
}, 30000);
