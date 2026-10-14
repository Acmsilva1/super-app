import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {expect,it} from 'vitest';
import {trainingDraft} from '../../features/treino/localStore.js';
const schema=readFileSync(new URL('../../migration/20261013_create_saude_treinos.sql',import.meta.url),'utf8');
const rpc=readFileSync(new URL('../../migration/20261013_saude_treinos_api.sql',import.meta.url),'utf8');
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
async function fixture(){
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.role() returns text language sql as $$ select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),'service_role') $$;
 create function is_app_admin() returns boolean language sql as $$ select false $$;
 create function can_access_app(text) returns boolean language sql as $$ select true $$;
 create function touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now();return new;end $$;
 create table tb_saude_perfis(id bigint primary key,created_by uuid not null,unique(id,created_by));
 insert into auth.users values('${owner}'),('${other}');insert into tb_saude_perfis values(1,'${owner}'),(2,'${other}');`);
 await db.exec(schema);await db.exec(rpc);await db.exec(rpc);return db;
}
it('CRUD atômico, retry de criação, conflitos e alteração de tipo preservam exercícios',async()=>{
 const db=await fixture();
 try{
  const call=async(action,payload=null,expected=null,who=owner,profile=1)=>(await db.query('select saude_manage_treinos($1,$2,$3,$4::jsonb,$5::timestamptz) result',[who,profile,action,payload?JSON.stringify(payload):null,expected])).rows[0].result;
  const row={id:'00000000-0000-4000-8000-000000000010',...trainingDraft('Meu treino','abc')};
  row.grupos[0].nome='Peito';row.grupos[0].exercicios=[{id:'00000000-0000-4000-8000-000000000020',nome:'Supino'}];
  const created=(await call('save',row)).row;
  expect((await call('save',row)).row.updated_at).toBe(created.updated_at);
  expect((await call('list')).rows).toHaveLength(1);
  expect((await call('list',null,null,other,2)).rows).toEqual([]);
  await expect(call('save',{...row,nome:'Mudou'},'2000-01-01')).rejects.toThrow('training_conflict');
  const weekly={...row,...trainingDraft('Semana','semanal')};weekly.grupos[0].exercicios=row.grupos[0].exercicios;
  weekly.grupos[0].nome='Nome proibido';
  await expect(call('save',weekly,created.updated_at)).rejects.toThrow(/check/);
  expect((await call('list')).rows[0].grupos[0]).toMatchObject({nome:'Peito',exercicios:[{nome:'Supino'}]});
  weekly.grupos[0].nome='Segunda-feira';const updated=(await call('save',weekly,created.updated_at)).row;
  expect(updated.grupos).toHaveLength(7);expect(updated.grupos[0].exercicios[0].nome).toBe('Supino');
  await expect(call('delete',{id:row.id},created.updated_at)).rejects.toThrow('training_conflict');
  await call('delete',{id:row.id},updated.updated_at);expect((await call('list')).rows).toEqual([]);
 }finally{await db.close();}
},20000);
it('chamada sem identidade ou de outro usuário não acessa o perfil',async()=>{
 const db=await fixture();try{
  await db.exec("set request.jwt.claim.role='authenticated'");
  await expect(db.query("select saude_manage_treinos($1,1,'list')",[owner])).rejects.toThrow('training_forbidden');
  await db.exec(`set request.jwt.claim.sub='${other}'`);
  await expect(db.query("select saude_manage_treinos($1,1,'list')",[owner])).rejects.toThrow('training_forbidden');
 }finally{await db.close();}
},20000);
