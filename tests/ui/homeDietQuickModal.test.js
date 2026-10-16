import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {HOME_DIET_LAST_DIET_KEY,HOME_DIET_LAST_PROFILE_KEY,openHomeDietQuickModal} from '../../features/saude/homeDietQuick.js';
import {DIET_WEEK,dietDayIndex,todayDietDate} from '../../features/saude/service/dietasService.js';

const profiles=[{id:1,nome:'André'},{id:2,nome:'Juliana'}];
const weekly=(id,name)=>({id,titulo:`Dieta ${name}`,semanal:true,semana:DIET_WEEK.map((titulo,index)=>({titulo,
  refeicoes:[{tipo:'almoco',itens:[{nome:`${name} dia ${index}`,quantidade:'100 g'}]}]}))});
const response=rows=>({ok:true,json:async()=>({rows})});
let overlay,storage;
beforeEach(()=>{
  storage=new Map([[HOME_DIET_LAST_PROFILE_KEY,'2'],[HOME_DIET_LAST_DIET_KEY,'22']]);
  vi.stubGlobal('localStorage',{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)});
  vi.stubGlobal('document',{
    getElementById:()=>null,querySelector:()=>null,head:{appendChild(){}},body:{appendChild(node){overlay=node;}},
    createElement:()=>({dataset:{},innerHTML:'',handlers:{},remove(){},querySelector:()=>({focus(){}}),
      addEventListener(name,callback){this.handlers[name]=callback;}}),
  });
});
afterEach(()=>vi.unstubAllGlobals());
const change=id=>overlay.handlers.change({target:{closest:selector=>selector==='[data-home-diet-active-profile]'?{value:String(id)}:null}});
const click=action=>overlay.handlers.click({target:{closest:selector=>selector==='.home-diet-quick-modal'?{}:
  selector==='[data-action]'?{dataset:{action}}:null}});

it('mostra seletor acima das refeições mesmo ao restaurar uma dieta salva',async()=>{
  vi.stubGlobal('fetch',vi.fn(async url=>response(url.includes('resource=perfis')?profiles:[weekly(22,'Juliana')])));
  await openHomeDietQuickModal();
  expect(overlay.innerHTML).toContain('Dieta Juliana');
  expect(overlay.innerHTML).toContain('<option value="1">André</option>');
  expect(overlay.innerHTML).toContain('<option value="2" selected>Juliana</option>');
  expect(overlay.innerHTML.indexOf('data-home-diet-active-profile')).toBeLessThan(overlay.innerHTML.indexOf('home-diet-quick-week-nav'));
  expect(fetch).toHaveBeenLastCalledWith('/api/saude?resource=dietas&profile_id=2',{cache:'no-store'});
});

it('troca perfil no detalhe sem Saúde, limpa o conteúdo anterior e reinicia no dia atual',async()=>{
  let resolve;
  const pending=new Promise(done=>{resolve=done;});
  const launchSaude=vi.fn();
  vi.stubGlobal('fetch',vi.fn(async url=>{
    if(url.includes('resource=perfis'))return response(profiles);
    if(url.includes('profile_id=1'))return pending;
    return response([weekly(22,'Juliana')]);
  }));
  await openHomeDietQuickModal({launchSaude});
  const today=dietDayIndex(todayDietDate());
  await click('diet-day-next');
  expect(overlay.innerHTML).toContain(`Juliana dia ${(today+1)%7}`);
  const switching=change(1);
  expect(overlay.innerHTML).toContain('Carregando dietas...');
  expect(overlay.innerHTML).toContain('data-home-diet-active-profile disabled');
  expect(overlay.innerHTML).not.toContain('Juliana dia');
  await change(2); // O controle desabilitado não deve iniciar uma consulta concorrente.
  expect(fetch).toHaveBeenCalledTimes(3);
  resolve(response([weekly(11,'André')]));await switching;
  expect(overlay.innerHTML).toContain('Dieta André');
  expect(overlay.innerHTML).toContain(`André dia ${today}`);
  expect(overlay.innerHTML).not.toContain('Juliana dia');
  expect(storage.get(HOME_DIET_LAST_PROFILE_KEY)).toBe('1');
  expect(storage.get(HOME_DIET_LAST_DIET_KEY)).toBe('11');
  expect(launchSaude).not.toHaveBeenCalled();
  expect(fetch.mock.calls.every(([url,options])=>url.startsWith('/api/saude?')&&!options.method)).toBe(true);
});

it('permite trocar novamente quando o perfil não tem dietas ou a consulta falha',async()=>{
  let fail=false;
  vi.stubGlobal('fetch',async url=>{
    if(url.includes('resource=perfis'))return response(profiles);
    if(url.includes('profile_id=1')){
      if(fail)throw new Error('Falha ao carregar');
      return response([]);
    }
    return response([weekly(22,'Juliana')]);
  });
  await openHomeDietQuickModal();await change(1);
  expect(overlay.innerHTML).toContain('Nenhuma dieta cadastrada para André');
  expect(overlay.innerHTML).toContain('data-action="change-profile"');
  await change(2);fail=true;await change(1);
  expect(overlay.innerHTML).toContain('Falha ao carregar');
  expect(overlay.innerHTML).toContain('data-home-diet-profile');
  expect(overlay.innerHTML).not.toContain('Juliana dia');
});
