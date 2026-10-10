import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';import {it,expect} from 'vitest';
it('janela de água reaplicável com validação e rollback',async()=>{
 const db=new PGlite();try{
 await db.exec('create table tb_saude_alertas_agenda(perfil_id integer primary key);insert into tb_saude_alertas_agenda values(1)');
 const sql=await readFile(new URL('../../migration/20261010_add_saude_agua_janela.sql',import.meta.url),'utf8');await db.exec(sql);
 expect((await db.query('select agua_inicio,agua_fim from tb_saude_alertas_agenda')).rows[0]).toEqual({agua_inicio:'07:30',agua_fim:'22:30'});
 await db.query('update tb_saude_alertas_agenda set agua_inicio=$1,agua_fim=$2',['08:17','20:17']);await db.exec(sql);
 expect((await db.query('select agua_inicio from tb_saude_alertas_agenda')).rows[0].agua_inicio).toBe('08:17');
 for(const [start,end] of [['20:00','08:00'],['08:00','08:00'],['25:00','26:00']])await expect(db.query('update tb_saude_alertas_agenda set agua_inicio=$1,agua_fim=$2',[start,end])).rejects.toThrow();
 await db.exec(await readFile(new URL('../../migration/rollback/20261010_saude_agua_janela.sql',import.meta.url),'utf8'));expect((await db.query('select perfil_id from tb_saude_alertas_agenda')).rows[0].perfil_id).toBe(1);
 }finally{await db.close();}
},20000);
