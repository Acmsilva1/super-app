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

it('importa ambos os perfis e o conteúdo semanal fiel, sem duplicar nem sobrescrever edições',async()=>{
  const db=new PGlite();
  try{
    await fixture(db);await db.exec(seed);
    const rows=await seeded(db);expect(rows).toHaveLength(2);
    expect(rows.map(row=>Number(row.perfil_id))).toEqual([1,2]);
    for(const row of rows){
      expect(row.created_by).toBe(owner);expect(row.semanal).toBe(true);expect(row.refeicoes).toEqual([]);
      expect(row.meta_calorias).toBe(1600);expect(row.alerta_ativo).toBe(true);
      expect(row.semana.map(day=>day.titulo)).toEqual(DIET_WEEK);
      expect(row.semana.every(day=>day.calorias_pdf===undefined)).toBe(true);
      expect(row.semana.flatMap(day=>day.refeicoes.flatMap(meal=>meal.itens))).toHaveLength(95);
      for(const day of row.semana){
        expect(day.refeicoes.filter(meal=>meal.itens.length)).toHaveLength(5);
        expect(day.refeicoes[5]).toEqual({tipo:'ceia',titulo:'Ceia',itens:[]});
        expect(day.refeicoes.flatMap(meal=>meal.itens).filter(item=>item.nome==='Ovo inteiro').reduce((sum,item)=>sum+item.quantidade_valor,0)).toBe(13);
        for(const item of day.refeicoes.flatMap(meal=>meal.itens)){
          expect(item.calorias).toBeNull();expect(item.alimento_id).toBeNull();
          expect(item.quantidade_unidade).toBe(item.nome==='Ovo inteiro'?'un':'g');
          expect(item.nome).not.toMatch(/^óleo$/i);
        }
      }
      expect(row.observacoes).toContain('13 ovos por dia');
      expect(row.observacoes).toContain('Não é um plano nutricionalmente completo');
      expect(row.observacoes).toContain('Os nutrientes são calculados pelo catálogo');
      expect(row.observacoes).not.toMatch(/pdf|Estimativas iniciais/i);
      expect(row.dias.map(day=>day.quantidade_refeicoes)).toEqual(Array(7).fill(5));
      expect(dietForDate(row,'2026-10-12').refeicoes[2].itens.map(item=>[item.nome,item.quantidade_valor])).toEqual([
        ['Ovo inteiro',3],['Abóbora',200],['Brócolis',150],['Batata inglesa cozida',150]]);
      expect(dietForDate(row,'2026-10-18').refeicoes[4].itens.map(item=>[item.nome,item.quantidade_valor])).toEqual([
        ['Ovo inteiro',3],['Brócolis',200],['Cenoura',150]]);
    }
    expect(rows[0].semana).toEqual(rows[1].semana);
    await db.query("update tb_saude_dietas set titulo='Editada pelo usuário' where id=$1",[rows[0].id]);
    await db.exec(seed);expect(await seeded(db)).toHaveLength(2);
    expect((await db.query('select titulo from tb_saude_dietas where id=$1',[rows[0].id])).rows[0].titulo).toBe('Editada pelo usuário');
    expect((await db.query('select count(*)::int n from tb_saude_dietas')).rows[0].n).toBe(3);
  }finally{await db.close();}
},20000);

