import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it('migration do carnê aceita tipo carne e persiste parcelas pagas', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('f88a6351-317d-425b-afcd-9430c8a34f53');`);
    await db.exec(await readFile(new URL('../../migration/20261010_create_financeiro_alertas.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../../migration/20261010_financeiro_alertas_secoes_horarios.sql', import.meta.url), 'utf8'));
    const sql = await readFile(new URL('../../migration/20261027_financeiro_carne_alerta.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql);
    await db.query(
      `insert into tb_financeiro_alertas(user_id,nome,tipo,mensagem,cron,horarios,ativo)
       values('f88a6351-317d-425b-afcd-9430c8a34f53','Resumo · Carnê / boleto','carne','','0 9 * * *',$1,true)`,
      [JSON.stringify(['09:00'])],
    );
    await db.query(
      `insert into tb_financeiro_carne_pago(user_id,carne_id,parcela_numero)
       values('f88a6351-317d-425b-afcd-9430c8a34f53','carro-juliana',1)`,
    );
    expect((await db.query('select tipo from tb_financeiro_alertas where tipo=$1', ['carne'])).rows).toHaveLength(1);
    expect((await db.query('select parcela_numero from tb_financeiro_carne_pago')).rows[0].parcela_numero).toBe(1);
    await db.exec('set role authenticated');
    await expect(db.query('select * from tb_financeiro_carne_pago')).rejects.toThrow();
    await db.exec('reset role');
  } finally {
    await db.close();
  }
}, 20000);
