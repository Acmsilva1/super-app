import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {it,expect} from 'vitest';

const read=path=>readFile(new URL(`../../${path}`,import.meta.url),'utf8');
const migration=await read('migration/20261011_drop_tabelas_financeiro_legadas.sql');
const targets=['tb_compras','tb_financeiro_analises','tb_financeiro_features_mensais','tb_financeiro_analise_runs','tb_financeiro_modelo_estado'];
const preserved=['tb_financas','tb_lista_compras','tb_telegram_compras','tb_saude_alertas_envios','bkp_views_dashboards_20261003'];
const fixture=async db=>db.exec(`
  create table tb_compras(id int primary key);
  create table tb_financeiro_analises(id int primary key);
  create table tb_financeiro_features_mensais(id int primary key);
  create table tb_financeiro_analise_runs(id int primary key,analise_id int references tb_financeiro_analises(id));
  create table tb_financeiro_modelo_estado(id int primary key);
  create view vw_financeiro_compras_mensal as select id from tb_compras;
  create view vw_financeiro_ultimos_5_meses as select id from tb_financeiro_features_mensais;
  ${preserved.map(name=>`create table ${name}(id int primary key);`).join('\n')}
`);
const exists=async(db,names)=>Promise.all(names.map(async name=>(await db.query('select to_regclass($1) is not null as present',[`public.${name}`])).rows[0].present));

it('audita somente leitura, remove apenas legadas e aceita repetição',async()=>{
  const db=new PGlite();
  try{
    await fixture(db);
    const result=await db.exec(await read('sql/20261011_auditoria_tabelas_supabase.sql'));
    const inventory=result.find(part=>part.rows?.some(row=>row.tabela==='tb_compras'));
    expect(inventory.rows.find(row=>row.tabela==='tb_compras').analise_codigo).toContain('Candidata');
    expect(inventory.rows.find(row=>row.tabela==='bkp_views_dashboards_20261003').analise_codigo).toContain('Preservar');
    expect(await exists(db,targets)).toEqual(targets.map(()=>true));
    await db.exec(migration);await db.exec(migration);
    expect(await exists(db,targets)).toEqual(targets.map(()=>false));
    expect(await exists(db,preserved)).toEqual(preserved.map(()=>true));
    expect(await exists(db,['vw_financeiro_compras_mensal','vw_financeiro_ultimos_5_meses'])).toEqual([false,false]);
  }finally{await db.close();}
},20000);

it('bloqueia dados sem confirmação de backup e libera com confirmação explícita',async()=>{
  const db=new PGlite();
  try{
    await fixture(db);await db.exec('insert into tb_compras values(1)');
    await expect(db.exec(migration)).rejects.toThrow('contém dados');await db.exec('rollback');
    expect(await exists(db,[...targets,'vw_financeiro_compras_mensal'])).toEqual([...targets,true].map(()=>true));
    expect((await db.query('select id from tb_compras')).rows).toEqual([{id:1}]);
    await db.exec(migration.replace('begin;',"begin;\nset local superapp.cleanup_backup_confirmed = 'on';"));
    expect(await exists(db,targets)).toEqual(targets.map(()=>false));
    expect(await exists(db,preserved)).toEqual(preserved.map(()=>true));
  }finally{await db.close();}
},20000);

it('dependência externa e função antiga bloqueiam a operação inteira',async()=>{
  const db=new PGlite();
  try{
    await fixture(db);await db.exec('create view consumidor_externo as select id from tb_financeiro_modelo_estado');
    await expect(db.exec(migration)).rejects.toThrow();await db.exec('rollback');
    expect(await exists(db,[...targets,'vw_financeiro_compras_mensal','vw_financeiro_ultimos_5_meses'])).toEqual([...targets,true,true].map(()=>true));
    await db.exec(`drop view consumidor_externo;
      create function consumidor_legado() returns int language plpgsql as $$ begin return (select count(*)::int from public.tb_compras); end $$;`);
    await expect(db.exec(migration)).rejects.toThrow('consumidor_legado');await db.exec('rollback');
    expect(await exists(db,targets)).toEqual(targets.map(()=>true));
    await db.exec(`drop function consumidor_legado();
      create function consumidor_view() returns int language plpgsql as $$ begin return (select count(*)::int from public.vw_financeiro_compras_mensal); end $$;`);
    await expect(db.exec(migration)).rejects.toThrow('consumidor_view');await db.exec('rollback');
    expect(await exists(db,targets)).toEqual(targets.map(()=>true));
    await db.exec('drop function consumidor_view(); create table referencia_externa(id int references tb_compras(id));');
    await expect(db.exec(migration)).rejects.toThrow();await db.exec('rollback');
    expect(await exists(db,[...targets,'vw_financeiro_compras_mensal'])).toEqual([...targets,true].map(()=>true));
  }finally{await db.close();}
},20000);

it('bloqueia objetos inesperados e exige backup real para restauração',async()=>{
  const db=new PGlite();
  try{
    await db.exec('create view tb_compras as select 1 id');
    await expect(db.exec(migration)).rejects.toThrow('não é uma tabela comum');await db.exec('rollback');
    expect(await exists(db,['tb_compras'])).toEqual([true]);
    await expect(db.exec(await read('migration/rollback/20261011_drop_tabelas_financeiro_legadas.sql'))).rejects.toThrow('Rollback exige restaurar o backup');
  }finally{await db.close();}
},20000);
