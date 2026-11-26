import fs from 'node:fs';
import crypto from 'node:crypto';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {describe,it,expect} from 'vitest';
import {CONTENT_SECURITY_POLICY} from '../../lib/securityHeaders.js';
import request from 'supertest';
import {createApp} from '../../server.js';
describe('Carregamento da API e shell',()=>{
  it('mantém auxiliares fora de api e rotas consolidadas no servidor',()=>{
    expect(fs.existsSync('api/financeiro-simulador.js')).toBe(false);
    expect(fs.existsSync('api/_financeiroShared.js')).toBe(false);
    const server=fs.readFileSync('server.js','utf8');
    expect(server).toContain("requestedEndpoint === 'financeiro-simulador' ? 'financeiro'");
    expect(server).toContain("new Set(['auth-config', 'statistics', 'roadmap', 'cron-treinar-modelo'])");
  });
  it('todos os modulos API carregam em processo isolado sem chamar handlers',()=>{
    const script="import fs from 'node:fs';import {pathToFileURL} from 'node:url';const files=fs.readdirSync('api',{recursive:true}).filter(f=>f.endsWith('.js'));for(const file of files)await import(pathToFileURL(process.cwd()+'/api/'+file));console.log(files.length);";
    const result=execFileSync(process.execPath,['--input-type=module','-e',script],{cwd:process.cwd(),env:{...process.env,OFFLINE_DEV:'true',NODE_ENV:'test'},encoding:'utf8'});
    expect(Number(result.trim())).toBe(fs.readdirSync('api', { recursive: true }).filter(f => f.endsWith('.js')).length);
  });
  it('scripts inline possuem sintaxe valida sem executar o navegador',()=>{
    const html=fs.readFileSync('index.html','utf8');
    let count=0;
    for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
      if(!match[1].trim())continue;new vm.Script(match[1]);count++;
    }
    expect(count).toBeGreaterThan(0);
  });
  it('servidor entrega CSP com hashes calculados do index.html e demais headers de segurança',async()=>{
    const app=createApp();
    for(const route of ['/','/sw.js','/manifest.json']){
      const res=await request(app).get(route);
      expect(res.status).toBe(200);
      expect(res.headers['content-security-policy']).toBe(CONTENT_SECURITY_POLICY);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(res.headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
    }
    const html=fs.readFileSync('index.html','utf8').replace(/\r\n?/g,'\n');
    const inline=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].filter(m=>m[1].trim());
    expect(inline.length).toBeGreaterThan(0);
    for(const m of inline)expect(CONTENT_SECURITY_POLICY).toContain("'sha256-"+crypto.createHash('sha256').update(m[1]).digest('base64')+"'");
  });
  it('servidor mantém cache e content-type do PWA',async()=>{
    const app=createApp();
    for(const route of ['/','/index.html','/sw.js','/app-version.json'])expect((await request(app).get(route)).headers['cache-control']).toBe('no-cache, no-store, must-revalidate');
    expect((await request(app).get('/sw.js')).headers['content-type']).toContain('application/javascript');
    expect((await request(app).get('/manifest.json')).headers['content-type']).toContain('application/manifest+json');
    for(const icon of ['/icon-192.png','/icon-512.png'])expect((await request(app).get(icon)).headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });
});
