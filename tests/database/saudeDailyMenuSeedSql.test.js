import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {it,expect} from 'vitest';
import {DIET_WEEK,dietForDate} from '../../features/saude/service/dietasService.js';

import {ALIMENTOS_NUTRICIONAIS} from '../../features/saude/data/alimentosNutricionais.js';
import {enrichDietNutrition,nutritionForDietItem} from '../../features/saude/service/alimentosService.js';
import {buildDietAlertMessages} from '../../features/saude/service/alertasSaudeScheduler.js';

const read=path=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');
const seed=await read('sql/20261016_seed_cardapio_diario_andre_juliana.sql');
const rollback=await read('sql/rollback/20261016_seed_cardapio_diario_andre_juliana.sql');
const owner='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
const source='seed-cardapio-diario-21-dias-20261016';
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
  const foodsSchema=await read('migration/20261007_create_saude_alimentos_seed.sql');
  await db.exec(foodsSchema.match(/create table if not exists public.tb_saude_alimentos \([\s\S]*?\n\);/)[0]);
  for(const [index,food] of ALIMENTOS_NUTRICIONAIS.filter(f=>['Abobrinha','Brócolis','Couve-flor','Chuchu','Ovo inteiro','Morango','Abacate','Peito de frango grelhado','Mamão papaia','Aveia em flocos crua','Feijão cozido','Batata inglesa cozida','Café sem açúcar'].includes(f.item)).entries()){
    // IDs intencionalmente diferentes da ordem do Excel e do catálogo versionado.
    await db.query(`insert into tb_saude_alimentos(id,source_order,categoria,item,porcao_equivalente,peso_referencia_g,
      kcal_100g,proteina_100g,carboidrato_100g,gordura_100g) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [900+index,index+1,food.categoria,food.item,food.porcao,food.peso_referencia_g,
        food.kcal_100g,food.proteina_100g,food.carboidrato_100g,food.gordura_100g]);
  }
}
const seeded=async db=>(await db.query('select id,perfil_id,created_by,semanal,semana,dias,refeicoes,meta_calorias,observacoes,alerta_ativo from tb_saude_dietas where source_file=$1 order by perfil_id',[source])).rows;

it('importa cada perfil com duas opções por dia, pesos calculáveis e rotação usada pelo bot',async()=>{
  const db=new PGlite();
  try{
    await fixture(db);await db.exec(seed);
    const rows=await seeded(db);expect(rows).toHaveLength(2);
    const [andre,juliana]=rows;
    const foods=(await db.query('select id,item,peso_referencia_g,kcal_100g,proteina_100g,carboidrato_100g,gordura_100g from tb_saude_alimentos')).rows;
    const pairs=[['Brócolis','Abobrinha'],['Couve-flor','Chuchu'],['Brócolis','Couve-flor'],['Abobrinha','Chuchu'],
      ['Brócolis','Chuchu'],['Abobrinha','Couve-flor'],['Brócolis','Abobrinha']];
    for(const row of rows){
      expect(row.created_by).toBe(owner);expect(row.semanal).toBe(true);expect(row.refeicoes).toEqual([]);
      expect(row.semana.map(d=>d.titulo)).toEqual(DIET_WEEK);expect(row.dias).toHaveLength(7);
      expect(row.meta_calorias).toBeNull();expect(row.alerta_ativo).toBe(false);
      for(let day=0;day<7;day++){
        const selected=dietForDate(row,`2026-10-${12+day}`);
        const lunch=selected.refeicoes.find(m=>m.tipo==='almoco');
        const dinner=selected.refeicoes.find(m=>m.tipo==='jantar');
        const vegetables=meal=>meal.itens.filter(i=>['Abobrinha','Brócolis','Couve-flor','Chuchu'].includes(i.nome));
        expect(vegetables(lunch)).toHaveLength(2);expect(vegetables(dinner)).toEqual(vegetables(lunch));
        expect(vegetables(lunch).map(i=>i.nome)).toEqual(pairs[day]);
        expect(vegetables(lunch).reduce((sum,i)=>sum+i.quantidade_valor,0)).toBe(200);
        expect(selected.refeicoes.flatMap(m=>m.itens).some(i=>i.nome==='Legumes')).toBe(false);
        for(const item of vegetables(lunch)){
          expect(item.quantidade_valor).toBe(100);expect(item.quantidade_unidade).toBe('g');
          expect(item.alimento_id).toBeGreaterThanOrEqual(900);
          const food=foods.find(f=>Number(f.id)===item.alimento_id);
          const nutrition=nutritionForDietItem(item,foods);
          expect(nutrition).toEqual({kcal:Number(food.kcal_100g),proteina:Number(food.proteina_100g),
            carboidrato:Number(food.carboidrato_100g),gordura:Number(food.gordura_100g)});
        }
        // Isola a contribuição nutricional dos legumes; os demais itens não mudam nesta revisão.
        const veggieMeal={...lunch,itens:vegetables(lunch)};
        expect(enrichDietNutrition({refeicoes:[veggieMeal]},foods).nutricao_total.completo).toBe(true);
        const veggieDiet={...row,alerta_ativo:true,semana:row.semana.map(d=>({...d,refeicoes:[veggieMeal]}))};
        const messages=buildDietAlertMessages({profiles:[{id:row.perfil_id,nome:'Perfil'}],foods,schedules:new Map(),diets:[veggieDiet]},
          {tipo:'almoco',titulo:'Almoço'},`2026-10-${12+day}`,'12:00').join('\n');
        expect(messages).toContain('Nesta refeição, você ingere');expect(messages).not.toContain('Ainda faltam dados');
      }
    }
    expect(Number(andre.perfil_id)).toBe(1);expect(Number(juliana.perfil_id)).toBe(2);
    expect(andre.dias.every(d=>d.quantidade_refeicoes===6)).toBe(true);
    expect(juliana.dias.every(d=>d.quantidade_refeicoes===5)).toBe(true);
    const am=andre.semana[0].refeicoes,jm=juliana.semana[0].refeicoes;
    for(const row of rows) for(const day of row.semana) for(const meal of day.refeicoes) for(const item of meal.itens){
      expect(['Ovos','Ovos inteiros','Morangos']).not.toContain(item.nome);
      const food=foods.find(f=>f.item===item.nome);
      if(food) expect(item.alimento_id).toBe(Number(food.id));
      else expect(item.alimento_id).toBeNull();
      if(item.nome==='Ovo inteiro'){
        expect(item.quantidade_unidade).toBe('un');
        expect(item.quantidade_valor).toBeGreaterThan(0);
      }
    }
    expect(am.map(m=>m.itens.length)).toEqual([3,2,6,2,5,1]);
    expect(jm.map(m=>m.itens.length)).toEqual([3,2,5,2,5,0]);
    expect(am[0].itens.map(i=>i.quantidade_valor)).toEqual([3,150,30]);
    expect(am[2].itens.find(i=>i.nome==='Arroz branco').observacao).toContain('Dias 15-21: 60-70 g.');
    expect(am[4].itens.find(i=>i.nome==='Batata inglesa cozida').observacao).toContain('Dias 15-21: 80-100 g.');
    expect(am[5].itens[0].quantidade).toBe('25-30 g');
    expect(jm[3].itens[0].quantidade).toBe('150 g de mamão ou 200 g de morangos');
    expect(jm[3].itens[0].observacao).toContain('Mamão ou morangos');
    expect(jm[4].itens[0].observacao).toContain('Frango ou omelete');
    expect(am[0].itens[1].observacao).toContain('Mamão papaia');
    expect(am[0].itens[2].observacao).toContain('Aveia em flocos crua');
    expect(jm[4].itens[0].quantidade).toBe('130-150 g de frango ou omelete com 3 ovos');
    expect(juliana.observacoes).toContain('Sem carne vermelha');expect(juliana.observacoes).toContain('12h/13h');
    expect((await db.query("select titulo from tb_saude_dietas where slug='dieta-anterior'")).rows[0].titulo).toBe('Anterior');
    await db.query('update tb_saude_dietas set observacoes=$1 where id=$2',['Editada no app',andre.id]);
    await db.exec(seed);expect(await seeded(db)).toHaveLength(2);
    expect((await seeded(db))[0].observacoes).toBe('Editada no app');
  }finally{await db.close();}
},20000);

it('bloqueia catálogo incompleto ou ambíguo antes de inserir dietas',async()=>{
  const db=new PGlite();
  try{
    await fixture(db);
    await db.exec("update tb_saude_alimentos set item='Ausente' where item='Chuchu';");
    await expect(db.exec(seed)).rejects.toThrow('cadastro único');await db.exec('rollback;');
    expect(await seeded(db)).toHaveLength(0);
    await db.exec("update tb_saude_alimentos set item='Chuchu' where item='Ausente';");
    await db.exec(`insert into tb_saude_alimentos(source_order,categoria,item,porcao_equivalente,kcal_100g,proteina_100g,carboidrato_100g,gordura_100g)
      values(999,'Legumes',' Chuchu ','100 g',19,0.8,4.5,0.1);`);
    await expect(db.exec(seed)).rejects.toThrow('cadastro único');await db.exec('rollback;');
    expect(await seeded(db)).toHaveLength(0);
  }finally{await db.close();}
},20000);

it('bloqueia homônimos e aceita somente IDs explícitos do mesmo proprietário',async()=>{
  const db=new PGlite();
  try{
    await fixture(db);
    await db.query(`insert into tb_saude_perfis(id,created_by,nome,sexo,data_nascimento,peso_kg,altura_cm)
      values(3,$1,'André','masculino','1990-01-01',80,174)`,[owner]);
    await expect(db.exec(seed)).rejects.toThrow('Esperado um único par');await db.exec('rollback;');
    expect(await seeded(db)).toHaveLength(0);
    await db.query('update tb_saude_perfis set created_by=$1 where id=3',[other]);
    await expect(db.exec(explicit(3,2))).rejects.toThrow('IDs incompatíveis');await db.exec('rollback;');
    expect(await seeded(db)).toHaveLength(0);
    await db.exec(explicit(1,2));expect(await seeded(db)).toHaveLength(2);
  }finally{await db.close();}
},20000);

it('bloqueia colisão de slug sem substituir outra origem ou inserir parcialmente',async()=>{
  const db=new PGlite();
  try{
    await fixture(db);
    await db.query(`update tb_saude_dietas set slug='seed-cardapio-diario-20261016-perfil-2' where slug='dieta-anterior'`);
    await expect(db.exec(seed)).rejects.toThrow('Slug reservado');await db.exec('rollback;');
    expect(await seeded(db)).toHaveLength(0);
  }finally{await db.close();}
},20000);

it('reverte só o seed e bloqueia reversão de dietas editadas ou vinculadas a agendas',async()=>{
  const db=new PGlite();
  try{
    await fixture(db);await db.exec(seed);
    const [andre]=await seeded(db);
    await db.query('insert into tb_saude_alertas_agenda(dieta_id) values($1)',[andre.id]);
    await expect(db.exec(undo)).rejects.toThrow('ligada a uma agenda');await db.exec('rollback;');
    await db.exec('delete from tb_saude_alertas_agenda;');
    await db.query("update tb_saude_dietas set titulo='Editada' where id=$1",[andre.id]);
    await expect(db.exec(undo)).rejects.toThrow('foi editada');await db.exec('rollback;');
    await db.query('delete from tb_saude_dietas where source_file=$1',[source]);
    await db.exec(seed);await db.exec(undo);
    expect(await seeded(db)).toHaveLength(0);
    expect((await db.query('select count(*)::int n from tb_saude_dietas')).rows[0].n).toBe(1);
  }finally{await db.close();}
},20000);

