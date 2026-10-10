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
import { buildDietAlertMessages, runSaudeAlertSlot } from '../../features/saude/service/alertasSaudeScheduler.js';

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
  it('includes every diet with its real profile even when an old schedule selected only one', async () => {
    state.rows.tb_saude_perfis=[{id:1,nome:'André'},{id:99,nome:'Juliana'}];
    state.rows.tb_saude_alertas_agenda=[{perfil_id:1,agua_ativo:false,dieta_ativa:true,dieta_id:2}];
    state.rows.tb_saude_dietas=[{id:2,perfil_id:99,titulo:'Emagrecimento'},{id:3,perfil_id:99,titulo:'Manutenção'},{id:4,perfil_id:1,titulo:'Plano André'}];
    const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({ok:true,telegram_message_id:7})});
    vi.stubGlobal('fetch',fetchMock);
    await runSaudeAlertSlot(new Date('2026-10-05T22:05:00Z'));
    expect(fetchMock).toHaveBeenCalledOnce();
    const payload=JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.message).toContain('Emagrecimento');
    expect(payload.message).toContain('Manutenção');
    expect(payload.message).toContain('Plano André');
    expect(payload.message).toContain('Juliana');
    expect(payload.message).toContain('André');
    expect(payload.dedupe_key).toBe('dietas:2026-10-05:19:00:todas:1');
  });
  it('respects inactive profiles and keeps diets without a linked profile visible', () => {
    const messages=buildDietAlertMessages({profiles:[{id:1,nome:'André'}],foods:[],
      schedules:new Map([['1',{dieta_ativa:false}]]),
      diets:[{id:1,perfil_id:1,titulo:'Desativada'},{id:2,perfil_id:null,titulo:'Sem vínculo'}]},
      {tipo:'jantar',titulo:'Jantar'},'2026-10-05','19:00');
    expect(messages.join('')).not.toContain('Desativada');
    expect(messages.join('')).toContain('Sem vínculo');
    expect(messages.join('')).toContain('Perfil não vinculado');
  });
  it('splits long summaries without dropping diets or meal items', () => {
    const diets=Array.from({length:5},(_,i)=>({id:i+1,perfil_id:1,titulo:`Plano ${i+1}`,
      refeicoes:[{tipo:'jantar',itens:Array.from({length:20},(_,j)=>({nome:`Alimento ${i}-${j}`,quantidade:'100 g'}))}]}));
    const messages=buildDietAlertMessages({profiles:[{id:1,nome:'Juliana'}],foods:[],schedules:new Map(),diets},
      {tipo:'jantar',titulo:'Jantar'},'2026-10-05','19:00');
    expect(messages.length).toBeGreaterThan(1);
    expect(messages.every(message=>message.length<=2800)).toBe(true);
    for(let i=0;i<5;i++) {
      expect(messages.join('')).toContain(`Plano ${i+1}`);
      for(let j=0;j<20;j++) expect(messages.join('')).toContain(`Alimento ${i}-${j}`);
    }
  });
});

it('envia em minuto personalizado por perfil e ignora o antigo horário fixo',async()=>{
 vi.stubEnv('SAUDE_ALERTS_ENABLED','true');vi.stubEnv('SAUDE_ALERTS_OWNER_USER_ID','f88a6351-317d-425b-afcd-9430c8a34f53');vi.stubEnv('ALERTS_API_URL','https://example.invalid/api/telegram-alert');vi.stubEnv('ALERTS_API_TOKEN','x'.repeat(32));
 state.rows.tb_saude_dietas=[{id:1,perfil_id:1,titulo:'Meu horário',alerta_ativo:true,refeicoes:[{tipo:'almoco',itens:[{nome:'Frango',quantidade:'100 g'}]}]},{id:2,perfil_id:2,titulo:'Outro perfil',alerta_ativo:true,refeicoes:[]}];
 state.rows.tb_saude_alertas_agenda=[{perfil_id:1,agua_ativo:false,dieta_ativa:true,dieta_horarios:[{tipo:'almoco',horario:'12:17'}]},{perfil_id:2,agua_ativo:false,dieta_ativa:true,dieta_horarios:[{tipo:'almoco',horario:'13:00'}]}];
 const transport=vi.fn().mockResolvedValue({ok:true,json:async()=>({ok:true,telegram_message_id:1})});vi.stubGlobal('fetch',transport);
 await runSaudeAlertSlot(new Date('2026-10-05T15:22:00Z'));
 expect(transport).toHaveBeenCalledOnce();const message=JSON.parse(transport.mock.calls[0][1].body);expect(message.message).toContain('12:17');expect(message.message).toContain('Meu horário');expect(message.message).not.toContain('Outro perfil');
 transport.mockClear();await runSaudeAlertSlot(new Date('2026-10-05T14:05:00Z'));expect(transport).not.toHaveBeenCalled();
});

it('água começa no minuto configurado, repete pelo intervalo e termina na janela',async()=>{
 vi.stubEnv('SAUDE_ALERTS_ENABLED','true');vi.stubEnv('SAUDE_ALERTS_OWNER_USER_ID','f88a6351-317d-425b-afcd-9430c8a34f53');vi.stubEnv('ALERTS_API_URL','https://example.invalid/api/telegram-alert');vi.stubEnv('ALERTS_API_TOKEN','x'.repeat(32));
 state.rows.tb_saude_alertas_agenda=[{perfil_id:1,agua_ativo:true,agua_inicio:'08:17',agua_fim:'14:17',agua_intervalo_horas:3,dieta_ativa:false}];
 const transport=vi.fn().mockResolvedValue({ok:true,json:async()=>({ok:true,telegram_message_id:1})});vi.stubGlobal('fetch',transport);
 for(const time of ['11:22','14:22','17:22']){transport.mockClear();await runSaudeAlertSlot(new Date(`2026-10-05T${time}:00Z`));expect(transport).toHaveBeenCalledOnce();}
 for(const time of ['10:37','18:22']){transport.mockClear();await runSaudeAlertSlot(new Date(`2026-10-05T${time}:00Z`));expect(transport).not.toHaveBeenCalled();}
});
