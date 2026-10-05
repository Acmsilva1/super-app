import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { configureDevelopmentEnv } from './scripts/local-env.js';
const root=path.dirname(fileURLToPath(import.meta.url));
export async function createDevApp({real=false,seed=true}={}){
  configureDevelopmentEnv(root,{real});
  const app=express();app.use(express.json({limit:'4.5mb'}));
  const {APPS}=await import('./api/apps.js');
  if(!real){
    const {createLocalMockHandler,seedLocalSaude}=await import('./scripts/local-mock-api.js');
    app.use(createLocalMockHandler(APPS));if(seed)await seedLocalSaude();
  }
  app.get('/healthz',(_req,res)=>res.json({ok:true,mode:real?'real':'mock'}));
  app.all('/api/*',async(req,res)=>{
    const route=req.path.replace(/^\/api\//,'').replace(/\/$/,'');
    const consolidated=new Set(['auth-config','statistics','roadmap']);
    const endpoint=consolidated.has(route)?'apps':route;
    if(consolidated.has(route))req.query={...req.query,route};
    if(!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/i.test(endpoint))return res.status(404).json({error:'Rota não encontrada.'});
    const moduleFile=path.join(root,'api',`${endpoint}.js`);
    if(!fs.existsSync(moduleFile))return res.status(404).json({error:'Rota não encontrada.'});
    try{const {default:handler}=await import(`./api/${endpoint}.js`);await handler(req,res);}
    catch{if(!res.headersSent)res.status(500).json({error:'Falha no servidor local.'});}
  });
  app.use((_req,res)=>res.status(404).json({error:'Rota não encontrada.'}));return app;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const real=process.env.LOCAL_DATA_MODE==='real',app=await createDevApp({real});
  app.listen(Number(process.env.PORT||3002),'127.0.0.1',()=>console.log(`Backend local: http://127.0.0.1:${process.env.PORT}; modo ${real?'real':'mock'}`));
}
