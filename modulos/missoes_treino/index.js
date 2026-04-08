function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeCompare(value) {
  return String(value ?? '').trim().toLowerCase();
}

function tempItemHtml(item) {
  return `
    <div class="mt-temp-item">
      <div class="mt-temp-text"><strong>${Number(item.reps || 0)}x</strong> ${escapeHtml(item.name)}</div>
      <button class="mt-btn-link is-danger" data-action="remove-temp" data-id="${escapeHtml(item.id)}">Remover</button>
    </div>
  `;
}

function missionCardHtml(mission, index) {
  const total = mission.items?.length || 0;
  const done = (mission.items || []).filter((item) => item.completed).length;
  const allDone = total > 0 && done === total;
  const shellClass = allDone ? 'mt-mission-shell is-done' : 'mt-mission-shell';
  const concludeClass = allDone ? 'mt-btn mt-btn-complete is-done' : 'mt-btn mt-btn-complete';
  return `
    <section class="${shellClass}">
      <header class="mt-mission-shell-header">
        <h3>MISSAO ${index + 1}</h3>
        <span>${done}/${total} itens concluidos</span>
      </header>
      <div class="mt-mission-list">
        ${(mission.items || []).map((item) => `
          <article class="mt-mission-row ${item.completed ? 'is-done' : ''}">
            <div class="mt-mission-main">
              <h4 class="mt-mission-title ${item.completed ? 'is-done' : ''}">${escapeHtml(item.name)}</h4>
              <p class="mt-mission-meta">QUANTIDADE: <strong>${Number(item.reps || 0)} REPETICOES</strong></p>
            </div>
          </article>
        `).join('')}
      </div>
      <footer class="mt-card-actions">
        <button class="${concludeClass}" data-action="toggle-mission" data-mission-id="${escapeHtml(mission.id)}" ${mission._busy ? 'disabled' : ''}>
          ${allDone ? 'CONCLUIDA' : 'CONCLUIR MISSAO'}
        </button>
        <button class="mt-btn-icon" data-action="edit-mission" data-mission-id="${escapeHtml(mission.id)}" ${mission._busy ? 'disabled' : ''}>Editar</button>
        <button class="mt-btn-icon is-danger" data-action="delete-mission" data-mission-id="${escapeHtml(mission.id)}" ${mission._busy ? 'disabled' : ''}>Excluir</button>
      </footer>
    </section>
  `;
}

class MissoesTreinoApp {
  constructor(container) {
    this.container = container;
    this.missions = [];
    this.tempMissions = [];
    this.editingMissionId = null;
    this.isLoading = false;
    this.errorMessage = '';
    this.onClick = this.onClick.bind(this);
    this.onKeyPress = this.onKeyPress.bind(this);
  }

  init() {
    this.container.innerHTML = this.template();
    this.cacheDom();
    this.bind();
    this.updateDateDisplay();
    this.render();
    this.loadFromApi();
  }

  destroy() {
    if (!this.root) return;
    this.root.removeEventListener('click', this.onClick);
    this.tempNameInput?.removeEventListener('keypress', this.onKeyPress);
    this.container._cleanup = null;
  }

  cacheDom() {
    this.root = this.container.querySelector('.mt-root');
    this.todayDateEl = this.container.querySelector('[data-role="today-date"]');
    this.completedEl = this.container.querySelector('[data-role="completed"]');
    this.progressEl = this.container.querySelector('[data-role="progress"]');
    this.listEl = this.container.querySelector('[data-role="list"]');
    this.noticeEl = this.container.querySelector('[data-role="notice"]');
    this.modalEl = this.container.querySelector('[data-role="modal"]');
    this.modalTitleEl = this.container.querySelector('[data-role="modal-title"]');
    this.modalDescEl = this.container.querySelector('[data-role="modal-desc"]');
    this.modalSubmitEl = this.container.querySelector('[data-role="modal-submit"]');
    this.tempNameInput = this.container.querySelector('[data-role="temp-name"]');
    this.tempRepsInput = this.container.querySelector('[data-role="temp-reps"]');
    this.tempListEl = this.container.querySelector('[data-role="temp-list"]');
  }

