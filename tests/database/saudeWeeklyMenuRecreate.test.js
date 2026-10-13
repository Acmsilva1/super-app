import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {it,expect} from 'vitest';
import {DIET_WEEK,dietForDate} from '../../features/saude/service/dietasService.js';

const read=path=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');
const seed=await read('sql/20261011_seed_cardapio_semanal_andre_juliana.sql');
const rollback=await read('sql/rollback/20261011_seed_cardapio_semanal_andre_juliana.sql');
const owner='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
const source='seed-cardapio-7-dias-1600-kcal-20261011';
const explicit=(a,j)=>seed.replace('v_andre_id bigint := null;',`v_andre_id bigint := ${a};`).replace('v_juliana_id bigint := null;',`v_juliana_id bigint := ${j};`);
const undo=rollback.replace('v_perfis bigint[] := array[]::bigint[];', 'v_perfis bigint[] := array[1,2]::bigint[];');
async function fixture(db){
  const schema=await read('migration/20260926_reset_modulo_saude.sql');
  await db.exec(`create schema auth;create table auth.users(id uuid primary key);
    insert into auth.users values('${owner}'),('${other}');
    ${schema.match(/create table public.tb_saude_perfis \([\s\S]*?\n\);/)[0]}
    ${schema.match(/create table public.tb_saude_dietas \([\s\S]*?\n\);/)[0]}
    create function touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
    create trigger diet_updated before update on tb_saude_dietas for each row execute function touch_updated_at();
    create table tb_saude_alertas_agenda(dieta_id bigint references tb_saude_dietas(id) on delete set null);
    insert into tb_saude_perfis(id,created_by,nome,sexo,data_nascimento,peso_kg,altura_cm) values
      (1,'${owner}','André','masculino','1990-01-01',80,174),
      (2,'${owner}','Juliana','feminino','1988-01-01',80,166);
    insert into tb_saude_dietas(slug,titulo,objetivo,duracao_dias,dias,perfil_id,created_by)
      values('dieta-anterior','Anterior','Plano alimentar',1,'[{}]',1,'${owner}');`);
  await db.exec(await read('migration/20261005_add_meta_calorias_dietas.sql'));
  const weekly=await read('migration/20261010_add_saude_dietas_semanais.sql');
  await db.exec(weekly.split('create or replace function public.save_saude_dieta_with_food')[0]+'commit;');
  await db.exec(await read('migration/20261010_add_saude_dieta_alerta_ativo.sql'));
}
const seeded=async db=>(await db.query('select id,perfil_id,created_by,semanal,semana,dias,refeicoes,meta_calorias,observacoes,alerta_ativo from tb_saude_dietas where source_file=$1 order by perfil_id',[source])).rows;


const recreate=await read('sql/20261011_recriar_cardapio_semanal_andre_juliana.sql');
async function setup(db){
  await fixture(db);
  await db.exec('create role anon;create role authenticated;drop table tb_saude_alertas_agenda;');
  const agenda=await read('migration/20261005_saude_alertas_supabase.sql');
  await db.exec(agenda.match(/create table if not exists public.tb_saude_alertas_agenda \([\s\S]*?\n\);/)[0]);
  await db.exec(seed);
}
it('recria só as dietas do seed com backup, mesmos IDs e vínculos das agendas',async()=>{
  const db=new PGlite();
  try{
    await setup(db);const old=await seeded(db);
    await db.query("update tb_saude_dietas set titulo='Editada',observacoes='Texto antigo PDF',alerta_ativo=false where id=$1",[old[0].id]);
    await db.query('insert into tb_saude_alertas_agenda(perfil_id,created_by,dieta_id) values($1,$2,$3)',[1,owner,old[0].id]);
    await db.exec(recreate);const rows=await seeded(db);
    expect(rows.map(row=>row.id)).toEqual(old.map(row=>row.id));
    expect(rows[0].alerta_ativo).toBe(false);
    expect(rows.every(row=>!row.observacoes.includes('PDF')&&row.observacoes.length<250)).toBe(true);
    expect((await db.query('select dieta_id,dieta_ativa from tb_saude_alertas_agenda where perfil_id=1')).rows[0]).toEqual({dieta_id:old[0].id,dieta_ativa:true});
    const backups=(await db.query('select dieta,replacement,agendas from tb_saude_dietas_seed_backup order by perfil_id')).rows;
    expect(backups).toHaveLength(2);expect(backups[0].dieta.titulo).toBe('Editada');
    expect(backups[0].replacement.titulo).toContain('Cardápio semanal');
    expect(backups[0].agendas[0].dieta_id).toBe(old[0].id);
    expect((await db.query("select titulo from tb_saude_dietas where slug='dieta-anterior'")).rows[0].titulo).toBe('Anterior');
    await db.exec(recreate);expect(await seeded(db)).toHaveLength(2);
    expect((await db.query('select count(*)::int n from tb_saude_dietas_seed_backup')).rows[0].n).toBe(4);
  }finally{await db.close();}
},20000);
it('não apaga nada quando o alvo é ambíguo',async()=>{
  const db=new PGlite();
  try{
    await setup(db);const before=await seeded(db);
    await db.exec(`insert into tb_saude_perfis(id,created_by,nome,sexo,data_nascimento,peso_kg,altura_cm) values(3,'${owner}','André','masculino','1990-01-01',80,174);`);
    await expect(db.exec(recreate)).rejects.toThrow('encontrados 2');await db.exec('rollback');
    expect(await seeded(db)).toEqual(before);
  }finally{await db.close();}
},20000);

it('restaura o backup escolhido e bloqueia restauração sobre edição posterior',async()=>{
  const db=new PGlite();
  try{
    await setup(db);const before=await seeded(db);await db.exec(recreate);
    const run=(await db.query('select run_id from tb_saude_dietas_seed_backup limit 1')).rows[0].run_id;
    const rollbackSql=(await read('sql/rollback/20261011_recriar_cardapio_semanal_andre_juliana.sql')).replace('v_run uuid := null;',`v_run uuid := '${run}';`);
    await db.query("update tb_saude_dietas set observacoes='Nova edição' where id=$1",[before[0].id]);
    await expect(db.exec(rollbackSql)).rejects.toThrow('Dieta editada');await db.exec('rollback');
    await db.exec(recreate);
    const latest=(await db.query('select run_id from tb_saude_dietas_seed_backup order by backup_id desc limit 1')).rows[0].run_id;
    const restore=(await read('sql/rollback/20261011_recriar_cardapio_semanal_andre_juliana.sql')).replace('v_run uuid := null;',`v_run uuid := '${latest}';`);
    await db.exec(restore);
    expect((await seeded(db))[0].observacoes).toBe('Nova edição');
    expect((await db.query("select titulo from tb_saude_dietas where slug='dieta-anterior'")).rows[0].titulo).toBe('Anterior');
  }finally{await db.close();}
},20000);
