import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ rows: {}, writes: [] }));
vi.mock('../../lib/auth.js', () => ({ requireUser: async () => ({ ok: true, user: { id: 'admin' }, isAdmin: true }) }));
vi.mock('../../lib/supabase.js', () => ({ supabase: {
  from(table) {
    const filters = [];
    let operation = null;
    let payload;
    let single = false;
    let descending = false;
    let maxRows;
    const query = {
      select(columns) {
        if (/cintura_cm|quadril_cm|peito_cm|braco_cm|coxa_cm/.test(columns)) throw new Error('Coluna ausente no schema atual');
        if (/agua_updated_at|dieta_updated_at/.test(columns)) throw new Error('Timestamps por seção ausentes no schema anterior');
        return query;
      },
      eq(field, value) { filters.push((row) => row[field] === value); return query; },
      in(field, values) { filters.push((row) => values.includes(row[field])); return query; },
      lt(field, value) { filters.push((row) => row[field] < value); return query; },
      order(field, options) { descending = field === 'id' && options?.ascending === false; return query; },
      limit(value) { maxRows = value; return query; },
      maybeSingle() { single = true; return query; },
      single() { single = true; return query; },
      insert(value) { operation = 'insert'; payload = value; return query; },
      upsert(value) { operation = 'upsert'; payload = value; return query; },
      update(value) { operation = 'update'; payload = value; return query; },
      delete() { operation = 'delete'; return query; },
      then(resolve, reject) {
        const rows = state.rows[table] ||= [];
        let matches = rows.filter((row) => filters.every((filter) => filter(row)));
        if (operation) {
          state.writes.push({ table, operation, payload });
          if (operation === 'insert' || operation === 'upsert') {
            const existing = operation === 'upsert' && table === 'tb_saude_alertas_agenda'
              ? rows.find(row => row.perfil_id === payload.perfil_id) : null;
            const row = existing ? Object.assign(existing,payload) : { id: rows.length + 20, ...payload };
            if (!existing) rows.push(row);
            matches = [row];
          } else if (operation === 'update') matches.forEach((row) => Object.assign(row, payload));
          else state.rows[table] = rows.filter((row) => !matches.includes(row));
        }
        if (descending) matches.sort((a, b) => b.id - a.id);
        if (maxRows) matches = matches.slice(0, maxRows);
        return Promise.resolve({ data: single ? matches[0] || null : matches, error: null }).then(resolve, reject);
      },
    };
    return query;
  },
} }));
import handler from '../../api/saude.js';

async function call(method, resource, body, query = {}) {
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, end(value) { this.body = JSON.parse(value); } };
  await handler({ method, query: { resource, ...query }, body }, res);
  return res;
}

describe('Persistência administrativa no contrato Supabase atual', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('OFFLINE_DEV', 'false');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'mock-only');
    state.writes = [];
    state.rows = { tb_saude_perfis: [{ id: 3, nome: 'Teste', created_by: 'owner', peso_kg: 70, altura_cm: 170 }] };
  });
  afterEach(() => vi.unstubAllEnvs());

  it('carrega e salva agenda sem exigir timestamps internos do scheduler', async () => {
    state.rows.tb_saude_alertas_agenda = [{ perfil_id: 3, created_by:'owner', agua_ativo:true,
      agua_intervalo_horas:3, agua_inicio:'08:00', agua_fim:'20:00', dieta_ativa:true,
      dieta_id:null, dieta_horarios:[{tipo:'almoco',horario:'12:15'}], updated_at:'2026-10-10T10:00:00Z' }];
    const loaded = await call('GET','alertas-agenda',undefined,{profile_id:3});
    expect(loaded.code).toBe(200);
    expect(loaded.body.row).toMatchObject({agua_inicio:'08:00',dieta_horarios:[{tipo:'almoco',horario:'12:15',titulo:'Almoço'}]});
    const saved = await call('POST','alertas-agenda',{profile_id:3,section:'agua',
      agua_ativo:false,agua_intervalo_horas:2,agua_inicio:'09:00',agua_fim:'21:00'});
    expect(saved.code).toBe(200);
    expect(saved.body.row).toMatchObject({agua_ativo:false,agua_inicio:'09:00',dieta_horarios:loaded.body.row.dieta_horarios});
    expect(state.writes.at(-1).payload.created_by).toBe('owner');
  });

  it('grava meta e consumo para o dono e permite remover o perfil', async () => {
    const goal = await call('POST', 'consumo-agua', { profile_id: 3, nome: 'Água', meta_doses: 6 });
    expect(goal.code).toBe(200);
    expect(state.rows.tb_saude_agua_metas[0].created_by).toBe('owner');
    expect(state.rows.tb_saude_agua_logs[0]).toMatchObject({ created_by: 'owner', meta_doses: 6 });
    const progress = await call('PATCH', 'consumo-agua', { profile_id: 3, realizado_doses: 2 });
    expect(progress.code).toBe(200);
    expect(state.rows.tb_saude_agua_logs[0].realizado_doses).toBe(2);
    expect((await call('DELETE', 'perfis', { id: 3 })).code).toBe(200);
    expect(state.rows.tb_saude_perfis).toEqual([]);
  });

  it('exclui a última medição e restaura peso usando somente colunas existentes', async () => {
    state.rows.tb_saude_perfil_medidas = [
      { id: 6, perfil_id: 3, created_by: 'owner', peso_kg: 70, altura_cm: 170, registrado_em: '2026-01-01T12:00:00Z' },
      { id: 7, perfil_id: 3, created_by: 'owner', peso_kg: 68, altura_cm: 170, registrado_em: '2026-01-02T12:00:00Z' },
    ];
    expect((await call('DELETE', 'perfil-medidas', { id: 7 })).code).toBe(200);
    expect(state.rows.tb_saude_perfil_medidas).toHaveLength(1);
    expect(state.rows.tb_saude_perfis[0]).toMatchObject({ peso_kg: 70, created_by: 'owner' });
  });

  it('inicializa o consumo do novo dia ao admin marcar água de outro usuário', async () => {
    state.rows.tb_saude_agua_metas = [{ perfil_id: 3, created_by: 'owner', nome: 'Água', meta_doses: 8 }];
    const progress = await call('PATCH', 'consumo-agua', { profile_id: 3, realizado_doses: 1 });
    expect(progress.code).toBe(200);
    expect(state.rows.tb_saude_agua_logs[0]).toMatchObject({ created_by: 'owner', perfil_id: 3, realizado_doses: 1 });
  });
});
