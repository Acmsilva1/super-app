import {afterEach,beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../lib/uiConfirmation.js',()=>({showAppConfirmation:vi.fn()}));
vi.mock('../../features/saude/waterDropVisual.js?v=2026-10-13-water-ml-v1',()=>({
 WATER_DROP_STYLES:'',removeWaterCelebration:vi.fn(),stopWaterDropMotion:vi.fn(),
 refreshWaterVictoryPresentation:vi.fn(),waterIntakePercent:()=>0,
 renderWaterDropHtml:()=>'<div data-water-drop></div>',
}));
import {openHomeWaterQuickModal} from '../../features/saude/homeWaterQuick.js';

const profile={id:1,nome:'André'};
const response=data=>({ok:true,json:async()=>data});
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
let overlay;
beforeEach(()=>{
 vi.stubGlobal('__superAppRuntimeMode','remote');
 vi.stubGlobal('localStorage',{getItem:()=>null,setItem(){}});
 vi.stubGlobal('requestAnimationFrame',()=>0);
 vi.stubGlobal('document',{
  querySelector:()=>null,querySelectorAll:()=>[],getElementById:()=>null,
  head:{appendChild(){}},body:{appendChild(node){overlay=node;node.isConnected=true;}},
  createElement(){return {innerHTML:'',dataset:{},querySelectorAll:()=>[],querySelector:()=>null,
   handlers:{},addEventListener(name,fn){this.handlers[name]=fn;},remove(){this.isConnected=false;}};},
 });
});
afterEach(()=>vi.unstubAllGlobals());

it('mostra gota e sete opções durante as consultas sem exibir o formulário de meta',async()=>{
 const profiles=deferred();const water=deferred();
 vi.stubGlobal('fetch',vi.fn(url=>url.includes('resource=perfis')?profiles.promise:water.promise));
 const opening=openHomeWaterQuickModal();
 const expectLoading=()=>{
  expect(overlay.innerHTML).toContain('Carregando consumo de água');
  expect(overlay.innerHTML).toContain('data-water-drop');
  expect(overlay.innerHTML.match(/data-water-amount=/g)).toHaveLength(7);
  expect(overlay.innerHTML.match(/aria-label="Registrar [^"]+" disabled/g)).toHaveLength(7);
  expect(overlay.innerHTML).not.toContain('Defina uma meta');
  expect(overlay.innerHTML).not.toContain('<form');
 };
 expectLoading();
 profiles.resolve(response({rows:[profile]}));
 await vi.waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));
 expectLoading();
 water.resolve(response({config:{nome:'Água',meta_ml:2000},today:{meta_ml:2000,realizado_ml:500}}));
 await opening;
 expect(overlay.innerHTML).toContain('500 de 2000 ml hoje');
 expect(overlay.innerHTML).not.toContain('Carregando consumo');
 expect(overlay.innerHTML).not.toMatch(/aria-label="Registrar [^"]+" disabled/);
});

it('perfil sem meta direciona para Saúde sem editar a meta no atalho',async()=>{
 const launchSaude=vi.fn();
 vi.stubGlobal('fetch',async url=>response(url.includes('resource=perfis')?{rows:[profile]}:{config:null,today:null}));
 await openHomeWaterQuickModal({launchSaude});
 expect(overlay.innerHTML).toContain('Configure a meta diária deste perfil em Saúde');
 expect(overlay.innerHTML).not.toContain('<form');
 await overlay.handlers.click({target:{closest:selector=>selector==='.home-water-quick-modal'?{}:selector==='[data-action]'?{dataset:{action:'open-saude'}}:null}});
 expect(launchSaude).toHaveBeenCalledWith({profileId:1,screen:'hub'});
});

it('trocar o perfil não mostra consumo do perfil anterior enquanto consulta o novo',async()=>{
 const pending=deferred();
 vi.stubGlobal('localStorage',{getItem:()=> '1',setItem(){}});
 vi.stubGlobal('fetch',async url=>{
  if(url.includes('resource=perfis'))return response({rows:[profile,{id:2,nome:'Juliana'}]});
  if(url.includes('profile_id=2'))return pending.promise;
  return response({config:{nome:'Água',meta_ml:2000},today:{meta_ml:2000,realizado_ml:500}});
 });
 await openHomeWaterQuickModal();
 const change=overlay.handlers.change({target:{closest:selector=>selector==='[data-home-water-profile]'?{value:'2'}:null}});
 expect(overlay.innerHTML).toContain('Carregando consumo de água');
 expect(overlay.innerHTML).not.toContain('500 de 2000');
 pending.resolve(response({config:{nome:'Água',meta_ml:2000},today:{meta_ml:2000,realizado_ml:100}}));
 await change;
 expect(overlay.innerHTML).toContain('100 de 2000 ml hoje');
});
