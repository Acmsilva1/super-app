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

it('alterar água não cancela a recuperação de uma dieta anterior', async () => {
  state.rows.tb_saude_dietas = [{id:1,perfil_id:1,titulo:'Almoço',alerta_ativo:true}];
  state.rows.tb_saude_alertas_agenda = [{perfil_id:1,agua_ativo:false,dieta_ativa:true,
    dieta_horarios:[{tipo:'almoco',horario:'12:00'}],
    updated_at:'2026-10-10T15:05:00Z', agua_updated_at:'2026-10-10T15:05:00Z', dieta_updated_at:'2026-10-10T10:00:00Z'}];
  const fetchMock = vi.fn().mockResolvedValue({ok:true,json:async()=>({ok:true,telegram_message_id:7})});
  vi.stubGlobal('fetch',fetchMock);
  await runSaudeAlertSlot(new Date('2026-10-10T15:15:00Z'));
  expect(fetchMock).toHaveBeenCalledOnce();
});

it('alterar dieta não cancela a recuperação de água anterior', async () => {
  state.rows.tb_saude_alertas_agenda = [{perfil_id:1,agua_ativo:true,agua_inicio:'12:00',agua_fim:'18:00',agua_intervalo_horas:3,dieta_ativa:false,
    updated_at:'2026-10-10T15:05:00Z', dieta_updated_at:'2026-10-10T15:05:00Z', agua_updated_at:'2026-10-10T10:00:00Z'}];
  const fetchMock = vi.fn().mockResolvedValue({ok:true,json:async()=>({ok:true,telegram_message_id:7})});
  vi.stubGlobal('fetch',fetchMock);
  await runSaudeAlertSlot(new Date('2026-10-10T15:15:00Z'));
  expect(fetchMock).toHaveBeenCalledOnce();
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs(); vi.unstubAllGlobals();
  state.inserts=[]; state.updates=[]; state.duplicate=false;
  state.rows={
    app_user_roles:[{role:'owner'}], tb_saude_perfis:[{id:1,nome:'Perfil'}],
    tb_saude_agua_metas:[{perfil_id:1,meta_ml:2000}],
    tb_saude_alertas_agenda:[{perfil_id:1,agua_ativo:true,agua_intervalo_horas:3,dieta_ativa:false}],
  };
  vi.stubEnv('SAUDE_ALERTS_ENABLED','true');
  vi.stubEnv('SAUDE_ALERTS_OWNER_USER_ID','00000000-0000-4000-8000-000000000001');
  vi.stubEnv('ALERTS_API_URL','https://example.invalid/api/telegram-alert');
  vi.stubEnv('ALERTS_API_TOKEN','x'.repeat(32));
  vi.stubEnv('WHATSAPP_API_ORIGIN','');
  vi.stubEnv('WHATSAPP_INTEGRATION_TOKEN','');
  vi.stubEnv('WHATSAPP_FINANCE_PROFILE_ID','');
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

it('enfileira água e cada dieta no WhatsApp sem a chave agregada', async () => {
  vi.stubEnv('WHATSAPP_API_ORIGIN', 'https://mensageria.example');
  vi.stubEnv('WHATSAPP_INTEGRATION_TOKEN', 'token-de-teste');
  const fetchMock = vi.fn(async (url) => String(url).includes('/api/control')
    ? { status: 202, ok: true, json: async () => ({ ok: true }) }
    : { ok: true, json: async () => ({ ok: true, telegram_message_id: 7 }) });
  vi.stubGlobal('fetch', fetchMock);
  await runSaudeAlertSlot(new Date('2026-10-05T10:37:00Z'));
  const telegram = fetchMock.mock.calls.find(([url]) => String(url).includes('telegram-alert'));
  const whatsapp = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/control'));
  const telegramBody = JSON.parse(telegram[1].body);
  const body = JSON.parse(whatsapp[1].body);
  expect(whatsapp[0]).toBe('https://mensageria.example/api/control?action=event');
  expect(whatsapp[1].headers.Authorization).toBe('Bearer token-de-teste');
  expect(body).toMatchObject({
    source: 'superapp', event_type: 'health.water_progress', audience: '1',
    idempotency_key: 'agua:2026-10-05:07:30:1', title: telegramBody.title, message: telegramBody.message,
  });
  expect(Object.values(body).every((value) => typeof value === 'string')).toBe(true);

  state.rows.tb_saude_perfis = [{ id: 1, nome: 'André' }, { id: 99, nome: 'Juliana' }];
  state.rows.tb_saude_alertas_agenda = [{ perfil_id: 1, agua_ativo: false, dieta_ativa: true, dieta_id: 2 }];
  state.rows.tb_saude_dietas = [
    { id: 2, perfil_id: 99, titulo: 'Emagrecimento' },
    { id: 3, perfil_id: 99, titulo: 'Manutenção' },
    { id: 4, perfil_id: 1, titulo: 'Plano André' },
  ];
  fetchMock.mockClear();
  await runSaudeAlertSlot(new Date('2026-10-05T22:05:00Z'));
  const dietTelegram = fetchMock.mock.calls.filter(([url]) => String(url).includes('telegram-alert'));
  const dietWhatsapp = fetchMock.mock.calls.filter(([url]) => String(url).includes('/api/control'));
  expect(dietTelegram).toHaveLength(1);
  expect(JSON.parse(dietTelegram[0][1].body).dedupe_key).toBe('dietas:2026-10-05:19:00:todas:1');
  expect(dietWhatsapp).toHaveLength(3);
  const menus = dietWhatsapp.map(([, options]) => JSON.parse(options.body));
  expect(menus.map((item) => item.idempotency_key)).toEqual([
    'dietas:2026-10-05:19:00:99:jantar',
    'dietas:2026-10-05:19:00:99:jantar',
    'dietas:2026-10-05:19:00:1:jantar',
  ]);
  expect(menus.every((item) => item.source === 'superapp' && item.event_type === 'health.diet_menu' && item.title === 'Dietas · Jantar')).toBe(true);
  expect(menus.every((item) => !item.idempotency_key.includes(':todas'))).toBe(true);
  expect(menus[0].message).toContain('Emagrecimento');
  expect(menus[0].message).not.toContain('Plano André');
  expect(menus[2].message).toContain('Plano André');
  expect(menus[2].message).not.toContain('Emagrecimento');
  expect(menus[0].audience).toBe('99');
  expect(menus[2].audience).toBe('1');
});

it('falha de rede do WhatsApp não impede o Telegram', async () => {
  vi.stubEnv('WHATSAPP_API_ORIGIN', 'https://mensageria.example');
  vi.stubEnv('WHATSAPP_INTEGRATION_TOKEN', 'token-de-teste');
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const fetchMock = vi.fn(async (url) => {
    if (String(url).includes('/api/control')) throw new Error('network');
    return { ok: true, json: async () => ({ ok: true, telegram_message_id: 7 }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  await expect(runSaudeAlertSlot(new Date('2026-10-05T10:37:00Z'))).resolves.toMatchObject({ alerts_sent: 1 });
  expect(fetchMock.mock.calls.some(([url]) => String(url).includes('telegram-alert'))).toBe(true);
});

it('água começa no minuto configurado, repete pelo intervalo e termina na janela',async()=>{
 vi.stubEnv('SAUDE_ALERTS_ENABLED','true');vi.stubEnv('SAUDE_ALERTS_OWNER_USER_ID','f88a6351-317d-425b-afcd-9430c8a34f53');vi.stubEnv('ALERTS_API_URL','https://example.invalid/api/telegram-alert');vi.stubEnv('ALERTS_API_TOKEN','x'.repeat(32));
 state.rows.tb_saude_alertas_agenda=[{perfil_id:1,agua_ativo:true,agua_inicio:'08:17',agua_fim:'14:17',agua_intervalo_horas:3,dieta_ativa:false}];
 const transport=vi.fn().mockResolvedValue({ok:true,json:async()=>({ok:true,telegram_message_id:1})});vi.stubGlobal('fetch',transport);
 for(const time of ['11:22','14:22','17:22']){transport.mockClear();await runSaudeAlertSlot(new Date(`2026-10-05T${time}:00Z`));expect(transport).toHaveBeenCalledOnce();}
 for(const time of ['10:37','18:22']){transport.mockClear();await runSaudeAlertSlot(new Date(`2026-10-05T${time}:00Z`));expect(transport).not.toHaveBeenCalled();}
});

function callsTo(fetchMock, fragment) {
  return fetchMock.mock.calls.filter(([url]) => String(url).includes(fragment));
}

it.each([
  ['os dois', true, true, true, true],
  ['só Telegram', true, false, true, false],
  ['só WhatsApp', false, true, false, true],
  ['nenhum', false, false, false, false],
])('respeita os canais na água: %s', async (_label, telegram, whatsapp, expectTelegram, expectWhatsapp) => {
  state.rows.tb_admin_alert_channels = [{ telegram_enabled: telegram, whatsapp_enabled: whatsapp }];
  vi.stubEnv('WHATSAPP_API_ORIGIN', 'https://mensageria.example');
  vi.stubEnv('WHATSAPP_INTEGRATION_TOKEN', 'token-de-teste');
  const fetchMock = vi.fn(async (url) => String(url).includes('/api/control')
    ? { status: 202, ok: true, json: async () => ({ ok: true }) }
    : { ok: true, json: async () => ({ ok: true, telegram_message_id: 7 }) });
  vi.stubGlobal('fetch', fetchMock);
  const result = await runSaudeAlertSlot(new Date('2026-10-05T10:37:00Z'));
  expect(callsTo(fetchMock, 'telegram-alert').length > 0).toBe(expectTelegram);
  expect(callsTo(fetchMock, '/api/control').length > 0).toBe(expectWhatsapp);
  if (!expectTelegram) expect(state.inserts).toHaveLength(0);
  if (expectWhatsapp) {
    expect(JSON.parse(callsTo(fetchMock, '/api/control')[0][1].body)).toMatchObject({
      source: 'superapp', event_type: 'health.water_progress', audience: '1',
      idempotency_key: 'agua:2026-10-05:07:30:1',
    });
  }
  if (!telegram && !whatsapp) expect(result).toMatchObject({ skipped: true, reason: 'channels_disabled' });
});

it.each([
  ['os dois', true, true, 1, 3],
  ['só Telegram', true, false, 1, 0],
  ['só WhatsApp', false, true, 0, 3],
  ['nenhum', false, false, 0, 0],
])('respeita os canais na dieta: %s', async (_label, telegram, whatsapp, telegramCount, whatsappCount) => {
  state.rows.tb_admin_alert_channels = [{ telegram_enabled: telegram, whatsapp_enabled: whatsapp }];
  state.rows.tb_saude_perfis = [{ id: 1, nome: 'André' }, { id: 99, nome: 'Juliana' }];
  state.rows.tb_saude_alertas_agenda = [{ perfil_id: 1, agua_ativo: false, dieta_ativa: true, dieta_id: 2 }];
  state.rows.tb_saude_dietas = [
    { id: 2, perfil_id: 99, titulo: 'Emagrecimento' },
    { id: 3, perfil_id: 99, titulo: 'Manutenção' },
    { id: 4, perfil_id: 1, titulo: 'Plano André' },
  ];
  vi.stubEnv('WHATSAPP_API_ORIGIN', 'https://mensageria.example');
  vi.stubEnv('WHATSAPP_INTEGRATION_TOKEN', 'token-de-teste');
  const fetchMock = vi.fn(async (url) => String(url).includes('/api/control')
    ? { status: 202, ok: true, json: async () => ({ ok: true }) }
    : { ok: true, json: async () => ({ ok: true, telegram_message_id: 7 }) });
  vi.stubGlobal('fetch', fetchMock);
  await runSaudeAlertSlot(new Date('2026-10-05T22:05:00Z'));
  expect(callsTo(fetchMock, 'telegram-alert')).toHaveLength(telegramCount);
  const menus = callsTo(fetchMock, '/api/control').map(([, options]) => JSON.parse(options.body));
  expect(menus).toHaveLength(whatsappCount);
  if (whatsappCount) {
    expect(menus.map((item) => item.audience)).toEqual(['99', '99', '1']);
    expect(menus.every((item) => item.event_type === 'health.diet_menu' && !item.idempotency_key.includes(':todas'))).toBe(true);
  }
  if (!telegram) expect(state.inserts).toHaveLength(0);
});

it('o teste de saúde do WhatsApp usa o perfil de cada alerta', async () => {
  state.rows.tb_saude_perfis = [{ id: 9, nome: 'Ana' }];
  state.rows.tb_saude_dietas = [{ id: 1, perfil_id: 9, titulo: 'Plano', alerta_ativo: true }];
  const { previewWhatsAppHealthTests } = await import('../../features/saude/service/alertasSaudeScheduler.js');
  const alerts = await previewWhatsAppHealthTests(new Date('2026-10-05T15:00:00Z'));
  expect(alerts.find((item) => item.eventType === 'health.water_progress')).toMatchObject({ audience: '9' });
  expect(alerts.find((item) => item.eventType === 'health.diet_menu')).toMatchObject({ audience: '9' });
  expect(alerts.every((item) => item.message.startsWith('Teste do SuperApp:'))).toBe(true);
});

it('lembrete produzido pelo scheduler transporta assinatura válida até o registro de água', async () => {
  const { whatsappWaterHandler } = await import('../../lib/whatsappWater.js');
  const callbackToken = 'callback-test-'.padEnd(48, 'x');
  vi.stubEnv('WHATSAPP_WATER_CALLBACK_TOKEN', callbackToken);
  vi.stubEnv('WHATSAPP_API_ORIGIN', 'https://mensageria.example');
  vi.stubEnv('WHATSAPP_INTEGRATION_TOKEN', 'integration-test');
  const fetchMock = vi.fn(async url => String(url).includes('/api/control')
    ? { status: 202, ok: true, json: async () => ({ ok: true }) }
    : { ok: true, json: async () => ({ ok: true, telegram_message_id: 7 }) });
  vi.stubGlobal('fetch', fetchMock);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  await runSaudeAlertSlot(new Date(`${date}T10:37:00Z`));
  const body = JSON.parse(callsTo(fetchMock, '/api/control')[0][1].body);
  expect(body.water_prompt).toMatchObject({ profile_id: '1', date, dedupe_key: `agua:${date}:07:30:1`, signature: expect.stringMatching(/^[a-f0-9]{64}$/) });
  const rpc = vi.fn(async () => ({ data: { realizado_ml: 300, meta_ml: 2000, duplicate: false }, error: null }));
  const db = { rpc, from(table) { const q = { select() { return q; }, eq() { return q; }, maybeSingle() { return q; }, then(resolve) { return Promise.resolve({ data: table === 'app_user_roles' ? [{ role: 'admin' }] : { id: 1, nome: 'Perfil', created_by: process.env.SAUDE_ALERTS_OWNER_USER_ID }, error: null }).then(resolve); } }; return q; } };
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.value = value; return this; } };
  await whatsappWaterHandler({ method: 'POST', headers: { authorization: `Bearer ${callbackToken}` }, body: { water_prompt: body.water_prompt, amount_ml: 300 } }, res, { getClient: () => db });
  expect(res.code).toBe(200); expect(res.value).toMatchObject({ amount_ml: 300, remaining_ml: 1700 });
  expect(rpc).toHaveBeenCalledWith('saude_record_water_ml', expect.objectContaining({ p_request: `wa-water:${body.idempotency_key}` }));
});
