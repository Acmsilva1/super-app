import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isCronAuthorized } from '../../lib/cronAuth.js';

const state = vi.hoisted(() => ({ rows: {}, inserts: [], updates: [], duplicate: false }));
vi.mock('../../lib/alertServiceClient.js', () => ({
  getAlertServiceClient: () => ({ from(table) {
    let operation = 'select';
    const query = {
      select() { return query; }, eq() { return query; }, order() { return query; },
      insert(row) { state.inserts.push(row); operation='insert'; return query; },
      update(row) { state.updates.push(row); operation='update'; return query; },
      then(resolve, reject) {
        return Promise.resolve(operation === 'insert' && state.duplicate
          ? { error: { code: '23505' } }
          : { data: state.rows[table] || [], error: null }).then(resolve,reject);
      },
    };
    return query;
  } }),
}));
import { runSaudeAlertSlot } from '../../features/saude/service/alertasSaudeScheduler.js';

beforeEach(() => {
  vi.unstubAllEnvs(); vi.unstubAllGlobals();
  state.inserts=[]; state.updates=[]; state.duplicate=false;
  state.rows={
    app_user_roles:[{role:'owner'}], tb_saude_perfis:[{id:1,nome:'Perfil'}],
    tb_saude_agua_metas:[{perfil_id:1,meta_doses:8}],
    tb_saude_alertas_agenda:[{perfil_id:1,agua_ativo:true,agua_intervalo_horas:3,dieta_ativa:false}],
  };
  vi.stubEnv('SAUDE_ALERTS_ENABLED','true');
  vi.stubEnv('SAUDE_ALERTS_OWNER_USER_ID','00000000-0000-4000-8000-000000000001');
  vi.stubEnv('ALERTS_API_URL','https://example.invalid/api/telegram-alert');
  vi.stubEnv('ALERTS_API_TOKEN','x'.repeat(32));
});

describe('Vercel alerts', () => {
  it('denies cron calls when missing, wrong or short secrets', () => {
    vi.stubEnv('CRON_SECRET',''); expect(isCronAuthorized({headers:{}})).toBe(false);
    vi.stubEnv('CRON_SECRET','short'); expect(isCronAuthorized({headers:{authorization:'Bearer short'}})).toBe(false);
    vi.stubEnv('CRON_SECRET','x'.repeat(32)); expect(isCronAuthorized({headers:{authorization:'Bearer wrong'}})).toBe(false);
    expect(isCronAuthorized({headers:{authorization:`Bearer ${'x'.repeat(32)}`}})).toBe(true);
  });
  it('does not send while disabled', async () => {
    vi.stubEnv('SAUDE_ALERTS_ENABLED','false');
    expect((await runSaudeAlertSlot()).skipped).toBe(true); expect(state.inserts).toHaveLength(0);
  });
  it('recovers a delayed slot and forwards the payload to Python', async () => {
    const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({ok:true,telegram_message_id:7})});
    vi.stubGlobal('fetch',fetchMock);
    await runSaudeAlertSlot(new Date('2026-10-05T10:37:00Z'));
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url,options]=fetchMock.mock.calls[0];
    expect(url).toBe('https://example.invalid/api/telegram-alert');
    expect(JSON.parse(options.body).dedupe_key).toBe('agua:2026-10-05:07:30:1');
    expect(state.updates[0].status).toBe('sent');
  });
  it('never sends a duplicate claimed key', async () => {
    state.duplicate=true; const fetchMock=vi.fn(); vi.stubGlobal('fetch',fetchMock);
    await runSaudeAlertSlot(new Date('2026-10-05T10:35:00Z'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('marks an ambiguous failure and reports failure to the caller', async () => {
    vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('timeout')));
    await expect(runSaudeAlertSlot(new Date('2026-10-05T10:35:00Z'))).rejects.toThrow('alerts_delivery_uncertain');
    expect(state.updates[0].status).toBe('uncertain');
  });
  it('does not send for a non administrative configured owner', async () => {
    state.rows.app_user_roles=[{role:'user'}];
    await expect(runSaudeAlertSlot()).rejects.toThrow('alerts_owner_invalid');
  });
  it('does not use a selected diet belonging to another profile', async () => {
    state.rows.tb_saude_alertas_agenda=[{perfil_id:1,agua_ativo:false,dieta_ativa:true,dieta_id:2}];
    state.rows.tb_saude_dietas=[{id:2,perfil_id:99,titulo:'Outra'}];
    const fetchMock=vi.fn(); vi.stubGlobal('fetch',fetchMock);
    await runSaudeAlertSlot(new Date('2026-10-05T22:05:00Z'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