  bind() {
    this.root.addEventListener('click', this.onClick);
    this.tempNameInput?.addEventListener('keypress', this.onKeyPress);
  }

  async api(path = '', options = {}) {
    const response = await fetch(`/api/missoes-treino${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || 'Falha na API de missoes de treino');
    return data;
  }

  setNotice(message = '', isError = false) {
    this.errorMessage = message || '';
    if (!this.noticeEl) return;
    this.noticeEl.textContent = this.errorMessage;
    this.noticeEl.classList.toggle('is-error', Boolean(isError && this.errorMessage));
    this.noticeEl.classList.toggle('is-empty', !this.errorMessage);
  }

  async loadFromApi() {
    this.isLoading = true;
    this.setNotice('Sincronizando com o banco...');
    this.render();
    try {
      const data = await this.api('');
      this.missions = Array.isArray(data?.missions) ? data.missions : [];
      await this.migrateLegacyLocalData(this.missions);
      const refreshed = await this.api('');
      this.missions = Array.isArray(refreshed?.missions) ? refreshed.missions : [];
      this.setNotice(this.missions.length ? 'Dados sincronizados.' : 'Sem missoes para hoje.');
    } catch (err) {
      this.setNotice(err.message || 'Falha ao carregar missoes.', true);
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  async migrateLegacyLocalData(existingMissions = []) {
    const legacyKey = 'sl-musculacao-system';
    const markerKey = `sl-musculacao-migrated-${getTodayKey()}`;
    if (localStorage.getItem(markerKey) === '1') return;

    const raw = localStorage.getItem(legacyKey);
    if (!raw) {
      localStorage.setItem(markerKey, '1');
      return;
    }

    let legacy = null;
    try {
      legacy = JSON.parse(raw);
    } catch (_err) {
      localStorage.setItem(markerKey, '1');
      return;
    }

    const legacyItems = Array.isArray(legacy?.missions) ? legacy.missions : [];
    if (!legacyItems.length) {
      localStorage.setItem(markerKey, '1');
      return;
    }

    const normalizedLegacy = legacyItems
      .map((item, idx) => ({
        name: String(item?.name || '').trim(),
        reps: Number(item?.reps || 0),
        ordem: idx + 1,
        completed: Boolean(item?.completed),
      }))
      .filter((item) => normalizeCompare(item.name) && item.reps > 0);

    if (!normalizedLegacy.length) {
      localStorage.setItem(markerKey, '1');
      return;
    }

    const existingSignatures = new Set(
      (existingMissions || []).map((mission) =>
        (mission.items || [])
          .map((item) => `${normalizeCompare(item.name)}::${Number(item.reps || 0)}`)
          .sort()
          .join('|')
      )
    );

    const newSignature = normalizedLegacy
      .map((item) => `${normalizeCompare(item.name)}::${Number(item.reps || 0)}`)
      .sort()
      .join('|');

    if (!existingSignatures.has(newSignature)) {
      await this.api('', {
        method: 'POST',
        body: JSON.stringify({ items: normalizedLegacy }),
      });
    }

    localStorage.setItem(markerKey, '1');
  }

  onKeyPress(event) {
    if (event.key === 'Enter') this.addTempItem();
  }

  onClick(event) {
    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.getAttribute('data-action');
    const id = actionEl.getAttribute('data-id');
    const missionId = actionEl.getAttribute('data-mission-id');

    if (action === 'refresh') this.loadFromApi();
    if (action === 'open-modal') this.openModal();
    if (action === 'close-modal') this.closeModal();
    if (action === 'clear-temp') {
      this.tempMissions = [];
      this.renderTempList();
    }
    if (action === 'add-temp') this.addTempItem();
    if (action === 'submit-modal') this.commitMissions();
    if (action === 'remove-temp' && id) this.removeTempItem(id);
    if (action === 'toggle-mission' && missionId) this.toggleMissionComplete(missionId);
    if (action === 'delete-mission' && missionId) this.deleteMission(missionId);
    if (action === 'edit-mission' && missionId) this.openModal(missionId);
  }

  updateDateDisplay() {
    const options = { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' };
    this.todayDateEl.textContent = `STATUS DO SERVIDOR: ${new Date().toLocaleDateString('pt-BR', options).toUpperCase()}`;
  }

  openModal(missionId = null) {
    this.editingMissionId = missionId;
    if (missionId) {
      const mission = this.missions.find((m) => m.id === missionId);
      this.tempMissions = (mission?.items || []).map((item) => ({
        id: item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: item.name,
        reps: item.reps,
        completed: Boolean(item.completed),
      }));
      this.modalTitleEl.textContent = 'EDITAR MISSAO';
      this.modalDescEl.textContent = 'Edite os itens desta missao.';
      this.modalSubmitEl.textContent = 'ATUALIZAR MISSAO';
    } else {
      this.tempMissions = [];
      this.modalTitleEl.textContent = 'NOVA MISSAO';
      this.modalDescEl.textContent = 'Adicione os itens desta nova missao diaria.';
      this.modalSubmitEl.textContent = 'CRIAR MISSAO';
    }
    this.renderTempList();
    this.modalEl.classList.remove('is-hidden');
    window.setTimeout(() => this.modalEl.classList.add('is-open'), 10);
    this.tempNameInput?.focus();
  }

  closeModal() {
    this.modalEl.classList.remove('is-open');
    window.setTimeout(() => this.modalEl.classList.add('is-hidden'), 180);
    this.editingMissionId = null;
  }

  addTempItem() {
    const name = this.tempNameInput.value.trim();
    const reps = Number.parseInt(this.tempRepsInput.value, 10);
    if (!name || !Number.isFinite(reps) || reps <= 0) return;
    this.tempMissions.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      reps,
      completed: false,
    });
    this.tempNameInput.value = '';
    this.tempNameInput.focus();
    this.renderTempList();
  }

  removeTempItem(id) {
    this.tempMissions = this.tempMissions.filter((item) => item.id !== id);
    this.renderTempList();
  }

  renderTempList() {
    if (!this.tempMissions.length) {
      this.tempListEl.innerHTML = '<p class="mt-empty-small">Lista de itens vazia...</p>';
      return;
    }
    this.tempListEl.innerHTML = this.tempMissions.map(tempItemHtml).join('');
  }

  async commitMissions() {
    if (!this.tempMissions.length) return;
    this.modalSubmitEl.disabled = true;
    this.setNotice('Salvando missao no banco...');
    try {
      const payloadItems = this.tempMissions.map((item, idx) => ({
        name: String(item.name || '').trim(),
        reps: Number(item.reps || 0),
        ordem: idx + 1,
        completed: Boolean(item.completed),
      })).filter((item) => item.name && item.reps > 0);

      if (!payloadItems.length) throw new Error('Adicione ao menos 1 exercicio valido.');

      if (this.editingMissionId) {
        await this.api('', {
          method: 'PATCH',
          body: JSON.stringify({ mission_id: this.editingMissionId, replace_items: payloadItems }),
        });
      } else {
        await this.api('', {
          method: 'POST',
          body: JSON.stringify({ items: payloadItems }),
        });
      }

      this.closeModal();
      await this.loadFromApi();
      this.setNotice('Missao salva com sucesso.');
    } catch (err) {
      this.setNotice(err.message || 'Falha ao salvar missao.', true);
    } finally {
      this.modalSubmitEl.disabled = false;
      this.render();
    }
  }

  async toggleMissionComplete(missionId) {
    const mission = this.missions.find((m) => m.id === missionId);
    if (!mission) return;
    mission._busy = true;
    this.render();
    try {
      await this.api('', {
        method: 'PATCH',
        body: JSON.stringify({ mission_id: missionId, completed: !mission.completed }),
      });
      mission.completed = !mission.completed;
      mission.items = (mission.items || []).map((item) => ({ ...item, completed: mission.completed }));
      this.setNotice('Missao atualizada no banco.');
    } catch (err) {
      this.setNotice(err.message || 'Falha ao concluir missao.', true);
    } finally {
      mission._busy = false;
      this.render();
    }
  }

  async deleteMission(missionId) {
    const mission = this.missions.find((m) => m.id === missionId);
    if (!mission) return;
    mission._busy = true;
    this.render();
    try {
      await this.api('', {
        method: 'DELETE',
        body: JSON.stringify({ mission_id: missionId }),
      });
      this.missions = this.missions.filter((m) => m.id !== missionId);
      this.setNotice('Missao removida do banco.');
    } catch (err) {
      this.setNotice(err.message || 'Falha ao excluir missao.', true);
      mission._busy = false;
    }
    this.render();
  }

  render() {
    const totalMissions = this.missions.length;
    const completedMissions = this.missions.filter((m) => m.completed).length;
    const progress = totalMissions ? Math.round((completedMissions / totalMissions) * 100) : 0;

    this.completedEl.textContent = `${completedMissions}/${totalMissions}`;
    this.progressEl.style.width = `${progress}%`;
    this.progressEl.classList.toggle('is-full', totalMissions > 0 && progress === 100);

    if (this.isLoading) {
      this.listEl.innerHTML = `
        <div class="mt-empty-card">
          <p class="mt-empty-title">SINCRONIZANDO...</p>
          <p class="mt-empty-text">Aguarde enquanto carregamos do banco.</p>
        </div>
      `;
      return;
    }

    if (!totalMissions) {
      this.listEl.innerHTML = `
        <div class="mt-empty-card">
          <p class="mt-empty-title">NENHUMA MISSAO GERADA</p>
          <p class="mt-empty-text">Clique em [+] Nova Missao para comecar.</p>
        </div>
      `;
      return;
    }

    this.listEl.innerHTML = this.missions.map((mission, idx) => missionCardHtml(mission, idx)).join('');
  }

  template() {
    return `
      <div class="mt-root">
        <style>
          .mt-root{--mt-bg:#050508;--mt-panel:rgba(10,15,25,.82);--mt-border:rgba(0,229,255,.34);--mt-accent:#00e5ff;--mt-danger:#ff003c;--mt-ok:#00d084;--mt-text:#d8f3ff;background:radial-gradient(circle at center,#0a0f19 0%,#050508 100%);border:1px solid rgba(20,80,98,.4);border-radius:14px;box-shadow:inset 0 0 18px rgba(0,229,255,.05),0 12px 26px rgba(1,8,14,.32);color:var(--mt-text);font-family:"Space Mono","Consolas","Courier New",monospace;padding:14px;position:relative;overflow:hidden}
          .mt-root *{box-sizing:border-box}
          .mt-root::before{content:"";position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,0) 50%,rgba(0,0,0,.14) 50%);background-size:100% 4px;pointer-events:none;opacity:.35}
          .mt-header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid var(--mt-border);padding-bottom:10px;position:relative;z-index:1}
          .mt-brand{display:flex;gap:12px;align-items:flex-start}
          .mt-bolt{width:44px;height:44px;border:1px solid var(--mt-accent);transform:rotate(45deg);display:flex;align-items:center;justify-content:center;flex:none;background:rgba(0,229,255,.08);box-shadow:0 0 14px rgba(0,229,255,.32)}
          .mt-bolt span{transform:rotate(-45deg);font-weight:900;color:var(--mt-accent)}
          .mt-title{margin:0;font-size:1.1rem;line-height:1.05;color:var(--mt-accent);font-family:"Orbitron","Segoe UI",sans-serif;letter-spacing:.06em;text-transform:uppercase;position:relative;text-shadow:0 0 6px rgba(0,229,255,.45),0 0 12px rgba(0,229,255,.25);animation:mt-title-pulse 2.8s ease-in-out infinite}
          .mt-title::before,.mt-title::after{content:attr(data-text);position:absolute;inset:0;opacity:.2;pointer-events:none}
          .mt-title::before{transform:translateX(1px);text-shadow:-1px 0 #ff003c;animation:mt-chroma 6s infinite steps(1,end)}
          .mt-title::after{transform:translateX(-1px);text-shadow:1px 0 #00e5ff;animation:mt-chroma 6s infinite steps(1,end) reverse}
          .mt-date{margin:5px 0 0;color:#9aa8b5;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase}
          .mt-stat{text-align:right;min-width:68px}
          .mt-stat strong{display:block;font-size:1.35rem;font-family:"Orbitron","Segoe UI",sans-serif;color:var(--mt-accent)}
          .mt-stat span{font-size:.62rem;color:#9aa8b5;letter-spacing:.2em;text-transform:uppercase}
          .mt-progress-wrap{height:8px;background:#0d141f;border:1px solid rgba(96,102,122,.28);margin:14px 0;border-radius:999px;overflow:hidden;position:relative;z-index:1}
          .mt-progress{height:100%;width:0%;background:linear-gradient(90deg,#00e5ff,#00c6ff);transition:width .35s ease}
          .mt-progress.is-full{background:linear-gradient(90deg,#00d084,#3ce29f)}
          .mt-list{display:grid;gap:10px;position:relative;z-index:1}
          .mt-notice{margin:8px 0 2px;font-size:.72rem;color:#7de3f7;min-height:16px;position:relative;z-index:1}
          .mt-notice.is-error{color:#ff8ca1}
          .mt-notice.is-empty{opacity:0}
          .mt-empty-card{border:1px dashed var(--mt-border);background:rgba(255,255,255,.03);padding:24px 14px;text-align:center;border-radius:10px}
          .mt-empty-title{margin:0;color:var(--mt-accent);font-weight:800;letter-spacing:.12em;font-size:.78rem}
          .mt-empty-text{margin:6px 0 0;color:#8f9aa6;font-size:.72rem}
          .mt-mission-shell{border:1px solid var(--mt-border);background:var(--mt-panel);border-radius:10px;box-shadow:inset 0 0 12px rgba(0,229,255,.04);overflow:hidden}
          .mt-mission-shell.is-done{border-color:rgba(0,208,132,.42)}
          .mt-mission-shell-header{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:10px 11px;border-bottom:1px solid rgba(95,122,153,.25);background:rgba(4,12,19,.5)}
          .mt-mission-shell-header h3{margin:0;color:var(--mt-accent);font-family:"Orbitron","Segoe UI",sans-serif;font-size:.86rem;letter-spacing:.08em}
          .mt-mission-shell-header span{font-size:.68rem;color:#9fb0c0;text-transform:uppercase;letter-spacing:.08em}
          .mt-mission-list{display:grid;gap:0}
          .mt-mission-row{display:flex;justify-content:space-between;gap:10px;padding:11px;border-top:1px solid rgba(95,122,153,.16)}
          .mt-mission-row:first-child{border-top:none}
          .mt-mission-row.is-done{background:rgba(0,208,132,.07)}
          .mt-mission-main{min-width:0}
          .mt-mission-title{margin:0;color:var(--mt-accent);font-family:"Orbitron","Segoe UI",sans-serif;font-size:1rem}
          .mt-mission-title.is-done{color:var(--mt-ok);text-decoration:line-through;opacity:.72}
          .mt-mission-meta{margin:5px 0 0;font-size:.68rem;letter-spacing:.11em;color:#94a3b8;text-transform:uppercase}
          .mt-mission-meta strong{color:#e8f6ff}
          .mt-card-actions{display:flex;gap:8px;align-items:center;padding:10px 11px;border-top:1px solid rgba(95,122,153,.2)}
          .mt-btn{border:1px solid var(--mt-accent);background:rgba(0,229,255,.1);color:var(--mt-accent);padding:8px 10px;font-size:.62rem;font-weight:800;letter-spacing:.05em;cursor:pointer;white-space:nowrap}
          .mt-btn:disabled,.mt-btn-icon:disabled{opacity:.6;cursor:not-allowed}
          .mt-btn-complete.is-done{border-color:var(--mt-ok);background:rgba(0,208,132,.14);color:var(--mt-ok)}
          .mt-btn-icon{border:1px solid #3a4656;background:rgba(0,0,0,.2);color:#b3c1cf;padding:5px 8px;font-size:.66rem;cursor:pointer}
          .mt-btn-icon.is-danger{color:#ff7d97;border-color:rgba(255,0,60,.42)}
          .mt-fab-wrap{display:flex;gap:8px;margin-top:12px;position:relative;z-index:2}
          .mt-fab{display:inline-block;border:1px solid var(--mt-accent);background:rgba(0,229,255,.1);color:var(--mt-accent);padding:10px 13px;font-family:"Orbitron","Segoe UI",sans-serif;font-weight:800;font-size:.74rem;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;border-radius:8px}
          .mt-fab.sec{border-color:#3a4656;color:#c1d3e2;background:rgba(0,0,0,.22)}
          .mt-modal{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:14px;opacity:0;pointer-events:none;transition:opacity .18s ease;z-index:3000}
          .mt-modal.is-open{opacity:1;pointer-events:auto}
          .mt-modal.is-hidden{display:none}
          .mt-modal-card{width:min(640px,100%);background:rgba(6,12,20,.95);border:1px solid var(--mt-border);border-radius:12px;padding:16px;transform:scale(.97);transition:transform .18s ease}
          .mt-modal.is-open .mt-modal-card{transform:scale(1)}
          .mt-modal-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;border-bottom:1px solid rgba(64,81,102,.45);padding-bottom:9px;margin-bottom:12px}
          .mt-modal-top h4{margin:0;color:var(--mt-accent);font-family:"Orbitron","Segoe UI",sans-serif;letter-spacing:.05em}
          .mt-modal-top p{margin:5px 0 0;font-size:.74rem;color:#93a1b0}
          .mt-close{border:1px solid #4b5666;background:transparent;color:#9fb0c0;cursor:pointer;padding:4px 9px}
          .mt-form{display:grid;gap:10px}
          .mt-row{display:grid;grid-template-columns:1fr 92px auto;gap:8px}
          .mt-field label{display:block;font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;color:#8da0b3;margin-bottom:4px}
          .mt-field input{width:100%;background:#090f17;border:1px solid #2e3b4f;color:#e5f4ff;padding:8px 9px}
          .mt-btn-soft{border:1px solid var(--mt-accent);background:rgba(0,229,255,.14);color:var(--mt-accent);padding:8px 10px;cursor:pointer;font-weight:700}
          .mt-temp-list{max-height:220px;overflow:auto;background:rgba(255,255,255,.03);border:1px solid rgba(90,106,124,.28);padding:7px;display:grid;gap:7px}
          .mt-empty-small{text-align:center;color:#7d8a98;font-size:.72rem;margin:9px 0}
          .mt-temp-item{display:flex;justify-content:space-between;align-items:center;gap:7px;border-left:3px solid var(--mt-accent);padding:7px 8px;background:rgba(255,255,255,.03)}
          .mt-temp-text{font-size:.83rem;color:#d9eaff}
          .mt-temp-text strong{color:var(--mt-accent)}
          .mt-btn-link{border:1px solid #3a4656;background:rgba(0,0,0,.24);color:#a6b8ca;padding:5px 8px;font-size:.7rem;cursor:pointer}
          .mt-btn-link.is-danger{color:#ff7d97;border-color:rgba(255,0,60,.4)}
          .mt-actions{display:flex;gap:8px;margin-top:10px}
          .mt-actions button{flex:1;padding:9px 10px;cursor:pointer;font-size:.69rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
          .mt-cancel{border:1px solid #4b5666;background:transparent;color:#bcc7d2}
          .mt-submit{border:1px solid var(--mt-accent);background:rgba(0,229,255,.1);color:var(--mt-accent)}
          @media (max-width:720px){.mt-header{align-items:center}.mt-brand{min-width:0}.mt-title{font-size:.9rem}.mt-date{font-size:.64rem}.mt-row{grid-template-columns:1fr}.mt-card-actions{flex-wrap:wrap}.mt-fab-wrap{flex-wrap:wrap}}
          @keyframes mt-title-pulse{0%,100%{text-shadow:0 0 5px rgba(0,229,255,.35),0 0 10px rgba(0,229,255,.2)}50%{text-shadow:0 0 8px rgba(0,229,255,.6),0 0 18px rgba(0,229,255,.35)}}
          @keyframes mt-chroma{0%,78%,100%{opacity:.1;transform:translateX(0)}80%{opacity:.25;transform:translateX(1px)}82%{opacity:.18;transform:translateX(-1px)}}
        </style>

        <header class="mt-header">
          <div class="mt-brand">
            <div class="mt-bolt"><span>Z</span></div>
            <div>
              <h2 class="mt-title" data-text="SISTEMA: MISSAO DIARIA">SISTEMA: MISSAO DIARIA</h2>
              <p class="mt-date" data-role="today-date"></p>
            </div>
          </div>
          <div class="mt-stat">
            <strong data-role="completed">0/0</strong>
            <span>Missoes</span>
          </div>
        </header>

        <div class="mt-progress-wrap"><div class="mt-progress" data-role="progress"></div></div>
        <p class="mt-notice is-empty" data-role="notice"></p>
        <section class="mt-list" data-role="list"></section>
        <div class="mt-fab-wrap">
          <button class="mt-fab" data-action="open-modal">[+] Nova Missao</button>
          <button class="mt-fab sec" data-action="refresh">Sincronizar</button>
        </div>

        <div class="mt-modal is-hidden" data-role="modal">
          <div class="mt-modal-card">
            <div class="mt-modal-top">
              <div>
                <h4 data-role="modal-title">NOVA MISSAO</h4>
                <p data-role="modal-desc">Adicione os itens desta nova missao diaria.</p>
              </div>
              <button class="mt-close" data-action="close-modal">X</button>
            </div>
            <div class="mt-form">
              <div class="mt-row">
                <div class="mt-field">
                  <label>Exercicio / Item</label>
                  <input type="text" data-role="temp-name" placeholder="Ex: Flexoes" />
                </div>
                <div class="mt-field">
                  <label>Reps</label>
                  <input type="number" data-role="temp-reps" value="10" />
                </div>
                <div style="display:flex;align-items:end;">
                  <button class="mt-btn-soft" data-action="add-temp">ADICIONAR</button>
                </div>
              </div>
              <div class="mt-temp-list" data-role="temp-list"></div>
              <div class="mt-actions">
                <button class="mt-cancel" data-action="clear-temp">Limpar tudo</button>
                <button class="mt-submit" data-role="modal-submit" data-action="submit-modal">CRIAR MISSAO</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

export function renderMissoesTreinoContent(container) {
  if (!container) return;
  if (typeof container._cleanup === 'function') container._cleanup();
  const app = new MissoesTreinoApp(container);
  app.init();
  container._cleanup = () => app.destroy();
}
