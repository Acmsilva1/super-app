import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rows: new Map(), roles: [], inserts: [], rpc: vi.fn(), auth: vi.fn(), selectError: null, insertError: null, race: null }));
vi.mock('../../lib/auth.js', () => ({ requireUser: state.auth }));
vi.mock('../../lib/financeiroShared.js', () => ({ obterFinanceiroMes: vi.fn(), garantirDespesasFixasMes: vi.fn(), criarRegistroFinanceiro: vi.fn(), atualizarRegistroFinanceiro: vi.fn(), removerRegistroFinanceiro: vi.fn() }));
vi.mock('../../lib/alertServiceClient.js', () => ({ getAlertServiceClient: () => client() }));
import handler from '../../api/financeiro.js';
import { whatsappPurchaseInput, whatsappPurchasesHandler } from '../../lib/whatsappPurchases.js';
import { getBrazilTodayIso } from '../../features/financeiro/service/financeiroService.js';
const token = 'test-purchase-callback'.padEnd(48, 'x');
const owner = '00000000-0000-4000-8000-000000000001';
const phone = '+5511900000000';
const id = '00000000-0000-4000-8000-000000000010';
function body(changes = {}) { return { action: 'record', request_id: id, sender_phone: phone, confirmed: true, date: getBrazilTodayIso(), items: [{ description: 'Padaria', amount_cents: 425, payment: 'debito' }, { description: 'Mercado', amount_cents: 1530, payment: 'pix' }], ...changes }; }
function req(changes = {}) { return { method: 'POST', headers: { authorization: 'Bearer ' + token }, query: { resource: 'whatsapp-purchases' }, body: body(), ...changes }; }
function res() { return { code: null, data: null, setHeader: vi.fn(), status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; }, end(data) { this.data = JSON.parse(data); return this; } }; }
function client() { return { rpc: state.rpc, from(table) {
  let rowId, insert;
  const q = { select() { return q; }, eq(key, value) { if (key === 'id') rowId = value; return q; }, maybeSingle() { return q; }, insert(value) { insert = value; return q; }, then(resolve) {
    if (table === 'app_user_roles') return Promise.resolve({ data: state.roles, error: null }).then(resolve);
    if (insert) {
      state.inserts.push(insert);
      if (state.race) { const race = state.race; state.race = null; state.rows.set(insert.id, { ...insert, status: 'pending', ...race }); return Promise.resolve({ error: { code: '23505' } }).then(resolve); }
      if (state.insertError) return Promise.resolve({ error: state.insertError }).then(resolve);
      state.rows.set(insert.id, { ...insert, status: 'pending' });
      return Promise.resolve({ error: null }).then(resolve);
    }
    return Promise.resolve({ data: state.rows.get(rowId) || null, error: state.selectError }).then(resolve);
  } };
  return q;
} }; }
async function run(request = req()) { const response = res(); await whatsappPurchasesHandler(request, response, { getClient: () => client() }); return response; }
beforeEach(() => {
  vi.stubEnv('WHATSAPP_PURCHASE_CALLBACK_TOKEN', token); vi.stubEnv('WHATSAPP_PURCHASE_OWNER_PHONE', phone); vi.stubEnv('SAUDE_ALERTS_OWNER_USER_ID', owner);
  state.rows = new Map(); state.roles = [{ role: 'owner' }]; state.inserts = []; state.selectError = null; state.insertError = null; state.race = null;
  state.auth.mockReset().mockResolvedValue({ ok: false, status: 401, data: { error: 'login_required' } });
  state.rpc.mockReset().mockImplementation(async (_name, args) => { const row = state.rows.get(args.p_id); if (!row) return { data: 'unavailable', error: null }; row.status = 'saved'; return { data: 'saved', error: null }; });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it('rota real registra lote confirmado no owner fixo sem sessão de navegador', async () => {
  const response = res(); await handler(req(), response);
  expect(response.code).toBe(200); expect(response.data).toEqual({ ok: true, status: 'saved', duplicate: false, request_id: id, count: 2, total_cents: 1955, date: getBrazilTodayIso() });
  expect(state.auth).not.toHaveBeenCalled(); expect(state.inserts).toHaveLength(1);
  expect(state.inserts[0]).toMatchObject({ owner_id: owner, chat_id: 'wa:' + phone, sender_id: 'wa:' + phone });
  expect(state.inserts[0].update_id).toBeLessThan(0); expect(Number.isSafeInteger(state.inserts[0].update_id)).toBe(true);
  expect(state.inserts[0].payload.items).toEqual([{ descricao: 'Padaria', valor: 4.25, tipo: 'despesa', categoria: 'Outros', metodo_pagamento: 'debito_pix', data_lancamento: getBrazilTodayIso() }, { descricao: 'Mercado', valor: 15.3, tipo: 'despesa', categoria: 'Outros', metodo_pagamento: 'debito_pix', data_lancamento: getBrazilTodayIso() }]);
  expect(state.rpc).toHaveBeenCalledWith('telegram_confirm_purchase', { p_id: id, p_chat_id: 'wa:' + phone, p_sender_id: 'wa:' + phone, p_owner_id: owner, p_cancel: false });
});
it('demais resources mantêm autenticação comum', async () => {
  const response = res(); await handler(req({ query: {} }), response);
  expect(response.code).toBe(401); expect(state.auth).toHaveBeenCalledOnce(); expect(state.inserts).toHaveLength(0);
});
it.each(['GET', 'PUT', 'PATCH', 'DELETE'])('recusa método %s', async method => {
  expect((await run(req({ method }))).code).toBe(405); expect(state.rpc).not.toHaveBeenCalled();
});
it.each(['', 'Bearer wrong', undefined])('recusa token incorreto %s', async authorization => {
  expect((await run(req({ headers: { authorization } }))).code).toBe(401); expect(state.inserts).toHaveLength(0);
});
it('não usa token de água/integração como fallback de compras', async () => {
  vi.stubEnv('WHATSAPP_PURCHASE_CALLBACK_TOKEN', ''); vi.stubEnv('WHATSAPP_WATER_CALLBACK_TOKEN', token);
  expect((await run()).code).toBe(503); expect(state.rpc).not.toHaveBeenCalled();
});
it('somente o telefone configurado é autorizado', async () => {
  expect((await run(req({ body: body({ sender_phone: '+5511900000001' }) }))).code).toBe(403); expect(state.inserts).toHaveLength(0);
});
it('owner do corpo é ignorado e usuário não administrativo é recusado', async () => {
  expect((await run(req({ body: body({ owner_id: 'attacker' }) }))).code).toBe(200); expect(state.inserts[0].owner_id).toBe(owner);
  state.roles = [{ role: 'user' }]; expect((await run()).code).toBe(403);
});
it.each([false, 'true', undefined])('não insere rascunho sem confirmed estritamente true: %s', async confirmed => {
  expect((await run(req({ body: body({ confirmed }) }))).code).toBe(400); expect(state.inserts).toHaveLength(0); expect(state.rpc).not.toHaveBeenCalled();
});
it.each([0, -1, 10.5, '425', 1000000000, null])('recusa centavos inválidos %s', async amount_cents => {
  expect((await run(req({ body: body({ items: [{ description: 'Padaria', amount_cents, payment: 'pix' }] }) }))).code).toBe(400); expect(state.inserts).toHaveLength(0);
});
it.each(['credito', 'dinheiro', 'debito_pix', '', null])('recusa método %s', async payment => {
  expect((await run(req({ body: body({ items: [{ description: 'Padaria', amount_cents: 100, payment }] }) }))).code).toBe(400);
});
it('limita quantidade, descrições e campos extras das compras', async () => {
  const cases = [[], Array(21).fill(body().items[0]), [{ ...body().items[0], description: ' ' }], [{ ...body().items[0], description: 'a'.repeat(121) }], [{ ...body().items[0], description: 'teste\ncontrole' }], [{ ...body().items[0], parcelas: 2 }]];
  for (const items of cases) expect((await run(req({ body: body({ items }) }))).code).toBe(400);
  expect(state.inserts).toHaveLength(0);
});
it.each(['2026-02-31', '2026-13-01', 'today', '2026-1-01'])('recusa data inválida %s', async date => {
  expect((await run(req({ body: body({ date }) }))).code).toBe(400);
});
it('novo pedido de outro dia é recusado sem inserir', async () => {
  expect((await run(req({ body: body({ date: '2000-01-01' }) }))).code).toBe(410); expect(state.inserts).toHaveLength(0);
});
it('retry salvo de data anterior confirma resultado sem RPC nem novo insert', async () => {
  const packet = body({ date: '2000-01-01' }); const input = whatsappPurchaseInput(packet);
  state.rows.set(id, { id, owner_id: owner, chat_id: 'wa:' + phone, sender_id: 'wa:' + phone, payload: input.payload, status: 'saved' });
  expect((await run(req({ body: packet }))).data).toMatchObject({ duplicate: true, date: '2000-01-01' }); expect(state.inserts).toHaveLength(0); expect(state.rpc).not.toHaveBeenCalled();
});
it('mesmo pedido salvo é idempotente; alteração inclusive de debito para pix dá conflito', async () => {
  await run(); expect((await run()).data.duplicate).toBe(true); expect(state.inserts).toHaveLength(1); expect(state.rpc).toHaveBeenCalledOnce();
  for (const items of [[{ ...body().items[0], payment: 'pix' }, body().items[1]], [{ ...body().items[0], amount_cents: 500 }, body().items[1]]]) expect((await run(req({ body: body({ items }) }))).code).toBe(409);
});
it('não reutiliza registro de outro proprietário/canal', async () => {
  const input = whatsappPurchaseInput(body()); state.rows.set(id, { owner_id: 'other', chat_id: '123', sender_id: '123', payload: input.payload, status: 'saved' });
  expect((await run()).code).toBe(409); expect(state.rpc).not.toHaveBeenCalled();
});
it('conflito concorrente mesmo ID/payload continua com a mesma RPC e sem substituir dados', async () => {
  state.race = {}; expect((await run()).data).toMatchObject({ duplicate: true, status: 'saved' }); expect(state.rpc).toHaveBeenCalledOnce();
});
it('colisão de update_id ou corrida com payload divergente é conflito', async () => {
  state.insertError = { code: '23505' }; expect((await run()).code).toBe(409); expect(state.rpc).not.toHaveBeenCalled();
});
it.each(['cancelled', 'expired'])('RPC %s não confirma sucesso', async status => {
  state.rpc.mockResolvedValue({ data: status, error: null }); const response = await run(); expect(response.code).toBe(409); expect(response.data.status).toBeUndefined();
});
it('falha ambígua pode repetir a mesma confirmação sem criar outro rascunho', async () => {
  state.rpc.mockResolvedValueOnce({ error: { message: 'database secret' }, data: null }); expect((await run()).code).toBe(503);
  expect((await run()).data).toMatchObject({ status: 'saved', duplicate: true }); expect(state.inserts).toHaveLength(1);
});
it('healthcheck autenticado usa UUID inexistente e não insere qualquer linha', async () => {
  const response = await run(req({ body: { action: 'healthcheck', sender_phone: phone } }));
  expect(response.data).toEqual({ ok: true, purchases_available: true }); expect(state.inserts).toHaveLength(0);
  expect(state.rpc).toHaveBeenCalledWith('telegram_confirm_purchase', expect.objectContaining({ p_id: '00000000-0000-0000-0000-000000000000', p_chat_id: 'wa:healthcheck' }));
});
it('falha de schema/RPC não vaza erros internos', async () => {
  state.rpc.mockResolvedValue({ error: { message: 'internal sensitive details' } });
  const response = await run(); expect(response.code).toBe(503); expect(JSON.stringify(response.data)).not.toContain('internal');
});
it('normaliza descrição e UUID, mantendo centavos exatos e ordem de itens', () => {
  const result = whatsappPurchaseInput(body({ request_id: id.toUpperCase(), items: [{ description: '  café  ', amount_cents: 1, payment: 'pix' }] }));
  expect(result.requestId).toBe(id); expect(result.payload.items[0]).toMatchObject({ descricao: 'café', valor: 0.01 }); expect(result.total).toBe(1);
});
it('JSON inválido e request_id malformado não acessam RPC', async () => {
  expect((await run(req({ body: '{invalid' }))).code).toBe(400);
  expect((await run(req({ body: body({ request_id: 'bad-id' }) }))).code).toBe(400); expect(state.rpc).not.toHaveBeenCalled();
});
