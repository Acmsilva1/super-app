import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {renderSaudeContent} from '../../features/saude/index.js';

const html=readFileSync(new URL('../../index.html',import.meta.url),'utf8');
function method(name,next){
  const start=html.search(new RegExp(`            (?:async )?${name}\\(`));
  const end=html.search(new RegExp(`            (?:async )?${next}\\(`));
  return html.slice(start,end).trim().replace(/\n            (?=(?:async )?\w+\()/g, ',\n            ');
}
const financeMethods=new Function(`return ({${method('loadAppContent','refreshAppContent')},${method('normalizeFinanceScreen','renderFinanceSimulador')},${method('mergeFinanceiroSectionData','getFinanceiroOperations')}})`)();
const financeRender=new Function('escapeHtml',`return ({${method('renderFinanceiroContent','renderListaComprasContent')}})`);
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
function container(screen='hub'){
  const attributes=new Map([['data-finance-screen',screen]]);
  const listeners=new Map();
  return {innerHTML:'',scrollTop:0,isConnected:true,classList:{add(){},remove(){}},
    getAttribute:key=>attributes.get(key),setAttribute:(key,value)=>attributes.set(key,value),
    querySelector:()=>null,querySelectorAll:()=>[],closest:()=>null,
    addEventListener:(name,handler)=>listeners.set(name,handler),removeEventListener:()=>{},
    click:dataset=>listeners.get('click')({target:{matches:()=>false,closest:()=>({dataset})}})};
}
function financeApp(){
  return {...financeMethods,uiState:{},getMesAnoAtual:()=> '2026-10',
    readApiJsonOrThrow:response=>response.json(),
    renderFinanceiroContent:vi.fn((el)=>{el.innerHTML='Tela do Financeiro';}),
    rememberWindowScroll:()=>{},restoreWindowScroll:()=>{},rememberAppCheckpoint:()=>{}};
}
const profile={id:1,nome:'André',sexo:'masculino',data_nascimento:'1990-01-01',peso_kg:80,altura_cm:174,historico:[]};
beforeEach(()=>{
  vi.useFakeTimers();
  vi.stubGlobal('window',{addEventListener(){},removeEventListener(){},matchMedia:()=>({matches:false})});
  vi.stubGlobal('localStorage',{getItem:()=>null,setItem(){},removeItem(){}});
  vi.stubGlobal('requestAnimationFrame',()=>0);
  vi.stubGlobal('__superAppRuntimeMode','remote');
});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});

it('Saúde mostra a estrutura antes da resposta e só consulta o módulo selecionado',async()=>{
  const pending=deferred();
  const fetch=vi.fn(async url=>{
    const resource=new URL(url,'https://app.test').searchParams.get('resource');
    if(resource==='perfis') return pending.promise;
    return {ok:true,json:async()=>({rows:[],config:null,today:null,history:[]})};
  });vi.stubGlobal('fetch',fetch);
  const el=container();const opening=renderSaudeContent(el);
  expect(el.innerHTML).toContain('Minha Saúde');expect(el.innerHTML).toContain('Carregando perfis');
  expect(el.innerHTML).not.toContain('Nenhum perfil cadastrado.');
  pending.resolve({ok:true,json:async()=>({rows:[profile]})});await opening;
  expect(fetch).toHaveBeenCalledTimes(1);
  await el.click({saudeAction:'open-profile-detail',saudeId:'1'});
  expect(fetch).toHaveBeenCalledTimes(1);expect(el.innerHTML).toContain('Abrir acompanhamento');
  await el.click({saudeAction:'profile-screen',screen:'dietas'});
  expect(fetch.mock.calls.slice(1).map(([url])=>new URL(url,'https://app.test').searchParams.get('resource')).sort()).toEqual(['alimentos','dietas']);
  expect(fetch.mock.calls.find(([url])=>url.includes('resource=dietas'))[0]).toContain('profile_id=1');
  await el.click({saudeAction:'profile-screen',screen:'hub'});
  await el.click({saudeAction:'open-water-tracker',waterProfileId:'1'});
  expect(fetch.mock.calls.filter(([url])=>url.includes('resource=consumo-agua'))).toHaveLength(1);
  el._cleanup();
});