it('reaplicar remove óleo da versão anterior sem sobrescrever outras edições nem outras dietas',async()=>{
  const db=new PGlite();
  try{
    await fixture(db);await db.exec(seed);
    const rows=await seeded(db);
    const edited=structuredClone(rows[0].semana);
    edited[0].refeicoes[0].itens[0].quantidade_valor=4;
    edited[0].refeicoes[0].itens[0].quantidade='4 unidades';
    edited[0].refeicoes[0].itens.push({nome:'Óleo',quantidade:'5 g'},{nome:'Óleo de coco',quantidade:'5 g'});
    edited[0].calorias_pdf=1406;edited[0].refeicoes[0].calorias_pdf=381;
    await db.query("update tb_saude_dietas set semana=$1::jsonb,titulo='Título editado' where id=$2",[JSON.stringify(edited),rows[0].id]);
    await db.query("update tb_saude_dietas set refeicoes=$1::jsonb where slug='dieta-anterior'",[JSON.stringify([{tipo:'almoco',itens:[{nome:'Óleo',quantidade:'10 g'}]}])]);
    await db.exec(seed);
    const updated=(await seeded(db))[0];
    expect(updated.semana[0].refeicoes[0].itens[0].quantidade_valor).toBe(4);
    expect(updated.semana[0].refeicoes[0].itens.some(item=>item.nome==='Óleo')).toBe(false);
    expect(updated.semana[0].refeicoes[0].itens.some(item=>item.nome==='Óleo de coco')).toBe(true);
    expect(updated.semana[0].calorias_pdf).toBeUndefined();
    expect(updated.semana[0].refeicoes[0].calorias_pdf).toBeUndefined();
    expect((await db.query('select titulo from tb_saude_dietas where id=$1',[updated.id])).rows[0].titulo).toBe('Título editado');
    expect((await db.query("select refeicoes from tb_saude_dietas where slug='dieta-anterior'")).rows[0].refeicoes[0].itens[0].nome).toBe('Óleo');
    await db.exec(seed);expect((await seeded(db))[0].semana).toEqual(updated.semana);
  }finally{await db.close();}
},20000);

it('bloqueia homônimos e donos diferentes e permite IDs explícitos',async()=>{
  const db=new PGlite();
  try{
    await fixture(db);await db.exec(`insert into tb_saude_perfis(id,created_by,nome,sexo,data_nascimento,peso_kg,altura_cm) values
      (3,'${other}','André','masculino','1990-01-01',80,174),(4,'${other}','Juliana','feminino','1988-01-01',80,166);`);
    await expect(db.exec(seed)).rejects.toThrow('encontrados 2');await db.exec('rollback');
    expect(await seeded(db)).toHaveLength(0);
    await expect(db.exec(explicit(1,4))).rejects.toThrow('IDs incompatíveis');await db.exec('rollback');
    expect(await seeded(db)).toHaveLength(0);
    await db.exec(explicit(1,2));expect((await seeded(db)).map(row=>row.created_by)).toEqual([owner,owner]);
  }finally{await db.close();}
},20000);

it('perfil ausente e slug de outra origem impedem inserção parcial',async()=>{
  const db=new PGlite();
  try{
    await fixture(db);await db.exec("update tb_saude_perfis set nome='Outro nome' where id=2");
    await expect(db.exec(seed)).rejects.toThrow('encontrados 0');await db.exec('rollback');
    await db.exec("update tb_saude_perfis set nome='Juliana' where id=2; update tb_saude_dietas set slug='seed-cardapio-1600-20261011-perfil-2' where slug='dieta-anterior';");
    await expect(db.exec(seed)).rejects.toThrow('slug reservado');await db.exec('rollback');
    expect(await seeded(db)).toHaveLength(0);
  }finally{await db.close();}
},20000);

it('reverte apenas o seed e bloqueia dietas editadas ou usadas em agendas',async()=>{
  const db=new PGlite();
  try{
    await fixture(db);await db.exec(seed);
    await expect(db.exec(rollback)).rejects.toThrow('dois perfil_id');await db.exec('rollback');
    const rows=await seeded(db);
    await db.query('insert into tb_saude_alertas_agenda values($1)',[rows[0].id]);
    await expect(db.exec(undo)).rejects.toThrow('ligada a uma agenda');await db.exec('rollback');
    expect(await seeded(db)).toHaveLength(2);await db.exec('delete from tb_saude_alertas_agenda');
    await db.query("update tb_saude_dietas set observacoes='Editada' where id=$1",[rows[0].id]);
    await expect(db.exec(undo)).rejects.toThrow('foi editada');await db.exec('rollback');
    // Restaurar timestamps do fixture sem acionar trigger novamente.
    await db.exec('alter table tb_saude_dietas disable trigger diet_updated; update tb_saude_dietas set created_at=updated_at; alter table tb_saude_dietas enable trigger diet_updated;');
    await db.exec(undo);await db.exec(undo);
    expect(await seeded(db)).toHaveLength(0);
    expect((await db.query('select slug from tb_saude_dietas')).rows).toEqual([{slug:'dieta-anterior'}]);
    expect((await db.query('select count(*)::int n from tb_saude_perfis')).rows[0].n).toBe(2);
  }finally{await db.close();}
},20000);
