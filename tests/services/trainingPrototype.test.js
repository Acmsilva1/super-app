import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {trainingDraft,updateTraining,readTrainings,saveTrainings} from '../../features/treino/localStore.js';
import {isLocalTrainingStorageMode} from '../../features/treino/repository.js';
import {mountTrainingPrototype} from '../../features/treino/index.js';
vi.mock('../../lib/uiConfirmation.js',()=>({showAppConfirmation:vi.fn()}));
let storage,root;
const profile={id:1,nome:'Perfil teste',created_by:'owner-a'};
beforeEach(()=>{
 vi.stubGlobal('__superAppRuntimeMode','offline');
 const values=new Map();storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
 vi.stubGlobal('localStorage',storage);
 vi.stubGlobal('FormData',class{constructor(form){this.values=form.values;}get(name){return this.values[name];}});
 root={innerHTML:'',handlers:{},contains:()=>true,addEventListener(name,fn){this.handlers[name]=fn;},removeEventListener(name){delete this.handlers[name];}};
});
afterEach(()=>vi.unstubAllGlobals());
async function click(action,id){await root.handlers.click({target:{closest:()=>({dataset:{trainingAction:action,id}})}});}
function submit(type,values){return root.handlers.submit({preventDefault(){},target:{closest:()=>({dataset:{trainingForm:type},values,reportValidity:()=>true})}});}
it('organizações têm uma, três ou sete listas independentes, sem séries',()=>{
 for(const [type,count] of [['full_body',1],['abc',3],['semanal',7]]){
  const row=trainingDraft('Meu treino',type);
  expect(row.grupos).toHaveLength(count);
  row.grupos[0].exercicios.push({id:'x',nome:'Exercício'});
  expect(row.grupos.slice(1).every(group=>!group.exercicios.length)).toBe(true);
  expect(JSON.stringify(row)).not.toContain('series');
 }
 expect(trainingDraft('Semana','semanal').grupos.map(group=>group.nome)).toEqual(['Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado','Domingo']);
});
it('troca de tipo mantém os exercícios na primeira lista e persistência isola perfis e proprietários',()=>{
 const row={id:'1',...trainingDraft('ABC','abc')};
 row.grupos[0].exercicios=[{id:'a',nome:'Remada'}];row.grupos[1].exercicios=[{id:'b',nome:'Agachamento'}];
 const updated=updateTraining(row,'Completo','full_body');
 expect(updated.grupos[0].exercicios.map(item=>item.nome)).toEqual(['Remada','Agachamento']);
 saveTrainings(profile,[updated],storage);
 expect(readTrainings(profile,storage)).toEqual([updated]);
 expect(readTrainings({...profile,id:2},storage)).toEqual([]);
 expect(readTrainings({...profile,created_by:'owner-b'},storage)).toEqual([]);
});
it('produção usa a API; o modo offline preserva o esboço no navegador',()=>{
 vi.stubGlobal('__superAppRuntimeMode','remote');expect(isLocalTrainingStorageMode()).toBe(false);
 vi.stubGlobal('__superAppRuntimeMode','offline');expect(isLocalTrainingStorageMode()).toBe(true);
});
it('CRUD local permite criar, abrir, editar exercício e excluir treino',async()=>{
 mountTrainingPrototype(root,{profile,confirm:async()=>true});
 await click('new');await submit('workout',{nome:'Completo',tipo:'full_body'});
 const id=readTrainings(profile)[0].id;await click('open',id);
 await submit('exercise',{nome:'Agachamento'});
 const exercise=readTrainings(profile)[0].grupos[0].exercicios[0];
 await click('edit-exercise',exercise.id);await submit('exercise',{nome:'Agachamento livre'});
 expect(readTrainings(profile)[0].grupos[0].exercicios[0].nome).toBe('Agachamento livre');
 await click('edit',id);await submit('workout',{nome:'Completo atualizado',tipo:'full_body'});
 expect(readTrainings(profile)[0].nome).toBe('Completo atualizado');
 await click('delete',id);expect(readTrainings(profile)).toEqual([]);
});
it('nomeia ABC e mantém exercícios em suas divisões; semanal não oferece renomear dias',async()=>{
 mountTrainingPrototype(root,{profile,confirm:async()=>true});
 await click('new');await submit('workout',{nome:'ABC',tipo:'abc'});
 await click('open',readTrainings(profile)[0].id);
 await submit('group',{nome:'Peito e costas'});await submit('exercise',{nome:'Remada'});
 await click('group','B');await submit('exercise',{nome:'Agachamento'});
 const row=readTrainings(profile)[0];
 expect(row.grupos[0]).toMatchObject({nome:'Peito e costas',exercicios:[{nome:'Remada'}]});
 expect(row.grupos[1].exercicios[0].nome).toBe('Agachamento');expect(row.grupos[2].exercicios).toEqual([]);
 await click('back');await click('new');await submit('workout',{nome:'Semana',tipo:'semanal'});
 await click('open',readTrainings(profile)[1].id);
 expect(root.innerHTML).not.toContain('data-training-form="group"');
 await submit('exercise',{nome:'Caminhada'});
 await click('group','dia-6');expect(root.innerHTML).not.toContain('<strong>Caminhada</strong>');
});
