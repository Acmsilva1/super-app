$ErrorActionPreference = 'Stop'
$path = 'index.html'
$raw = Get-Content -LiteralPath $path -Raw

$startMarker = "            renderDespesasFixasContent(el, data) {"
$endMarker = "            renderListaComprasContent(el, data) {"

$start = $raw.IndexOf($startMarker)
$end = $raw.IndexOf($endMarker)
if ($start -lt 0 -or $end -lt 0 -or $end -le $start) {
  throw "Não foi possível localizar os marcadores para substituição."
}

$before = $raw.Substring(0, $start)
$after = $raw.Substring($end)

$newBlock = @'
            getModuleActiveTab(el) {
                const current = (el.getAttribute('data-active-tab') || '').toLowerCase();
                const tab = current === 'data' ? 'data' : 'summary';
                el.setAttribute('data-active-tab', tab);
                return tab;
            }

            bindModuleTabUi(el, onSummaryActivated = null) {
                const buttons = Array.from(el.querySelectorAll('[data-action="module-tab"]'));
                const panels = Array.from(el.querySelectorAll('[data-tab-panel]'));
                const setTab = (tab) => {
                    el.setAttribute('data-active-tab', tab);
                    buttons.forEach((btn) => {
                        const active = btn.dataset.tab === tab;
                        btn.classList.toggle('is-active', active);
                        btn.setAttribute('aria-selected', active ? 'true' : 'false');
                    });
                    panels.forEach((panel) => {
                        panel.classList.toggle('hidden', panel.dataset.tabPanel !== tab);
                    });
                    if (tab === 'summary' && typeof onSummaryActivated === 'function') onSummaryActivated();
                };
                buttons.forEach((btn) => {
                    btn.onclick = () => setTab(btn.dataset.tab || 'summary');
                });
                setTab(this.getModuleActiveTab(el));
            }

            renderDespesasFixasContent(el, data) {
                if (el._mesCheckInterval) clearInterval(el._mesCheckInterval);
                if (el._dfChartStatus) { el._dfChartStatus.destroy(); el._dfChartStatus = null; }
                if (el._dfChartTop) { el._dfChartTop.destroy(); el._dfChartTop = null; }
                const activeTab = this.getModuleActiveTab(el);
                const rows = data.rows || data.despesas || [];
                const soma = data.soma != null ? Number(data.soma) : rows.reduce((a, r) => a + Number(r.valor || 0), 0);
                const somaPago = data.somaPago != null ? Number(data.somaPago) : rows.filter(r => (r.status || '').toLowerCase() === 'pago').reduce((a, r) => a + Number(r.valor || 0), 0);
                const somaPendente = data.somaPendente != null ? Number(data.somaPendente) : rows.filter(r => (r.status || '').toLowerCase() !== 'pago').reduce((a, r) => a + Number(r.valor || 0), 0);
                const receitasFinancas = data.receitas_financas != null ? Number(data.receitas_financas) : 0;
                const margem = Math.round((receitasFinancas - soma) * 100) / 100;
                const mesAno = data.mes_ano || el.getAttribute('data-mes-ano') || this.getMesAnoAtual();
                const [ano, mes] = mesAno.split('-').map(Number);
                const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                const anos = Array.from({ length: 9 }, (_, i) => new Date().getFullYear() - 2 + i);
                const rowsByValue = [...rows].sort((a, b) => Number(b.valor || 0) - Number(a.valor || 0));
                const tableRowsHtml = rowsByValue.length
                    ? rowsByValue.map((r) => {
                        const status = String(r.status || 'pendente').toLowerCase();
                        const isPago = status === 'pago';
                        return `
                            <tr data-status="${escapeHtml(status)}">
                                <td><strong>${escapeHtml(r.descricao || '')}</strong></td>
                                <td><span class="module-status-badge ${isPago ? 'is-paid' : 'is-pending'}">${isPago ? 'Pago' : 'Pendente'}</span></td>
                                <td>${this.formatMoneyBr(r.valor)}</td>
                                <td class="col-actions">
                                    <div class="app-list-actions">
                                        <button type="button" data-action="df-toggle" data-id="${r.id}" data-status="${status}">${isPago ? 'Marcar pendente' : 'Marcar pago'}</button>
                                        <button type="button" data-action="df-edit" data-id="${r.id}">Editar</button>
                                        <button type="button" data-action="df-delete" data-id="${r.id}">Excluir</button>
                                    </div>
                                </td>
                            </tr>`;
                    }).join('')
                    : '<tr><td colspan="4" class="module-table-empty">Nenhuma despesa fixa neste mês.</td></tr>';
                el.innerHTML = `
                    <div class="finance-module-shell">
                        <div class="app-mes-ano">
                            <label>Mês/Ano</label>
                            <select id="df-mes">${meses.map((m, i) => `<option value="${i + 1}" ${(i + 1 === mes) ? 'selected' : ''}>${m}</option>`).join('')}</select>
                            <select id="df-ano">${anos.map((a) => `<option value="${a}" ${(a === ano) ? 'selected' : ''}>${a}</option>`).join('')}</select>
                        </div>
                        <div class="module-tabbar" role="tablist" aria-label="Subabas de despesas">
                            <button type="button" class="module-tab-btn ${activeTab === 'summary' ? 'is-active' : ''}" data-action="module-tab" data-tab="summary" role="tab" aria-selected="${activeTab === 'summary' ? 'true' : 'false'}">Resumo</button>
                            <button type="button" class="module-tab-btn ${activeTab === 'data' ? 'is-active' : ''}" data-action="module-tab" data-tab="data" role="tab" aria-selected="${activeTab === 'data' ? 'true' : 'false'}">Dados</button>
                        </div>
                        <div class="module-tab-panel ${activeTab === 'summary' ? '' : 'hidden'}" data-tab-panel="summary">
                            <div class="app-totais">
                                <div class="totais-card"><div class="val" style="color:#22c55e">${this.formatMoneyBr(receitasFinancas)}</div><div class="stat-label">Receitas (Finanças)</div></div>
                                <div class="totais-card"><div class="val" style="color:#2563eb">${this.formatMoneyBr(soma)}</div><div class="stat-label">Total geral (mês)</div></div>
                                <div class="totais-card"><div class="val" style="color:${margem >= 0 ? '#16a34a' : '#dc2626'}">${this.formatMoneyBr(margem)}</div><div class="stat-label">Margem</div></div>
                            </div>
                            <div class="app-charts">
                                <div class="app-chart-wrap"><p style="font-size:0.875rem;font-weight:600;margin-bottom:0.5rem;">Pagos x Pendentes</p><canvas id="df-chart-status"></canvas></div>
                                <div class="app-chart-wrap"><p style="font-size:0.875rem;font-weight:600;margin-bottom:0.5rem;">Maiores despesas do mês</p><canvas id="df-chart-top"></canvas></div>
                            </div>
                            <p class="app-form-note">Visão direta do mês selecionado. Use a aba Dados para gerenciar todos os lançamentos.</p>
                        </div>
                        <div class="module-tab-panel ${activeTab === 'data' ? '' : 'hidden'}" data-tab-panel="data">
                            <div class="module-data-toolbar">
                                <p class="app-form-note" style="margin:0;">Lançamentos do mês selecionado (com status e ações).</p>
                                <div class="module-data-actions">
                                    <button type="button" class="app-btn app-btn-secondary" data-action="df-exportar">Exportar dados</button>
                                    <button type="button" class="app-btn app-btn-secondary" data-action="df-report-html">Baixar relatório HTML</button>
                                </div>
                            </div>
                            <div class="module-filter-row">
                                <div class="field">
                                    <label>Status</label>
                                    <select id="df-filter-status">
                                        <option value="">Todos</option>
                                        <option value="pago">Pago</option>
                                        <option value="pendente">Pendente</option>
                                    </select>
                                </div>
                            </div>
                            <div class="module-table-wrap">
                                <table class="module-table">
                                    <thead>
                                        <tr>
                                            <th>Descrição</th>
                                            <th>Status</th>
                                            <th>Valor</th>
                                            <th>Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody id="df-table-body">${tableRowsHtml}</tbody>
                                </table>
                            </div>
                        </div>
                        <button type="button" class="finance-fab" data-action="df-open-modal" aria-label="Adicionar despesa fixa">+</button>
                    </div>
                `;
                const rowsMap = new Map(rows.map((r) => [String(r.id), r]));
                const renderDfCharts = () => {
                    if (typeof Chart === 'undefined') {
                        this.ensureVisualizationLibraries().then(() => this.refreshAppContent('notas')).catch(() => {});
                        return;
                    }
                    if (!el.querySelector('[data-tab-panel="summary"]') || el.querySelector('[data-tab-panel="summary"]').classList.contains('hidden')) return;
                    const theme = this.getChartThemeTokens();
                    const valueLabelsPlugin = this.buildInlineChartValuePlugin({ asMoney: true });
                    const ctxStatus = el.querySelector('#df-chart-status');
                    if (ctxStatus && !el._dfChartStatus && (somaPago > 0 || somaPendente > 0)) {
                        el._dfChartStatus = new Chart(ctxStatus, {
                            type: 'doughnut',
                            data: {
                                labels: ['Pago', 'Pendente'],
                                datasets: [{
                                    data: [somaPago, somaPendente],
                                    backgroundColor: ['#22c55e', '#ef4444'],
                                    borderColor: theme.isDark ? '#0b1323' : '#ffffff',
                                    borderWidth: 2,
                                    hoverOffset: 8
                                }]
                            },
                            options: this.mergeChartOptions(
                                this.getModernChartBaseOptions({ legend: true }),
                                {
                                    cutout: '58%',
                                    scales: {
                                        x: { display: false, grid: { display: false }, ticks: { display: false }, border: { display: false } },
                                        y: { display: false, grid: { display: false }, ticks: { display: false }, border: { display: false } }
                                    }
                                }
                            ),
                            plugins: [valueLabelsPlugin]
                        });
                    }
                    const ctxTop = el.querySelector('#df-chart-top');
                    if (ctxTop && !el._dfChartTop && rowsByValue.length > 0) {
                        const topRows = rowsByValue.slice(0, 7);
                        el._dfChartTop = new Chart(ctxTop, {
                            type: 'bar',
                            data: {
                                labels: topRows.map((r) => (r.descricao || 'Sem descrição').slice(0, 24)),
                                datasets: [{
                                    label: 'Valor (R$)',
                                    data: topRows.map((r) => Number(r.valor || 0)),
                                    borderRadius: 10,
                                    borderSkipped: false,
                                    backgroundColor: '#38bdf8'
                                }]
                            },
                            options: this.mergeChartOptions(
                                this.getModernChartBaseOptions({ indexAxis: 'y', legend: false }),
                                { indexAxis: 'y', scales: { x: { beginAtZero: true } } }
                            ),
                            plugins: [valueLabelsPlugin]
                        });
                    }
                    if (el._dfChartStatus) el._dfChartStatus.resize();
                    if (el._dfChartTop) el._dfChartTop.resize();
                };
                this.bindModuleTabUi(el, renderDfCharts);
                renderDfCharts();
                const statusFilter = el.querySelector('#df-filter-status');
                if (statusFilter) {
                    statusFilter.onchange = (e) => {
                        const value = String(e.target.value || '').toLowerCase();
                        el.querySelectorAll('#df-table-body tr[data-status]').forEach((row) => {
                            row.style.display = (!value || row.dataset.status === value) ? '' : 'none';
                        });
                    };
                }
                el.querySelectorAll('[data-action="df-toggle"]').forEach((btn) => {
                    btn.onclick = () => this.submitDespesaFixaToggle(btn.dataset.id, btn.dataset.status, el);
                });
                el.querySelectorAll('[data-action="df-edit"]').forEach((btn) => {
                    btn.onclick = () => this.openDespesaFixaModal(el, { item: rowsMap.get(String(btn.dataset.id)) });
                });
                el.querySelectorAll('[data-action="df-delete"]').forEach((btn) => {
                    btn.onclick = () => this.submitDespesaFixaDelete(btn.dataset.id, el);
                });
                el.querySelector('[data-action="df-open-modal"]').onclick = () => this.openDespesaFixaModal(el);
                el.querySelector('[data-action="df-exportar"]').onclick = () => this.abrirExportarDespesasFixas(el, mesAno, meses, anos);
                el.querySelector('[data-action="df-report-html"]').onclick = async () => {
                    try {
                        await this.baixarRelatorioDespesasHtml({
                            rows,
                            soma,
                            somaPago,
                            somaPendente,
                            receitasFinancas,
                            margem,
                            mesAno,
                        });
                    } catch (e) {
                        alert(e.message || 'Erro ao gerar relatório HTML.');
                    }
                };
                el.querySelector('#df-mes').onchange = () => {
                    const m = el.querySelector('#df-mes').value;
                    const a = el.querySelector('#df-ano').value;
                    el.setAttribute('data-mes-ano', `${a}-${String(m).padStart(2, '0')}`);
                    this.refreshAppContent('notas');
                };
                el.querySelector('#df-ano').onchange = () => {
                    const m = el.querySelector('#df-mes').value;
                    const a = el.querySelector('#df-ano').value;
                    el.setAttribute('data-mes-ano', `${a}-${String(m).padStart(2, '0')}`);
                    this.refreshAppContent('notas');
                };
                let prevMesAno = this.getMesAnoAtual();
                el._mesCheckInterval = setInterval(() => {
                    const now = this.getMesAnoAtual();
                    if (now !== prevMesAno && el.getAttribute('data-mes-ano') === prevMesAno) {
                        el.setAttribute('data-mes-ano', now);
                        this.refreshAppContent('notas');
                    }
                    prevMesAno = now;
                }, 60000);
            }

            openDespesaFixaModal(el, { item = null } = {}) {
                const mesAno = el.getAttribute('data-mes-ano') || this.getMesAnoAtual();
                const overlay = document.createElement('div');
                overlay.className = 'app-modal-overlay';
                overlay.innerHTML = `
                    <div class="app-modal finance-entry-modal">
                        <h4>${item ? 'Editar despesa fixa' : 'Nova despesa fixa'}</h4>
                        <p class="app-form-note">Mês de referência: <strong>${this.formatMesAnoLabel(mesAno)}</strong></p>
                        <div class="app-form">
                            <div class="app-form-row df-form-grid">
                                <div class="field"><label>Descrição</label><input type="text" id="df-modal-descricao" placeholder="Ex: Aluguel, Internet" value="${escapeHtml(item?.descricao || '')}" /></div>
                                <div class="field"><label>Valor (R$)</label><input type="number" step="0.01" id="df-modal-valor" placeholder="0,00" value="${item ? Number(item.valor || 0) : ''}" /></div>
                                <div class="field"><label>Status</label><select id="df-modal-status"><option value="pendente" ${(!item || String(item.status).toLowerCase() !== 'pago') ? 'selected' : ''}>Pendente</option><option value="pago" ${(item && String(item.status).toLowerCase() === 'pago') ? 'selected' : ''}>Pago</option></select></div>
                            </div>
                        </div>
                        <div class="app-modal-actions">
                            <button type="button" class="app-btn app-btn-secondary" data-action="modal-cancel">Cancelar</button>
                            <button type="button" class="app-btn" data-action="modal-save">${item ? 'Salvar' : 'Adicionar'}</button>
                        </div>
                    </div>
                `;
                const close = () => overlay.remove();
                overlay.querySelector('[data-action="modal-cancel"]').onclick = close;
                overlay.onclick = (e) => { if (e.target === overlay) close(); };
                overlay.querySelector('[data-action="modal-save"]').onclick = async () => {
                    const descricao = overlay.querySelector('#df-modal-descricao').value.trim();
                    const valor = parseFloat(overlay.querySelector('#df-modal-valor').value) || 0;
                    const status = overlay.querySelector('#df-modal-status').value;
                    await this.submitDespesaFixaSave(el, { editId: item?.id || '', descricao, valor, status, mesAno });
                    close();
                };
                document.body.appendChild(overlay);
            }

            async submitDespesaFixaSave(el, payload = null) {
                const editId = String(payload?.editId || '').trim();
                const descricao = String(payload?.descricao || '').trim();
                const valor = Number(payload?.valor || 0);
                const status = String(payload?.status || 'pendente');
                const mesAno = payload?.mesAno || el.getAttribute('data-mes-ano') || this.getMesAnoAtual();
                if (!descricao) { alert('Descrição é obrigatória'); return; }
                try {
                    if (editId) {
                        const res = await fetch('/api/despesas-fixas', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: editId, descricao, valor, status })
                        });
                        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erro ao salvar'); }
                    } else {
                        const res = await fetch('/api/despesas-fixas', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ descricao, valor, status, mes_ano: mesAno })
                        });
                        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erro ao salvar'); }
                    }
                    await this.refreshAppContent('notas');
                } catch (e) {
                    alert(e.message);
                }
            }

            async submitDespesaFixaToggle(id, currentStatus, el) {
                const newStatus = currentStatus === 'pago' ? 'pendente' : 'pago';
                try {
                    const res = await fetch('/api/despesas-fixas', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id, status: newStatus })
                    });
                    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erro'); }
                    await this.refreshAppContent('notas');
                } catch (e) {
                    alert(e.message);
                }
            }

            async submitDespesaFixaDelete(id, el) {
                if (!(await this.showConfirm('Excluir despesa', 'Tem certeza que deseja excluir esta despesa fixa?'))) return;
                try {
                    const res = await fetch('/api/despesas-fixas?id=' + encodeURIComponent(id), { method: 'DELETE' });
                    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erro ao excluir'); }
                    await this.refreshAppContent('notas');
                } catch (e) {
                    alert(e.message);
                }
            }

            abrirExportarDespesasFixas(el, fromMesAno, meses, anos) {
                const [fromAno, fromMes] = fromMesAno.split('-').map(Number);
                const anosOpts = Array.from({ length: 9 }, (_, i) => new Date().getFullYear() - 2 + i);
                const overlay = document.createElement('div');
                overlay.className = 'app-modal-overlay';
                overlay.innerHTML = `
                    <div class="app-modal">
                        <h4>Exportar dados - escolha o mês espelho</h4>
                        <p style="font-size:0.875rem;color:var(--text-light);margin-bottom:0.75rem;">Copiar despesas de <strong>${meses[fromMes - 1]} ${fromAno}</strong> para:</p>
                        <div class="app-mes-ano">
                            <label>Mês</label>
                            <select id="df-export-mes">${meses.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')}</select>
                            <label>Ano</label>
                            <select id="df-export-ano">${anosOpts.map((a) => `<option value="${a}" ${(a === fromAno) ? 'selected' : ''}>${a}</option>`).join('')}</select>
                        </div>
                        <div class="app-modal-actions">
                            <button type="button" class="app-btn app-btn-secondary" data-action="df-export-cancel">Cancelar</button>
                            <button type="button" class="app-btn" data-action="df-export-confirm">Copiar</button>
                        </div>
                    </div>
                `;
                overlay.querySelector('[data-action="df-export-cancel"]').onclick = () => overlay.remove();
                overlay.querySelector('[data-action="df-export-confirm"]').onclick = async () => {
                    const m = overlay.querySelector('#df-export-mes').value;
                    const a = overlay.querySelector('#df-export-ano').value;
                    const toMesAno = a + '-' + String(m).padStart(2, '0');
                    if (toMesAno === fromMesAno) { alert('Escolha um mês diferente do mês atual.'); return; }
                    try {
                        const res = await fetch('/api/despesas-fixas', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ exportar: true, from_mes_ano: fromMesAno, to_mes_ano: toMesAno })
                        });
                        const payload = await res.json();
                        if (!res.ok) throw new Error(payload.error || 'Erro ao exportar');
                        overlay.remove();
                        el.setAttribute('data-mes-ano', payload.to_mes_ano || toMesAno);
                        await this.refreshAppContent('notas');
                        alert('Exportado: ' + (payload.exported || 0) + ' registro(s) para ' + (payload.to_mes_ano || toMesAno).replace('-', '/') + ' com status pendente.');
                    } catch (e) {
                        alert(e.message);
                    }
                };
                overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
                document.body.appendChild(overlay);
            }

            renderFinancasContent(el, data) {
                if (el._chartPie) { el._chartPie.destroy(); el._chartPie = null; }
                if (el._chartBar) { el._chartBar.destroy(); el._chartBar = null; }
                if (el._mesCheckInterval) clearInterval(el._mesCheckInterval);
                const activeTab = this.getModuleActiveTab(el);
                const rows = data.rows || [];
                const totais = data.totais || { receitas: 0, despesas: 0, despesas_fixas: 0, liquido: 0 };
                const bi = data.bi || {};
                const tabelaGastos = bi.tabela_gastos || [];
                const categorias = ['Alimentação', 'Habitação', 'Transporte', 'Lazer', 'Saúde', 'Compras', 'Contas', 'Receitas', 'Ticket'];
                const mesAno = data.mes_ano || el.getAttribute('data-mes-ano') || this.getMesAnoAtual();
                const [ano, mes] = mesAno.split('-').map(Number);
                const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                const years = Array.from({ length: 9 }, (_, i) => new Date().getFullYear() - 2 + i);
                const receitas = Number(totais.receitas) || 0;
                const despesasVariaveis = Number(totais.despesas) || 0;
                const despesasFixas = Number(totais.despesas_fixas) || 0;
                const liquido = Number.isFinite(Number(totais.liquido)) ? Number(totais.liquido) : (receitas - despesasVariaveis - despesasFixas);
                const lancDate = (r) => String((r && (r.data_lancamento || (r.created_at && String(r.created_at).slice(0, 10)))) || '').slice(0, 10);
                const createdStamp = (r) => String((r && r.created_at) || '');
                const fmtDataBrFin = (isoDate) => {
                    const m = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
                    return m ? `${m[3]}/${m[2]}/${m[1]}` : '--';
                };
                const fmtHoraBrasilia = (isoStamp) => {
                    if (!isoStamp) return '';
                    try {
                        return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(isoStamp));
                    } catch (e) {
                        return '';
                    }
                };
                const rowsOrdered = [...rows].sort((a, b) => {
                    const da = lancDate(a);
                    const db = lancDate(b);
                    if (da !== db) return db.localeCompare(da);
                    return createdStamp(b).localeCompare(createdStamp(a));
                });
                const tableRowsHtml = rowsOrdered.length
                    ? rowsOrdered.map((r) => {
                        const tipo = String(r.tipo || 'despesa').toLowerCase();
                        const hora = fmtHoraBrasilia(r.created_at);
                        return `
                            <tr data-tipo="${escapeHtml(tipo)}" data-categoria="${escapeHtml(r.categoria || '')}">
                                <td><strong>${escapeHtml(r.descricao || '')}</strong></td>
                                <td>${tipo === 'receita' ? 'Receita' : 'Despesa'}</td>
                                <td>${escapeHtml(r.categoria || '--')}</td>
                                <td style="color:${tipo === 'receita' ? '#22c55e' : '#ef4444'}">${tipo === 'receita' ? '+' : '-'} ${this.formatMoneyBr(r.valor)}</td>
                                <td>${escapeHtml(fmtDataBrFin(lancDate(r)))}${hora ? `<br><span style="font-size:0.72rem;color:#9ca3af;">${escapeHtml(hora)}</span>` : ''}</td>
                                <td class="col-actions">
                                    <div class="app-list-actions">
                                        <button type="button" data-action="fin-edit" data-id="${r.id}">Editar</button>
                                        <button type="button" data-action="fin-delete" data-id="${r.id}">Excluir</button>
                                    </div>
                                </td>
                            </tr>`;
                    }).join('')
                    : '<tr><td colspan="6" class="module-table-empty">Nenhum lançamento neste mês.</td></tr>';
                el.innerHTML = `
                    <div class="finance-module-shell">
                        <div class="app-mes-ano">
                            <label>Mês/Ano</label>
                            <select id="fin-mes">${months.map((m, i) => `<option value="${i + 1}" ${(i + 1 === mes) ? 'selected' : ''}>${m}</option>`).join('')}</select>
                            <select id="fin-ano">${years.map((a) => `<option value="${a}" ${(a === ano) ? 'selected' : ''}>${a}</option>`).join('')}</select>
                        </div>
                        <div class="module-tabbar" role="tablist" aria-label="Subabas de finanças">
                            <button type="button" class="module-tab-btn ${activeTab === 'summary' ? 'is-active' : ''}" data-action="module-tab" data-tab="summary" role="tab" aria-selected="${activeTab === 'summary' ? 'true' : 'false'}">Resumo</button>
                            <button type="button" class="module-tab-btn ${activeTab === 'data' ? 'is-active' : ''}" data-action="module-tab" data-tab="data" role="tab" aria-selected="${activeTab === 'data' ? 'true' : 'false'}">Dados</button>
                        </div>
                        <div class="module-tab-panel ${activeTab === 'summary' ? '' : 'hidden'}" data-tab-panel="summary">
                            <div class="app-totais">
                                <div class="totais-card"><div class="val" style="color:#22c55e">${this.formatMoneyBr(receitas)}</div><div class="stat-label">Receitas</div></div>
                                <div class="totais-card totais-card--despesas">
                                    <div class="despesas-titulo">Despesas</div>
                                    <div class="despesas-grid">
                                        <div class="despesa-linha"><span class="despesa-nome">Despesas fixas</span><span class="val" style="color:#f87171">${this.formatMoneyBr(despesasFixas)}</span></div>
                                        <div class="despesa-linha"><span class="despesa-nome">Despesas variáveis</span><span class="val" style="color:#ef4444">${this.formatMoneyBr(despesasVariaveis)}</span></div>
                                    </div>
                                </div>
                                <div class="totais-card"><div class="val" style="color:#2563eb">${this.formatMoneyBr(liquido)}</div><div class="stat-label">Líquido</div></div>
                            </div>
                            <div class="app-charts">
                                <div class="app-chart-wrap"><p style="font-size:0.875rem;font-weight:600;margin-bottom:0.5rem;">Receitas x Despesas variáveis x Despesas fixas</p><canvas id="fin-chart-pie"></canvas></div>
                                <div class="app-chart-wrap"><p style="font-size:0.875rem;font-weight:600;margin-bottom:0.5rem;">Categorias que mais gastam</p><canvas id="fin-chart-bar"></canvas></div>
                            </div>
                        </div>
                        <div class="module-tab-panel ${activeTab === 'data' ? '' : 'hidden'}" data-tab-panel="data">
                            <div class="module-data-toolbar">
                                <p class="app-form-note" style="margin:0;">Tabela única com todos os lançamentos do mês selecionado.</p>
                                <div class="module-data-actions">
                                    <button type="button" class="app-btn app-btn-secondary" data-action="financas-report-html">Baixar relatório HTML</button>
                                </div>
                            </div>
                            <div class="module-filter-row">
                                <div class="field">
                                    <label>Tipo</label>
                                    <select id="fin-filter-tipo">
                                        <option value="">Todos</option>
                                        <option value="receita">Receita</option>
                                        <option value="despesa">Despesa</option>
                                    </select>
                                </div>
                                <div class="field">
                                    <label>Categoria</label>
                                    <select id="fin-filter-categoria">
                                        <option value="">Todas</option>
                                        ${categorias.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
                                    </select>
                                </div>
                            </div>
                            <div class="module-table-wrap">
                                <table class="module-table">
                                    <thead>
                                        <tr>
                                            <th>Descrição</th>
                                            <th>Tipo</th>
                                            <th>Categoria</th>
                                            <th>Valor</th>
                                            <th>Data</th>
                                            <th>Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody id="fin-table-body">${tableRowsHtml}</tbody>
                                </table>
                            </div>
                        </div>
                        <button type="button" class="finance-fab" data-action="fin-open-modal" aria-label="Adicionar lançamento financeiro">+</button>
                    </div>
                `;
                const rowsMap = new Map(rows.map((r) => [String(r.id), r]));
                const renderFinCharts = () => {
                    if (typeof Chart === 'undefined') {
                        this.ensureVisualizationLibraries().then(() => this.refreshAppContent('financas')).catch(() => {});
                        return;
                    }
                    const summaryPanel = el.querySelector('[data-tab-panel="summary"]');
                    if (!summaryPanel || summaryPanel.classList.contains('hidden')) return;
                    const finTheme = this.getChartThemeTokens();
                    const valueLabelsPlugin = this.buildInlineChartValuePlugin({ asMoney: true });
                    const ctxPie = el.querySelector('#fin-chart-pie');
                    if (ctxPie && !el._chartPie && (receitas > 0 || despesasVariaveis > 0 || despesasFixas > 0)) {
                        el._chartPie = new Chart(ctxPie, {
                            type: 'doughnut',
                            data: {
                                labels: ['Receitas', 'Despesas variáveis', 'Despesas fixas'],
                                datasets: [{
                                    data: [receitas, despesasVariaveis, despesasFixas],
                                    backgroundColor: ['#22c55e', '#f97316', '#ef4444'],
                                    borderColor: finTheme.isDark ? '#0b1323' : '#ffffff',
                                    borderWidth: 2,
                                    hoverOffset: 8
                                }]
                            },
                            options: this.mergeChartOptions(
                                this.getModernChartBaseOptions({ legend: true }),
                                {
                                    cutout: '58%',
                                    plugins: { legend: { position: 'bottom' } },
                                    scales: {
                                        x: { display: false, grid: { display: false }, ticks: { display: false }, border: { display: false } },
                                        y: { display: false, grid: { display: false }, ticks: { display: false }, border: { display: false } }
                                    }
                                }
                            ),
                            plugins: [valueLabelsPlugin]
                        });
                    }
                    const ctxBar = el.querySelector('#fin-chart-bar');
                    if (ctxBar && !el._chartBar && tabelaGastos.length > 0) {
                        const labelsBar = tabelaGastos.map((x) => x[0]);
                        const valuesBar = tabelaGastos.map((x) => x[1]);
                        el._chartBar = new Chart(ctxBar, {
                            type: 'bar',
                            data: {
                                labels: labelsBar,
                                datasets: [{
                                    label: 'Gasto (R$)',
                                    data: valuesBar,
                                    borderRadius: 10,
                                    borderSkipped: false,
                                    backgroundColor: (context) => {
                                        const chart = context.chart;
                                        const area = chart.chartArea;
                                        if (!area) return '#38bdf8';
                                        const g = chart.ctx.createLinearGradient(area.left, 0, area.right, 0);
                                        g.addColorStop(0, '#1d4ed8');
                                        g.addColorStop(1, '#22d3ee');
                                        return g;
                                    }
                                }]
                            },
                            options: this.mergeChartOptions(
                                this.getModernChartBaseOptions({ indexAxis: 'y', legend: false }),
                                { indexAxis: 'y', scales: { x: { beginAtZero: true } } }
                            ),
                            plugins: [valueLabelsPlugin]
                        });
                    }
                    if (el._chartPie) el._chartPie.resize();
                    if (el._chartBar) el._chartBar.resize();
                };
                this.bindModuleTabUi(el, renderFinCharts);
                renderFinCharts();
                const applyFinFilters = () => {
                    const tipo = String(el.querySelector('#fin-filter-tipo')?.value || '').toLowerCase();
                    const categoria = String(el.querySelector('#fin-filter-categoria')?.value || '');
                    el.querySelectorAll('#fin-table-body tr[data-tipo]').forEach((row) => {
                        const okTipo = !tipo || row.dataset.tipo === tipo;
                        const okCat = !categoria || row.dataset.categoria === categoria;
                        row.style.display = (okTipo && okCat) ? '' : 'none';
                    });
                };
                const tipoFilter = el.querySelector('#fin-filter-tipo');
                const categoriaFilter = el.querySelector('#fin-filter-categoria');
                if (tipoFilter) tipoFilter.onchange = applyFinFilters;
                if (categoriaFilter) categoriaFilter.onchange = applyFinFilters;
                el.querySelectorAll('[data-action="fin-edit"]').forEach((btn) => {
                    btn.onclick = () => this.openFinancasModal(el, { item: rowsMap.get(String(btn.dataset.id)), categorias });
                });
                el.querySelectorAll('[data-action="fin-delete"]').forEach((btn) => {
                    btn.onclick = () => this.submitFinancasDelete(btn.dataset.id, el);
                });
                el.querySelector('[data-action="fin-open-modal"]').onclick = () => this.openFinancasModal(el, { categorias });
                el.querySelector('[data-action="financas-report-html"]').onclick = async () => {
                    try {
                        await this.baixarRelatorioFinancasHtml({
                            el,
                            rows,
                            totais,
                            tabelaGastos,
                            mesAno,
                        });
                    } catch (e) {
                        alert(e.message || 'Erro ao gerar relatório HTML.');
                    }
                };
                el.querySelector('#fin-mes').onchange = () => {
                    const m = el.querySelector('#fin-mes').value;
                    const a = el.querySelector('#fin-ano').value;
                    el.setAttribute('data-mes-ano', `${a}-${String(m).padStart(2, '0')}`);
                    this.refreshAppContent('financas');
                };
                el.querySelector('#fin-ano').onchange = () => {
                    const m = el.querySelector('#fin-mes').value;
                    const a = el.querySelector('#fin-ano').value;
                    el.setAttribute('data-mes-ano', `${a}-${String(m).padStart(2, '0')}`);
                    this.refreshAppContent('financas');
                };
                let prevMesAnoFin = this.getMesAnoAtual();
                el._mesCheckInterval = setInterval(() => {
                    const now = this.getMesAnoAtual();
                    if (now !== prevMesAnoFin && el.getAttribute('data-mes-ano') === prevMesAnoFin) {
                        el.setAttribute('data-mes-ano', now);
                        this.refreshAppContent('financas');
                    }
                    prevMesAnoFin = now;
                }, 60000);
            }

            openFinancasModal(el, { item = null, categorias = null } = {}) {
                const categories = categorias || ['Alimentação', 'Habitação', 'Transporte', 'Lazer', 'Saúde', 'Compras', 'Contas', 'Receitas', 'Ticket'];
                const mesAno = el.getAttribute('data-mes-ano') || this.getMesAnoAtual();
                const [ano, mes] = mesAno.split('-').map(Number);
                const pad = (n) => String(n).padStart(2, '0');
                const firstDayMonth = `${ano}-${pad(mes)}-01`;
                const lastDayMonth = `${ano}-${pad(mes)}-${pad(new Date(ano, mes, 0).getDate())}`;
                const todayBrazilIso = this.getBrazilDateIsoFrom(new Date());
                const defaultLancamento = (todayBrazilIso >= firstDayMonth && todayBrazilIso <= lastDayMonth) ? todayBrazilIso : firstDayMonth;
                const rawDate = item && (item.data_lancamento || (item.created_at && String(item.created_at).slice(0, 10)));
                const dateValue = rawDate ? String(rawDate).slice(0, 10) : defaultLancamento;
                const overlay = document.createElement('div');
                overlay.className = 'app-modal-overlay';
                overlay.innerHTML = `
                    <div class="app-modal finance-entry-modal">
                        <h4>${item ? 'Editar lançamento' : 'Novo lançamento'}</h4>
                        <p class="app-form-note">Mês de referência: <strong>${this.formatMesAnoLabel(mesAno)}</strong></p>
                        <div class="app-form">
                            <div class="app-form-row fin-form-grid">
                                <div class="field"><label>Descrição</label><input type="text" id="fin-modal-descricao" placeholder="Ex: Supermercado" value="${escapeHtml(item?.descricao || '')}" /></div>
                                <div class="field"><label>Valor (R$)</label><input type="number" step="0.01" id="fin-modal-valor" placeholder="0,00" value="${item ? Number(item.valor || 0) : ''}" /></div>
                                <div class="field"><label>Tipo</label><select id="fin-modal-tipo"><option value="despesa" ${(!item || String(item.tipo).toLowerCase() !== 'receita') ? 'selected' : ''}>Despesa</option><option value="receita" ${(item && String(item.tipo).toLowerCase() === 'receita') ? 'selected' : ''}>Receita</option></select></div>
                                <div class="field"><label>Categoria</label><select id="fin-modal-categoria"><option value="">--</option>${categories.map((c) => `<option value="${escapeHtml(c)}" ${(item && item.categoria === c) ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}</select></div>
                                <div class="field"><label>Data do lançamento</label><input type="date" id="fin-modal-data" value="${escapeHtml(dateValue)}" min="${firstDayMonth}" max="${lastDayMonth}" /></div>
                            </div>
                        </div>
                        <div class="app-modal-actions">
                            <button type="button" class="app-btn app-btn-secondary" data-action="modal-cancel">Cancelar</button>
                            <button type="button" class="app-btn" data-action="modal-save">${item ? 'Salvar' : 'Registrar'}</button>
                        </div>
                    </div>
                `;
                const close = () => overlay.remove();
                overlay.querySelector('[data-action="modal-cancel"]').onclick = close;
                overlay.onclick = (e) => { if (e.target === overlay) close(); };
                overlay.querySelector('[data-action="modal-save"]').onclick = async () => {
                    const payload = {
                        editId: item?.id || '',
                        descricao: overlay.querySelector('#fin-modal-descricao').value.trim(),
                        valor: parseFloat(overlay.querySelector('#fin-modal-valor').value) || 0,
                        tipo: overlay.querySelector('#fin-modal-tipo').value,
                        categoria: overlay.querySelector('#fin-modal-categoria').value || null,
                        dataLanc: overlay.querySelector('#fin-modal-data').value || defaultLancamento,
                        mesAno,
                    };
                    await this.submitFinancasSave(el, payload);
                    close();
                };
                document.body.appendChild(overlay);
            }

            async submitFinancasSave(el, payload = null) {
                const editId = String(payload?.editId || '').trim();
                const descricao = String(payload?.descricao || '').trim();
                const valor = Number(payload?.valor || 0);
                const tipo = String(payload?.tipo || 'despesa');
                const categoria = payload?.categoria || null;
                const mesAno = payload?.mesAno || el.getAttribute('data-mes-ano') || this.getMesAnoAtual();
                const dataLanc = String(payload?.dataLanc || this.getBrazilDateIsoFrom(new Date()));
                if (!descricao) { alert('Descrição é obrigatória'); return; }
                const [yy, mm] = mesAno.split('-').map(Number);
                const [dy, dm] = dataLanc.split('-').map(Number);
                if (dy !== yy || dm !== mm) {
                    alert('A data do lançamento precisa estar dentro do mês selecionado no topo (mês/ano: ' + mesAno.replace('-', '/') + ').');
                    return;
                }
                try {
                    if (editId) {
                        const res = await fetch('/api/financas', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: editId, descricao, valor, tipo, categoria, data_lancamento: dataLanc })
                        });
                        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erro ao salvar'); }
                    } else {
                        const res = await fetch('/api/financas', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ descricao, valor, tipo, categoria, data_lancamento: dataLanc })
                        });
                        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erro ao salvar'); }
                    }
                    await this.refreshAppContent('financas');
                } catch (e) {
                    alert(e.message);
                }
            }

            async submitFinancasDelete(id, el) {
                if (!(await this.showConfirm('Excluir lançamento', 'Tem certeza que deseja excluir este lançamento financeiro?'))) return;
                try {
                    const res = await fetch('/api/financas?id=' + encodeURIComponent(id), { method: 'DELETE' });
                    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erro ao excluir'); }
                    await this.refreshAppContent('financas');
                } catch (e) {
                    alert(e.message);
                }
            }

'@

$updated = $before + $newBlock + $after
Set-Content -LiteralPath $path -Value $updated
