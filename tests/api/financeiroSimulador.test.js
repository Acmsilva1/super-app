import { beforeEach, describe, expect, it, vi } from 'vitest';
const { requireUser, from } = vi.hoisted(() => ({ requireUser: vi.fn(), from: vi.fn() }));
vi.mock('../../lib/auth.js', () => ({ requireUser }));
vi.mock('../../lib/supabase.js', () => ({ supabase: { from } }));
import handler from '../../api/financeiro.js';
const parametros = { nome: 'Carro', preco: 20000, entrada: 0, parcelas: 60, parcela: 1000, historico: '6', horizonte: 6 };
async function call(method, body = {}) {
  const res = { code: 0, body: null, setHeader: vi.fn(), status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await handler({ method, body, query: { recurso: 'simulador' } }, res); return res;
}
beforeEach(() => { vi.clearAllMocks(); process.env.OFFLINE_DEV = 'true'; requireUser.mockResolvedValue({ ok: true, user: { id: crypto.randomUUID() } }); });
describe('API do simulador', () => {
  it('exige autenticação e permissão do Financeiro', async () => {
    requireUser.mockResolvedValue({ ok: false, status: 403, data: { error: 'Sem permissão' } });
    expect((await call('GET')).code).toBe(403);
    expect(requireUser).toHaveBeenCalledWith(expect.anything(), { appId: 'financeiro' });
    expect(from).not.toHaveBeenCalled();
  });
  it('salva e repete como nova execução da mesma meta', async () => {
    requireUser.mockResolvedValue({ ok: true, user: { id: 'demo-user' } });
    const saved = await call('POST', { acao: 'salvar', parametros });
    const repeated = await call('POST', { acao: 'repetir', id: saved.body.registro.id, parametros: { ...parametros, parcela: 99999 } });
    expect(saved.code).toBe(201); expect(repeated.code).toBe(201);
    expect(repeated.body.registro.meta_id).toBe(saved.body.registro.meta_id);
    expect(repeated.body.registro.id).not.toBe(saved.body.registro.id);
    expect(repeated.body.resultado.proposal.parcela).toBe(1000);
    const listed = await call('GET'); expect(listed.body.registros.length).toBeGreaterThanOrEqual(2);
    expect(from).not.toHaveBeenCalled();
  });
  it('não permite repetir a simulação de outro usuário', async () => {
    const saved = await call('POST', { acao: 'salvar', parametros });
    requireUser.mockResolvedValue({ ok: true, user: { id: 'another-user' } });
    expect((await call('POST', { acao: 'repetir', id: saved.body.registro.id })).code).toBe(404);
  });
  it('não salva ao apenas analisar e rejeita corpo inválido', async () => {
    requireUser.mockResolvedValue({ ok: true, user: { id: 'analysis-user' } });
    expect((await call('POST', { acao: 'simular', parametros })).code).toBe(200);
    expect((await call('GET')).body.registros).toEqual([]);
    expect((await call('POST', '{')).code).toBe(400);
    expect((await call('POST', { acao: 'repetir', id: 'invalid' })).code).toBe(400);
  });
  it('aplica isolamento por usuário mesmo com cliente privilegiado', async () => {
    process.env.OFFLINE_DEV = 'false';
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: [], error: null }) };
    from.mockReturnValue(query);
    await call('GET');
    expect(query.eq).toHaveBeenCalledWith('user_id', expect.any(String));
  });
  it('informa que persistência depende da migration', async () => {
    process.env.OFFLINE_DEV = 'false';
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST205' } }) };
    from.mockReturnValue(query);
    const response = await call('GET'); expect(response.code).toBe(200); expect(response.body.persistencia).toBe(false);
  });
});
