export const TRAINING_TYPES = {full_body:'Full body',abc:'ABC',semanal:'Semanal'};
const DAYS=['Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado','Domingo'];
export function trainingPrototypeEnabled(){
 return ['localhost','127.0.0.1','[::1]','::1','0.0.0.0'].includes(globalThis.location?.hostname || globalThis.window?.location?.hostname);
}
export function trainingGroups(type){
 if(type==='full_body')return [{id:'unico',nome:'Exercícios',exercicios:[]}];
 if(type==='abc')return ['A','B','C'].map(id=>({id,nome:`Treino ${id}`,exercicios:[]}));
 if(type==='semanal')return DAYS.map((nome,index)=>({id:`dia-${index}`,nome,exercicios:[]}));
 throw new Error('Selecione Full body, ABC ou Semanal.');
}
export function trainingDraft(nome,type){
 const clean=String(nome||'').trim();
 if(!clean || clean.length>80)throw new Error('Informe um nome de treino com até 80 caracteres.');
 return {nome:clean,tipo:type,grupos:trainingGroups(type)};
}
export function updateTraining(workout,nome,type){
 const draft=trainingDraft(nome,type);
 if(type===workout.tipo)return {...workout,nome:draft.nome};
 draft.grupos[0].exercicios=workout.grupos.flatMap(group=>group.exercicios);
 return {...workout,...draft};
}
export function readTrainings(profile,storage=globalThis.localStorage){
 const raw=storage.getItem(trainingStorageKey(profile));
 if(!raw)return [];
 const rows=JSON.parse(raw);
 if(!Array.isArray(rows))throw new Error('Não foi possível ler os treinos locais deste perfil.');
 return rows;
}
export const trainingStorageKey=profile=>`superapp:treino:esboco:v1:${profile.created_by||'perfil'}:${profile.id}`;
export function saveTrainings(profile,rows,storage=globalThis.localStorage){
 storage.setItem(trainingStorageKey(profile),JSON.stringify(rows));
}
