import {trainingGroups} from '../features/treino/localStore.js';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function json(res,status,data){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');return res.status(status).end(JSON.stringify(data));}
export function validateTrainingPayload(body){
 if(!UUID.test(body?.id||''))throw Error('Treino inválido.');
 const nome=String(body.nome||'').trim();if(!nome||nome.length>80)throw Error('Informe um nome de treino com até 80 caracteres.');
 const expected=trainingGroups(body.tipo),ids=new Set();
 if(!Array.isArray(body.grupos)||body.grupos.length!==expected.length)throw Error('As divisões não correspondem ao formato do treino.');
 const grupos=body.grupos.map((group,index)=>{
  if(group.id!==expected[index].id)throw Error('Divisão de treino inválida.');
  const name=String(group.nome||'').trim();
  if(!name||name.length>80||(body.tipo!=='abc'&&name!==expected[index].nome))throw Error('Nome da divisão inválido.');
  if(!Array.isArray(group.exercicios)||group.exercicios.length>200)throw Error('Lista de exercícios inválida.');
  return {id:group.id,nome:name,exercicios:group.exercicios.map(item=>{
   const text=String(item.nome||'').trim();
   if(!UUID.test(item.id||'')||ids.has(item.id.toLowerCase())||!text||text.length>120)throw Error('Exercício inválido ou repetido.');
   ids.add(item.id.toLowerCase());return {id:item.id,nome:text};
  })};
 });
 return {id:body.id,nome,tipo:body.tipo,grupos};
}
export async function saudeTreinosHandler(req,res,{auth,resolveOwner,client}){
 if(!['GET','POST','PATCH','DELETE'].includes(req.method)){res.setHeader('Allow','GET, POST, PATCH, DELETE');return json(res,405,{error:'Método não permitido.'});}
 const profileId=Number(req.query?.profile_id);
 if(!Number.isSafeInteger(profileId)||profileId<=0)return json(res,400,{error:'Perfil inválido.'});
 const owner=await resolveOwner(auth.user.id,profileId,auth.isAdmin);
 if(owner.error)return json(res,500,{error:'Não foi possível consultar o perfil.'});
 if(!owner.userId)return json(res,404,{error:'Perfil indisponível.'});
 let payload=null,expected=null;
 if(req.method!=='GET')try{
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(req.method==='DELETE'){
   if(!UUID.test(body?.id||''))throw Error('Treino inválido.');payload={id:body.id};
  }else payload=validateTrainingPayload(body);
  if(req.method!=='POST'){
   if(typeof body.updated_at!=='string'||!Number.isFinite(Date.parse(body.updated_at)))throw Error('Atualize os treinos antes de salvar.');
   expected=body.updated_at;
  }
 }catch(cause){return json(res,400,{error:cause.message||'Dados inválidos.'});}
 try{
  client ||= (await import('./supabase.js')).supabase;
  const {data,error}=await client.rpc('saude_manage_treinos',{
   p_owner:owner.userId,p_profile:profileId,p_action:req.method==='GET'?'list':req.method==='DELETE'?'delete':'save',p_workout:payload,p_expected:expected,
  });
  if(error){
   if(['42P01','42883','PGRST202','PGRST205'].includes(error.code))return json(res,503,{error:'Aplique as migrations de cadastro e API de treinos no Supabase para habilitar o módulo.'});
   if(/training_conflict/.test(error.message||''))return json(res,409,{error:'Este treino foi alterado em outra sessão. Atualize os treinos antes de salvar.'});
   if(/training_not_found/.test(error.message||''))return json(res,404,{error:'Treino indisponível. Atualize a lista.'});
   if(/training_forbidden/.test(error.message||''))return json(res,403,{error:'Você não pode acessar os treinos deste perfil.'});
   if(/training_invalid/.test(error.message||''))return json(res,400,{error:'Dados do treino inválidos.'});
   return json(res,500,{error:'Não foi possível salvar os treinos. Tente novamente.'});
  }
  return json(res,200,{...data,storage:'supabase'});
 }catch{return json(res,500,{error:'Não foi possível acessar os treinos. Tente novamente.'});}
}
