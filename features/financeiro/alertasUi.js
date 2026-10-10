import { validateAlert, nextOccurrences } from './service/alertSchedule.js';
const endpoint = '/api/financeiro?recurso=alertas';
const types = {diario:'Gastos do dia · débito/Pix',fixas:'Despesas fixas · pagas e pendentes',mensal:'Receitas, despesas e saldo do mês',mensagem:'Mensagem personalizada'};
export async function renderFinanceAlerts(host) {
  if (!document.querySelector('link[data-finance-alerts]')) {
    const link=document.createElement('link');link.rel='stylesheet';link.href='/features/financeiro/alertas.css';link.dataset.financeAlerts='true';document.head.append(link);
  }
  host.className='fin-alerts';
  host.innerHTML=`<div class="fin-alerts-head"><h3>Alertas do Financeiro</h3><button type="button" class="fin-btn fin-btn--ghost" data-add>Novo alerta</button></div>
    <p class="fin-alerts-note">Agendamentos do seu bot · horário de Brasília</p>
    <p data-notice role="status" aria-live="polite">Carregando alertas…</p><ul class="fin-alerts-list"></ul>
    <form hidden class="fin-alerts-form">
      <label>Nome do alerta<input name="nome" required maxlength="120" placeholder="Ex.: resumo no fim do dia"></label>
      <label>Conteúdo<select name="tipo">${Object.entries(types).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label>
      <label>Mensagem <span>(opcional para resumos)</span><textarea name="mensagem" rows="2" maxlength="1500" placeholder="Seu texto para o bot"></textarea></label>
      <label>Frequência<select data-preset><option value="0 20 * * *">Todos os dias às 20h</option><option value="0 9 * * 1-5">Dias úteis às 9h</option><option value="0 9 * * 1">Toda segunda às 9h</option><option value="0 9 1 * *">Dia 1 às 9h</option><option value="custom">Cron personalizado</option></select></label>
      <label>Expressão cron<input name="cron" required maxlength="120" value="0 20 * * *" spellcheck="false"></label>
      <p class="fin-alerts-note">Minuto · hora · dia do mês · mês · dia da semana (0 = domingo). Ex.: 0 13,20 * * *.</p>
      <p data-preview role="status" aria-live="polite"></p>
      <label class="fin-alerts-active"><input type="checkbox" name="ativo" checked> Ativo</label>
      <div class="fin-alerts-actions"><button class="fin-btn" type="submit">Salvar alerta</button><button class="fin-btn fin-btn--ghost" type="button" data-cancel>Cancelar</button></div>
    </form>
    <p class="fin-alerts-note">Execução verificada pelo servidor a cada 5 minutos, sujeita a atrasos. Agendamentos salvos continuam com o app fechado.</p>`;
  const form=host.querySelector('form'), list=host.querySelector('ul'), notice=host.querySelector('[data-notice]'), preview=host.querySelector('[data-preview]');
  const add=host.querySelector('[data-add]');let rows=[],editing=null,busy=false;
  const fmt=iso=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(iso));
  async function api(method='GET',body) {
    const response=await fetch(endpoint,{method,cache:'no-store',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
    const data=await response.json();if(!response.ok)throw new Error(data.error || 'Não foi possível concluir a operação.');return data;
  }
  function button(text,handler) { const b=document.createElement('button');b.type='button';b.className='fin-btn fin-btn--ghost';b.textContent=text;b.addEventListener('click',handler);return b; }
  async function mutate(method,payload) {
    if(busy)return;busy=true;add.disabled=true;form.querySelector('[type=submit]').disabled=true;
    list.querySelectorAll('button').forEach(b=>b.disabled=true);
    try { await api(method,payload);form.hidden=true;await load();notice.textContent='Alteração salva.'+(host.dataset.demo==='true'?' Apenas em memória neste modo local.':''); }
    catch(error){notice.textContent=error.message;}
    finally {busy=false;add.disabled=false;form.querySelector('[type=submit]').disabled=false;list.querySelectorAll('button').forEach(b=>b.disabled=false);}
  }
  function updatePreview() {
    try {
      const dates=nextOccurrences(form.elements.cron.value);
      preview.textContent=dates.length?'Próximos horários: '+dates.map(fmt).join(' · '):'Nenhuma ocorrência nos próximos cinco anos.';
    } catch(error) {preview.textContent=error.message;}
  }
  function open(row=null) {
    editing=row?.id || null;form.reset();form.hidden=false;
    for(const key of ['nome','tipo','mensagem','cron']) if(row)form.elements[key].value=row[key];
    if(row)form.elements.ativo.checked=row.ativo;
    const preset=host.querySelector('[data-preset]');
    preset.value=[...preset.options].some(o=>o.value===form.elements.cron.value)?form.elements.cron.value:'custom';
    updatePreview();form.elements.nome.focus();
  }
  async function load() {
    try {
      const data=await api();if(!host.isConnected)return;
      rows=data.rows || [];host.dataset.demo=String(Boolean(data.demo));
      notice.textContent=data.aviso || (!data.configurado?'Agendador desativado: confira a configuração do bot no servidor.':'');
      add.disabled=data.persistencia===false && !data.demo;
      list.replaceChildren();
      if(!rows.length){const li=document.createElement('li');li.textContent='Nenhum alerta criado.';list.append(li);}
      for(const row of rows) {
        const li=document.createElement('li'),title=document.createElement('strong'),desc=document.createElement('p'),next=document.createElement('p'),actions=document.createElement('div');
        title.textContent=row.nome;desc.textContent=`${row.ativo?'Ativo':'Pausado'} · ${types[row.tipo]} · ${row.cron}`;
        try {const dates=nextOccurrences(row.cron,new Date(),1);next.textContent=row.ativo&&dates.length?'Próximo: '+fmt(dates[0]):'';}catch{next.textContent='Revise a expressão cron.';}
        actions.className='fin-alerts-actions';
        actions.append(button('Editar',()=>open(row)),button(row.ativo?'Pausar':'Ativar',()=>mutate('PATCH',{...row,ativo:!row.ativo})),button('Excluir',()=>{
          actions.replaceChildren();const prompt=document.createElement('span');prompt.textContent='Excluir este alerta?';actions.append(prompt,button('Confirmar exclusão',()=>mutate('DELETE',{id:row.id})),button('Cancelar',load));
        }));li.append(title,desc,next,actions);list.append(li);
      }
    } catch(error) {notice.textContent=error.message;add.disabled=true;notice.append(button('Tentar novamente',load));}
  }
  add.addEventListener('click',()=>open());host.querySelector('[data-cancel]').addEventListener('click',()=>form.hidden=true);
  form.elements.cron.addEventListener('input',()=>{host.querySelector('[data-preset]').value='custom';updatePreview();});
  host.querySelector('[data-preset]').addEventListener('change',event=>{if(event.target.value!=='custom'){form.elements.cron.value=event.target.value;updatePreview();}});
  form.addEventListener('submit',event=>{
    event.preventDefault();
    try {const payload=validateAlert({nome:form.elements.nome.value,tipo:form.elements.tipo.value,mensagem:form.elements.mensagem.value,cron:form.elements.cron.value,ativo:form.elements.ativo.checked});mutate(editing?'PATCH':'POST',{...payload,...(editing?{id:editing}:{})});}
    catch(error){notice.textContent=error.message;}
  });
  await load();
}
