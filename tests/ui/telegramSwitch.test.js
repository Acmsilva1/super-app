import fs from 'node:fs';
import {afterEach,it,expect,vi} from 'vitest';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const methods=html.slice(html.indexOf('            setAdminTelegramWebhookState('),html.indexOf('            async testAdminTelegram('));
const controller=()=>new Function(`return new class {${methods}};`)();
afterEach(()=>vi.unstubAllGlobals());
function setup(enabled){
  const label={textContent:''},button={disabled:false,state:String(enabled),getAttribute(){return this.state;},setAttribute(key,value){this.state=value;},querySelector(){return label;}},message={textContent:''};
  vi.stubGlobal('document',{getElementById:id=>id==='adminTelegramWebhook'?button:message});return {button,label,message};
}
it('atualiza o switch somente após confirmação do servidor',async()=>{
  const {button,label}=setup(false);vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({ok:true,enabled:true,simulated:true})})));
  await controller().configureAdminTelegramWebhook();expect(button.state).toBe('true');expect(label.textContent).toBe('Ligado');expect(JSON.parse(fetch.mock.calls[0][1].body).enabled).toBe(true);
});
it('mantém o estado anterior quando o servidor recusa a alteração',async()=>{
  const {button,label,message}=setup(true);vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,json:async()=>({error:'Falha na conexão'})})));
  await controller().configureAdminTelegramWebhook();expect(button.state).toBe('true');expect(label.textContent).toBe('Ligado');expect(button.disabled).toBe(false);expect(message.textContent).toBe('Falha na conexão');
});
