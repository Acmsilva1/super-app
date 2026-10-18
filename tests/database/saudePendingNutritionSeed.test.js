import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import { dietItemNutritionIssue, nutritionForDietItem } from '../../features/saude/service/alimentosService.js';

const read = path => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const seed = await read('sql/20261017_seed_alimentos_pendentes_nutricao.sql');
const rollback = await read('sql/rollback/20261017_seed_alimentos_pendentes_nutricao.sql');
const source = 'seed-alimentos-pendentes-nutricao-20261017';
const columns = 'id,source_order,item,kcal_100g,proteina_100g,carboidrato_100g,gordura_100g,peso_referencia_g,observacoes,fonte_nutricional,source_file';
async function fixture(db) {
  const migration = await read('migration/20261007_create_saude_alimentos_seed.sql');
  await db.exec(migration.match(/create table if not exists public.tb_saude_alimentos \([\s\S]*?\n\);/)[0]);
  await db.exec(`create unique index food_name_key on tb_saude_alimentos(lower(trim(item)));
    create sequence tb_saude_alimentos_source_order_seq start 150;
    create table tb_saude_dietas(id bigint primary key,refeicoes jsonb,semana jsonb);`);
}
const rows = async db => (await db.query(`select ${columns} from tb_saude_alimentos order by id`)).rows;

it('insere quatro referências, calcula porções e reaplica sem duplicar ou alterar', async () => {
  const db = new PGlite();
  try {
    await fixture(db);
    await db.exec(seed);
    const before = await rows(db);
    expect(before).toHaveLength(4);
    await db.exec(seed);
    expect(await rows(db)).toEqual(before);
    const whey = before.find(f => f.item === 'Whey protein');
    expect(whey.observacoes).toContain('ESTIMATIVA');
    expect(whey.fonte_nutricional).toContain('NDB 14066');
    expect(nutritionForDietItem({ nome: 'Whey protein', quantidade: '30 g' }, before))
      .toEqual({ kcal: 105.6, proteina: 23.44, carboidrato: 1.88, gordura: 0.47 });
    expect(nutritionForDietItem({ nome: 'Arroz branco', quantidade: '100 g' }, before))
      .toEqual({ kcal: 128, proteina: 2.5, carboidrato: 28.1, gordura: 0.2 });
    for (const nome of ['Salada', 'Salada de folhas e tomate']) {
      const salada = before.find(f => f.item === nome);
      expect(salada.observacoes).toContain('ESTIMATIVA DE RECEITA');
      expect(nutritionForDietItem({ nome, quantidade: '100 g' }, before))
        .toEqual({ kcal: (14 + 15) / 2, proteina: (1.7 + 1.1) / 2, carboidrato: (2.4 + 3.1) / 2, gordura: 0.15 });
      expect(dietItemNutritionIssue({ nome, quantidade: 'À vontade' }, before)).toBe('quantidade_indefinida');
    }
    expect(dietItemNutritionIssue({ nome: 'Whey protein', quantidade: '25-30 g' }, before)).toBe('quantidade_indefinida');
    expect((await db.query("select nextval('tb_saude_alimentos_source_order_seq') as n")).rows[0].n).toBeGreaterThanOrEqual(150);
  } finally { await db.close(); }
}, 20000);

it('preserva o cadastro anterior mesmo com acentos e espaços diferentes', async () => {
  const db = new PGlite();
  try {
    await fixture(db);
    await db.exec(`insert into tb_saude_alimentos(source_order,categoria,item,porcao_equivalente,
      kcal_100g,proteina_100g,carboidrato_100g,gordura_100g,source_file)
      values(200,'Proteínas','  WHÉY   protein  ','30 g',400,80,10,4,'rotulo-real');`);
    const original = (await rows(db))[0];
    await db.exec(seed);
    expect(await rows(db)).toHaveLength(4);
    expect((await rows(db))[0]).toEqual(original);
    await db.exec(rollback);
    expect(await rows(db)).toEqual([original]);
    expect((await db.query("select nextval('tb_saude_alimentos_source_order_seq') as n")).rows[0].n).toBeGreaterThan(203);
  } finally { await db.close(); }
}, 20000);

it('interrompe atomicamente quando o catálogo possui nomes normalizados duplicados', async () => {
  const db = new PGlite();
  try {
    await fixture(db);
    await db.exec(`insert into tb_saude_alimentos(source_order,categoria,item,porcao_equivalente,
      kcal_100g,proteina_100g,carboidrato_100g,gordura_100g)
      values(1,'Outros','Whey protein','100 g',1,1,1,1),(2,'Outros','Whéy protein','100 g',2,2,2,2);`);
    const before = await rows(db);
    await expect(db.exec(seed)).rejects.toThrow('duplicados após normalização');
    await db.exec('rollback');
    expect(await rows(db)).toEqual(before);
  } finally { await db.close(); }
}, 20000);

it('bloqueia rollback de alimentos editados ou vinculados em dietas semanais', async () => {
  const db = new PGlite();
  try {
    await fixture(db);
    await db.exec(seed);
    const whey = (await rows(db)).find(f => f.item === 'Whey protein');
    await db.query("update tb_saude_alimentos set updated_at=created_at+interval '1 second' where id=$1", [whey.id]);
    await expect(db.exec(rollback)).rejects.toThrow('foi editado');
    await db.exec('rollback');
    await db.query('update tb_saude_alimentos set updated_at=created_at where id=$1', [whey.id]);
    for (const alimento_id of [Number(whey.id), String(whey.id)]) {
      await db.query('insert into tb_saude_dietas(id,semana) values(1,$1)',
        [JSON.stringify([{ refeicoes: [{ itens: [{ alimento_id }] }] }])]);
      await expect(db.exec(rollback)).rejects.toThrow('vinculado a dieta');
      await db.exec('rollback');
      expect(await rows(db)).toHaveLength(4);
      await db.exec('delete from tb_saude_dietas');
    }
    await db.exec(rollback);
    expect(await rows(db)).toHaveLength(0);
    await db.exec(rollback);
    expect(await rows(db)).toHaveLength(0);
  } finally { await db.close(); }
}, 20000);
