import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {expect,it} from 'vitest';
const migration=readFileSync(new URL('../../migration/20261013_create_saude_treinos.sql',import.meta.url),'utf8');
const rollback=readFileSync(new URL('../../migration/rollback/20261013_create_saude_treinos.sql',import.meta.url),'utf8');
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
async function fixture(){
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to authenticated;
  create function is_app_admin() returns boolean language sql as $$ select false $$;
  create function can_access_app(text) returns boolean language sql as $$ select true $$;
  create function touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now();return new;end $$;
  create table tb_saude_perfis(id bigint primary key,created_by uuid not null,unique(id,created_by));
  insert into auth.users values('${owner}'),('${other}');
  insert into tb_saude_perfis values(1,'${owner}'),(2,'${other}');`);
 await db.exec(migration);await db.exec(migration);return db;
}
it('formatos, dias fixos, isolamento por proprietário e rollback com dados',async()=>{
 const db=await fixture();
 try{
  const [{id:abc}]=(await db.query("insert into tb_saude_treinos(created_by,perfil_id,nome,tipo) values($1,1,'Meu ABC','abc') returning id",[owner])).rows;
  const [{id:weekly}]=(await db.query("insert into tb_saude_treinos(created_by,perfil_id,nome,tipo) values($1,1,'Semana','semanal') returning id",[owner])).rows;
  const [{id:block}]=(await db.query("insert into tb_saude_treino_blocos(created_by,treino_id,tipo,chave,nome,ordem) values($1,$2,'abc','A','Peito e costas',0) returning id",[owner,abc])).rows;
  await db.query("insert into tb_saude_treino_exercicios(created_by,bloco_id,nome,ordem) values($1,$2,'Remada',0)",[owner,block]);
  await db.query("insert into tb_saude_treino_blocos(created_by,treino_id,tipo,chave,nome,ordem) values($1,$2,'semanal','dia-0','Segunda-feira',0)",[owner,weekly]);
  await expect(db.query("insert into tb_saude_treino_blocos(created_by,treino_id,tipo,chave,nome,ordem) values($1,$2,'semanal','dia-1','Meu dia',1)",[owner,weekly])).rejects.toThrow(/check/);
  await expect(db.query("insert into tb_saude_treino_exercicios(created_by,bloco_id,nome,ordem) values($1,$2,'Outro',1)",[other,block])).rejects.toThrow(/foreign key/);
  await db.exec(`set request.jwt.claim.sub='${other}';set role authenticated;`);
  expect((await db.query('select count(*)::int n from tb_saude_treinos')).rows[0].n).toBe(0);
  expect((await db.query('select count(*)::int n from tb_saude_treino_exercicios')).rows[0].n).toBe(0);
  await db.exec(`reset role;set request.jwt.claim.sub='${owner}';set role authenticated;`);
  expect((await db.query('select count(*)::int n from tb_saude_treinos')).rows[0].n).toBe(2);
  await db.exec('reset role');
  await expect(db.exec(rollback)).rejects.toThrow('contém dados');await db.exec('rollback');
  await db.query('delete from tb_saude_treinos where id=$1',[abc]);
  expect((await db.query('select count(*)::int n from tb_saude_treino_exercicios')).rows[0].n).toBe(0);
 }finally{await db.close();}
},20000);
it('rollback vazio é reaplicável e preserva os perfis de Saúde',async()=>{
 const db=await fixture();try{
  await db.exec(rollback);await db.exec(rollback);
  expect((await db.query('select count(*)::int n from tb_saude_perfis')).rows[0].n).toBe(2);
 }finally{await db.close();}
},20000);
