import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
const owner='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
let db;
beforeAll(async()=>{
  db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    create function auth.role() returns text language sql as 'select current_setting(''request.jwt.claim.role'',true)';
    set request.jwt.claim.role='service_role';
    create table tb_financas(id bigserial primary key,user_id uuid not null,descricao text not null,valor numeric not null check(valor>0),tipo text,categoria text,data_lancamento date,metodo_pagamento text,created_at timestamptz default now());
    create table tb_despesas_fixas(id bigserial primary key,user_id uuid not null,descricao text not null,valor numeric check(valor>0),status text,pendente_mes boolean,conta_fixa boolean,parcela_atual integer,parcela_total integer,serie_id text,created_at timestamptz default now());
    create table tb_poupanca(id bigserial primary key,user_id uuid not null,descricao text,valor numeric check(valor>0),data_lancamento date,created_at timestamptz default now());
    create table tb_poupanca_metas(id bigserial primary key,user_id uuid not null,nome_meta text not null,valor_meta numeric check(valor_meta>0),data_inicio date,ativa boolean,created_at timestamptz default now());`);
  await db.exec(fs.readFileSync('migration/20261008_financeiro_operacoes_atomicas.sql','utf8'));
  await db.exec(fs.readFileSync('migration/20261008_action_rate_limits.sql','utf8'));
},30000);
afterAll(async()=>{await db?.close();});
beforeEach(async()=>{
  await db.exec(`set request.jwt.claim.role='service_role'; truncate tb_financas,tb_despesas_fixas,tb_poupanca,tb_poupanca_metas,tb_action_rate_limits restart identity;`);
  await db.query('insert into tb_despesas_fixas(user_id,descricao,valor) values($1,$2,15)',[owner,'Origem']);
});
const row={descricao:'Destino',valor:15,tipo:'despesa',categoria:'Outros',data_lancamento:'2026-10-07',metodo_pagamento:'debito_pix'};
async function move(payload=row,id='1',userId=owner){return db.query('select financeiro_realocar_registro($1,$2,$3,$4,$5) as rows',[userId,'tb_despesas_fixas',id,'tb_financas',JSON.stringify([payload])]);}
describe('PostgreSQL: operacoes financeiras atomicas',()=>{
  it('realoca e preserva autoria ignorando user_id enviado',async()=>{
    const result=await move({...row,user_id:other});
    expect(result.rows[0].rows[0].user_id).toBe(owner);
    expect((await db.query('select * from tb_despesas_fixas')).rows).toHaveLength(0);
    expect((await db.query('select * from tb_financas')).rows).toHaveLength(1);
  });
  it('nao insere quando origem nao existe',async()=>{
    await expect(move(row,'999')).rejects.toThrow('financeiro_source_not_found');
    expect((await db.query('select * from tb_financas')).rows).toHaveLength(0);
  });
  it('nao move registros de outro usuario',async()=>{
    await expect(move(row,'1',other)).rejects.toThrow('financeiro_source_not_found');
    expect((await db.query('select * from tb_despesas_fixas')).rows).toHaveLength(1);
  });
  it('rollback preserva origem quando insert falha',async()=>{
    await expect(move({...row,valor:-1})).rejects.toThrow();
    expect((await db.query('select * from tb_financas')).rows).toHaveLength(0);
    expect((await db.query('select * from tb_despesas_fixas')).rows).toHaveLength(1);
  });
  it('segunda execucao nao duplica a realocacao',async()=>{
    await move(); await expect(move()).rejects.toThrow('financeiro_source_not_found');
    expect((await db.query('select * from tb_financas')).rows).toHaveLength(1);
  });
  it('rollback desfaz o destino se a exclusao falhar',async()=>{
    await db.exec("create function reject_audit_delete() returns trigger language plpgsql as $$begin raise exception 'simulated delete failure';end;$$; create trigger audit_reject before delete on tb_despesas_fixas for each row execute function reject_audit_delete();");
    try {
      await expect(move()).rejects.toThrow('simulated delete failure');
      expect((await db.query('select * from tb_financas')).rows).toHaveLength(0);
      expect((await db.query('select * from tb_despesas_fixas')).rows).toHaveLength(1);
    } finally { await db.exec('drop trigger audit_reject on tb_despesas_fixas; drop function reject_audit_delete();'); }
  });
  it('rejeita tabelas fora da lista permitida',async()=>{
    await expect(db.query('select financeiro_realocar_registro($1,$2,$3,$4,$5)',[owner,'tb_despesas_fixas','1','auth.users',JSON.stringify([row])])).rejects.toThrow('financeiro_invalid_operation');
  });
  it('troca meta ativa dentro da transacao',async()=>{
    for(const name of ['Primeira','Segunda']) await db.query('select financeiro_criar_meta($1,$2)',[owner,JSON.stringify({nome_meta:name,valor_meta:100})]);
    const result=await db.query('select * from tb_poupanca_metas where ativa');
    expect(result.rows).toHaveLength(1); expect(result.rows[0].nome_meta).toBe('Segunda');
  });
  it('falha na nova meta nao desativa a anterior',async()=>{
    await db.query('select financeiro_criar_meta($1,$2)',[owner,JSON.stringify({nome_meta:'Anterior',valor_meta:100})]);
    await expect(db.query('select financeiro_criar_meta($1,$2)',[owner,JSON.stringify({nome_meta:'Nova',valor_meta:100,data_inicio:'invalida'})])).rejects.toThrow();
    expect((await db.query('select * from tb_poupanca_metas where ativa')).rows[0].nome_meta).toBe('Anterior');
  });
  it('credencial comum nao aceita owner diferente',async()=>{
    await db.exec(`set request.jwt.claim.role='authenticated'; set request.jwt.claim.sub='${other}';`);
    await expect(move()).rejects.toThrow('financeiro_forbidden');
  });
  it('limite persiste entre chamadas e respeita janela',async()=>{
    for(const expected of [true,true,false]) expect((await db.query('select consume_action_limit($1,2,60) as allowed',['key'])).rows[0].allowed).toBe(expected);
    await db.exec("update tb_action_rate_limits set window_started_at=now()-interval '61 seconds'");
    expect((await db.query("select consume_action_limit('key',2,60) as allowed")).rows[0].allowed).toBe(true);
  });
  it('migrations podem reaplicar e rollback remove apenas objetos novos',async()=>{
    await db.exec(fs.readFileSync('migration/20261008_financeiro_operacoes_atomicas.sql','utf8'));
    await db.exec(fs.readFileSync('migration/20261008_action_rate_limits.sql','utf8'));
    await db.exec(fs.readFileSync('migration/rollback/20261008_financeiro_operacoes_atomicas.sql','utf8'));
    await db.exec(fs.readFileSync('migration/rollback/20261008_action_rate_limits.sql','utf8'));
    expect((await db.query('select * from tb_despesas_fixas')).rows).toHaveLength(1);
    await db.exec(fs.readFileSync('migration/20261008_financeiro_operacoes_atomicas.sql','utf8'));
    await db.exec(fs.readFileSync('migration/20261008_action_rate_limits.sql','utf8'));
  });
});
