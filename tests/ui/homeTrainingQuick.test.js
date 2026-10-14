import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {HOME_TRAINING_PROFILE_KEY,openHomeTrainingQuick,initialTrainingProfile} from '../../features/treino/homeTrainingQuick.js';
import {trainingDraft} from '../../features/treino/localStore.js';
let overlay,body,values,fetch,profiles,workouts;
const response=rows=>({ok:true,json:async()=>({rows})});
beforeEach(()=>{
 values=new Map();vi.stubGlobal('localStorage',{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)});
 vi.stubGlobal('__superAppRuntimeMode','remote');vi.stubGlobal('superApp',undefined);
 profiles=[{id:1,nome:'Perfil A'},{id:2,nome:'Perfil B'},{id:3,nome:'Perfil C'}];
 workouts={};for(const profile of profiles){const row={id:`treino-${profile.id}`,...trainingDraft(`Treino ${profile.nome}`,'full_body')};row.grupos[0].exercicios=[{id:`ex-${profile.id}`,nome:`Exercício ${profile.nome}`}];workouts[profile.id]=[row];}
 fetch=vi.fn(async url=>response(url.includes('resource=perfis')?profiles:workouts[new URL(url,'https://app.test').searchParams.get('profile_id')]));vi.stubGlobal('fetch',fetch);
 body={innerHTML:''};vi.stubGlobal('document',{
  querySelector:()=>null,body:{appendChild(node){overlay=node;node.isConnected=true;}},
  createElement(){return {dataset:{},innerHTML:'',handlers:{},querySelector:selector=>selector==='[data-training-picker-body]'?body:{focus(){}},remove(){this.isConnected=false;},addEventListener(name,fn){this.handlers[name]=fn;}};},
 });
});
afterEach(()=>vi.unstubAllGlobals());
function changeProfile(id){overlay.handlers.change({target:{closest:selector=>selector==='[data-home-training-profile]'?{value:String(id)}:null}});}
it('abre o treino no próprio painel, sem edição e sem lançar Saúde automaticamente',async()=>{
 profiles=[profiles[0]];const launchSaude=vi.fn();await openHomeTrainingQuick({launchSaude});
 expect(body.innerHTML).toContain('Exercício Perfil A');expect(overlay.isConnected).toBe(true);expect(launchSaude).not.toHaveBeenCalled();
 expect(body.innerHTML).not.toContain('<form');expect(body.innerHTML).not.toContain('<input');expect(body.innerHTML).not.toContain('Adicionar exercício');
 expect(fetch.mock.calls.every(([,options])=>!options.method||options.method==='GET')).toBe(true);
});
it('lembra o perfil válido e permite trocar rapidamente sem misturar exercícios',async()=>{
 values.set(HOME_TRAINING_PROFILE_KEY,'2');await openHomeTrainingQuick();
 expect(body.innerHTML).toContain('Exercício Perfil B');expect(body.innerHTML).toContain('value="2" selected');
 changeProfile(99);expect(fetch).toHaveBeenCalledTimes(2);
 changeProfile(1);expect(body.innerHTML).toContain('Carregando treino');expect(body.innerHTML).not.toContain('Exercício Perfil B');
 await vi.waitFor(()=>expect(body.innerHTML).toContain('Exercício Perfil A'));expect(values.get(HOME_TRAINING_PROFILE_KEY)).toBe('1');
});
it('resposta lenta de outro perfil não substitui a seleção mais recente',async()=>{
 await openHomeTrainingQuick();let resolve;
 fetch.mockImplementation(async url=>url.includes('profile_id=2')?new Promise(done=>{resolve=done;}):response(workouts[3]));
 changeProfile(2);changeProfile(3);
 await vi.waitFor(()=>expect(body.innerHTML).toContain('Exercício Perfil C'));
 resolve(response(workouts[2]));await Promise.resolve();await Promise.resolve();
 expect(body.innerHTML).not.toContain('Exercício Perfil B');
});
it('perfil lembrado que não pertence à lista atual é ignorado',()=>{
 values.set(HOME_TRAINING_PROFILE_KEY,'99');expect(initialTrainingProfile(profiles).id).toBe(1);
});
it('ABC mostra a divisão selecionada sem campos para renomear',async()=>{
 const row={id:'abc',...trainingDraft('Meu ABC','abc')};row.grupos[0].exercicios=[{id:'a',nome:'Remada'}];row.grupos[1].exercicios=[{id:'b',nome:'Agachamento'}];workouts[1]=[row];
 await openHomeTrainingQuick();expect(body.innerHTML).toContain('Remada');
 overlay.handlers.click({target:{closest:selector=>selector==='[data-home-training-group]'?{dataset:{homeTrainingGroup:'B'}}:null}});
 expect(body.innerHTML).toContain('Agachamento');expect(body.innerHTML).not.toContain('Remada');expect(body.innerHTML).not.toContain('Salvar nome');
});
it('fechar enquanto carrega cancela a abertura tardia',async()=>{
 let resolve;const pending=new Promise(done=>{resolve=done;});const launchSaude=vi.fn();vi.stubGlobal('fetch',()=>pending);
 const opening=openHomeTrainingQuick({launchSaude});overlay.handlers.keydown({key:'Escape'});resolve(response(profiles));
 await opening;expect(launchSaude).not.toHaveBeenCalled();expect(overlay.isConnected).toBe(false);
});