it('Financeiro mostra a tela antes do resumo e não consulta gráfico ou alertas ao abrir',async()=>{
  const pending=deferred();const app=financeApp();const el=container();
  const fetch=vi.fn(url=>pending.promise.then(()=>({ok:true,json:async()=>({mes_ano:'2026-10',secao:new URL(url,'https://app.test').searchParams.get('secao')})})));
  vi.stubGlobal('fetch',fetch);
  const opening=app.loadAppContent('financeiro',el);
  expect(app.renderFinanceiroContent).toHaveBeenCalledTimes(1);expect(el._financeScreenLoading).toBe(true);
  expect(fetch.mock.calls.map(([url])=>new URL(url,'https://app.test').searchParams.get('secao')).sort()).toEqual(['data','poupanca']);
  expect(app.financeSectionsForScreen('alertas')).toEqual([]);expect(app.financeSectionsForScreen('tendencia')).toEqual([]);
  pending.resolve();await opening;
  expect(el._financeScreenLoading).toBe(false);expect(app.renderFinanceiroContent).toHaveBeenCalledTimes(2);
});

it('resposta atrasada do Financeiro não substitui a seção selecionada depois',async()=>{
  const pending=deferred();const app=financeApp();const el=container();vi.stubGlobal('fetch',()=>pending.promise);
  const opening=app.loadAppContent('financeiro',el);
  await app.navigateFinanceScreen(el,'alertas');
  const count=app.renderFinanceiroContent.mock.calls.length;
  pending.resolve({ok:true,json:async()=>({mes_ano:'2026-10',secao:'data'})});await opening;
  expect(el.getAttribute('data-finance-screen')).toBe('alertas');
  expect(app.renderFinanceiroContent).toHaveBeenCalledTimes(count);
});

it('hub mantém resumo mensal, menu clicável e nenhum zero enquanto carrega',()=>{
  // Executa o renderer real; imports de gráfico/alertas não são disparados no hub.
  const app={...financeApp(),...financeRender(String),formatMoneyBr:value=>`R$ ${value.toFixed(2)}`,formatMesAnoLabel:value=>value,
    getFinanceiroOperations:()=>[],getFinanceiroPendingOperations:()=>[],financeiroOperationsForSection:()=>[]};
  const el=container();el._financeScreenLoading=true;
  app.renderFinanceiroContent(el,{mes_ano:'2026-10'});
  expect(el.innerHTML).toContain('Carregando resumo mensal');
  expect(el.innerHTML).toContain('data-screen="alertas"');expect(el.innerHTML).toContain('data-screen="tendencia"');
  expect(el.innerHTML).not.toContain('R$ 0.00');
  el._financeScreenLoading=false;
  app.renderFinanceiroContent(el,{mes_ano:'2026-10',dashboard:{receitas:1000,despesas_fixas:200,despesas_variadas:100},poupanca:{total:50}});
  expect(el.innerHTML).toContain('R$ 1000.00');expect(el.innerHTML).toContain('R$ 700.00');expect(el.innerHTML).toContain('R$ 50.00');
});


it('reabrir Financeiro começa pela visão geral mesmo com uma seção anterior', async()=>{
  const app=financeApp();const el=container('extrato');
  app.uiState={checkpoint:{appMeta:{financeiro:{screen:'poupanca'}}}};
  vi.stubGlobal('fetch',async()=>({ok:true,json:async()=>({mes_ano:'2026-10'})}));
  await app.loadAppContent('financeiro',el);
  expect(el.getAttribute('data-finance-screen')).toBe('hub');
  expect(el._financeInitialRenderDone).toBe(true);
});


it('Saúde abre na lista de perfis sem restaurar a dieta anterior',async()=>{
  vi.stubGlobal('localStorage',{getItem:()=>JSON.stringify({view:'profile-detail',selectedProfileId:1,profileScreen:'dietas'}),setItem(){},removeItem(){}});
  const fetch=vi.fn(async()=>({ok:true,json:async()=>({rows:[profile]})}));
  vi.stubGlobal('fetch',fetch);
  const el=container();await renderSaudeContent(el);
  expect(el.innerHTML).toContain('Minha Saúde');
  expect(el.innerHTML).toContain('André');
  expect(fetch).toHaveBeenCalledTimes(1);
  el._cleanup();
});
