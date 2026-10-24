import crypto from 'node:crypto';
import { requireUser } from './auth.js';
import { supabase } from './supabase.js';
import { validateAlert, alertOccurrences } from '../features/financeiro/service/alertSchedule.js';
const table = 'tb_financeiro_alertas';
const columns = 'id,nome,tipo,mensagem,cron,horarios,timezone,ativo,created_at,updated_at';
const mock = new Map();
const missing = error => ['42P01','PGRST205','42703','PGRST204'].includes(error?.code);
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  const send = (status,body) => res.status(status).json(body);
  try {
    const auth = await requireUser(req,{appId:'financeiro'});
    if (!auth.ok) return send(auth.status,auth.data);
    const demo = process.env.OFFLINE_DEV==='true' || process.env.NODE_ENV==='test';
    const userId = auth.user.id, owner = process.env.SAUDE_ALERTS_OWNER_USER_ID;
    // O gateway tem um único chat, nunca encaminhar finanças de outro usuário a ele.
    if (!demo && userId !== owner) return send(403,{error:'O bot atual está vinculado a outra conta ou ainda não possui proprietário configurado.'});
    if (req.method==='GET') {
      let rows;
      if (demo) rows = mock.get(userId) || [];
      else {
        const result = await supabase.from(table).select(columns).eq('user_id',userId).order('created_at',{ascending:false}).limit(50);
        if (missing(result.error)) return send(200,{rows:[],persistencia:false,aviso:'Aplique a migration de alertas financeiros para habilitar o agendamento.'});
        if (result.error) return send(500,{error:'Não foi possível carregar os alertas.'});
        rows = result.data || [];
      }
      return send(200,{rows,persistencia:!demo,demo,configurado:demo || process.env.SAUDE_ALERTS_ENABLED==='true',aviso:demo?'Modo local: regras em memória; nenhum Telegram enviado.':null});
    }
    if (!['POST','PATCH','DELETE'].includes(req.method)) { res.setHeader('Allow','GET, POST, PATCH, DELETE'); return send(405,{error:'Método não permitido.'}); }
    let body;
    try { body = typeof req.body==='string' ? JSON.parse(req.body) : req.body || {}; } catch { return send(400,{error:'JSON inválido.'}); }
    if (req.method !== 'POST' && !/^[0-9a-f-]{36}$/i.test(String(body.id || ''))) return send(400,{error:'Alerta inválido.'});
    let payload;
    if (req.method!=='DELETE') {
      try {
        payload = validateAlert(body);
        if (!alertOccurrences(payload,new Date(),{future:true}).length) throw new Error('Esse cron não tem uma ocorrência válida nos próximos cinco anos.');
      } catch(error) { return send(400,{error:error.message}); }
    }
    if (demo) {
      const rows = mock.get(userId) || [], index = rows.findIndex(r => r.id === body.id);
      if (req.method!=='POST' && index<0) return send(404,{error:'Alerta não encontrado.'});
      if (req.method==='POST') {
        if (rows.length >= 50) return send(400,{error:'Limite de 50 alertas.'});
        rows.unshift({id:crypto.randomUUID(),...payload,created_at:new Date().toISOString()});
      } else if (req.method==='PATCH') rows[index] = {...rows[index],...payload,updated_at:new Date().toISOString()};
      else rows.splice(index,1);
      mock.set(userId,rows); return send(req.method==='POST'?201:200,{ok:true,demo:true});
    }
    let result;
    if (req.method==='POST') result = await supabase.from(table).insert({...payload,user_id:userId}).select('id').single();
    else if (req.method==='PATCH') result = await supabase.from(table).update({...payload,updated_at:new Date().toISOString()}).eq('user_id',userId).eq('id',body.id).select('id').maybeSingle();
    else result = await supabase.from(table).delete().eq('user_id',userId).eq('id',body.id).select('id').maybeSingle();
    if (result.error) return send(missing(result.error)?503:result.error.code==='23514'?400:500,{error:missing(result.error)?'A migration de alertas ainda não foi aplicada.':result.error.code==='23514'?'Limite de alertas ou dados inválidos.':'Não foi possível salvar a alteração.'});
    if (!result.data) return send(404,{error:'Alerta não encontrado.'});
    return send(req.method==='POST'?201:200,{ok:true});
  } catch { return send(500,{error:'Não foi possível processar os alertas.'}); }
}
