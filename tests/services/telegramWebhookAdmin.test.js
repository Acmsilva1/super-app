import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const {telegramCall}=vi.hoisted(()=>({telegramCall:vi.fn()}));
vi.mock('../../lib/telegramPurchase.js',()=>({telegramCall,getTelegramWebhookSecret:()=> 'a'.repeat(32)}));
import {configureTelegramWebhook,getTelegramWebhookStatus} from '../../lib/telegramWebhookAdmin.js';
const client={from:()=>({select:()=>({limit:async()=>({error:null})})})};
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('NODE_ENV','development');vi.stubEnv('OFFLINE_DEV','false');vi.stubEnv('SAUDE_ALERTS_OWNER_USER_ID','owner');vi.stubEnv('TELEGRAM_CHAT_ID','12345');vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL','app.example.com');});
afterEach(()=>vi.unstubAllEnvs());
it('consulta o estado real sem alterar o webhook',async()=>{
  telegramCall.mockResolvedValue({url:'https://app.example.com/api/telegram-webhook'});
  expect((await getTelegramWebhookStatus('owner')).body.enabled).toBe(true);
  expect(telegramCall).toHaveBeenCalledTimes(1);expect(telegramCall).toHaveBeenCalledWith('getWebhookInfo',{});
  expect((await getTelegramWebhookStatus('outra-conta')).status).toBe(403);
});
it('liga e confirma no Telegram',async()=>{
  telegramCall.mockResolvedValueOnce({url:''}).mockResolvedValueOnce(true).mockResolvedValueOnce({url:'https://app.example.com/api/telegram-webhook'});
  expect((await configureTelegramWebhook(client,'owner',true)).body.enabled).toBe(true);
  expect(telegramCall).toHaveBeenCalledWith('setWebhook',expect.objectContaining({url:'https://app.example.com/api/telegram-webhook'}));
});
it('desliga preservando os updates pendentes',async()=>{
  telegramCall.mockResolvedValueOnce({url:'https://app.example.com/api/telegram-webhook'}).mockResolvedValueOnce(true).mockResolvedValueOnce({url:''});
  expect((await configureTelegramWebhook(client,'owner',false)).body.enabled).toBe(false);
  expect(telegramCall).toHaveBeenCalledWith('deleteWebhook',{drop_pending_updates:false});
});
it('não altera webhook de outro receptor nem confirma falha como sucesso',async()=>{
  telegramCall.mockResolvedValue({url:'https://outro.example.com/bot'});
  expect((await configureTelegramWebhook(client,'owner',false)).status).toBe(409);expect(telegramCall).toHaveBeenCalledTimes(1);
  telegramCall.mockRejectedValue(new Error('network'));
  expect((await getTelegramWebhookStatus('owner')).status).toBe(502);
});
