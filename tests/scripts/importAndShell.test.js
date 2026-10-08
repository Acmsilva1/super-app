import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {describe,it,expect} from 'vitest';
import {CONTENT_SECURITY_POLICY} from '../../lib/securityHeaders.js';
describe('Carregamento da API e shell',()=>{
  it('todos os modulos API carregam em processo isolado sem chamar handlers',()=>{
    const script="import fs from 'node:fs';import {pathToFileURL} from 'node:url';const files=fs.readdirSync('api',{recursive:true}).filter(f=>f.endsWith('.js'));for(const file of files)await import(pathToFileURL(process.cwd()+'/api/'+file));console.log(files.length);";
    const result=execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:process.cwd(),env:{...process.env,OFFLINE_DEV:'true',NODE_ENV:'test'},encoding:'utf8'});
    expect(Number(result.trim())).toBeGreaterThanOrEqual(12);
  });
  it('scripts inline possuem sintaxe valida sem executar o navegador',()=>{
    const html=fs.readFileSync('index.html','utf8');
    let count=0;
    for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
      if(!match[1].trim())continue;new vm.Script(match[1]);count++;
    }
    expect(count).toBeGreaterThan(0);
  });
  it('CSP do servidor e Vercel possuem o mesmo contrato',()=>{
    const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
    const policy=config.headers.find(row=>row.source==='/(.*)').headers.find(row=>row.key==='Content-Security-Policy');
    expect(policy.value).toBe(CONTENT_SECURITY_POLICY);
  });
});
