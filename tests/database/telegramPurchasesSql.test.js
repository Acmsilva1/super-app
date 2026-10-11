import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {it,expect} from 'vitest';

it('confirma lote atomicamente, preserva rascunhos antigos e não duplica no segundo clique',async()=>{
  const db=new PGlite();
  const owner='00000000-0000-4000-8000-000000000001';
  const item=(descricao,valor)=>({descricao,valor,tipo:'despesa',metodo_pagamento:'debito_pix',data_lancamento:'2026-10-11'});
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create schema auth;create table auth.users(id uuid primary key);
      create table tb_financas(user_id uuid,descricao text,valor numeric(12,2),tipo text,categoria text,data_lancamento date,metodo_pagamento text);`);
    await db.query('insert into auth.users values($1)',[owner]);
    await db.exec(await readFile(new URL('../../migration/20261006_telegram_compras.sql',import.meta.url),'utf8'));
    const sql=await readFile(new URL('../../migration/20261011_telegram_compras_multiplas.sql',import.meta.url),'utf8');
    await db.exec(sql);await db.exec(sql);
    let update=0;
    const draft=async payload=>{
      const id=`00000000-0000-4000-8000-${String(++update+10).padStart(12,'0')}`;
      await db.query('insert into tb_telegram_compras(id,update_id,chat_id,sender_id,owner_id,payload) values($1,$2,$3,$4,$5,$6)',[id,update,'123','123',owner,JSON.stringify(payload)]);
      return id;
    };
    const confirm=async(id,cancel=false,who=owner)=> (await db.query('select telegram_confirm_purchase($1,$2,$3,$4,$5) result',[id,'123','123',who,cancel])).rows[0].result;
    const id=await draft({items:[item('padaria',4.25),item('mercado',15.30)]});
    expect(await confirm(id,false,'00000000-0000-4000-8000-000000000002')).toBe('unavailable');
    expect(await confirm(id,false,null)).toBe('unavailable');
    expect(await confirm(id)).toBe('saved');expect(await confirm(id)).toBe('saved');
    expect((await db.query('select descricao,valor::text,user_id from tb_financas')).rows).toEqual([
      {descricao:'padaria',valor:'4.25',user_id:owner},{descricao:'mercado',valor:'15.30',user_id:owner}]);
    const cancelled=await draft({items:[item('cancelar',1)]});expect(await confirm(cancelled,true)).toBe('cancelled');expect(await confirm(cancelled)).toBe('cancelled');
    const old=await draft(item('antigo',2));expect(await confirm(old)).toBe('saved');
    const invalid=await draft({items:[item('válido',3),item('inválido',-1)]});
    await expect(confirm(invalid)).rejects.toThrow();
    expect((await db.query('select count(*)::int count from tb_financas')).rows[0].count).toBe(3);
    expect((await db.query('select status from tb_telegram_compras where id=$1',[invalid])).rows[0].status).toBe('pending');
    const expired=await draft({items:[item('expirado',1)]});await db.query("update tb_telegram_compras set created_at=now()-interval '16 minutes' where id=$1",[expired]);expect(await confirm(expired)).toBe('expired');
    await db.exec('set role authenticated');await expect(confirm(id)).rejects.toThrow();await db.exec('reset role');
    const rollback=await readFile(new URL('../../migration/rollback/20261011_telegram_compras_multiplas.sql',import.meta.url),'utf8');
    await expect(db.exec(rollback)).rejects.toThrow();await db.exec('rollback');
    expect(await confirm(invalid,true)).toBe('cancelled');await db.exec(rollback);
    const restored=await draft(item('após rollback',5));expect(await confirm(restored)).toBe('saved');
    expect((await db.query('select count(*)::int count from tb_financas')).rows[0].count).toBe(4);
  }finally{await db.close();}
},20000);
