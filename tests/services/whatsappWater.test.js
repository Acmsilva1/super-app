import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rows: {}, rpc: vi.fn(), auth: vi.fn() }));
vi.mock('../../lib/auth.js', () => ({ requireUser: state.auth }));
vi.mock('../../lib/alertServiceClient.js', () => ({ getAlertServiceClient: () => client() }));
import handler from '../../api/saude.js';
import { createWhatsAppWaterPrompt, whatsappWaterHandler } from '../../lib/whatsappWater.js';
import { getBrazilTodayIso } from '../../features/financeiro/service/financeiroService.js';
const token = 'test-water-callback-'.padEnd(48, 'x');
const owner = '00000000-0000-4000-8000-000000000001';
function client() {
  return { rpc: state.rpc, from(table) {
    const filters = [];
    const q = { select() { return q; }, eq(key, value) { filters.push(row => String(row[key]) === String(value)); return q; }, maybeSingle() { q.single = true; return q; },
      then(resolve) { const rows = (state.rows[table] || []).filter(row => filters.every(test => test(row))); return Promise.resolve({ data: q.single ? rows[0] : rows, error: null }).then(resolve); } };
    return q;
  } };
}
function prompt(date = getBrazilTodayIso()) { return createWhatsAppWaterPrompt({ profileId: 1, date, dedupeKey: `agua:${date}:07:30:1` }); }
function request(changes = {}) { return { method: 'POST', headers: { authorization: `Bearer ${token}` }, query: { resource: 'whatsapp-water' }, body: { water_prompt: prompt(), amount_ml: 200 }, ...changes }; }
function response() { return { statusCode: null, data: null, setHeader: vi.fn(), status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; }, end(data) { this.data = JSON.parse(data); return this; } }; }
async function run(req = request()) { const res = response(); await whatsappWaterHandler(req, res, { getClient: () => client() }); return res; }
beforeEach(() => {
  vi.stubEnv('WHATSAPP_WATER_CALLBACK_TOKEN', token); vi.stubEnv('SAUDE_ALERTS_OWNER_USER_ID', owner);
  state.rows = { app_user_roles: [{ user_id: owner, role: 'admin' }], tb_saude_perfis: [{ id: 1, created_by: owner, nome: 'Ana' }] };
  state.rpc.mockReset().mockResolvedValue({ data: { realizado_ml: 700, meta_ml: 2000, duplicate: false }, error: null });
  state.auth.mockReset().mockResolvedValue({ ok: false, status: 401, data: { error: 'login_required' } });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it('dispatch real da API aceita callback autenticado sem sessão de navegador', async () => {
  const res = response(); await handler(request(), res);
  expect(res.statusCode).toBe(200); expect(state.auth).not.toHaveBeenCalled();
  expect(res.data).toEqual({ ok: true, duplicate: false, profile_name: 'Ana', amount_ml: 200, realizado_ml: 700, meta_ml: 2000, remaining_ml: 1300 });
  expect(state.rpc).toHaveBeenCalledWith('saude_record_water_ml', { p_owner: owner, p_profile: 1, p_amount: 200, p_request: `wa-water:agua:${getBrazilTodayIso()}:07:30:1` });
});
it('demais resources continuam usando requireUser', async () => {
  const res = response(); await handler(request({ query: { resource: 'consumo-agua' } }), res);
  expect(state.auth).toHaveBeenCalledOnce(); expect(res.statusCode).toBe(401); expect(state.rpc).not.toHaveBeenCalled();
});
it('perfil terceiro usa proprietário real, sem aceitar owner do pedido', async () => {
  const other = '00000000-0000-4000-8000-000000000002'; state.rows.tb_saude_perfis[0].created_by = other;
  expect((await run()).statusCode).toBe(200); expect(state.rpc).toHaveBeenCalledWith('saude_record_water_ml', expect.objectContaining({ p_owner: other }));
});
it.each(['GET', 'PATCH', 'DELETE'])('recusa método %s antes de acesso a banco', async method => {
  expect((await run(request({ method }))).statusCode).toBe(405); expect(state.rpc).not.toHaveBeenCalled();
});
it.each([undefined, '', 'Bearer wrong'])('recusa autorização inválida %s', async authorization => {
  expect((await run(request({ headers: { authorization } }))).statusCode).toBe(401); expect(state.rpc).not.toHaveBeenCalled();
});
it('sem chave forte desativa callback e emissão do seletor', async () => {
  vi.stubEnv('WHATSAPP_WATER_CALLBACK_TOKEN', 'short'); expect(prompt()).toBeNull();
  expect((await run()).statusCode).toBe(503); expect(state.rpc).not.toHaveBeenCalled();
});
it.each([100, 200, 300, 400, 500, 1000, 2000])('aceita volume %d e calcula restante', async amount_ml => {
  expect((await run(request({ body: { water_prompt: prompt(), amount_ml } }))).statusCode).toBe(200);
});
it.each(['200', 250, 0, -100, 200.5, null])('recusa volume fora do contrato %s', async amount_ml => {
  expect((await run(request({ body: { water_prompt: prompt(), amount_ml } }))).statusCode).toBe(400); expect(state.rpc).not.toHaveBeenCalled();
});
it('recusa assinatura adulterada e perfil/data/chave incoerentes', async () => {
  const original = prompt();
  for (const changed of [{ ...original, signature: '0'.repeat(64) }, { ...original, profile_id: '2' }, { ...original, dedupe_key: `agua:${original.date}:25:30:1` }]) {
    expect((await run(request({ body: { water_prompt: changed, amount_ml: 200 } }))).statusCode).toBe(400);
  }
  expect(state.rpc).not.toHaveBeenCalled();
});
it('recusa lembrete antigo mesmo com assinatura válida', async () => {
  expect((await run(request({ body: { water_prompt: prompt('2000-01-01'), amount_ml: 200 } }))).statusCode).toBe(410); expect(state.rpc).not.toHaveBeenCalled();
});
it('perfil inexistente e proprietário sem papel admin não gravam', async () => {
  state.rows.tb_saude_perfis = [];
  expect((await run()).statusCode).toBe(403);
  state.rows.app_user_roles[0].role = 'user';
  expect((await run()).statusCode).toBe(403); expect(state.rpc).not.toHaveBeenCalled();
});
it('retry retorna duplicate e meta excedida retorna zero restante', async () => {
  state.rpc.mockResolvedValue({ data: { realizado_ml: 2200, meta_ml: 2000, duplicate: true }, error: null });
  expect((await run()).data).toMatchObject({ duplicate: true, remaining_ml: 0 });
});
it.each([['water_request_conflict', 409], ['water_goal_required', 409], ['database_secret_failure', 503]])('traduz falha RPC %s sem expor detalhes', async (message, status) => {
  state.rpc.mockResolvedValue({ data: null, error: { message } });
  const res = await run(); expect(res.statusCode).toBe(status); expect(res.data.ok).toBe(false);
  expect(JSON.stringify(res.data)).not.toContain('database_secret');
});
it('JSON inválido não toca banco', async () => {
  expect((await run(request({ body: '{invalid' }))).statusCode).toBe(400); expect(state.rpc).not.toHaveBeenCalled();
});
