import fs from 'node:fs';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const html=fs.readFileSync(new URL('../../index.html',import.meta.url),'utf8');
const method=html.slice(html.indexOf('            async testAdminWhatsApp('),html.indexOf('            async loadAdminUsers('));
let buttons,message,profile;
beforeEach(()=>{
  buttons=['water','diet','finance'].map(type=>({dataset:{adminWhatsappTest:type},disabled:false,textContent:type}));
  message={textContent:''};profile={value:'3'};
  vi.stubGlobal('document',{querySelectorAll:()=>buttons,getElementById:id=>id==='adminWhatsAppProfile'?profile:message});
  vi.stubGlobal('crypto',{randomUUID:()=> '00000000-0000-4000-8000-000000000003'});
  vi.stubGlobal('showAppConfirmation',vi.fn());
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({ok:true,queued:1})})));
});
afterEach(()=>vi.unstubAllGlobals());
it('botao usa action WhatsApp e distingue fila de entrega',async()=>{
  await new Function(`return ({${method}});`)().testAdminWhatsApp('water');
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({action:'test_whatsapp',type:'water',profileId:'3'});
  expect(showAppConfirmation).toHaveBeenCalledWith('Teste WhatsApp enfileirado.');
  expect(message.textContent).toContain('Pedido aceito na fila');expect(buttons.every(item=>!item.disabled)).toBe(true);
});
it('nao envia teste de saude sem selecionar perfil',async()=>{
  profile.value='';await new Function(`return ({${method}});`)().testAdminWhatsApp('diet');
  expect(fetch).not.toHaveBeenCalled();expect(message.textContent).toContain('Selecione um perfil');
});
it('erro preserva feedback e libera botoes sem repetir requisicao',async()=>{
  fetch.mockResolvedValue({ok:false,json:async()=>({error:'Nenhum destinatário autorizado.'})});
  await new Function(`return ({${method}});`)().testAdminWhatsApp('finance');
  expect(message.textContent).toBe('Nenhum destinatário autorizado.');expect(fetch).toHaveBeenCalledOnce();expect(buttons.every(item=>!item.disabled)).toBe(true);
});

it('exibe etapa e HTTP do diagnostico sem exigir consulta aos logs', async()=>{
  fetch.mockResolvedValue({ok:false,json:async()=>({error:'Chave recusada.',diagnostics:[{state:'error',stage:'Autenticação da mensageria',http_status:401,message:'Confira a chave de integração.',code:'gateway_unauthorized'}]})});
  await new Function(`return ({${method}});`)().testAdminWhatsApp('water');
  expect(message.textContent).toContain('Autenticação da mensageria (HTTP 401)');
  expect(message.textContent).toContain('Confira a chave de integração.');
  expect(message.textContent).toContain('gateway_unauthorized');
});
