import {afterEach,it,expect,vi} from 'vitest';
import {telegramEnabled} from '../../lib/messagingChannels.js';
import handler from '../../api/telegram-webhook.js';
import {telegramCall} from '../../lib/telegramPurchase.js';
import {configureTelegramWebhook,getTelegramWebhookStatus} from '../../lib/telegramWebhookAdmin.js';
import {runTelegramManualTest} from '../../lib/telegramManualTest.js';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
it.each(['','false','TRUE','1','true'])('Telegram exige true exato (%s)',value=>{vi.stubEnv('TELEGRAM_ENABLED',value);expect(telegramEnabled()).toBe(value==='true');});
it('webhook inativo ignora updates antes de autorizacao e acesso ao banco',async()=>{
 vi.stubEnv('TELEGRAM_ENABLED','');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 const res={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()};
 await handler({method:'POST',headers:{},body:'JSON invalido'},res);
 expect(res.status).toHaveBeenCalledWith(200);expect(res.json).toHaveBeenCalledWith({ok:true,disabled:true});expect(fetch).not.toHaveBeenCalled();
});
it('canal inativo bloqueia chamadas diretas, teste legado e configuracao do webhook',async()=>{
 vi.stubEnv('TELEGRAM_ENABLED','');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 const client={from:vi.fn(()=>{throw Error('Nao deveria consultar banco');})};
 await expect(telegramCall('sendMessage',{text:'alerta'})).rejects.toThrow('telegram_disabled');
 expect((await configureTelegramWebhook(client,'owner',true)).status).toBe(503);
 expect((await getTelegramWebhookStatus('owner')).body).toMatchObject({enabled:false,disabled:true});
 expect((await runTelegramManualTest()).status).toBe(503);
 expect(client.from).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
