import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {it,expect} from 'vitest';
it('migration reaplicável preserva horários e bloqueia acesso direto à agenda',async()=>{
  const db=new PGlite();
  try{
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('f88a6351-317d-425b-afcd-9430c8a34f53');`);
    const sql=await readFile(new URL('../../migration/20261010_create_financeiro_alertas.sql',import.meta.url),'utf8');
    await db.exec(sql);await db.exec(sql);expect((await db.query('select cron from tb_financeiro_alertas')).rows).toHaveLength(3);
    await db.exec('set role authenticated');await expect(db.query('select id from tb_financeiro_alertas')).rejects.toThrow();
    await db.exec('reset role;set role service_role');expect((await db.query('select id from tb_financeiro_alertas')).rows).toHaveLength(3);
    await expect(db.exec(`update tb_financeiro_alertas set tipo='mensagem',mensagem=''`)).rejects.toThrow();
    await db.exec('reset role');await db.exec(await readFile(new URL('../../migration/rollback/20261010_financeiro_alertas.sql',import.meta.url),'utf8'));
    expect((await db.query('select ativo from tb_financeiro_alertas')).rows.every(r=>r.ativo===false)).toBe(true);
    await db.exec('set role service_role');await expect(db.query('select id from tb_financeiro_alertas')).rejects.toThrow();
  }finally{await db.close();}
},15000);
