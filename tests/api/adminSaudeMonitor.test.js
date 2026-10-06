import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ requireUser: vi.fn(), queries: [], rows: {} }));
vi.mock('../../lib/auth.js', () => ({ requireUser: mock.requireUser }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  from(table) {
    const query = { table, columns: '', filters: [],
      select(columns) { this.columns = columns; return this; },
      eq(field, value) { this.filters.push([field, [value]]); return this; },
      in(field, values) { this.filters.push([field, values]); return this; },
      order() { return this; }, limit() { return this; }, or() { return this; },
      then(resolve, reject) {
        mock.queries.push(this);
        // Reproduce the columns removed by the unified September schema.
        const obsolete = /(?:cintura_cm|quadril_cm|peito_cm|braco_cm|coxa_cm)/.test(this.columns)
          || (table === 'tb_saude_agua_logs' && this.columns.split(',').includes('created_at'));
        const result = obsolete ? { data: null, error: { code: '42703' } }
          : table === 'tb_saude_agua_perfis' ? { data: null, error: { code: '42P01' } }
          : { data: (mock.rows[table] || []).filter((row) => this.filters.every(([field, values]) => values.includes(row[field]))), error: null };
        return Promise.resolve(result).then(resolve, reject);
      },
    };
    return query;
  },
}) }));
import handler from '../../lib/adminUsuariosHandler.js';

const owner = '00000000-0000-4000-8000-000000000001';
const relative = '00000000-0000-4000-8000-000000000002';
function response() {
  return { statusCode: null, body: null, setHeader() {},
    status(code) { this.statusCode = code; return this; },
    end(value) { this.body = JSON.parse(value); },
  };
}
beforeEach(() => {
  mock.queries.length = 0;
  mock.rows = {
    tb_saude_perfis: [{ id: 1, nome: 'Perfil A', created_by: owner }, { id: 2, nome: 'Perfil B', created_by: relative }],
    tb_saude_perfil_medidas: [{ id: 3, perfil_id: 2, created_by: relative, peso_kg: 70 }],
    tb_saude_agua_metas: [{ perfil_id: 2, created_by: relative, meta_doses: 8 }],
    tb_saude_agua_logs: [{ perfil_id: 2, created_by: relative, realizado_doses: 4 }],
    app_user_permissions: [{ user_id: relative, app_id: 'saude', can_access: true }],
  };
  vi.stubEnv('AUTH_MODE', 'supabase');
  vi.stubEnv('SUPABASE_URL', 'https://example.invalid');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'mock-key');
  mock.requireUser.mockResolvedValue({ ok: true, user: { id: owner }, isAdmin: true });
});
describe('Admin Saúde with the unified schema', () => {
  it('loads the selected account with water attached to the main health profile', async () => {
    const res = response();
    await handler({ method: 'GET', query: { resource: 'saude_monitor', user_id: relative } }, res, []);
    expect(res.statusCode).toBe(200);
    expect(res.body.profiles.map((row) => row.id)).toEqual([2]);
    expect(res.body.water_profiles.map((row) => row.id)).toEqual([2]);
    expect(res.body.measurements).toHaveLength(1);
    expect(res.body.water_logs[0].realizado_doses).toBe(4);
    expect(mock.queries.some((query) => query.table === 'tb_saude_agua_perfis')).toBe(false);
  });
  it('loads all accounts without mixing profile IDs with the retired water table', async () => {
    const res = response();
    await handler({ method: 'GET', query: { resource: 'saude_monitor', user_id: 'all' } }, res, []);
    expect(res.statusCode).toBe(200);
    expect(res.body.profiles).toHaveLength(2);
    expect(res.body.water_profiles).toHaveLength(2);
    expect(res.body.monitored_user_ids).toEqual([owner, relative]);
  });
  it('denies a non-admin before reading health data', async () => {
    mock.requireUser.mockResolvedValue({ ok: false, status: 403, data: { error: 'Restrito' } });
    const res = response();
    await handler({ method: 'GET', query: { resource: 'saude_monitor', user_id: relative } }, res, []);
    expect(res.statusCode).toBe(403);
    expect(mock.queries).toHaveLength(0);
  });
});
