import {TRAINING_TYPES,trainingDraft,updateTraining,readTrainings} from './localStore.js';
import {createTrainingRepository,isLocalTrainingStorageMode} from './repository.js';
import {showAppConfirmation} from '../../lib/uiConfirmation.js';
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const TYPE_ICONS={full_body:'fa-dumbbell',abc:'fa-layer-group',semanal:'fa-calendar-week'};
const exerciseCount=row=>row.grupos.reduce((sum,item)=>sum+item.exercicios.length,0);
const countLabel=(count,singular,plural)=>`${count} ${count===1?singular:plural}`;
function ensureTrainingStyles(){
 if(typeof document==='undefined')return;
 if(document.querySelector('link[data-training-styles]'))return;
 const link=document.createElement('link');
 link.rel='stylesheet';
 link.href=new URL('./styles.css?v=2026-11-27',import.meta.url).href;
 link.dataset.trainingStyles='';
 document.head.appendChild(link);
}
export function mountTrainingPrototype(root,{profile,confirm}){
 ensureTrainingStyles();
 const local=isLocalTrainingStorageMode(),repository=createTrainingRepository(profile);
 let rows=[],selected=null,groupId=null,editor=null,exerciseEditor=null,error='',disposed=false,busy=false,loading=!local,loadFailed=false;
 if(local)try{rows=readTrainings(profile);}catch{error='Não foi possível carregar os treinos locais. Verifique o armazenamento do navegador.';loadFailed=true;}
 const workout=()=>rows.find(row=>row.id===selected);
 const group=()=>workout()?.grupos.find(item=>item.id===groupId);
 const button=(action,label,extra='')=>`<button type="button" class="saude-btn" data-training-action="${action}" ${extra}>${label}</button>`;
 const commit=async next=>{
  busy=true;paint();
  try{
   const removed=rows.find(row=>!next.some(item=>item.id===row.id));
   const changed=next.find(row=>JSON.stringify(row)!==JSON.stringify(rows.find(item=>item.id===row.id)));
   if(removed)await repository.remove(removed);
   if(changed){const saved=await repository.save(changed,rows.find(item=>item.id===changed.id));next=next.map(row=>row.id===changed.id?saved:row);}
   if(disposed)return;rows=next;error='';
  }finally{busy=false;}
 };
 const persistWorkout=next=>commit(rows.map(row=>row.id===next.id?next:row));
 function paint(){
  if(disposed)return;
  const active=workout(),current=group();
  const cardHtml=row=>`<section class="training-card training-workout">
   <button type="button" class="training-open" data-training-action="open" data-id="${escape(row.id)}" aria-label="Abrir treino ${escape(row.nome)}">
    <div class="training-card-heading"><span class="training-type-icon" aria-hidden="true"><i class="fas ${TYPE_ICONS[row.tipo]}"></i></span><span class="training-type-badge">${TRAINING_TYPES[row.tipo]}</span><i class="fas fa-arrow-up-right-from-square training-card-arrow" aria-hidden="true"></i></div>
    <h3>${escape(row.nome)}</h3><p class="training-card-count">${countLabel(exerciseCount(row),'exercício','exercícios')}</p>
    <div class="training-group-preview">${row.grupos.map(item=>`<span>${escape(row.tipo==='abc'?item.id:row.tipo==='full_body'?'Lista única':item.nome.replace('-feira',''))}<b>${item.exercicios.length}</b></span>`).join('')}</div>
    <span class="training-card-link">Abrir treino <i class="fas fa-arrow-right" aria-hidden="true"></i></span>
   </button><div class="training-card-footer">${button('edit','Editar',`data-id="${escape(row.id)}"`)}${button('delete','Excluir',`data-id="${escape(row.id)}"`)}</div>
  </section>`;
  root.innerHTML=`<div class="training-prototype">
   <p class="training-note training-card">${local?'Modo local · ':''}${escape(profile.nome)}${local?' · salvo neste navegador.':''}</p>
   ${loading?'<p class="training-card" role="status">Carregando treinos…</p>':''}
   ${busy?'<p class="training-card" role="status">Salvando treino…</p>':''}
   ${error?`<div class="training-error training-card" role="alert">${escape(error)} ${button('reload','Atualizar treinos')}</div>`:''}
   ${loading||loadFailed?'':active?`${button('back','← Meus treinos')}<section class="training-card"><div class="training-hero-heading"><span class="training-type-icon" aria-hidden="true"><i class="fas ${TYPE_ICONS[active.tipo]}"></i></span><div><h3>${escape(active.nome)}</h3><span class="training-type-badge">${TRAINING_TYPES[active.tipo]}</span></div>${button('edit','Editar treino',`data-id="${escape(active.id)}"`)}</div>
    ${active.tipo!=='full_body'?`<div class="training-tabs" aria-label="Divisões do treino">${active.grupos.map(item=>`<button type="button" class="saude-btn" data-training-action="group" data-id="${escape(item.id)}" aria-pressed="${item.id===groupId}">${escape(active.tipo==='abc'?`${item.id} · ${item.nome}`:item.nome)}</button>`).join('')}</div>`:''}
    <h3>${escape(current.nome)}</h3>
    ${active.tipo==='abc'?`<form class="training-form" data-training-form="group"><label>Nome do treino ${current.id}<input name="nome" maxlength="80" required value="${escape(current.nome)}"></label><div><button type="submit" class="saude-btn">Salvar nome</button></div></form>`:''}
    ${current.exercicios.length?current.exercicios.map((item,index)=>`<div class="training-exercise"><div class="training-exercise-name"><span class="training-exercise-number" aria-hidden="true">${index+1}</span><strong>${escape(item.nome)}</strong></div><div class="training-actions">${button('edit-exercise','Editar',`data-id="${escape(item.id)}"`)}${button('delete-exercise','Excluir',`data-id="${escape(item.id)}"`)}</div></div>`).join(''):'<p>Nenhum exercício adicionado nesta lista.</p>'}
    <form class="training-form" data-training-form="exercise"><label>${exerciseEditor?'Editar exercício':'Adicionar exercício'}<input name="nome" maxlength="120" required placeholder="Nome do exercício" value="${escape(current.exercicios.find(item=>item.id===exerciseEditor)?.nome||'')}"></label><div class="training-actions"><button class="saude-btn" type="submit">${exerciseEditor?'Salvar exercício':'Adicionar exercício'}</button>${exerciseEditor?button('cancel-exercise','Cancelar'):''}</div></form></section>`:
    `<section class="training-card training-hero"><div class="training-hero-heading"><span class="training-type-icon" aria-hidden="true"><i class="fas fa-dumbbell"></i></span><div><h3>Meus treinos</h3><p>Organize seus exercícios do seu jeito.</p></div>${button('new','Novo treino')}</div><div class="training-summary"><span><strong>${rows.length}</strong>${rows.length===1?'treino':'treinos'}</span><span><strong>${rows.reduce((sum,row)=>sum+exerciseCount(row),0)}</strong>exercícios</span></div></section>${rows.length?`<div class="training-grid">${rows.map(cardHtml).join('')}</div>`:'<section class="training-card training-empty"><span class="training-type-icon" aria-hidden="true"><i class="fas fa-dumbbell"></i></span><h3>Seu primeiro treino começa aqui</h3><p>Crie seu treino e adicione os exercícios no seu ritmo.</p></section>'}`}
   ${editor?`<section class="training-card"><h3>${editor.id?'Editar treino':'Novo treino'}</h3><form class="training-form" data-training-form="workout"><label>Nome do treino<input name="nome" maxlength="80" required value="${escape(editor.nome)}" placeholder="Ex.: Meu treino"></label><label>Organização<select name="tipo" aria-label="Organização">${Object.entries(TRAINING_TYPES).map(([id,label])=>`<option value="${id}"${id===editor.tipo?' selected':''}>${label}</option>`).join('')}</select></label>${editor.id?'<p class="training-note">Ao mudar a organização, os exercícios são mantidos na primeira lista.</p>':''}<div class="training-actions"><button type="submit" class="saude-btn">Salvar treino</button>${button('cancel','Cancelar')}</div></form></section>`:''}
  </div>`;
  root.querySelectorAll?.('button,input,select').forEach(control=>{control.disabled=busy||loading||(loadFailed&&control.dataset.trainingAction!=='reload');});
 }
 async function onClick(event){
  const control=event.target.closest('[data-training-action]');if(!control||!root.contains(control))return;
  const {trainingAction:action,id}=control.dataset;
  if(busy||loading)return;
  try{
   if(action==='reload'){await reload();return;}
   if(action==='new')editor={nome:'',tipo:'full_body'};
   if(action==='cancel')editor=null;
   if(action==='edit')editor={...rows.find(row=>row.id===id)};
   if(action==='open'){selected=id;groupId=workout().grupos[0].id;editor=null;exerciseEditor=null;}
   if(action==='back'){selected=null;editor=null;exerciseEditor=null;}
   if(action==='group'){groupId=id;exerciseEditor=null;}
   if(action==='edit-exercise')exerciseEditor=id;
   if(action==='cancel-exercise')exerciseEditor=null;
   if(action==='delete'){
    const row=rows.find(item=>item.id===id);
    if(await confirm({message:`Excluir “${row.nome}” e seus exercícios?`})){
     if(disposed)return;await commit(rows.filter(item=>item.id!==id));if(selected===id)selected=null;editor=null;showAppConfirmation('Treino excluído.');
    }
   }
   if(action==='delete-exercise'){
    const row=workout(),target=group(),item=target.exercicios.find(item=>item.id===id);
    if(await confirm({message:`Excluir o exercício “${item.nome}”?`})){
     if(disposed)return;await persistWorkout({...row,grupos:row.grupos.map(g=>g.id===target.id?{...g,exercicios:g.exercicios.filter(item=>item.id!==id)}:g)});exerciseEditor=null;showAppConfirmation('Exercício excluído.');
    }
   }
  }catch(cause){error=cause.message||'Não foi possível salvar o treino local.';}
  paint();
 }
 async function onSubmit(event){
  const form=event.target.closest('[data-training-form]');if(!form||!root.contains(form))return;
  event.preventDefault();if(busy||loading||loadFailed||!form.reportValidity())return;
  const values=new FormData(form),nome=String(values.get('nome')||'').trim();
  try{
   if(form.dataset.trainingForm==='workout'){
    const tipo=values.get('tipo');
    editor.nome=nome;editor.tipo=tipo;
    if(editor.id){await persistWorkout(updateTraining(rows.find(row=>row.id===editor.id),nome,tipo));if(selected)groupId=workout().grupos[0].id;}
    else {editor.newId ||= crypto.randomUUID();await commit([...rows,{id:editor.newId,...trainingDraft(nome,tipo)}]);}
    editor=null;showAppConfirmation('Treino salvo.');
   }else{
    const row=workout(),target=group();
    if(!nome)throw new Error('Informe o nome.');
    if(form.dataset.trainingForm==='group'){
     if(row.tipo!=='abc')throw new Error('Os dias da semana possuem nomes fixos.');
     await persistWorkout({...row,grupos:row.grupos.map(g=>g.id===target.id?{...g,nome}:g)});showAppConfirmation('Nome salvo.');
    }else{
     const items=exerciseEditor?target.exercicios.map(item=>item.id===exerciseEditor?{...item,nome}:item):[...target.exercicios,{id:crypto.randomUUID(),nome}];
     await persistWorkout({...row,grupos:row.grupos.map(g=>g.id===target.id?{...g,exercicios:items}:g)});exerciseEditor=null;showAppConfirmation('Exercício salvo.');
    }
   }
  }catch(cause){error=cause.message||'Não foi possível salvar o treino local.';}
  paint();
 }
 async function reload(){
  loading=true;paint();
  try{const loaded=await repository.load();if(disposed)return;rows=loaded;loadFailed=false;error='';selected=null;editor=null;exerciseEditor=null;}
  catch(cause){error=cause.message||'Não foi possível carregar os treinos.';loadFailed=true;}
  finally{loading=false;paint();}
 }
 root.addEventListener('click',onClick);root.addEventListener('submit',onSubmit);paint();
 if(!local)void reload();
 return ()=>{disposed=true;root.removeEventListener('click',onClick);root.removeEventListener('submit',onSubmit);};
}
