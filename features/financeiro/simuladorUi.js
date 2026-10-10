const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = value => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = value => value == null ? 'Não se aplica' : `${Number(value).toLocaleString('pt-BR')}%`;
const month = value => new Date(`${value}-01T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' });
const signed = value => `<span class="${value < 0 ? 'sim-neg' : 'sim-positive'}">${money(value)}</span>`;
const currencyFields = ['preco', 'entrada', 'parcela'];
export const formatMoneyValue = value => Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function maskMoneyInput(value) {
  const digits = String(value).replace(/\D/g, '');
  return digits ? formatMoneyValue(Number(digits) / 100) : '';
}
export function parseMoneyInput(value) {
  if (value === '') return 0;
  if (!/^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(String(value))) throw new Error('Informe os valores monetários no formato brasileiro.');
  return Number(String(value).replace(/\./g, '').replace(',', '.'));
}
export async function renderSimulador(el, { onBack = () => {} } = {}) {
  if (!document.querySelector('link[href*="/styles/bank-theme.css"]')) {
    const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/styles/bank-theme.css'; document.head.append(style);
  }
  if (!document.querySelector('[data-simulador-style]')) {
    const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = '/features/financeiro/simulador.css'; style.dataset.simuladorStyle = '1'; document.head.append(style);
  }
  el.innerHTML = `<section class="finance-module-shell fin-bank">
    <header class="fin-topbar"><div class="fin-topbar__inner"><button type="button" class="fin-back" data-sim-back aria-label="Voltar"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7"/></svg></button><h2 class="fin-topbar__title">Simulador</h2></div></header>
    <div class="sim-shell">
    <div data-sim-banner></div>
    <div class="sim-layout"><aside><form class="sim-card sim-form"><h3>Simular compra</h3>
      <label>Nome da meta<input name="nome" maxlength="120" required></label>
      <div class="sim-row"><label>Preço à vista (R$)<input name="preco" type="text" inputmode="numeric" maxlength="18" required></label><label>Entrada (R$)<input name="entrada" type="text" inputmode="numeric" maxlength="18"></label></div>
      <div class="sim-row"><label>Parcelas<input name="parcelas" type="number" inputmode="numeric" min="1" max="600" required></label><label>Parcela (R$)<input name="parcela" type="text" inputmode="numeric" maxlength="18" required></label></div>
      <div class="sim-row"><label>Histórico<select name="historico"><option value="6">6 meses</option><option value="12">12 meses</option><option value="all">Todo</option></select></label><label>Projeção<select name="horizonte"><option value="6">6 meses</option><option value="12">12 meses</option></select></label></div>
      <p class="sim-note">Parcelas mensais a partir do próximo mês.</p>
      <div class="sim-actions"><button class="sim-primary" type="submit">Simular</button><button type="button" data-sim-save disabled>Salvar meta</button></div>
    </form><details class="sim-card sim-saved"><summary>Metas salvas</summary><div data-sim-saved>Carregando…</div></details></aside>
    <main><div class="sim-status" role="status" aria-live="polite"></div><div data-sim-result><section class="sim-card sim-empty"><h3>Veja quanto sobraria por mês</h3><p>Preencha a compra e clique em Simular.</p></section></div></main></div>
  </div></section>`;
  const root = el.querySelector('.sim-shell'), form = root.querySelector('form'), save = root.querySelector('[data-sim-save]'), status = root.querySelector('.sim-status');
  let records = [], persistence = false, result = null, busy = false;
  el.querySelector('[data-sim-back]').addEventListener('click', onBack);
  const alive = () => el.contains(root);
  const request = async (body) => {
    const response = await fetch('/api/financeiro?recurso=simulador', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' } : { cache: 'no-store' });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Não foi possível concluir.'); return data;
  };
  const refreshSaved = async () => {
    const data = await request(); if (!alive()) return;
    records = data.registros; persistence = data.persistencia || data.demo;
    root.querySelector('[data-sim-banner]').innerHTML = data.demo ? '<p class="sim-demo">Dados fictícios · metas temporárias até reiniciar o servidor.</p>' : data.aviso ? `<p class="sim-demo">${esc(data.aviso)}</p>` : '';
    const grouped = new Map(); records.forEach(r => { const group = grouped.get(r.meta_id) || []; group.push(r); grouped.set(r.meta_id, group); });
    root.querySelector('[data-sim-saved]').innerHTML = [...grouped.values()].map(group => {
      const r = group[0], previous = group[1];
      const difference = r.resultado.resumo && previous?.resultado.resumo ? `<p class="sim-note">Mudança da sobra média: ${money(r.resultado.resumo.sobra - previous.resultado.resumo.sobra)}</p>` : '';
      return `<div class="sim-history-item"><strong>${esc(r.nome)}</strong><p class="sim-note">${r.parametros.parcelas} × ${money(r.parametros.parcela)}</p><div class="sim-actions"><button data-sim-repeat="${esc(r.id)}">Repetir simulação</button><button data-sim-view="${esc(r.id)}">Ver resultado</button></div><details><summary>Execuções anteriores (${group.length})</summary>${difference}${group.map(item => `<p><button data-sim-view="${esc(item.id)}">${esc(new Date(item.created_at).toLocaleString('pt-BR'))}</button></p>`).join('')}</details></div>`;
    }).join('') || '<p class="sim-note">Nenhuma meta salva ainda.</p>';
    save.disabled = !result || !persistence || busy;
  };
  const show = r => {
    result = r; save.disabled = !persistence || busy;
    Object.entries(r.proposal).forEach(([key, value]) => {
      const field = form.elements.namedItem(key);
      if (field) field.value = currencyFields.includes(key) ? (key === 'entrada' && value === 0 ? '' : formatMoneyValue(value)) : value;
    });
    const s = r.resumo, purchase = r.compra;
    const purchaseHtml = `<h3>Custo da compra</h3><p>Total: <strong>${money(purchase.total)}</strong> · acréscimo: ${money(purchase.acrescimo)} (${pct(purchase.percentual)}).</p><p class="sim-note">Taxa mensal implícita estimada: ${pct(purchase.taxaMensal)}. Não equivale ao CET nem inclui custos adicionais. ${r.proposal.parcelas} parcelas no total.</p>`;
    if (!s) { root.querySelector('[data-sim-result]').innerHTML = `<section class="sim-card"><p>${esc(r.avisos[0])}</p><details class="sim-details"><summary>Ver custo da compra</summary>${purchaseHtml}</details></section>`; return; }
    const projectionNegatives = r.projecao.filter(p => p.tendencia < 0).length;
    const after = s.sobra - r.proposal.parcela;
    const critical = after < 0;
    const caution = !critical && (s.cobertos < s.meses || projectionNegatives > 0);
    const conclusion = critical ? 'A parcela supera sua sobra média.' : caution ? 'Cabe na média, mas há meses de aperto.' : 'A parcela foi coberta em todos os meses analisados.';
    const lowest = Math.min(...r.projecao.map(p => p.tendencia));
    root.querySelector('[data-sim-result]').innerHTML = `<section class="sim-card sim-result"><span class="sim-label">${esc(r.proposal.nome)}</span>
      <h3 class="sim-conclusion">${conclusion}</h3>
      <div class="sim-kpis"><div class="sim-kpi"><span>Sobra média mensal</span><strong>${signed(s.sobra)}</strong></div><div class="sim-kpi"><span>Após a parcela</span><strong>${signed(after)}</strong></div><div class="sim-kpi"><span>Meses em que caberia</span><strong>${s.cobertos} de ${s.meses}</strong></div></div>
      <p class="sim-note">Receita média: ${money(s.receitas)} · gasto médio: ${money(s.gastos)}.</p>
      <div class="sim-reading ${critical ? 'is-critical' : caution ? 'is-warning' : ''}">${s.cobertos < s.meses ? `Em ${s.meses - s.cobertos} dos ${s.meses} meses, a sobra não cobriria a parcela.` : 'Sua sobra cobriu a parcela em todos os meses com registros.'}${projectionNegatives ? ` Pela tendência, ${projectionNegatives} dos próximos ${r.proposal.horizonte} meses teriam déficit.` : ` Pela tendência, a menor sobra nos próximos ${r.proposal.horizonte} meses seria ${money(lowest)}.`}</div>
      <p class="sim-note">Base: ${month(r.historico[0].mes)} a ${month(r.historico.at(-1).mes)}. Projeção estimada, sem garantia de sobra futura.</p>
      <details class="sim-details"><summary>Ver cálculos e histórico</summary>
        <h3>Histórico mensal</h3><div class="sim-table-wrap"><table><thead><tr><th>Mês</th><th>Receitas</th><th>Gastos</th><th>Sobra</th><th>Após parcela</th></tr></thead><tbody>${r.historico.map(h => `<tr><td>${month(h.mes)}</td><td>${money(h.receitas)}</td><td>${money(h.gastos)}</td><td>${signed(h.sobra)}</td><td>${signed(h.aposParcela)}</td></tr>`).join('')}</tbody></table></div>
        <p class="sim-note">Sobra mediana: ${money(s.mediana)} · oscilação (desvio padrão): ${money(s.desvio)} · menor sobra: ${money(s.menor)}. Parcela consome ${pct(s.consumo)} da sobra média.</p>
        <h3>Próximos ${r.proposal.horizonte} meses</h3><div class="sim-table-wrap"><table><thead><tr><th>Mês</th><th>Sobra pela média</th><th>Sobra pela tendência</th></tr></thead><tbody>${r.projecao.map(p => `<tr><td>${month(p.mes)}</td><td>${signed(p.media)}</td><td>${signed(p.tendencia)}</td></tr>`).join('')}</tbody></table></div>
        <p class="sim-note">Valores após a nova compra. Sobra mensal, não saldo acumulado. Tendência por regressão linear: ${money(s.tendenciaSobra)} por mês.</p>
        ${purchaseHtml}<h3>Como foi calculado</h3>${r.avisos.map(a => `<p class="sim-note">${esc(a)}</p>`).join('')}<p class="sim-note">Calculado em ${month(r.referencia)} · regras ${esc(r.version)}.</p>
      </details></section>`;
  };
  const execute = async (acao, id) => {
    if (busy) return;
    busy = true; root.querySelectorAll('button').forEach(b => { b.disabled = true; }); status.textContent = 'Consultando histórico e calculando…';
    try {
      const parametros = Object.fromEntries(new FormData(form));
      currencyFields.forEach(key => { parametros[key] = parseMoneyInput(parametros[key]); });
      const data = await request({ acao, id, parametros }); if (!alive()) return;
      show(data.resultado); status.textContent = acao === 'simular' ? '' : 'Simulação salva.';
      if (acao !== 'simular') { await refreshSaved(); root.querySelector('.sim-saved').open = true; }
    } catch (error) { if (alive()) status.textContent = error.message; }
    finally { busy = false; if (alive()) { root.querySelectorAll('button').forEach(b => { b.disabled = false; }); save.disabled = !result || !persistence; } }
  };
  form.addEventListener('submit', e => { e.preventDefault(); execute('simular'); });
  form.addEventListener('input', event => {
    const field = event.target;
    if (currencyFields.includes(field.name)) {
      const digitsAfter = field.value.slice(field.selectionStart ?? field.value.length).replace(/\D/g, '').length;
      field.value = maskMoneyInput(field.value);
      let caret = field.value.length, remaining = digitsAfter;
      while (caret > 0 && remaining > 0) { caret--; if (/\d/.test(field.value[caret])) remaining--; }
      field.setSelectionRange(caret, caret);
    }
    result = null; save.disabled = true; status.textContent = 'Condições alteradas. Analise novamente antes de salvar.';
  });
  form.addEventListener('change', () => { result = null; save.disabled = true; });
  root.addEventListener('click', e => {
    const button = e.target.closest('button'); if (!button || button.disabled || busy) return;
    if (button.hasAttribute('data-sim-back')) onBack();
    if (button.hasAttribute('data-sim-save') && form.reportValidity()) execute('salvar');
    if (button.dataset.simRepeat) execute('repetir', button.dataset.simRepeat);
    if (button.dataset.simView) {
      const record = records.find(r => r.id === button.dataset.simView); if (!record) return;
      show(record.resultado); status.textContent = 'Resultado salvo. Use Repetir simulação para atualizar a base.';
    }
  });
  try { await refreshSaved(); } catch (error) { if (alive()) { status.textContent = error.message; root.querySelector('[data-sim-saved]').innerHTML = '<button data-sim-retry>Tentar novamente</button>'; root.querySelector('[data-sim-retry]').onclick = () => renderSimulador(el, { onBack }); } }
}
