import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {it,expect} from 'vitest';
import {ALIMENTOS_NUTRICIONAIS} from '../../features/saude/data/alimentosNutricionais.js';
import {enrichDietNutrition} from '../../features/saude/service/alimentosService.js';
import {buildDietAlertMessages} from '../../features/saude/service/alertasSaudeScheduler.js';

const read=path=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');
const seed=await read('sql/20261011_seed_alimentos_cenoura_abobora_jacare.sql');
async function fixture(db){
  const migration=await read('migration/20261007_create_saude_alimentos_seed.sql');
  await db.exec(migration.match(/create table if not exists public.tb_saude_alimentos \([\s\S]*?\n\);/)[0]);
  await db.exec('create unique index food_name_key on tb_saude_alimentos(lower(trim(item)));create sequence tb_saude_alimentos_source_order_seq start 122;');
  await db.exec("insert into tb_saude_alimentos(source_order,categoria,item,porcao_equivalente,kcal_100g,proteina_100g,carboidrato_100g,gordura_100g) values(121,'Outros','Preservado','100 g',9,1,1,1);");
}
it('seed é idempotente, preserva o catálogo e calcula todas as refeições semanais',async()=>{
  const db=new PGlite();
  try{
    await fixture(db);await db.exec(seed);
    const before=(await db.query('select id,source_order,item,kcal_100g,proteina_100g,carboidrato_100g,gordura_100g,peso_referencia_g,observacoes from tb_saude_alimentos order by id')).rows;
    await db.exec(seed);
    expect((await db.query('select id,source_order,item,kcal_100g,proteina_100g,carboidrato_100g,gordura_100g,peso_referencia_g,observacoes from tb_saude_alimentos order by id')).rows).toEqual(before);
    const foods=[...ALIMENTOS_NUTRICIONAIS,...before.filter(row=>row.item!=='Preservado')];
    expect(before.find(row=>row.item==='Abóbora').observacoes).toContain('ESTIMATIVA');
    expect((await db.query("select nextval('tb_saude_alimentos_source_order_seq') as n")).rows[0].n).toBeGreaterThan(Math.max(...before.map(row=>row.source_order)));
    const menu=await read('sql/20261011_seed_cardapio_semanal_andre_juliana.sql');
    const semana=JSON.parse(menu.match(/\$cardapio\$([\s\S]*?)\$cardapio\$/)[1]);
    for(const day of semana){
      for(const meal of day.refeicoes.filter(meal=>meal.itens.length)){
        expect(enrichDietNutrition({refeicoes:[meal]},foods).nutricao_total.completo,`${day.titulo}: ${meal.tipo}`).toBe(true);
      }
    }
    const messages=buildDietAlertMessages({profiles:[{id:1,nome:'Perfil'}],foods,schedules:new Map(),diets:[{id:1,perfil_id:1,titulo:'Semanal',alerta_ativo:true,semanal:true,semana}]}, {tipo:'jantar',titulo:'Jantar'},'2026-10-11','19:30');
    expect(messages.join('\n')).toContain('Nesta refeição, você ingere');
    expect(messages.join('\n')).not.toContain('Ainda faltam dados');
  }finally{await db.close();}
},20000);
it('cadastro existente divergente interrompe tudo sem sobrescrever dados',async()=>{
  const db=new PGlite();
  try{
    await fixture(db);
    await db.exec("insert into tb_saude_alimentos(source_order,categoria,item,porcao_equivalente,kcal_100g,proteina_100g,carboidrato_100g,gordura_100g) values(122,'Legumes','Cenoura','100 g',99,2,3,4);");
    await expect(db.exec(seed)).rejects.toThrow('cadastro diferente');
    await db.exec('rollback');
    expect((await db.query("select kcal_100g from tb_saude_alimentos where item='Cenoura'")).rows[0].kcal_100g).toBe('99.00');
    expect((await db.query("select id from tb_saude_alimentos where item='Abóbora'")).rows).toHaveLength(0);
  }finally{await db.close();}
},20000);
