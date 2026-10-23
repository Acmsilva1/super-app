import { beforeEach, afterEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({limit:vi.fn(),enqueue:vi.fn(),enabled:vi.fn(),getClient:vi.fn(),profile:{id:3,created_by:'00000000-0000-4000-8000-000000000002'}}));
vi.mock('../../lib/actionRateLimit.js',()=>({consumeActionLimit:mocks.limit}));
vi.mock('../../lib/alertServiceClient.js',()=>({getAlertServiceClient:mocks.getClient}));
vi.mock('../../lib/whatsappAlertDelivery.js',()=>({enqueueWhatsAppAlert:mocks.enqueue,whatsappAlertsEnabled:mocks.enabled}));
import {runWhatsAppManualTest} from '../../lib/whatsappManualTest.js';
const input={type:'water',profileId:'3',requestId:'00000000-0000-4000-8000-000000000003'};
const user={id:'00000000-0000-4000-8000-000000000001'};
beforeEach(()=>{
  vi.stubEnv('NODE_ENV','development');vi.stubEnv('OFFLINE_DEV','false');
  vi.stubEnv('SAUDE_ALERTS_OWNER_USER_ID',user.id);
  mocks.limit.mockReset().mockResolvedValue(true);mocks.enqueue.mockReset().mockResolvedValue(true);mocks.enabled.mockReset().mockReturnValue(true);
  mocks.profile={id:3,created_by:'00000000-0000-4000-8000-000000000002'};
  mocks.getClient.mockReset().mockImplementation(()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:mocks.profile,error:null})})})})}));
});
afterEach(()=>vi.unstubAllEnvs());
it('exige identidade e entrada validas antes de consultar ou enviar',async()=>{
  expect((await runWhatsAppManualTest(input,null)).status).toBe(401);
  expect((await runWhatsAppManualTest({...input,type:'outro'},user)).status).toBe(400);
  expect((await runWhatsAppManualTest({...input,profileId:''},user)).status).toBe(400);
  expect(mocks.enqueue).not.toHaveBeenCalled();
});
it.each(['water','diet'])('teste %s usa perfil real e proprietario do banco',async type=>{
  const result=await runWhatsAppManualTest({...input,type,ownerId:'nao-confiavel'},user);
  expect(result.body).toMatchObject({ok:true,queued:1,audience:'3',simulated:false});
  expect(mocks.enqueue.mock.calls[0][0].ownerId).toBe(mocks.profile.created_by);
  expect(mocks.enqueue.mock.calls[0][1]).toMatchObject({audience:'3',eventType:type==='water'?'health.water_progress':'health.diet_menu'});
  expect(mocks.enqueue.mock.calls[0][1].message).toContain('não representa dados reais');
});
it('Financeiro usa proprietario configurado e nao o perfil escolhido',async()=>{
  expect((await runWhatsAppManualTest({...input,type:'finance',profileId:'999'},user)).body.audience).toBe(user.id);
  expect(mocks.enqueue.mock.calls[0][1].eventType).toBe('financeiro.daily_summary');
});
it('perfil inexistente e limite de testes impedem envio',async()=>{
  mocks.profile=null;expect((await runWhatsAppManualTest(input,user)).status).toBe(404);
  mocks.limit.mockResolvedValue(false);expect((await runWhatsAppManualTest(input,user)).status).toBe(429);
  expect(mocks.enqueue).not.toHaveBeenCalled();
});
it('informa ausencia de destinatario sem afirmar entrega',async()=>{
  mocks.enqueue.mockResolvedValue(false);
  const result=await runWhatsAppManualTest(input,user);expect(result.status).toBe(422);expect(result.body.queued).toBe(0);expect(result.body.sent).toBeUndefined();
});
it('erro externo nao expoe segredos',async()=>{
  mocks.enqueue.mockRejectedValue(new Error('URL-com-TOKEN-PRIVADO'));
  const result=await runWhatsAppManualTest(input,user);expect(result.status).toBe(503);expect(JSON.stringify(result)).not.toContain('TOKEN-PRIVADO');
});
it('offline apenas simula sem limite, consultas ou mensagens reais',async()=>{
  vi.stubEnv('OFFLINE_DEV','true');
  expect((await runWhatsAppManualTest(input,user)).body).toMatchObject({ok:true,simulated:true,queued:0});
  expect(mocks.getClient).not.toHaveBeenCalled();expect(mocks.enqueue).not.toHaveBeenCalled();
});
