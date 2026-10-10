import {readFile} from 'node:fs/promises';import {PGlite} from '@electric-sql/pglite';import {it,expect} from 'vitest';
it('persiste horários, preserva agenda ao reaplicar e valida minutos e duplicatas',async()=>{
 const db=new PGlite();try{
 await db.exec('create table tb_saude_alertas_agenda(perfil_id integer primary key,dieta_ativa boolean not null default true);insert into tb_saude_alertas_agenda values(1,true)');
 const sql=await readFile(new URL('../../migration/20261010_add_saude_dieta_horarios.sql',import.meta.url),'utf8');await db.exec(sql);
 expect((await db.query('select dieta_horarios from tb_saude_alertas_agenda')).rows[0].dieta_horarios).toHaveLength(4);
 const times=JSON.stringify([{tipo:'ceia',horario:'23:47'}]);await db.query('update tb_saude_alertas_agenda set dieta_horarios=$1::jsonb',[times]);await db.exec(sql);expect((await db.query('select dieta_horarios from tb_saude_alertas_agenda')).rows[0].dieta_horarios[0].horario).toBe('23:47');
 for(const value of [[{tipo:'ceia',horario:'24:00'}],[],[{tipo:'ceia',horario:'12:00'},{tipo:'ceia',horario:'12:00'}]])await expect(db.query('update tb_saude_alertas_agenda set dieta_horarios=$1::jsonb',[JSON.stringify(value)])).rejects.toThrow();
 await db.exec(await readFile(new URL('../../migration/rollback/20261010_saude_dieta_horarios.sql',import.meta.url),'utf8'));
 expect((await db.query('select dieta_ativa from tb_saude_alertas_agenda')).rows[0].dieta_ativa).toBe(true);
 }finally{await db.close();}
},20000);
