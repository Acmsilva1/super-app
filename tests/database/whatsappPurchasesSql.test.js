import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, expect, it, vi } from 'vitest';
import { whatsappPurchasesHandler } from '../../lib/whatsappPurchases.js';
import { getBrazilTodayIso } from '../../features/financeiro/service/financeiroService.js';
const owner = '00000000-0000-4000-8000-000000000001';
const token = 'test-only-whatsapp-purchase-sql'.padEnd(48, 'x');
const phone = '+5511900000000';
afterEach(() => vi.unstubAllEnvs());
it('endpoint real reutiliza RPC SQL, confirma lote uma vez e não altera registros Telegram', async () => {
  const db = new PGlite();
  vi.stubEnv('WHATSAPP_PURCHASE_CALLBACK_TOKEN', token); vi.stubEnv('WHATSAPP_PURCHASE_OWNER_PHONE', phone); vi.stubEnv('SAUDE_ALERTS_OWNER_USER_ID', owner);
  try {
    await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table app_user_roles(user_id uuid,role text);create table tb_financas(user_id uuid,descricao text,valor numeric(12,2),tipo text,categoria text,data_lancamento date,metodo_pagamento text);');
    await db.query('insert into auth.users values($1)', [owner]); await db.query('insert into app_user_roles values($1,$2)', [owner, 'owner']);
    await db.exec(await readFile(new URL('../../migration/20261006_telegram_compras.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../../migration/20261011_telegram_compras_multiplas.sql', import.meta.url), 'utf8'));
    const client = { rpc: async (_name, p) => { try { const r = await db.query('select telegram_confirm_purchase($1,$2,$3,$4,$5) result', [p.p_id, p.p_chat_id, p.p_sender_id, p.p_owner_id, p.p_cancel]); return { data: r.rows[0].result, error: null }; } catch (e) { return { data: null, error: { code: e.code, message: e.message } }; } }, from(table) {
      let single = false, inserted = null; const values = {};
      const q = { select() { return q; }, eq(k, v) { values[k] = v; return q; }, maybeSingle() { single = true; return q; }, insert(row) { inserted = row; return q; }, async then(resolve) {
        try {
          if (inserted) { const p = inserted; await db.query('insert into tb_telegram_compras(id,update_id,chat_id,sender_id,owner_id,payload) values($1,$2,$3,$4,$5,$6)', [p.id, p.update_id, p.chat_id, p.sender_id, p.owner_id, JSON.stringify(p.payload)]); return resolve({ error: null }); }
          const r = table === 'app_user_roles' ? await db.query('select role from app_user_roles where user_id=$1', [values.user_id]) : await db.query('select id,owner_id,chat_id,sender_id,payload,status from tb_telegram_compras where id=$1', [values.id]);
          return resolve({ data: single ? r.rows[0] || null : r.rows, error: null });
        } catch (e) { return resolve({ data: null, error: { code: e.code, message: e.message } }); }
      } }; return q;
    } };
    const requestId = '00000000-0000-4000-8000-000000000010';
    const packet = { action: 'record', sender_phone: phone, request_id: requestId, confirmed: true, date: getBrazilTodayIso(), items: [{ description: 'Padaria', amount_cents: 425, payment: 'debito' }, { description: 'Mercado', amount_cents: 1530, payment: 'pix' }] };
    async function call(body) { const res = { code: null, data: null, setHeader() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } }; await whatsappPurchasesHandler({ method: 'POST', headers: { authorization: 'Bearer ' + token }, body }, res, { getClient: () => client }); return res; }
    expect((await call({ ...packet, confirmed: false })).code).toBe(400);
    expect((await db.query('select count(*)::int n from tb_telegram_compras')).rows[0].n).toBe(0);
    const results = await Promise.all([call(packet), call(packet)]);
    expect(results.every(r => r.code === 200)).toBe(true);
    expect(results.filter(r => r.data.duplicate === false)).toHaveLength(1);
    expect((await db.query('select descricao,valor::text,tipo,categoria,metodo_pagamento,user_id from tb_financas order by tb_financas.valor')).rows).toEqual([{ descricao: 'Padaria', valor: '4.25', tipo: 'despesa', categoria: 'Outros', metodo_pagamento: 'debito_pix', user_id: owner }, { descricao: 'Mercado', valor: '15.30', tipo: 'despesa', categoria: 'Outros', metodo_pagamento: 'debito_pix', user_id: owner }]);
    expect((await call({ ...packet, items: [{ ...packet.items[0], amount_cents: 500 }, packet.items[1]] })).code).toBe(409);
    expect((await call({ action: 'healthcheck', sender_phone: phone })).data).toEqual({ ok: true, purchases_available: true });
    expect((await db.query('select count(*)::int n from tb_financas')).rows[0].n).toBe(2);
    expect((await db.query('select count(*)::int n from tb_telegram_compras')).rows[0].n).toBe(1);
    expect((await db.query('select update_id::text id from tb_telegram_compras')).rows[0].id.startsWith('-')).toBe(true);
    // The oldest deployed helper must never turn a batch into a blank expense.
    await db.exec(await readFile(new URL('../../migration/20261006_telegram_compras.sql', import.meta.url), 'utf8'));
    const single = await call({ ...packet, request_id: '00000000-0000-4000-8000-000000000011', items: [packet.items[0]] });
    expect(single.code).toBe(200);
    expect((await db.query('select count(*)::int n from tb_financas')).rows[0].n).toBe(3);
    const legacyBatch = await call({ ...packet, request_id: '00000000-0000-4000-8000-000000000012' });
    expect(legacyBatch.code).toBe(503);
    expect((await db.query('select count(*)::int n from tb_financas')).rows[0].n).toBe(3);
    expect((await db.query('select count(*)::int n from tb_financas where descricao is null or valor is null')).rows[0].n).toBe(0);
  } finally { await db.close(); }
}, 20000);
