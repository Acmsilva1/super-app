import {createTrainingRepository} from './repository.js';
import {TRAINING_TYPES} from './localStore.js';
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
export const HOME_TRAINING_PROFILE_KEY='superapp:home-training:last-profile';
const workoutKey=profile=>`superapp:home-training:last-workout:${profile}`;
function read(key){try{return localStorage.getItem(key);}catch{return null;}}
function write(key,value){try{localStorage.setItem(key,String(value));}catch{/* preferência opcional */}}
export function initialTrainingProfile(profiles){
 const checkpoint=globalThis.superApp?.uiState?.checkpoint?.appMeta?.saude||globalThis.superApp?.uiState?.appMeta?.saude;
 for(const id of [read(HOME_TRAINING_PROFILE_KEY),checkpoint?.selectedProfileId]){
  const profile=profiles.find(row=>Number(row.id)===Number(id));if(profile)return profile;
 }
 return profiles[0]||null;
}
function initialGroup(row){
 if(row.tipo==='semanal'){
  const day=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'America/Sao_Paulo'}).format(new Date()));
  return row.grupos.find(group=>group.id===`dia-${day}`)||row.grupos[0];
 }
 return row.grupos[0];
}
export async function openHomeTrainingQuick({launchSaude}={}){
 document.querySelector('[data-home-training-overlay]')?.remove();
 const overlay=document.createElement('div');overlay.dataset.homeTrainingOverlay='';
 overlay.innerHTML=`<style>
 [data-home-training-overlay]{position:fixed;inset:0;z-index:1300;display:grid;place-items:center;padding:1rem;background:#020617bd;backdrop-filter:blur(4px)}
 .home-training-picker{width:min(100%,29rem);max-height:85dvh;overflow:auto;box-sizing:border-box;background:var(--bk-surface,#fff);color:var(--bk-ink,#20463c);border-radius:1rem;padding:1.2rem;font-family:var(--bk-font,Arial,sans-serif);box-shadow:0 18px 60px #0005}
 .home-training-picker header{display:flex;justify-content:space-between;align-items:center;gap:1rem}.home-training-picker h3{margin:0;font-size:1.1rem}
 .home-training-picker button,.home-training-picker select{font:inherit;min-height:2.7rem;border:1px solid var(--bk-line,#d1d3d4);border-radius:.7rem;background:var(--bk-surface,#fff);color:var(--bk-ink,#20463c);padding:.6rem .85rem}
 .home-training-picker button{cursor:pointer}.home-training-picker p{font-size:.85rem;line-height:1.5}
 .home-training-picker label{display:grid;gap:.4rem;margin:.85rem 0;font-size:.8rem;font-weight:600}.home-training-picker select{width:100%;box-sizing:border-box}
 .home-training-tabs{display:flex;gap:.4rem;overflow:auto;padding:.5rem 0;margin:.6rem 0}.home-training-tabs button{white-space:nowrap;font-size:.8rem}
 .home-training-tabs button[aria-pressed="true"]{background:var(--bk-primary,#327746);color:var(--bk-primary-ink,#fff);border-color:var(--bk-primary,#327746)}
 .home-training-list{list-style:none;padding:0;margin:.75rem 0}.home-training-list li{display:flex;align-items:center;gap:.7rem;padding:.85rem;border:1px solid var(--bk-line,#d1d3d4);border-radius:.7rem;margin:.45rem 0;font-size:.9rem;overflow-wrap:anywhere}
 .home-training-list .number{display:grid;place-items:center;flex:none;width:1.7rem;height:1.7rem;border-radius:.5rem;background:var(--bk-bg,#f3f7f3);color:var(--bk-primary,#327746);font-size:.75rem;font-weight:700}
 .home-training-detail{border-top:1px solid var(--bk-line,#d1d3d4);padding-top:.85rem;margin-top:.85rem}.home-training-meta{color:var(--bk-muted,#4b6e61);margin:.4rem 0}
 .home-training-manage{width:100%;margin-top:.75rem;font-size:.8rem!important}.home-training-picker [role="alert"]{color:#a02220}
 </style><section class="home-training-picker" role="dialog" aria-modal="true" aria-labelledby="home-training-title"><header><h3 id="home-training-title"><i class="fas fa-dumbbell" aria-hidden="true"></i> Meu treino</h3><button type="button" data-training-close aria-label="Fechar">×</button></header><div data-training-picker-body></div></section>`;
 document.body.appendChild(overlay);
 const body=overlay.querySelector('[data-training-picker-body]');
 let profiles=[],profile=null,rows=[],selected=null,groupId=null,loading=true,error='',version=0;
 const close=()=>{version++;overlay.remove();};
 const current=()=>rows.find(row=>row.id===selected);
 function paint(){
  if(!overlay.isConnected)return;
  const row=current(),group=row?.grupos.find(item=>item.id===groupId);
  body.innerHTML=`
   ${profiles.length?`<label>Perfil<select data-home-training-profile aria-label="Perfil">${profiles.map(item=>`<option value="${escape(item.id)}"${Number(item.id)===Number(profile?.id)?' selected':''}>${escape(item.nome)}</option>`).join('')}</select></label>`:''}
   ${loading?'<p role="status">Carregando treino…</p>':error?`<p role="alert">${escape(error)}</p><button type="button" data-training-retry>Tentar novamente</button>`:!profile?'<p>Crie um perfil em Saúde para consultar seus treinos.</p>':!rows.length?'<p>Este perfil ainda não tem treinos cadastrados.</p>':`
    ${rows.length>1?`<label>Treino<select data-home-training-workout aria-label="Treino">${rows.map(item=>`<option value="${escape(item.id)}"${item.id===selected?' selected':''}>${escape(item.nome)}</option>`).join('')}</select></label>`:''}
    <div class="home-training-detail"><h3>${escape(row.nome)}</h3><p class="home-training-meta">${TRAINING_TYPES[row.tipo]}</p>
    ${row.tipo!=='full_body'?`<div class="home-training-tabs" aria-label="Divisões do treino">${row.grupos.map(item=>`<button type="button" data-home-training-group="${escape(item.id)}" aria-pressed="${item.id===groupId}">${escape(row.tipo==='abc'?`${item.id} · ${item.nome}`:item.nome)}</button>`).join('')}</div>`:''}
    <p class="home-training-meta">${escape(group?.nome||'Exercícios')} · ${group?.exercicios.length||0} ${(group?.exercicios.length||0)===1?'exercício':'exercícios'}</p>
    ${group?.exercicios.length?`<ol class="home-training-list">${group.exercicios.map((item,index)=>`<li><span class="number" aria-hidden="true">${index+1}</span><span>${escape(item.nome)}</span></li>`).join('')}</ol>`:'<p>Nenhum exercício nesta lista.</p>'}</div>`}
   ${typeof launchSaude==='function'&&!loading?'<button type="button" class="home-training-manage" data-training-open-saude>Gerenciar em Saúde</button>':''}`;
 }
 async function loadProfile(next){
  const request=++version;profile=next;rows=[];selected=null;groupId=null;error='';loading=true;paint();
  try{
   const loaded=await createTrainingRepository(next).load();
   if(request!==version||!overlay.isConnected)return;
   rows=loaded;const remembered=read(workoutKey(next.id));selected=rows.find(row=>row.id===remembered)?.id||rows[0]?.id||null;
   groupId=current()?initialGroup(current())?.id:null;write(HOME_TRAINING_PROFILE_KEY,next.id);
  }catch(cause){if(request===version)error=cause.message||'Não foi possível consultar os treinos.';}
  finally{if(request===version){loading=false;paint();}}
 }
 async function loadProfiles(){
  const request=++version;loading=true;error='';paint();
  try{
   const response=await fetch('/api/saude?resource=perfis',{cache:'no-store'});
   const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||'Não foi possível carregar os perfis.');
   if(request!==version||!overlay.isConnected)return;profiles=Array.isArray(data.rows)?data.rows:[];
   const next=initialTrainingProfile(profiles);
   if(next){await loadProfile(next);return;}
   profile=null;loading=false;paint();
  }catch(cause){if(request===version){error=cause.message;loading=false;paint();}}
 }
 overlay.addEventListener('click',event=>{
  if(event.target===overlay||event.target.closest('[data-training-close]'))return close();
  if(event.target.closest('[data-training-retry]'))return void (profile?loadProfile(profile):loadProfiles());
  if(event.target.closest('[data-training-open-saude]')){const id=profile?.id;close();return launchSaude?.(id?{profileId:Number(id),screen:'treinos'}:null);}
  const control=event.target.closest('[data-home-training-group]');
  if(!loading&&current()?.grupos.some(group=>group.id===control?.dataset.homeTrainingGroup)){groupId=control.dataset.homeTrainingGroup;paint();}
 });
 overlay.addEventListener('change',event=>{
  const pick=event.target.closest('[data-home-training-profile]');
  if(pick){const next=profiles.find(row=>Number(row.id)===Number(pick.value));if(next)void loadProfile(next);return;}
  const workout=event.target.closest('[data-home-training-workout]');
  if(!loading&&workout&&rows.some(row=>row.id===workout.value)){selected=workout.value;groupId=initialGroup(current())?.id;write(workoutKey(profile.id),selected);paint();}
 });
 overlay.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
 overlay.querySelector('[data-training-close]').focus();
 await loadProfiles();
}
