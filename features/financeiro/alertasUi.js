import { showAppConfirmation } from '../../lib/uiConfirmation.js';
import { validateAlert, alertOccurrences, parseCron, FINANCIAL_ALERT_SECTIONS, FINANCIAL_ALERT_INTRO, FINANCIAL_ALERT_DESCRIPTIONS } from './service/alertSchedule.js';
const endpoint = '/api/financeiro?recurso=alertas';

export async function renderFinanceAlerts(host) {
  if (!document.querySelector('link[data-finance-alerts]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '/features/financeiro/alertas.css'; link.dataset.financeAlerts = 'true'; document.head.append(link);
  }
  host.className = 'fin-alerts';
  host.innerHTML = `<div class="fin-alerts-head"><h3>Alertas do Financeiro</h3><button type="button" class="fin-btn fin-btn--ghost" data-add>Novo alerta</button></div>
    <p class="fin-alerts-note">Sua grana no radar 💸 Escolha o módulo e os horários; o bot manda o resumo.</p>
    <p data-notice role="status" aria-live="polite">Carregando alertas…</p><div data-new-editor></div><ul class="fin-alerts-list"></ul>
    <form hidden class="fin-alerts-form">
      <label>O que você quer acompanhar?<select name="tipo" required><option value="">Selecione um módulo</option>${Object.entries(FINANCIAL_ALERT_SECTIONS).map(([value,label]) => `<option value="${value}">${value === 'geral' ? 'Geral · resumo de tudo' : label}</option>`).join('')}</select></label>
      <div><span class="fin-alerts-label">Horários do dia</span><div data-times class="fin-alerts-times"></div><button class="fin-btn fin-btn--ghost" type="button" data-add-time>Adicionar horário</button></div>
      <p class="fin-alerts-note">Todos os dias, no horário de Brasília. Geral reúne extrato, despesas fixas, receitas, poupança e metas do simulador.</p>
      <div class="fin-alerts-message"><strong>Mensagem padrão do bot</strong><p data-message-preview role="status" aria-live="polite"></p></div>
      <p data-preview role="status" aria-live="polite"></p>
      <label class="fin-alerts-active"><input type="checkbox" name="ativo" checked> Ativo</label>
      <div class="fin-alerts-actions"><button class="fin-btn" type="submit">Salvar alerta</button><button class="fin-btn fin-btn--ghost" type="button" data-cancel>Cancelar</button></div>
    </form>
    <p class="fin-alerts-note">O bot verifica os agendamentos periodicamente; pode haver atraso no envio. Funciona com o app fechado.</p>`;
  const form = host.querySelector('form'), list = host.querySelector('ul'), notice = host.querySelector('[data-notice]'), preview = host.querySelector('[data-preview]');
  const add = host.querySelector('[data-add]'), timesHost = host.querySelector('[data-times]');
  const newEditor = host.querySelector('[data-new-editor]');
  form.id = `fin-alerts-editor-${crypto.randomUUID()}`;
  newEditor.append(form);
  add.setAttribute('aria-controls',form.id); add.setAttribute('aria-expanded','false');
  let rows = [], editing = null, busy = false, editorButton = null;
  function closeEditor({ restoreFocus = false } = {}) {
    const previousButton = editorButton;
    form.hidden = true; newEditor.append(form);
    previousButton?.setAttribute('aria-expanded','false');
    editorButton = null; editing = null;
    if (restoreFocus && previousButton?.isConnected) previousButton.focus({preventScroll:true});
  }
  const fmt = iso => new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(iso));
  const times = () => [...timesHost.querySelectorAll('input')].map(input => input.value);
  function button(text, handler) {
    const result = document.createElement('button'); result.type = 'button'; result.className = 'fin-btn fin-btn--ghost'; result.textContent = text; result.addEventListener('click', handler); return result;
  }
  function updatePreview() {
    const section = form.elements.tipo.value;
    host.querySelector('[data-message-preview]').textContent = Object.hasOwn(FINANCIAL_ALERT_SECTIONS, section)
      ? `${FINANCIAL_ALERT_INTRO}\nResumo · ${FINANCIAL_ALERT_SECTIONS[section]}\n${FINANCIAL_ALERT_DESCRIPTIONS[section]} Os valores são atualizados na hora do envio.`
      : 'Escolha um módulo para ver o que vai chegar no Telegram.';
    try {
      const payload = validateAlert({tipo:form.elements.tipo.value,horarios:times(),ativo:form.elements.ativo.checked});
      preview.textContent = 'Próximos envios: ' + alertOccurrences(payload,new Date(),{future:true}).map(fmt).join(' · ');
    } catch { preview.textContent = 'Selecione o módulo e preencha os horários desejados.'; }
  }
  function renderTimes(values) {
    timesHost.replaceChildren();
    values.forEach((value,index) => {
      const row = document.createElement('div'); row.className = 'fin-alerts-time';
      const label = document.createElement('label'); label.textContent = `Horário ${index+1}`;
      const input = document.createElement('input'); input.type = 'time'; input.required = true; input.name = 'horario'; input.value = value; input.addEventListener('input',updatePreview); label.append(input);
      const remove = button('Remover',() => { const remaining = times().filter((_,i) => i !== index); renderTimes(remaining.length ? remaining : ['']); updatePreview(); });
      remove.setAttribute('aria-label',`Remover horário ${index+1}`); row.append(label,remove); timesHost.append(row);
    });
    host.querySelector('[data-add-time]').disabled = values.length >= 12;
  }
  async function api(method = 'GET',body) {
    const response = await fetch(endpoint,{method,cache:'no-store',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
    const data = await response.json(); if(!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.'); return data;
  }
  async function mutate(method,payload) {
    if(busy) return;
    busy = true; add.disabled = true; form.querySelectorAll('button').forEach(button => button.disabled = true); list.querySelectorAll('button').forEach(button => button.disabled = true);
    try { await api(method,payload); closeEditor(); await load(); showAppConfirmation(host.dataset.demo === 'true' ? 'Alerta salvo no modo local.' : 'Alerta atualizado.'); }
    catch(error) { notice.textContent = error.message; }
    finally { busy = false; add.disabled = false; form.querySelectorAll('button').forEach(button => button.disabled = false); list.querySelectorAll('button').forEach(button => button.disabled = false); }
  }
  function open(row = null, item = null, trigger = add) {
    if (busy) return;
    if (!form.hidden && editorButton === trigger) { closeEditor({restoreFocus:true}); return; }
    closeEditor();
    if (item) item.append(form);
    editorButton = trigger; trigger.setAttribute('aria-expanded','true');
    editing = row?.id || null; form.reset(); form.hidden = false; notice.textContent = '';
    form.elements.tipo.value = row ? (Object.hasOwn(FINANCIAL_ALERT_SECTIONS,row.tipo) ? row.tipo : 'geral') : '';
    form.elements.ativo.checked = row?.ativo ?? true;
    let values = row?.horarios || [''];
    if(row && row.horarios == null) {
      try { const parsed = parseCron(row.cron); values = [...parsed.sets[1]].sort((a,b)=>a-b).flatMap(hour => [...parsed.sets[0]].sort((a,b)=>a-b).map(minute => `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`)).slice(0,12); } catch { values = ['']; }
      notice.textContent = 'Ao salvar, este alerta passa a enviar um resumo padrão todos os dias nos horários escolhidos.';
    }
    renderTimes(values); updatePreview(); form.elements.tipo.focus({preventScroll:true});
  }
  async function load() {
    try {
      const data = await api(); if(!host.isConnected) return;
      rows = data.rows || []; host.dataset.demo = String(Boolean(data.demo));
      notice.textContent = data.aviso || (!data.configurado ? 'Agendador desativado: confira a configuração do bot no servidor.' : '');
      add.disabled = data.persistencia === false && !data.demo; closeEditor(); list.replaceChildren();
      if(!rows.length) { const empty = document.createElement('li'); empty.textContent = 'Nenhum alerta criado.'; list.append(empty); }
      for(const row of rows) {
        const item = document.createElement('li'), title = document.createElement('strong'), desc = document.createElement('p'), next = document.createElement('p'), actions = document.createElement('div');
        title.textContent = FINANCIAL_ALERT_SECTIONS[row.tipo] || row.nome;
        const header = document.createElement('div'); header.className = 'fin-alerts-row-head';
        const toggle = button('',() => mutate('PATCH',{...row,ativo:!row.ativo}));
        toggle.className = 'fin-alerts-switch';
        toggle.setAttribute('role','switch'); toggle.setAttribute('aria-checked',String(row.ativo));
        toggle.setAttribute('aria-label',`Alerta de ${title.textContent}`);
        const track = document.createElement('span'); track.className = 'fin-alerts-switch-track'; track.setAttribute('aria-hidden','true');
        const state = document.createElement('span'); state.textContent = `Alerta ${row.ativo ? 'Ligado' : 'Desligado'}`;
        toggle.append(track,state); header.append(title,toggle);
        desc.textContent = `${row.ativo ? 'Ativo' : 'Pausado'} · ${row.horarios ? 'Todos os dias às ' + row.horarios.join(' · ') : 'Agendamento anterior'}`;
        try { const dates = alertOccurrences(row,new Date(),{future:true,count:1}); next.textContent = row.ativo && dates.length ? 'Próximo: ' + fmt(dates[0]) : ''; } catch { next.textContent = 'Revise os horários deste alerta.'; }
        actions.className = 'fin-alerts-actions';
        const edit = button('Editar',() => open(row,item,edit));
        edit.setAttribute('aria-controls',form.id); edit.setAttribute('aria-expanded','false');
        actions.append(edit,button('Excluir',() => {
          closeEditor();
          actions.replaceChildren(); const prompt = document.createElement('span'); prompt.textContent = 'Excluir este alerta?'; actions.append(prompt,button('Confirmar exclusão',() => mutate('DELETE',{id:row.id})),button('Cancelar',load));
        })); item.append(header,desc,next,actions); list.append(item);
      }
    } catch(error) { notice.textContent = error.message; add.disabled = true; notice.append(button('Tentar novamente',load)); }
  }
  add.addEventListener('click',() => open()); host.querySelector('[data-cancel]').addEventListener('click',() => closeEditor({restoreFocus:true}));
  host.querySelector('[data-add-time]').addEventListener('click',() => { if(times().length < 12) { renderTimes([...times(),'']); updatePreview(); } });
  form.elements.tipo.addEventListener('change',updatePreview);
  form.addEventListener('submit',event => {
    event.preventDefault(); if(busy || !form.reportValidity()) return;
    try { const payload = validateAlert({tipo:form.elements.tipo.value,horarios:times(),ativo:form.elements.ativo.checked}); mutate(editing ? 'PATCH' : 'POST',{...payload,...(editing ? {id:editing} : {})}); }
    catch(error) { notice.textContent = error.message; }
  });
  await load();
}
