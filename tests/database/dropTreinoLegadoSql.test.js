import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {expect,it} from 'vitest';
const migration=readFileSync(new URL('../../migration/20261013_drop_treino_legado.sql',import.meta.url),'utf8');
async function fixture(){
 const db=new PGlite();
 await db.exec(`
  create table tb_saude_perfis(id bigint primary key);
  insert into tb_saude_perfis values(1);
  create table tb_missoes_treino_perfis(id bigint primary key);
  create table tb_missoes_treino(id uuid primary key,perfil_id bigint references tb_missoes_treino_perfis);
  create table tb_missoes_treino_itens(id bigint primary key,missao_id uuid references tb_missoes_treino);
  create table tb_missoes_treino_chamas(id bigint primary key,mission_id uuid references tb_missoes_treino);
  create table tb_missoes_treino_logs(id bigint primary key,perfil_id bigint references tb_missoes_treino_perfis,missao_id uuid references tb_missoes_treino);
 `);
 return db;
}
it('remove as cinco tabelas com dados e permite reaplicar sem atingir Saúde',async()=>{
 const db=await fixture();
 try{
  await db.exec(`
   insert into tb_missoes_treino_perfis values(1);
   insert into tb_missoes_treino values('00000000-0000-4000-8000-000000000001',1);
   insert into tb_missoes_treino_itens values(1,'00000000-0000-4000-8000-000000000001');
   insert into tb_missoes_treino_chamas values(1,'00000000-0000-4000-8000-000000000001');
   insert into tb_missoes_treino_logs values(1,1,'00000000-0000-4000-8000-000000000001');
  `);
  await db.exec(migration);
  await db.exec(migration);
  expect((await db.query("select count(*)::int n from pg_tables where schemaname='public' and tablename like 'tb_missoes_treino%'")).rows[0].n).toBe(0);
  expect((await db.query('select count(*)::int n from tb_saude_perfis')).rows[0].n).toBe(1);
 }finally{await db.close();}
},20000);
it('dependência externa impede o drop inteiro sem apagar outras tabelas',async()=>{
 const db=await fixture();
 try{
  await db.exec('create table consumidor_externo(id bigint primary key,treino_id uuid references tb_missoes_treino)');
  await expect(db.exec(migration)).rejects.toThrow(/depend/);
  await db.exec('rollback');
  const result=await db.query("select count(*)::int n from pg_tables where schemaname='public' and tablename like 'tb_missoes_treino%'");
  expect(result.rows[0].n).toBe(5);
  expect((await db.query("select to_regclass('consumidor_externo') is not null as existe")).rows[0].existe).toBe(true);
 }finally{await db.close();}
},20000);
it('função que consulta treino bloqueia a limpeza mesmo sem dependência SQL registrada',async()=>{
 const db=await fixture();
 try{
  await db.exec("create function consumidor_treino() returns int language plpgsql as $$ begin return (select count(*) from tb_missoes_treino); end $$");
  await expect(db.exec(migration)).rejects.toThrow('consumidor_treino');
  await db.exec('rollback');
  expect((await db.query("select to_regclass('tb_missoes_treino') is not null as existe")).rows[0].existe).toBe(true);
 }finally{await db.close();}
},20000);
