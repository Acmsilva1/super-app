import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {it,expect} from 'vitest';
it('preserva dietas existentes, inicia novas desligadas e não religa ao reaplicar',async()=>{
 const db=new PGlite();try{
 await db.exec("create table tb_saude_dietas(id integer primary key);insert into tb_saude_dietas values(1)");
 const sql=await readFile(new URL('../../migration/20261010_add_saude_dieta_alerta_ativo.sql',import.meta.url),'utf8');await db.exec(sql);
 expect((await db.query('select alerta_ativo from tb_saude_dietas')).rows[0].alerta_ativo).toBe(true);
 await db.exec('insert into tb_saude_dietas(id) values(2);update tb_saude_dietas set alerta_ativo=false where id=1');await db.exec(sql);
 expect((await db.query('select alerta_ativo from tb_saude_dietas')).rows.every(row=>row.alerta_ativo===false)).toBe(true);
 }finally{await db.close();}
},20000);
