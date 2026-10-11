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

it('novos horários são reaplicáveis, validados pelo banco e reversíveis sem perda silenciosa',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('f88a6351-317d-425b-afcd-9430c8a34f53');`);
    await db.exec(await readFile(new URL('../../migration/20261010_create_financeiro_alertas.sql',import.meta.url),'utf8'));
    const sql=await readFile(new URL('../../migration/20261010_financeiro_alertas_secoes_horarios.sql',import.meta.url),'utf8');
    await db.exec(sql);
    expect((await db.query('select horarios from tb_financeiro_alertas')).rows.every(row=>row.horarios===null)).toBe(true);
    await db.query(`update tb_financeiro_alertas set tipo='geral',horarios=$1`,[JSON.stringify(['09:15','20:30'])]);
    await db.exec(sql);
    expect((await db.query('select horarios,tipo from tb_financeiro_alertas')).rows[0]).toMatchObject({tipo:'geral',horarios:['09:15','20:30']});
    for(const invalid of [[],['09:00','09:00'],['23:59','00:01'],['24:00'],[900],{},Array(13).fill('09:00')]) await expect(db.query('update tb_financeiro_alertas set horarios=$1',[JSON.stringify(invalid)])).rejects.toThrow();
    await expect(db.exec(`update tb_financeiro_alertas set mensagem='texto livre'`)).rejects.toThrow();
    await db.exec('set role authenticated');await expect(db.query('select horarios from tb_financeiro_alertas')).rejects.toThrow();await db.exec('reset role');
    const rollback=await readFile(new URL('../../migration/rollback/20261010_financeiro_alertas_secoes_horarios.sql',import.meta.url),'utf8');
    await expect(db.exec(rollback)).rejects.toThrow();await db.exec('rollback');
    await db.exec("update tb_financeiro_alertas set horarios=null,tipo='diario'");await db.exec(rollback);
    expect((await db.query('select cron from tb_financeiro_alertas')).rows).toHaveLength(3);
  } finally {await db.close();}
},20000);
