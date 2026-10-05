import crypto from 'node:crypto';
import { DIET_MEALS } from '../features/saude/service/dietasService.js';
const OWNER='f88a6351-317d-425b-afcd-9430c8a34f53';
const send=(res,status,data)=>res.status(status).json(data);
export function createLocalMockHandler(apps){
  const users=[
    {id:OWNER,name:'Administrador Mock',email:'admin@example.invalid',is_admin:true,is_banned:false,permissions:[],created_at:new Date().toISOString()},
    {id:'00000000-0000-4000-8000-000000000002',name:'Usuário Mock',email:'usuario@example.invalid',is_admin:false,is_banned:false,permissions:['saude'],created_at:new Date().toISOString()},
  ];
  let projects=[{id:1,nome:'Fluxograma Mock',dados:{nodes:[],edges:[]},created_at:new Date().toISOString(),updated_at:new Date().toISOString()}];
  let nextProject=2;
  return(req,res,next)=>{
    if(process.env.OFFLINE_DEV!=='true'||process.env.LOCAL_DATA_MODE!=='mock')return next();
    const endpoint=req.path.replace(/^\/api\//,'').replace(/\/$/,'');
    if(['saude-alertas-cron','telegram-alert'].includes(endpoint))return send(res,503,{error:'Envio externo desativado no modo mock. Use o teste manual explícito.'});
    if(endpoint==='admin/usuarios'){
      res.setHeader('Cache-Control','no-store');
      if(req.method==='HEAD')return res.status(204).end();
      if(req.method==='GET')return send(res,200,{apps:apps.map(({id,title})=>({id,title})),restricted_apps:[],users});
      const body=req.body||{};
      if(req.method==='POST'){
        if(!String(body.name||'').trim()||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email||'')))return send(res,400,{error:'Nome ou email inválido.'});
        if(users.some(user=>user.email===body.email))return send(res,409,{error:'Email já cadastrado.'});
        const id=crypto.randomUUID();users.push({id,name:body.name,email:body.email,is_admin:false,is_banned:false,permissions:[],created_at:new Date().toISOString()});
        return send(res,201,{ok:true,user_id:id,temporary_password:'SENHA-MOCK-SEM-VALIDADE'});
      }
      if(req.method==='PATCH'){
        const user=users.find(row=>row.id===body.user_id);
        if(!user||user.is_admin)return send(res,400,{error:'Usuário inválido ou protegido.'});
        if(body.action==='reset_password')return send(res,200,{ok:true,temporary_password:'SENHA-MOCK-SEM-VALIDADE'});
        if(body.action==='status'){
          if(typeof body.blocked!=='boolean')return send(res,400,{error:'Status inválido.'});
          user.is_banned=body.blocked;return send(res,200,{ok:true,is_banned:user.is_banned});
        }
        if(!apps.some(app=>app.id===body.app_id)||typeof body.can_access!=='boolean')return send(res,400,{error:'Permissão inválida.'});
        user.permissions=user.permissions.filter(id=>id!==body.app_id);if(body.can_access)user.permissions.push(body.app_id);
        return send(res,200,{ok:true});
      }
      return send(res,405,{error:'Method Not Allowed'});
    }
    if(endpoint==='fluxograma'){
      if(req.query.health==='1')return send(res,200,{ok:true,service:'fluxograma',storage:'memory'});
      const body=req.body||{},id=Number(body.id??req.query.id),project=projects.find(row=>row.id===id);
      if(req.method==='GET')return req.query.id?(project?send(res,200,{project}):send(res,404,{error:'Projeto não encontrado'})):send(res,200,{projects});
      if(req.method==='POST'){
        const row={id:nextProject++,nome:String(body.nome||'Novo Fluxograma'),dados:body.dados||{},created_at:new Date().toISOString(),updated_at:new Date().toISOString()};projects.push(row);return send(res,201,row);
      }
      if(!project)return send(res,404,{error:'Projeto não encontrado'});
      if(req.method==='PATCH'){
        if(body.nome!==undefined)project.nome=String(body.nome);if(body.dados!==undefined)project.dados=body.dados;
        project.updated_at=new Date().toISOString();return send(res,200,project);
      }
      if(req.method==='DELETE'){projects=projects.filter(row=>row.id!==id);return send(res,200,{ok:true});}
      return send(res,405,{error:'Method Not Allowed'});
    }
    next();
  };
}
export async function seedLocalSaude(){
  if(process.env.OFFLINE_DEV!=='true'||process.env.LOCAL_DATA_MODE!=='mock')return;
  const {default:handler}=await import('../api/saude.js');
  async function call(resource,body){
    const res={code:200,body:null,setHeader(){},status(code){this.code=code;return this;},end(text){this.body=JSON.parse(text);}};
    await handler({method:'POST',query:{resource},body},res);
    if(res.code>=400)throw new Error(`Seed mock ${resource}: ${res.body.error}`);return res.body;
  }
  const profile=await call('perfis',{nome:'Perfil Mock',sexo:'nao_informado',data_nascimento:'1990-01-01',data_medicao:new Date().toISOString().slice(0,10),peso_kg:75,altura_cm:175});
  const diet=await call('dietas',{perfil_id:profile.row.id,titulo:'Dieta Mock',meta_calorias:2000,refeicoes:DIET_MEALS.map(meal=>({tipo:meal.tipo,itens:[{nome:'Alimento de demonstração',quantidade:'1 porção',calorias:300,observacao:''}]}))});
  await call('consumo-agua',{profile_id:profile.row.id,nome:'Copo Mock',meta_doses:8});
  await call('alertas-agenda',{profile_id:profile.row.id,agua_ativo:true,agua_intervalo_horas:3,dieta_ativa:true,dieta_id:diet.row.id});
}
