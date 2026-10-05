import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from './local-env.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!process.argv.includes('--send'))throw new Error('Envio manual requer --send.');
loadLocalEnv(path.join(root,'.env.telegram.local'));
const token=process.env.TELEGRAM_BOT_TOKEN||process.env.TELEGRAM_TOKEN;
const chat=process.env.TELEGRAM_CHAT_ID;
if(!token||!chat)throw new Error('Configure TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID em .env.telegram.local.');
const secret=crypto.randomBytes(32).toString('hex');
const child=spawn(process.env.PYTHON_EXECUTABLE||'python',[path.join(root,'api','telegram-alert.py'),'--port','0'],{
  windowsHide:true,stdio:['ignore','pipe','ignore'],env:{...process.env,TELEGRAM_BOT_TOKEN:token,TELEGRAM_CHAT_ID:chat,ALERTS_API_TOKEN:secret},
});
const port=await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{child.kill();reject(new Error('Python local não iniciou.'));},10000);
  child.on('error',()=>{clearTimeout(timeout);reject(new Error('Python indisponível. Configure PYTHON_EXECUTABLE.'));});
  child.stdout.on('data',chunk=>{const match=String(chunk).match(/Telegram Python local: (\d+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});
  child.once('exit',()=>{clearTimeout(timeout);reject(new Error('Python encerrou antes de iniciar.'));});
});
const results=[];
try{
  for(const alert of [
    {event_type:'health.water_progress',title:'[TESTE MANUAL] Água',message:'Mensagem de teste do retorno à Vercel. Perfil fictício: 3 de 8 doses. Não representa seus dados reais.'},
    {event_type:'health.diet_menu',title:'[TESTE MANUAL] Dieta',message:'Mensagem de teste do retorno à Vercel. Refeição e calorias fictícias. Fluxo validado: Node → Python → Telegram.'},
  ]){
    const response=await fetch(`http://127.0.0.1:${port}/api/telegram-alert`,{
      method:'POST',headers:{'Content-Type':'application/json','X-Alert-Token':secret},
      body:JSON.stringify({source:'superapp-node',severity:'info',dedupe_key:`manual:${crypto.randomUUID()}`,occurred_at:new Date().toISOString(),...alert}),
      signal:AbortSignal.timeout(20000),
    });
    const payload=await response.json();
    results.push({type:alert.event_type,status:response.status,ok:payload.ok===true,message_id:payload.telegram_message_id??null});
    if(!response.ok||!payload.ok)throw new Error(`Gateway retornou HTTP ${response.status}.`);
  }
  console.log(JSON.stringify({ok:true,mode:'manual_synthetic',results},null,2));
}catch(error){console.log(JSON.stringify({ok:false,error:error.message,results},null,2));process.exitCode=1;}
finally{child.kill();}
