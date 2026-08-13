import { MockTreinoStore } from './mock.example.js';

function isLocalDevHost() {
  try {
    const host = String(window.location.hostname || '').toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  } catch (_err) {
    return false;
  }
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = String(value ?? '');
  return div.innerHTML;
}

function formatProfileMissionCount(count) {
  const n = Number(count) || 0;
  return n === 1 ? '1 MISSÃO' : `${n} MISSÕES`;
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

function normalizeWeekdayText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getWeekdayTokensForToday() {
  const jsDay = new Date().getDay(); // 0..6 (dom..sab)
  const map = {
    1: ['segunda-feira', 'segunda'],
    2: ['terca-feira', 'terça-feira', 'terca', 'terça'],
    3: ['quarta-feira', 'quarta'],
    4: ['quinta-feira', 'quinta'],
    5: ['sexta-feira', 'sexta'],
    6: ['sabado', 'sábado'],
  };
  return map[jsDay] || [];
}

function missionMatchesTodayByName(mission, weekdayTokens) {
  if (!mission || !Array.isArray(weekdayTokens) || !weekdayTokens.length) return false;
  const referenceText = normalizeWeekdayText(`${mission?.title || ''} ${mission?.data_referencia || ''}`);
  if (!referenceText) return false;
  return weekdayTokens.some((token) => referenceText.includes(normalizeWeekdayText(token)));
}

function parseExerciseMeta(item) {
  const rawName = String(item?.name || '');
  const explicitSeries = Number(item?.series || 0);
  const explicitRepeticoes = Number(item?.repeticoes || item?.reps || 0);
  const match = rawName.match(/^(.*)\s\[(\d+)x(\d+)\]$/i);
  if (match) {
    return {
      name: match[1].trim(),
      series: Number(match[2] || 1),
      repeticoes: Number(match[3] || 1),
    };
  }
  return {
    name: rawName,
    series: explicitSeries > 0 ? explicitSeries : 1,
    repeticoes: explicitRepeticoes > 0 ? explicitRepeticoes : 1,
  };
}

function composeExerciseName(name, series, repeticoes) {
  const cleanName = String(name || '').trim();
  return `${cleanName} [${series}x${repeticoes}]`;
}

function tempItemHtml(item) {
  return `
    <div class="mt-temp-item">
      <div class="mt-temp-text"><strong>${Number(item.series || 1)}x${Number(item.repeticoes || 0)}</strong> ${escapeHtml(item.name)}</div>
      <div class="mt-temp-actions">
        <button class="mt-btn-link" data-action="edit-temp" data-id="${escapeHtml(item.id)}">Editar</button>
        <button class="mt-btn-link is-danger" data-action="remove-temp" data-id="${escapeHtml(item.id)}">Remover</button>
      </div>
    </div>
  `;
}

function missionCardHtml(mission, index, isTodayHighlight = false) {
  const total = mission.items?.length || 0;
  const done = (mission.items || []).filter((item) => item.completed).length;
  const allDone = total > 0 && done === total;
  const shellClass = [
    'mt-mission-shell',
    allDone ? 'is-done' : '',
    isTodayHighlight ? (allDone ? 'is-today-pulse-done' : 'is-today-pulse') : '',
  ].filter(Boolean).join(' ');
  return `
    <section class="${shellClass}" style="--card-i:${index};">
      <header class="mt-mission-shell-header">
        <h3>${escapeHtml(mission.title || `MISSÃO ${index + 1}`)} ${isTodayHighlight ? '<span class="mt-today-badge">TREINO DE HOJE</span>' : ''}</h3>
        <span>${done}/${total} itens concluídos</span>
      </header>
      <div class="mt-mission-list">
        ${(mission.items || []).map((item) => {
          const meta = parseExerciseMeta(item);
          return `
          <article class="mt-mission-row ${item.completed ? 'is-done' : ''}">
            <div class="mt-mission-main">
              <h4 class="mt-mission-title ${item.completed ? 'is-done' : ''}">${escapeHtml(meta.name)}</h4>
              <p class="mt-mission-meta">SÉRIES/REPS: <strong>${Number(item.series || meta.series || 1)}x${Number(item.repeticoes || meta.repeticoes || item.reps || 0)}</strong> (TOTAL ${Number(item.reps || 0)})</p>
            </div>
          </article>
        `;
        }).join('')}
      </div>
      <footer class="mt-card-actions">
        <button class="mt-btn-icon" data-action="edit-mission" data-mission-id="${escapeHtml(mission.id)}" ${mission._busy ? 'disabled' : ''}>Editar</button>
        <button class="mt-btn-icon is-danger" data-action="delete-mission" data-mission-id="${escapeHtml(mission.id)}" ${mission._busy ? 'disabled' : ''}>Excluir</button>
      </footer>
    </section>
  `;
}

function profileCardHtml(profile, index) {
  const color = escapeHtml(profile.cor || '#00e5ff');
  const icon = escapeHtml(profile.icone || 'fa-dumbbell');
  const count = Number(profile.missions_count || 0);
  return `
    <article class="mt-profile-card" style="--profile-color:${color};--card-i:${index};">
      <button class="mt-profile-open" data-action="select-profile" data-profile-id="${escapeHtml(profile.id)}" aria-label="Abrir perfil ${escapeHtml(profile.nome)}">
        <div class="mt-profile-icon"><i class="fas ${icon}" aria-hidden="true"></i></div>
        <div class="mt-profile-body">
          <h3>${escapeHtml(profile.nome)}</h3>
          <p>${escapeHtml(profile.descricao || 'Treinos personalizados deste perfil')}</p>
          <span class="mt-profile-meta">${formatProfileMissionCount(count)}</span>
        </div>
      </button>
      <footer class="mt-profile-actions">
        <button class="mt-btn-icon" data-action="edit-profile" data-profile-id="${escapeHtml(profile.id)}">Editar</button>
        <button class="mt-btn-icon is-danger" data-action="delete-profile" data-profile-id="${escapeHtml(profile.id)}">Excluir</button>
      </footer>
    </article>
  `;
}

class MissoesTreinoApp {
  constructor(container) {
    this.container = container;
    this.missions = [];
    this.profiles = [];
    this.tempMissions = [];
    this.performance = null;
    this.toasts = [];
    this.editingMissionId = null;
    this.editingTempItemId = null;
    this.editingProfileId = null;
    this.selectedProfile = null;
    this.selectedGoalsMonth = null;
    this.isLoading = false;
    this.isProfilesLoading = false;
    this.errorMessage = '';
    this.currentView = 'profiles';
    this.useMock = isLocalDevHost();
    this.mockStore = this.useMock ? new MockTreinoStore() : null;
    this.onClick = this.onClick.bind(this);
    this.onKeyPress = this.onKeyPress.bind(this);
  }

  init() {
    this.container.innerHTML = this.template();
    this.cacheDom();
    this.bind();
    this.updateDateDisplay();
    this.render();
    void this.bootstrapAndLoad();
  }

  async bootstrapAndLoad() {
    if (this.useMock) {
      try {
        const mod = await import('./mock.js');
        this.mockStore = new mod.MockTreinoStore();
      } catch (_err) {
        // mock.example.js já carregado no construtor
      }
      this.setNotice('Mock local fixo ativo.');
      this.render();
    }
    await this.loadProfiles();
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
    this.modalEl = this.container.querySelector('[data-role="modal"]');
    this.modalTitleEl = this.container.querySelector('[data-role="modal-title"]');
    this.modalDescEl = this.container.querySelector('[data-role="modal-desc"]');
    this.modalSubmitEl = this.container.querySelector('[data-role="modal-submit"]');
    this.tempTitleInput = this.container.querySelector('[data-role="temp-title"]');
    this.tempNameInput = this.container.querySelector('[data-role="temp-name"]');
    this.tempSeriesInput = this.container.querySelector('[data-role="temp-series"]');
    this.tempRepsInput = this.container.querySelector('[data-role="temp-reps"]');
    this.tempListEl = this.container.querySelector('[data-role="temp-list"]');
    this.performanceHost = this.container.querySelector('[data-role="performance"]');
    this.toastHost = this.container.querySelector('[data-role="toasts"]');
    this.profilesHost = this.container.querySelector('[data-role="profiles-list"]');
    this.trainingHost = this.container.querySelector('[data-role="training-view"]');
    this.profileModalEl = this.container.querySelector('[data-role="profile-modal"]');
    this.profileModalTitleEl = this.container.querySelector('[data-role="profile-modal-title"]');
    this.profileModalDescEl = this.container.querySelector('[data-role="profile-modal-desc"]');
    this.profileModalSubmitEl = this.container.querySelector('[data-role="profile-modal-submit"]');
    this.profileNameInput = this.container.querySelector('[data-role="profile-name"]');
    this.profileDescInput = this.container.querySelector('[data-role="profile-desc"]');
    this.profileColorInput = this.container.querySelector('[data-role="profile-color"]');
    this.profileTitleEl = this.container.querySelector('[data-role="profile-title"]');
    this.profileSubtitleEl = this.container.querySelector('[data-role="profile-subtitle"]');
    this.confirmModalEl = this.container.querySelector('[data-role="confirm-modal"]');
    this.confirmModalTitleEl = this.container.querySelector('[data-role="confirm-title"]');
    this.confirmModalDescEl = this.container.querySelector('[data-role="confirm-desc"]');
    this.confirmModalConfirmEl = this.container.querySelector('[data-role="confirm-submit"]');
    this.confirmModalCancelEl = this.container.querySelector('[data-role="confirm-cancel"]');
    this.confirmResolver = null;
  }

  bind() {
    this.root.addEventListener('click', this.onClick);
    this.tempNameInput?.addEventListener('keypress', this.onKeyPress);
  }

  async api(path = '', options = {}) {
    if (this.useMock && this.mockStore) {
      return this.mockStore.handle(path, options);
    }

    const response = await fetch(`/api/missoes-treino${path}`, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || 'Falha na API de missões de treino');
    return data;
  }

  buildApiQuery(params = {}) {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value != null && String(value).trim() !== '') search.set(key, String(value));
    });
    const qs = search.toString();
    return qs ? `?${qs}` : '';
  }

  async loadProfiles() {
    this.isProfilesLoading = true;
    this.setNotice('Carregando perfis...');
    this.render();
    try {
      const data = await this.api(this.buildApiQuery({ resource: 'profiles' }));
      this.profiles = Array.isArray(data?.profiles) ? data.profiles : [];
      this.setNotice(this.profiles.length ? 'Selecione um perfil para continuar.' : 'Crie seu primeiro perfil de treino.');
    } catch (err) {
      this.setNotice(err.message || 'Falha ao carregar perfis.', true);
    } finally {
      this.isProfilesLoading = false;
      this.render();
    }
  }

  selectProfile(profileId) {
    const profile = this.profiles.find((item) => String(item.id) === String(profileId));
    if (!profile) return;
    this.selectedProfile = profile;
    this.currentView = 'training';
    sessionStorage.setItem('mt-selected-profile-id', String(profile.id));
    this.loadFromApi();
  }

  backToProfiles() {
    this.currentView = 'profiles';
    this.selectedProfile = null;
    this.missions = [];
    this.performance = null;
    sessionStorage.removeItem('mt-selected-profile-id');
    this.render();
    this.loadProfiles();
  }

  openProfileModal(profileId = null) {
    this.editingProfileId = profileId;
    const profile = profileId ? this.profiles.find((item) => String(item.id) === String(profileId)) : null;
    if (profile) {
      this.profileModalTitleEl.textContent = 'EDITAR PERFIL';
      this.profileModalDescEl.textContent = 'Atualize nome, descrição e cor deste perfil.';
      this.profileModalSubmitEl.textContent = 'SALVAR PERFIL';
      if (this.profileNameInput) this.profileNameInput.value = String(profile.nome || '');
      if (this.profileDescInput) this.profileDescInput.value = String(profile.descricao || '');
      if (this.profileColorInput) this.profileColorInput.value = String(profile.cor || '#00e5ff');
    } else {
      this.profileModalTitleEl.textContent = 'NOVO PERFIL';
      this.profileModalDescEl.textContent = 'Crie um perfil para organizar treinos personalizados.';
      this.profileModalSubmitEl.textContent = 'CRIAR PERFIL';
      if (this.profileNameInput) this.profileNameInput.value = '';
      if (this.profileDescInput) this.profileDescInput.value = '';
      if (this.profileColorInput) this.profileColorInput.value = '#00e5ff';
    }
    this.profileModalEl.classList.remove('is-hidden');
    window.setTimeout(() => this.profileModalEl.classList.add('is-open'), 10);
    this.profileNameInput?.focus();
  }

  closeProfileModal() {
    this.profileModalEl.classList.remove('is-open');
    window.setTimeout(() => this.profileModalEl.classList.add('is-hidden'), 180);
    this.editingProfileId = null;
  }

  async commitProfile() {
    const nome = String(this.profileNameInput?.value || '').trim();
    const descricao = String(this.profileDescInput?.value || '').trim();
    const cor = String(this.profileColorInput?.value || '#00e5ff').trim() || '#00e5ff';
    if (!nome) {
      this.showToast('Informe o nome do perfil.', 'error');
      return;
    }

    this.profileModalSubmitEl.disabled = true;
    try {
      if (this.editingProfileId) {
        await this.api('', {
          method: 'PATCH',
          body: JSON.stringify({
            resource: 'profile',
            profile_id: this.editingProfileId,
            nome,
            descricao,
            cor,
          }),
        });
        this.showToast('Perfil atualizado com sucesso.');
      } else {
        await this.api('', {
          method: 'POST',
          body: JSON.stringify({
            resource: 'profile',
            nome,
            descricao,
            cor,
          }),
        });
        this.showToast('Perfil criado com sucesso.');
      }
      this.closeProfileModal();
      await this.loadProfiles();
    } catch (err) {
      this.showToast(err.message || 'Falha ao salvar perfil.', 'error');
    } finally {
      this.profileModalSubmitEl.disabled = false;
    }
  }

  async deleteProfile(profileId) {
    const profile = this.profiles.find((item) => String(item.id) === String(profileId));
    if (!profile) return;
    const confirmed = await this.openConfirm({
      title: 'EXCLUIR PERFIL',
      message: `O perfil "${profile.nome}" será removido junto com todos os treinos vinculados. Essa ação não pode ser desfeita.`,
      confirmLabel: 'EXCLUIR PERFIL',
      cancelLabel: 'MANTER PERFIL',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await this.api('', {
        method: 'DELETE',
        body: JSON.stringify({ resource: 'profile', profile_id: profileId }),
      });
      if (this.selectedProfile && String(this.selectedProfile.id) === String(profileId)) {
        this.backToProfiles();
        return;
      }
      await this.loadProfiles();
      this.showToast('Perfil excluído.');
    } catch (err) {
      this.showToast(err.message || 'Falha ao excluir perfil.', 'error');
    }
  }

  openConfirm(options = {}) {
    return new Promise((resolve) => {
      this.confirmResolver = resolve;
      if (this.confirmModalTitleEl) {
        this.confirmModalTitleEl.textContent = String(options.title || 'CONFIRMAR AÇÃO');
      }
      if (this.confirmModalDescEl) {
        this.confirmModalDescEl.textContent = String(options.message || 'Deseja continuar?');
      }
      if (this.confirmModalConfirmEl) {
        this.confirmModalConfirmEl.textContent = String(options.confirmLabel || 'CONFIRMAR');
      }
      if (this.confirmModalCancelEl) {
        this.confirmModalCancelEl.textContent = String(options.cancelLabel || 'CANCELAR');
      }
      const tone = options.tone === 'danger' ? 'danger' : options.tone === 'create' ? 'create' : 'default';
      const card = this.confirmModalEl?.querySelector('.mt-confirm-card');
      card?.classList.remove('is-danger', 'is-create');
      if (tone === 'danger') card?.classList.add('is-danger');
      if (tone === 'create') card?.classList.add('is-create');
      const iconEl = this.confirmModalEl?.querySelector('.mt-confirm-icon i');
      if (iconEl) {
        iconEl.className = tone === 'create'
          ? 'fas fa-circle-plus'
          : tone === 'danger'
            ? 'fas fa-triangle-exclamation'
            : 'fas fa-circle-question';
      }
      this.confirmModalEl?.classList.remove('is-hidden');
      window.setTimeout(() => this.confirmModalEl?.classList.add('is-open'), 10);
    });
  }

  closeConfirm(result = false) {
    this.confirmModalEl?.classList.remove('is-open');
    window.setTimeout(() => this.confirmModalEl?.classList.add('is-hidden'), 180);
    const resolver = this.confirmResolver;
    this.confirmResolver = null;
    if (typeof resolver === 'function') resolver(Boolean(result));
  }

  setNotice(message = '', isError = false) {
    this.errorMessage = message || '';
    void isError;
  }

  async loadFromApi() {
    if (!this.selectedProfile?.id) return;
    this.isLoading = true;
    this.setNotice('Sincronizando com o banco...');
    this.render();
    try {
      const data = await this.api(this.buildApiQuery({ profile_id: this.selectedProfile.id }));
      this.missions = Array.isArray(data?.missions) ? data.missions : [];
      this.performance = data?.performance || null;
      await this.migrateLegacyLocalData(this.missions);
      const refreshed = await this.api(this.buildApiQuery({ profile_id: this.selectedProfile.id }));
      this.missions = Array.isArray(refreshed?.missions) ? refreshed.missions : [];
      this.performance = refreshed?.performance || this.performance;
      this.setNotice(this.missions.length ? 'Dados sincronizados.' : 'Sem missões para este perfil.');
    } catch (err) {
      this.setNotice(err.message || 'Falha ao carregar missões.', true);
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  async migrateLegacyLocalData(existingMissions = []) {
    if (this.useMock) return;
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
        body: JSON.stringify({ profile_id: this.selectedProfile?.id, items: normalizedLegacy }),
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

    const profileId = actionEl.getAttribute('data-profile-id');

    if (action === 'refresh') {
      if (this.currentView === 'profiles') this.loadProfiles();
      else this.loadFromApi();
    }
    if (action === 'back-profiles') this.backToProfiles();
    if (action === 'open-profile-modal') this.openProfileModal();
    if (action === 'close-profile-modal') this.closeProfileModal();
    if (action === 'submit-profile-modal') this.commitProfile();
    if (action === 'select-profile' && profileId) this.selectProfile(profileId);
    if (action === 'edit-profile' && profileId) this.openProfileModal(profileId);
    if (action === 'delete-profile' && profileId) this.deleteProfile(profileId);
    if (action === 'confirm-submit') this.closeConfirm(true);
    if (action === 'confirm-cancel' || action === 'close-confirm') this.closeConfirm(false);
    if (action === 'open-modal') this.openModal();
    if (action === 'close-modal') this.closeModal();
    if (action === 'clear-temp') {
      this.tempMissions = [];
      this.renderTempList();
    }
    if (action === 'add-temp') this.addTempItem();
    if (action === 'submit-modal') this.commitMissions();
    if (action === 'edit-temp' && id) this.startEditTempItem(id);
    if (action === 'remove-temp' && id) this.removeTempItem(id);
    if (action === 'delete-mission' && missionId) this.deleteMission(missionId);
    if (action === 'edit-mission' && missionId) this.openModal(missionId);
  }

  updateDateDisplay() {
    const options = { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' };
    const prefix = this.useMock ? 'MOCK LOCAL FIXO' : 'STATUS DO SERVIDOR';
    this.todayDateEl.textContent = `${prefix}: ${new Date().toLocaleDateString('pt-BR', options).toUpperCase()}`;
  }

  openModal(missionId = null) {
    this.editingMissionId = missionId;
    if (missionId) {
      const mission = this.missions.find((m) => m.id === missionId);
      this.tempMissions = (mission?.items || []).map((item) => {
        const meta = parseExerciseMeta(item);
        const series = Number(item.series || meta.series || 1);
        const repeticoes = Number(item.repeticoes || meta.repeticoes || item.reps || 1);
        return {
          id: item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: meta.name,
          series,
          repeticoes,
          reps: series * repeticoes,
          completed: Boolean(item.completed),
        };
      });
      this.modalTitleEl.textContent = 'EDITAR MISSÃO';
      this.modalDescEl.textContent = 'Edite os itens desta missão.';
      this.modalSubmitEl.textContent = 'ATUALIZAR MISSÃO';
      if (this.tempTitleInput) this.tempTitleInput.value = String(mission?.title || '').trim();
    } else {
      this.tempMissions = [];
      this.modalTitleEl.textContent = 'NOVA MISSÃO';
      this.modalDescEl.textContent = 'Adicione os exercícios deste treino. Ele fica salvo neste perfil.';
      this.modalSubmitEl.textContent = 'CRIAR MISSÃO';
      if (this.tempTitleInput) this.tempTitleInput.value = '';
    }
    this.editingTempItemId = null;
    this.resetTempInputs();
    this.renderTempList();
    this.modalEl.classList.remove('is-hidden');
    window.setTimeout(() => this.modalEl.classList.add('is-open'), 10);
    this.tempNameInput?.focus();
  }

  closeModal() {
    this.modalEl.classList.remove('is-open');
    window.setTimeout(() => this.modalEl.classList.add('is-hidden'), 180);
    this.editingMissionId = null;
    this.editingTempItemId = null;
  }

  resetTempInputs() {
    this.tempNameInput.value = '';
    if (this.tempSeriesInput) this.tempSeriesInput.value = '3';
    if (this.tempRepsInput) this.tempRepsInput.value = '12';
    this.editingTempItemId = null;
    const addBtn = this.container.querySelector('[data-action="add-temp"]');
    if (addBtn) addBtn.textContent = 'ADICIONAR';
  }

  addTempItem() {
    const name = this.tempNameInput.value.trim();
    const series = Number.parseInt(this.tempSeriesInput?.value, 10);
    const repeticoes = Number.parseInt(this.tempRepsInput.value, 10);
    if (!name || !Number.isFinite(series) || series <= 0 || !Number.isFinite(repeticoes) || repeticoes <= 0) return;
    const payload = {
      id: this.editingTempItemId || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      series,
      repeticoes,
      reps: series * repeticoes,
      completed: false,
    };
    if (this.editingTempItemId) {
      this.tempMissions = this.tempMissions.map((item) => (item.id === this.editingTempItemId ? { ...item, ...payload } : item));
    } else {
      this.tempMissions.push(payload);
    }
    this.resetTempInputs();
    this.tempNameInput.focus();
    this.renderTempList();
  }

  startEditTempItem(id) {
    const item = this.tempMissions.find((row) => row.id === id);
    if (!item) return;
    this.editingTempItemId = item.id;
    this.tempNameInput.value = item.name || '';
    if (this.tempSeriesInput) this.tempSeriesInput.value = String(Number(item.series || 1));
    this.tempRepsInput.value = String(Number(item.repeticoes || item.reps || 1));
    const addBtn = this.container.querySelector('[data-action="add-temp"]');
    if (addBtn) addBtn.textContent = 'ATUALIZAR';
    this.tempNameInput.focus();
  }

  removeTempItem(id) {
    this.tempMissions = this.tempMissions.filter((item) => item.id !== id);
    if (this.editingTempItemId === id) this.resetTempInputs();
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
    const isEditingMission = Boolean(this.editingMissionId);
    if (!isEditingMission) {
      const missionTitle = String(this.tempTitleInput?.value || '').trim() || 'Novo treino';
      const itemCount = this.tempMissions.length;
      const confirmed = await this.openConfirm({
        title: 'REGISTRAR NOVA MISSÃO',
        message: `Confirmar a criação de "${missionTitle}" com ${itemCount} exercício${itemCount === 1 ? '' : 's'} neste perfil?`,
        confirmLabel: 'CRIAR MISSÃO',
        cancelLabel: 'REVISAR ITENS',
        tone: 'create',
      });
      if (!confirmed) return;
    }
    this.modalSubmitEl.disabled = true;
    this.setNotice('Salvando missão no banco...');
    try {
      const payloadItems = this.tempMissions.map((item, idx) => ({
        name: composeExerciseName(String(item.name || '').trim(), Number(item.series || 0), Number(item.repeticoes || 0)),
        reps: Number(item.series || 0) * Number(item.repeticoes || 0),
        series: Number(item.series || 0),
        repeticoes: Number(item.repeticoes || 0),
        ordem: idx + 1,
        completed: Boolean(item.completed),
      })).filter((item) => item.name && item.reps > 0 && item.series > 0 && item.repeticoes > 0);

      if (!payloadItems.length) throw new Error('Adicione ao menos 1 exercício válido.');

      if (this.editingMissionId) {
        await this.api('', {
          method: 'PATCH',
          body: JSON.stringify({
            profile_id: this.selectedProfile?.id,
            mission_id: this.editingMissionId,
            title: String(this.tempTitleInput?.value || '').trim() || 'Novo treino',
            replace_items: payloadItems,
          }),
        });
      } else {
        await this.api('', {
          method: 'POST',
          body: JSON.stringify({
            profile_id: this.selectedProfile?.id,
            title: String(this.tempTitleInput?.value || '').trim() || 'Novo treino',
            items: payloadItems,
          }),
        });
      }

      this.closeModal();
      await this.loadFromApi();
      if (isEditingMission) {
        this.setNotice('Missão atualizada com sucesso.');
        this.showToast('MISSÃO ATUALIZADA COM SUCESSO');
      } else {
        this.setNotice('Missão incluída com sucesso.');
        this.showToast({
          type: 'confirm',
          title: 'Missão Inserida',
          message: 'Sua nova missão foi salva com sucesso no sistema.',
        });
      }
    } catch (err) {
      this.setNotice(err.message || 'Falha ao salvar missão.', true);
      this.showToast('ERRO AO SALVAR MISSÃO', 'error');
    } finally {
      this.modalSubmitEl.disabled = false;
      this.render();
    }
  }

  async deleteMission(missionId) {
    const mission = this.missions.find((m) => m.id === missionId);
    if (!mission) return;
    const confirmed = await this.openConfirm({
      title: 'EXCLUIR MISSÃO',
      message: `A missão "${mission.title || 'sem título'}" será removida permanentemente do perfil. Continuar?`,
      confirmLabel: 'EXCLUIR MISSÃO',
      cancelLabel: 'MANTER MISSÃO',
      tone: 'danger',
    });
    if (!confirmed) return;
    mission._busy = true;
    this.render();
    try {
      await this.api('', {
        method: 'DELETE',
        body: JSON.stringify({ mission_id: missionId }),
      });
      this.missions = this.missions.filter((m) => m.id !== missionId);
      this.setNotice('Missão removida do banco.');
      this.showToast({
        type: 'confirm-delete',
        title: 'Missão Excluída',
        message: 'A missão foi removida com sucesso do banco.',
      });
    } catch (err) {
      this.setNotice(err.message || 'Falha ao excluir missão.', true);
      mission._busy = false;
    }
    this.render();
  }

  showToast(messageOrConfig, type = 'success') {
    const config = typeof messageOrConfig === 'string'
      ? { message: messageOrConfig, type }
      : (messageOrConfig || {});
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.toasts.push({
      id,
      type: config.type || 'success',
      title: config.title || '',
      message: config.message || '',
    });
    this.renderToasts();
    window.setTimeout(() => {
      this.toasts = this.toasts.filter((t) => t.id !== id);
      this.renderToasts();
    }, 2600);
  }

  renderToasts() {
    if (!this.toastHost) return;
    this.toastHost.innerHTML = this.toasts.map((toast) => `
      <div class="mt-toast ${toast.type === 'error' ? 'is-error' : ''} ${toast.type === 'confirm' ? 'is-confirm' : ''} ${toast.type === 'confirm-delete' ? 'is-confirm-delete' : ''}">
        ${toast.title ? `<p class="mt-toast-title">${escapeHtml(toast.title)}</p>` : ''}
        <p class="mt-toast-text">${escapeHtml(toast.message)}</p>
      </div>
    `).join('');
  }

  renderMockBanner() {
    let banner = this.container.querySelector('[data-role="mock-banner"]');
    if (this.useMock) {
      if (!banner) {
        banner = document.createElement('div');
        banner.className = 'mt-mock-banner';
        banner.setAttribute('data-role', 'mock-banner');
        banner.textContent = 'Mock local fixo: módulo treino 100% em memória. Nada vai pro Supabase.';
        const header = this.container.querySelector('.mt-header-block');
        header?.insertAdjacentElement('afterend', banner);
      }
      this.updateDateDisplay();
    } else if (banner) {
      banner.remove();
    }
  }

  render() {
    this.renderMockBanner();
    const isProfilesView = this.currentView === 'profiles';
    this.trainingHost?.classList.toggle('mt-is-hidden', isProfilesView);
    this.profilesHost?.classList.toggle('mt-is-hidden', !isProfilesView);
    this.container.querySelector('[data-role="profiles-toolbar"]')?.classList.toggle('mt-is-hidden', !isProfilesView);
    this.container.querySelector('[data-role="training-toolbar"]')?.classList.toggle('mt-is-hidden', isProfilesView);
    this.container.querySelector('.mt-fab-floating')?.classList.toggle('mt-is-hidden', isProfilesView);
    this.container.querySelector('.mt-progress-wrap')?.classList.toggle('mt-is-hidden', isProfilesView);

    if (isProfilesView) {
      this.renderProfiles();
      return;
    }

    if (this.profileTitleEl) {
      this.profileTitleEl.textContent = this.selectedProfile?.nome || 'PERFIL DE TREINO';
    }
    if (this.profileSubtitleEl) {
      this.profileSubtitleEl.textContent = this.selectedProfile?.descricao || 'Treinos personalizados deste perfil';
    }

    const totalMissions = this.missions.length;
    const completedMissions = this.missions.filter((m) => m.completed).length;
    const progress = totalMissions ? Math.round((completedMissions / totalMissions) * 100) : 0;

    if (this.completedEl) this.completedEl.textContent = `${completedMissions}/${totalMissions}`;
    if (this.progressEl) {
      this.progressEl.style.width = `${progress}%`;
      this.progressEl.classList.toggle('is-full', totalMissions > 0 && progress === 100);
    }

    const displayMissions = this.missions;
    this.performanceHost?.classList.add('mt-is-hidden');

    if (this.isLoading) {
      this.listEl.innerHTML = `
        <div class="mt-empty-card mt-loading-state">
          <i class="fas fa-spinner spinner" aria-hidden="true"></i>
          <p class="mt-empty-title">SINCRONIZANDO...</p>
          <p class="mt-empty-text">Aguarde enquanto carregamos do banco.</p>
        </div>
      `;
      this.renderPerformance();
      return;
    }

    if (!displayMissions.length) {
      this.listEl.innerHTML = `
        <div class="mt-empty-card">
          <p class="mt-empty-title">NENHUMA MISSÃO</p>
          <p class="mt-empty-text">Clique em [+] Nova Missão para começar.</p>
        </div>
      `;
      this.renderPerformance();
      return;
    }

    this.listEl.innerHTML = displayMissions
      .map((mission, idx) => missionCardHtml(mission, idx, false))
      .join('');
    this.renderPerformance();
    this.renderToasts();
  }

  renderProfiles() {
    if (!this.profilesHost) return;
    if (this.isProfilesLoading) {
      this.profilesHost.innerHTML = `
        <div class="mt-empty-card mt-loading-state">
          <i class="fas fa-spinner spinner" aria-hidden="true"></i>
          <p class="mt-empty-title">CARREGANDO PERFIS...</p>
          <p class="mt-empty-text">Aguarde enquanto buscamos seus perfis de treino.</p>
        </div>
      `;
      return;
    }

    if (!this.profiles.length) {
      this.profilesHost.innerHTML = `
        <div class="mt-empty-card">
          <p class="mt-empty-title">NENHUM PERFIL</p>
          <p class="mt-empty-text">Crie um perfil para começar. Ex.: Hipertrofia, Emagrecimento, Corrida.</p>
        </div>
      `;
      return;
    }

    this.profilesHost.innerHTML = this.profiles
      .map((profile, idx) => profileCardHtml(profile, idx))
      .join('');
    this.renderToasts();
  }

  buildRadarSvg(radar) {
    const axes = Array.isArray(radar) && radar.length ? radar : [];
    const size = 240;
    const cx = 120;
    const cy = 120;
    const radius = 84;
    const levels = 4;
    const angleAt = (i) => ((Math.PI * 2) / axes.length) * i - Math.PI / 2;
    const pointAt = (i, ratio) => {
      const a = angleAt(i);
      const r = radius * ratio;
      return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    };

    const gridPolys = Array.from({ length: levels }, (_, l) => {
      const ratio = (l + 1) / levels;
      return axes
        .map((_, i) => {
          const p = pointAt(i, ratio);
          return `${p.x},${p.y}`;
        })
        .join(' ');
    });

    const spokes = axes.map((_, i) => {
      const p = pointAt(i, 1);
      return `<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" />`;
    });

    const valuePoly = axes
      .map((axis, i) => {
        const score = Math.max(0, Math.min(100, Number(axis.score || 0)));
        const p = pointAt(i, score / 100);
        return `${p.x},${p.y}`;
      })
      .join(' ');

    const labels = axes.map((axis, i) => {
      const p = pointAt(i, 1.16);
      return `<text x="${p.x}" y="${p.y}">${escapeHtml(axis.label || '')}</text>`;
    });

    return `
      <svg viewBox="0 0 ${size} ${size}" class="mt-radar-svg" role="img" aria-label="Radar de treino">
        <g class="mt-radar-grid">${gridPolys.map((pts) => `<polygon points="${pts}" />`).join('')}</g>
        <g class="mt-radar-spokes">${spokes.join('')}</g>
        <polygon class="mt-radar-value" points="${valuePoly}" />
        <g class="mt-radar-labels">${labels.join('')}</g>
      </svg>
    `;
  }

  renderPerformance() {
    if (!this.performanceHost) return;
    const p = this.performance || {};
    const history = Array.isArray(p.history) ? p.history : [];
    const goalsByMonth = Array.isArray(p.mission_goals_by_month) ? p.mission_goals_by_month : [];
    const minMonthRef = '2026-05';
    const monthOptionsRaw = goalsByMonth.length
      ? goalsByMonth.map((entry) => String(entry.month_ref || '')).filter(Boolean)
      : history.map((entry) => String(entry.month_ref || '')).filter(Boolean);
    const monthOptions = monthOptionsRaw.filter((monthRef) => monthRef >= minMonthRef);
    const selectedMonth = (this.selectedGoalsMonth && monthOptions.includes(this.selectedGoalsMonth))
      ? this.selectedGoalsMonth
      : (monthOptions[0] || String(p.month_ref || ''));
    const selectedEntry = goalsByMonth.find((entry) => String(entry.month_ref || '') === selectedMonth) || {
      month_ref: selectedMonth,
      total_goals: 0,
      completed_goals: 0,
      success_rate_percent: 0,
      goals: [],
    };
    const goals = Array.isArray(selectedEntry.goals) ? selectedEntry.goals : [];
    const buildCalendarHtml = () => {
      const [yy, mm] = String(selectedMonth || '').split('-').map(Number);
      if (!Number.isFinite(yy) || !Number.isFinite(mm) || mm < 1 || mm > 12) {
        return '<div class="mt-perf-empty">Selecione um mês válido para visualizar o calendário.</div>';
      }

      const daysInMonth = new Date(yy, mm, 0).getDate();
      const firstDayJs = new Date(yy, mm - 1, 1).getDay();
      const firstDayMondayBased = (firstDayJs + 6) % 7;

      const byDate = new Map();
      for (const goal of goals) {
        const dateRef = String(goal?.date_ref || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRef)) continue;
        if (!byDate.has(dateRef)) byDate.set(dateRef, []);
        byDate.get(dateRef).push(goal);
      }

      const normalizeWeekdayKey = (text) => {
        const normalized = String(text || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
        if (normalized.includes('segunda')) return 'mon';
        if (normalized.includes('terca')) return 'tue';
        if (normalized.includes('quarta')) return 'wed';
        if (normalized.includes('quinta')) return 'thu';
        if (normalized.includes('sexta')) return 'fri';
        if (normalized.includes('sabado')) return 'sat';
        return '';
      };

      const weekdayMissionTemplate = { mon: '', tue: '', wed: '', thu: '', fri: '', sat: '' };
      for (const goal of goals) {
        const key = normalizeWeekdayKey(goal?.title || '');
        if (!key) continue;
        if (!weekdayMissionTemplate[key]) weekdayMissionTemplate[key] = String(goal?.title || '').trim();
      }

      const weekdayKeyByJs = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' };

      const cells = [];
      for (let i = 0; i < firstDayMondayBased; i += 1) {
        cells.push('<div class="mt-cal-day is-empty"></div>');
      }

      for (let day = 1; day <= daysInMonth; day += 1) {
        const dateRef = `${yy}-${String(mm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const jsWeekday = new Date(yy, mm - 1, day).getDay();
        const isSunday = jsWeekday === 0;
        const weekdayKey = weekdayKeyByJs[jsWeekday] || '';
        const plannedMissionTitle = weekdayMissionTemplate[weekdayKey] || '';
        const dayGoals = byDate.get(dateRef) || [];
        const completedCount = dayGoals.filter((g) => Boolean(g.completed)).length;
        const totalCount = dayGoals.length;
        const allDone = totalCount > 0 && completedCount === totalCount;
        const hasPending = totalCount > 0 && completedCount < totalCount;
        const stateClass = isSunday
          ? 'is-rest'
          : allDone
            ? 'is-done'
            : hasPending
              ? 'is-pending'
              : 'is-empty-goal';
        const tooltip = isSunday
          ? `Domingo (${dateRef}) - Descanso`
          : (plannedMissionTitle || 'Missão não definida para este dia');
        const sundayLabel = '<span class="mt-rest-emoji" aria-hidden="true">😴</span> SONECA';

        cells.push(`
          <div class="mt-cal-day ${stateClass}" title="${escapeHtml(tooltip)}">
            <span class="mt-cal-num">${day}</span>
            <span class="mt-cal-meta">${isSunday ? sundayLabel : plannedMissionTitle ? plannedMissionTitle : '--'}</span>
          </div>
        `);
      }

      return `
        <div class="mt-calendar-wrap">
          <div class="mt-cal-head">
            <span>SEG</span><span>TER</span><span>QUA</span><span>QUI</span><span>SEX</span><span>SAB</span><span>DOM</span>
          </div>
          <div class="mt-cal-grid">${cells.join('')}</div>
        </div>
      `;
    };
    const radar = Array.isArray(p.radar) ? p.radar : [];
    const radarSvg = radar.length ? this.buildRadarSvg(radar) : '<div class="mt-perf-empty">Sem dados de desempenho</div>';
    this.performanceHost.innerHTML = `
      <section class="mt-performance-wrap">
        <article class="mt-perf-card">
          <div class="mt-goals-head">
            <h4>METAS DO MÊS (POR MISSÃO)</h4>
            <select class="mt-month-select" data-role="month-select">
              ${monthOptions.map((month) => `<option value="${escapeHtml(month)}" ${month === selectedMonth ? 'selected' : ''}>${escapeHtml(month)}</option>`).join('')}
            </select>
          </div>
          <div class="mt-success-line">
            <div class="mt-success-track">
              <div class="mt-success-fill is-open" style="width:${Math.max(0, Math.min(100, Number(selectedEntry.success_rate_percent || 0)))}%"></div>
            </div>
            <strong>${Math.max(0, Math.min(100, Number(selectedEntry.success_rate_percent || 0)))}%</strong>
          </div>
          <p>${Number(selectedEntry.completed_goals || 0)}/${Number(selectedEntry.total_goals || 0)} metas concluídas em ${escapeHtml(selectedMonth || '--')}</p>
          ${buildCalendarHtml()}
        </article>
        <article class="mt-perf-card">
          <h4>RADAR DE TREINO POR TIPO</h4>
          <div class="mt-radar-wrap">${radarSvg}</div>
        </article>
      </section>
    `;
    const monthSelect = this.performanceHost.querySelector('[data-role="month-select"]');
    if (monthSelect) {
      monthSelect.addEventListener('change', () => {
        const month = String(monthSelect.value || '');
        this.selectedGoalsMonth = month;
        this.renderPerformance();
      });
    }
  }

  template() {
    return `
      <div class="mt-root">
        <style>
          .mt-root{--mt-bg:#050508;--mt-panel:rgba(10,15,25,.82);--mt-border:rgba(0,229,255,.34);--mt-accent:#00e5ff;--mt-danger:#ff003c;--mt-ok:#00d084;--mt-text:#d8f3ff;background:radial-gradient(circle at center,#0a0f19 0%,#050508 100%);border:1px solid rgba(20,80,98,.4);border-radius:14px;box-shadow:inset 0 0 18px rgba(0,229,255,.05),0 12px 26px rgba(1,8,14,.32);color:var(--mt-text);font-family:"Space Mono","Consolas","Courier New",monospace;padding:14px;position:relative;overflow:visible;isolation:isolate}
          .mt-root *{box-sizing:border-box}
          .mt-root::before{content:"";position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,0) 50%,rgba(0,0,0,.14) 50%);background-size:100% 4px;pointer-events:none;opacity:.35}
          .mt-header-block{margin-bottom:16px;padding:16px;background:rgba(10,20,32,.6);border:1px solid var(--mt-border);border-radius:12px;box-shadow:inset 0 0 20px rgba(0,229,255,.05)}
          .mt-header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid var(--mt-border);padding-bottom:10px;margin-bottom:0;position:relative;z-index:1}
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
          .mt-progress-wrap{height:8px;background:#0d141f;border:1px solid rgba(96,102,122,.28);margin:0 0 20px 0;border-radius:999px;overflow:hidden;position:relative;z-index:1}
          .mt-progress{height:100%;width:0%;background:linear-gradient(90deg,#00e5ff,#00c6ff);transition:width .35s ease}
          .mt-progress.is-full{background:linear-gradient(90deg,#00d084,#3ce29f)}
          .mt-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-bottom:20px}
          .mt-empty-card{border:1px dashed var(--mt-border);background:rgba(255,255,255,.03);padding:24px 14px;text-align:center;border-radius:10px}
          .mt-empty-title{margin:0;color:var(--mt-accent);font-weight:800;letter-spacing:.12em;font-size:.78rem}
          .mt-empty-text{margin:6px 0 0;color:#8f9aa6;font-size:.72rem}
          .mt-mission-shell{border:1px solid var(--mt-border);background:var(--mt-panel);border-radius:10px;box-shadow:inset 0 0 12px rgba(0,229,255,.04);overflow:hidden;animation:cardIn .55s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--card-i, 0) * .07s);transition:transform .24s ease,box-shadow .24s ease,border-color .24s ease}
          .mt-mission-shell:hover{transform:translateY(-4px) scale(1.005);box-shadow:inset 0 0 14px rgba(0,229,255,.06),0 12px 24px rgba(2,20,36,.36);border-color:rgba(0,229,255,.62)}
          .mt-mission-shell.is-done{border-color:rgba(0,208,132,.42)}
          .mt-mission-shell.is-today-pulse{position:relative;border-color:rgba(255,95,31,.9);box-shadow:0 0 0 1px rgba(255,95,31,.4),0 0 14px rgba(255,95,31,.35),inset 0 0 10px rgba(255,95,31,.16);animation:cardIn .55s cubic-bezier(.2,.8,.2,1) both,mt-today-pulse 1.6s ease-in-out infinite}
          .mt-mission-shell.is-today-pulse-done{position:relative;border-color:rgba(0,208,132,.92);box-shadow:0 0 0 1px rgba(0,208,132,.4),0 0 14px rgba(0,208,132,.35),inset 0 0 10px rgba(0,208,132,.18);animation:cardIn .55s cubic-bezier(.2,.8,.2,1) both,mt-today-pulse-done 1.4s ease-in-out infinite}
          .mt-mission-shell-header{display:flex;justify-content:space-between;gap:6px;align-items:center;padding:8px 9px;border-bottom:1px solid rgba(95,122,153,.25);background:rgba(4,12,19,.5)}
          .mt-mission-shell-header h3{margin:0;color:var(--mt-accent);font-family:"Orbitron","Segoe UI",sans-serif;font-size:.74rem;letter-spacing:.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%}
          .mt-today-badge{display:inline-flex;align-items:center;justify-content:center;margin-left:8px;padding:2px 6px;border-radius:999px;font-size:.55rem;letter-spacing:.06em;text-transform:uppercase;color:#fff7ed;background:linear-gradient(135deg,#f97316,#ea580c);border:1px solid rgba(255,237,213,.5);box-shadow:0 0 8px rgba(249,115,22,.55)}
          .mt-mission-shell-header span{font-size:.6rem;color:#9fb0c0;text-transform:uppercase;letter-spacing:.06em}
          .mt-mission-list{display:grid;gap:0}
          .mt-mission-row{display:flex;justify-content:space-between;gap:8px;padding:8px;border-top:1px solid rgba(95,122,153,.16)}
          .mt-mission-row:first-child{border-top:none}
          .mt-mission-row.is-done{background:rgba(0,208,132,.07)}
          .mt-mission-main{min-width:0}
          .mt-mission-title{margin:0;color:var(--mt-accent);font-family:"Orbitron","Segoe UI",sans-serif;font-size:.82rem}
          .mt-mission-title.is-done{color:var(--mt-ok);text-decoration:line-through;opacity:.72}
          .mt-mission-meta{margin:3px 0 0;font-size:.56rem;letter-spacing:.08em;color:#94a3b8;text-transform:uppercase}
          .mt-mission-meta strong{color:#e8f6ff}
          .mt-card-actions{display:flex;gap:6px;align-items:center;padding:8px}
          .mt-btn{border:1px solid var(--mt-accent);background:rgba(0,229,255,.1);color:var(--mt-accent);padding:6px 8px;font-size:.55rem;font-weight:800;letter-spacing:.04em;cursor:pointer;white-space:nowrap}
          .mt-btn:disabled,.mt-btn-icon:disabled{opacity:.6;cursor:not-allowed}
          .mt-btn-complete.is-done{border-color:var(--mt-ok);background:rgba(0,208,132,.14);color:var(--mt-ok)}
          .mt-btn-icon{border:1px solid #3a4656;background:rgba(0,0,0,.2);color:#b3c1cf;padding:4px 6px;font-size:.58rem;cursor:pointer}
          .mt-btn-icon.is-danger{color:#ff7d97;border-color:rgba(255,0,60,.42)}
          .mt-fab-wrap{display:flex;gap:8px;margin-top:12px;position:relative;z-index:2}
          .mt-fab{display:inline-block;border:1px solid var(--mt-accent);background:rgba(0,229,255,.1);color:var(--mt-accent);padding:10px 13px;font-family:"Orbitron","Segoe UI",sans-serif;font-weight:800;font-size:.74rem;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;border-radius:8px}
          .mt-fab.sec{border-color:#3a4656;color:#c1d3e2;background:rgba(0,0,0,.22)}
          .mt-fab-floating{position:fixed;right:18px;bottom:18px;width:56px;height:56px;border-radius:50%;border:1px solid var(--mt-accent);background:radial-gradient(circle at 30% 30%,rgba(0,229,255,.35),rgba(0,105,132,.85));color:#dff9ff;font-size:2rem;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;z-index:4200;box-shadow:0 12px 24px rgba(0,0,0,.45),0 0 14px rgba(0,229,255,.35);transition:transform .18s ease,box-shadow .18s ease}
          .mt-fab-floating:hover{transform:translateY(-2px) scale(1.04);box-shadow:0 16px 28px rgba(0,0,0,.5),0 0 18px rgba(0,229,255,.5)}
          .mt-modal{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:14px;opacity:0;pointer-events:none;transition:opacity .18s ease;z-index:3000}
          .mt-modal[data-role="confirm-modal"]{z-index:3100}
          .mt-modal.is-open{opacity:1;pointer-events:auto}
          .mt-modal.is-hidden{display:none}
          .mt-modal-card{width:min(640px,100%);background:rgba(6,12,20,.95);border:1px solid var(--mt-border);border-radius:12px;padding:16px;transform:scale(.97);transition:transform .18s ease}
          .mt-modal.is-open .mt-modal-card{transform:scale(1)}
          .mt-modal-top{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;border-bottom:1px solid rgba(64,81,102,.45);padding-bottom:9px;margin-bottom:12px}
          .mt-modal-top h4{margin:0;color:var(--mt-accent);font-family:"Orbitron","Segoe UI",sans-serif;letter-spacing:.05em}
          .mt-modal-top p{margin:5px 0 0;font-size:.74rem;color:#93a1b0}
          .mt-close{border:1px solid #4b5666;background:transparent;color:#9fb0c0;cursor:pointer;padding:4px 9px}
          .mt-form{display:grid;gap:10px}
          .mt-row{display:grid;grid-template-columns:1fr 92px 110px auto;gap:8px}
          .mt-field label{display:block;font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;color:#8da0b3;margin-bottom:4px}
          .mt-field input{width:100%;background:#090f17;border:1px solid #2e3b4f;color:#e5f4ff;padding:8px 9px}
          .mt-btn-soft{border:1px solid var(--mt-accent);background:rgba(0,229,255,.14);color:var(--mt-accent);padding:8px 10px;cursor:pointer;font-weight:700}
          .mt-temp-list{max-height:220px;overflow:auto;background:rgba(255,255,255,.03);border:1px solid rgba(90,106,124,.28);padding:7px;display:grid;gap:7px}
          .mt-empty-small{text-align:center;color:#7d8a98;font-size:.72rem;margin:9px 0}
          .mt-temp-item{display:flex;justify-content:space-between;align-items:center;gap:7px;border-left:3px solid var(--mt-accent);padding:7px 8px;background:rgba(255,255,255,.03)}
          .mt-temp-text{font-size:.83rem;color:#d9eaff}
          .mt-temp-text strong{color:var(--mt-accent)}
          .mt-temp-actions{display:flex;gap:6px;align-items:center}
          .mt-btn-link{border:1px solid #3a4656;background:rgba(0,0,0,.24);color:#a6b8ca;padding:5px 8px;font-size:.7rem;cursor:pointer}
          .mt-btn-link.is-danger{color:#ff7d97;border-color:rgba(255,0,60,.4)}
          .mt-actions{display:flex;gap:8px;margin-top:10px}
          .mt-actions button{flex:1;padding:9px 10px;cursor:pointer;font-size:.69rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase}
          .mt-cancel{border:1px solid #4b5666;background:transparent;color:#bcc7d2}
          .mt-submit{border:1px solid var(--mt-accent);background:rgba(0,229,255,.1);color:var(--mt-accent)}
          .mt-performance-wrap{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:10px}
          .mt-perf-card{border:1px solid rgba(64,128,166,.34);border-radius:11px;padding:10px;background:linear-gradient(160deg,rgba(2,12,20,.52),rgba(3,16,28,.36));animation:cardIn .62s cubic-bezier(.2,.8,.2,1) both;transition:transform .24s ease,border-color .24s ease,box-shadow .24s ease}
          .mt-perf-card:hover{transform:translateY(-4px) scale(1.006);border-color:rgba(0,229,255,.52);box-shadow:0 12px 20px rgba(2,20,36,.3)}
          .mt-perf-card h4{margin:0 0 8px;color:#8cf2ff;font-size:.72rem;letter-spacing:.08em;font-family:"Orbitron","Segoe UI",sans-serif}
          .mt-goals-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
          .mt-month-select{background:#090f17;border:1px solid #2e3b4f;color:#e5f4ff;padding:5px 8px;font-size:.7rem}
          .mt-success-history{display:grid;gap:9px;max-height:260px;overflow-y:auto;padding-right:4px}
          .mt-success-history::-webkit-scrollbar{width:8px}
          .mt-success-history::-webkit-scrollbar-thumb{background:rgba(84,130,156,.45);border-radius:999px}
          .mt-success-history::-webkit-scrollbar-track{background:rgba(11,20,32,.35);border-radius:999px}
          .mt-success-history-item{padding:6px 8px;border-radius:9px;border:1px solid rgba(84,130,156,.2);background:rgba(8,16,25,.36);animation:cardIn .45s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--history-i, 0) * .05s)}
          .mt-success-history-item.is-closed{border-color:rgba(255,166,0,.28);background:linear-gradient(160deg,rgba(29,17,3,.36),rgba(20,13,4,.22))}
          .mt-success-line{display:flex;align-items:center;gap:8px}
          .mt-success-track{flex:1;height:10px;border:1px solid rgba(84,130,156,.45);background:#0b1420;border-radius:999px;overflow:hidden}
          .mt-success-fill{height:100%;transition:width .72s cubic-bezier(.2,.8,.2,1);position:relative;overflow:hidden}
          .mt-success-fill.is-open{background:linear-gradient(90deg,#00e5ff,#00b8d9);box-shadow:0 0 12px rgba(0,229,255,.55)}
          .mt-success-fill.is-closed{background:linear-gradient(90deg,#ff8a00,#ffb347);box-shadow:0 0 10px rgba(255,145,0,.5)}
          .mt-success-fill::after{content:"";position:absolute;inset:0 auto 0 -42px;width:40px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.52),transparent);animation:trackShine 1.7s linear infinite}
          .mt-success-line strong{color:#c6f7ff;font-size:.86rem}
          .mt-success-history-item.is-closed .mt-success-line strong{color:#ffd39b}
          .mt-perf-card p{margin:8px 0 0;color:#9ab0c6;font-size:.68rem}
          .mt-calendar-wrap{margin-top:8px;border:1px solid rgba(84,130,156,.26);border-radius:10px;padding:8px;background:rgba(4,11,18,.45)}
          .mt-cal-head{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin-bottom:5px}
          .mt-cal-head span{font-size:.58rem;color:#87a7bf;letter-spacing:.05em;text-align:center}
          .mt-cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
          .mt-cal-day{min-height:52px;border:1px solid rgba(73,112,138,.3);border-radius:8px;padding:4px 5px;display:flex;flex-direction:column;justify-content:space-between;background:rgba(8,16,25,.42)}
          .mt-cal-day.is-empty{opacity:0;border:none;background:transparent}
          .mt-cal-day.is-rest{border-color:rgba(151,163,177,.32);background:rgba(57,67,79,.28)}
          .mt-cal-day.is-done{border-color:rgba(0,208,132,.55);background:rgba(0,208,132,.15)}
          .mt-cal-day.is-pending{border-color:rgba(255,166,0,.55);background:rgba(255,166,0,.14)}
          .mt-cal-day.is-empty-goal{border-color:rgba(84,130,156,.28);background:rgba(8,16,25,.35)}
          .mt-cal-num{font-size:.72rem;color:#e7f8ff;font-weight:700}
          .mt-cal-meta{font-size:.52rem;color:#9fc0d8;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          .mt-rest-emoji{display:inline-block;animation:mt-rest-emoji-nap 1.7s ease-in-out infinite;transform-origin:center}
          .mt-is-hidden{display:none !important}
          .mt-radar-wrap{display:flex;justify-content:center;animation:radarFloat 3.4s ease-in-out infinite}
          .mt-radar-svg{width:100%;max-width:260px;height:auto}
          .mt-radar-grid polygon{fill:none;stroke:rgba(86,126,154,.28);stroke-width:1}
          .mt-radar-spokes line{stroke:rgba(86,126,154,.3);stroke-width:1}
          .mt-radar-value{fill:rgba(0,229,255,.24);stroke:#00e5ff;stroke-width:2;filter:drop-shadow(0 0 8px rgba(0,229,255,.45));transform-origin:center;animation:radarPulse 2.1s ease-in-out infinite}
          .mt-radar-labels text{fill:#9dc4dd;font-size:9px;font-family:"Space Mono","Consolas","Courier New",monospace;text-anchor:middle;dominant-baseline:middle}
          .mt-perf-empty{color:#7f95aa;font-size:.72rem}
          .mt-toast-wrap{position:fixed;left:50%;bottom:88px;transform:translateX(-50%);display:grid;gap:8px;z-index:5000;width:min(460px,calc(100vw - 24px))}
          .mt-toast{padding:12px 14px;background:rgba(0,229,255,.12);border:1px solid rgba(0,229,255,.55);color:#b9f5ff;font-size:.74rem;letter-spacing:.03em;border-radius:10px;backdrop-filter:blur(5px);animation:toastIn .24s ease;box-shadow:0 8px 24px rgba(0,0,0,.35)}
          .mt-toast-title{margin:0 0 4px;color:#e8fbff;font-family:"Orbitron","Segoe UI",sans-serif;font-size:.8rem;letter-spacing:.06em;text-transform:uppercase}
          .mt-toast-text{margin:0;color:inherit}
          .mt-toast.is-confirm{background:linear-gradient(160deg,rgba(0,208,132,.18),rgba(0,120,96,.16));border-color:rgba(0,208,132,.7);color:#dbffef}
          .mt-toast.is-confirm-delete{background:linear-gradient(160deg,rgba(255,166,0,.2),rgba(190,90,0,.2));border-color:rgba(255,166,0,.7);color:#ffe7c4}
          .mt-toast.is-error{background:rgba(255,0,60,.14);border-color:rgba(255,0,60,.62);color:#ffd3dd}
          @keyframes toastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
          @keyframes cardIn{from{opacity:0;transform:translateY(18px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
          @keyframes radarPulse{0%,100%{opacity:.88;transform:scale(.965)}50%{opacity:1;transform:scale(1.035)}}
          @keyframes radarFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
          @keyframes trackShine{0%{transform:translateX(0)}100%{transform:translateX(420px)}}
          @media (max-width:1024px){.mt-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
          @media (max-width:720px){.mt-header{align-items:center}.mt-brand{min-width:0}.mt-title{font-size:.9rem}.mt-date{font-size:.64rem}.mt-row{grid-template-columns:1fr}.mt-card-actions{flex-wrap:wrap}.mt-fab-wrap{flex-wrap:wrap}.mt-performance-wrap{grid-template-columns:1fr}.mt-list{grid-template-columns:1fr}.mt-fab-floating{right:12px;bottom:12px;width:52px;height:52px}}
          @keyframes mt-title-pulse{0%,100%{text-shadow:0 0 5px rgba(0,229,255,.35),0 0 10px rgba(0,229,255,.2)}50%{text-shadow:0 0 8px rgba(0,229,255,.6),0 0 18px rgba(0,229,255,.35)}}
          @keyframes mt-chroma{0%,78%,100%{opacity:.1;transform:translateX(0)}80%{opacity:.25;transform:translateX(1px)}82%{opacity:.18;transform:translateX(-1px)}}
          @keyframes mt-today-pulse{0%,100%{transform:translateY(0) scale(1);box-shadow:0 0 0 1px rgba(255,95,31,.38),0 0 12px rgba(255,95,31,.3),inset 0 0 8px rgba(255,95,31,.14)}50%{transform:translateY(-2px) scale(1.008);box-shadow:0 0 0 1px rgba(255,95,31,.55),0 0 20px rgba(255,95,31,.5),inset 0 0 12px rgba(255,95,31,.2)}}
          @keyframes mt-today-pulse-done{0%,100%{transform:translateY(0) scale(1);box-shadow:0 0 0 1px rgba(0,208,132,.38),0 0 12px rgba(0,208,132,.28),inset 0 0 8px rgba(0,208,132,.14)}50%{transform:translateY(-2px) scale(1.008);box-shadow:0 0 0 1px rgba(0,208,132,.55),0 0 20px rgba(0,208,132,.48),inset 0 0 12px rgba(0,208,132,.2)}}
          @keyframes mt-rest-emoji-nap{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-2px) rotate(-8deg)}}
          .mt-profiles-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-bottom:20px}
          .mt-profile-card{border:1px solid rgba(0,229,255,.28);background:var(--mt-panel);border-radius:12px;overflow:hidden;animation:cardIn .55s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--card-i, 0) * .07s);box-shadow:inset 0 0 12px rgba(0,229,255,.04)}
          .mt-profile-open{width:100%;border:none;background:transparent;color:inherit;text-align:left;cursor:pointer;padding:14px;display:flex;gap:12px;align-items:flex-start}
          .mt-profile-icon{width:52px;height:52px;border-radius:12px;border:1px solid color-mix(in srgb, var(--profile-color, #00e5ff) 60%, transparent);background:color-mix(in srgb, var(--profile-color, #00e5ff) 16%, transparent);display:flex;align-items:center;justify-content:center;color:var(--profile-color,#00e5ff);font-size:1.2rem;flex:none;box-shadow:0 0 14px color-mix(in srgb, var(--profile-color, #00e5ff) 35%, transparent)}
          .mt-profile-body{min-width:0}
          .mt-profile-body h3{margin:0;color:var(--mt-accent);font-family:"Orbitron","Segoe UI",sans-serif;font-size:.82rem;letter-spacing:.05em}
          .mt-profile-body p{margin:6px 0 0;color:#93a1b0;font-size:.72rem;line-height:1.35}
          .mt-profile-meta{display:inline-flex;margin-top:10px;padding:3px 8px;border-radius:999px;border:1px solid rgba(0,229,255,.24);color:#9fdcf0;font-size:.58rem;letter-spacing:.08em}
          .mt-profile-actions{display:flex;gap:6px;padding:0 10px 10px}
          .mt-profile-back{display:inline-flex;align-items:center;gap:8px;border:1px solid #3a4656;background:rgba(0,0,0,.22);color:#c1d3e2;padding:8px 12px;font-size:.68rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;border-radius:8px}
          .mt-mock-banner{margin:0 0 14px;padding:10px 12px;border:1px dashed rgba(255,166,0,.55);border-radius:10px;background:rgba(255,166,0,.12);color:#ffe7c4;font-size:.72rem;letter-spacing:.04em}
          .mt-confirm-card{border-color:rgba(0,229,255,.55);box-shadow:0 0 24px rgba(0,229,255,.12)}
          .mt-confirm-card.is-danger{border-color:rgba(255,0,60,.55);box-shadow:0 0 24px rgba(255,0,60,.12)}
          .mt-confirm-card.is-danger .mt-modal-top h4{color:#ff7d97}
          .mt-confirm-card.is-danger .mt-submit{border-color:rgba(255,0,60,.72);background:rgba(255,0,60,.14);color:#ffd3dd}
          .mt-confirm-card.is-create{border-color:rgba(0,208,132,.55);box-shadow:0 0 24px rgba(0,208,132,.12)}
          .mt-confirm-card.is-create .mt-modal-top h4{color:#7dffc8}
          .mt-confirm-card.is-create .mt-submit{border-color:rgba(0,208,132,.72);background:rgba(0,208,132,.14);color:#dbffef}
          .mt-confirm-icon{font-size:1.35rem;line-height:1;margin-bottom:8px;color:var(--mt-accent)}
          .mt-confirm-card.is-danger .mt-confirm-icon{color:#ff7d97}
          .mt-confirm-card.is-create .mt-confirm-icon{color:#7dffc8}
          @media (max-width:1024px){.mt-profiles-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
          @media (max-width:720px){.mt-profiles-list{grid-template-columns:1fr}}
        </style>

        <div class="mt-header-block">
          <header class="mt-header">
            <div class="mt-brand">
              <div class="mt-bolt"><span>Z</span></div>
              <div>
                <h2 class="mt-title" data-text="SISTEMA: MISSÃO DIÁRIA">SISTEMA: MISSÃO DIÁRIA</h2>
                <p class="mt-date" data-role="today-date"></p>
              </div>
            </div>
            <div class="mt-stat">
              <strong data-role="completed">0/0</strong>
              <span>Missões</span>
            </div>
          </header>
        </div>

        <div class="mt-fab-wrap" data-role="profiles-toolbar">
          <button class="mt-fab" data-action="open-profile-modal">+ Novo Perfil</button>
          <button class="mt-fab sec" data-action="refresh">Atualizar</button>
        </div>

        <section class="mt-profiles-list" data-role="profiles-list"></section>

        <div class="mt-fab-wrap mt-is-hidden" data-role="training-toolbar">
          <button class="mt-profile-back" data-action="back-profiles">← Perfis</button>
          <button class="mt-fab sec" data-action="refresh">Sincronizar</button>
        </div>

        <div data-role="training-view">
          <div class="mt-header-block" style="margin-bottom:12px;padding:12px 16px;">
            <h3 class="mt-title" data-role="profile-title" style="font-size:.95rem;margin:0;">PERFIL DE TREINO</h3>
            <p class="mt-date" data-role="profile-subtitle" style="margin-top:6px;">Treinos personalizados deste perfil</p>
          </div>

        <div class="mt-progress-wrap"><div class="mt-progress" data-role="progress"></div></div>
        <section class="mt-list" data-role="list"></section>
        <section data-role="performance"></section>
        </div>
        <button class="mt-fab-floating mt-is-hidden" data-action="open-modal" aria-label="Nova Missão" title="Nova Missão">+</button>
        <div class="mt-toast-wrap" data-role="toasts"></div>

        <div class="mt-modal is-hidden" data-role="profile-modal">
          <div class="mt-modal-card">
            <div class="mt-modal-top">
              <div>
                <h4 data-role="profile-modal-title">NOVO PERFIL</h4>
                <p data-role="profile-modal-desc">Crie um perfil para organizar treinos personalizados.</p>
              </div>
              <button class="mt-close" data-action="close-profile-modal">X</button>
            </div>
            <div class="mt-form">
              <div class="mt-field">
                <label>Nome do perfil</label>
                <input type="text" data-role="profile-name" placeholder="Ex: Hipertrofia" />
              </div>
              <div class="mt-field">
                <label>Descrição</label>
                <input type="text" data-role="profile-desc" placeholder="Ex: Treino focado em ganho de massa" />
              </div>
              <div class="mt-field">
                <label>Cor do perfil</label>
                <input type="color" data-role="profile-color" value="#00e5ff" />
              </div>
              <div class="mt-actions">
                <button class="mt-cancel" data-action="close-profile-modal">Cancelar</button>
                <button class="mt-submit" data-role="profile-modal-submit" data-action="submit-profile-modal">CRIAR PERFIL</button>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-modal is-hidden" data-role="modal">
          <div class="mt-modal-card">
            <div class="mt-modal-top">
              <div>
                <h4 data-role="modal-title">NOVA MISSÃO</h4>
                <p data-role="modal-desc">Adicione os exercícios deste treino. Ele fica salvo neste perfil.</p>
              </div>
              <button class="mt-close" data-action="close-modal">X</button>
            </div>
            <div class="mt-form">
              <div class="mt-field">
                <label>Nome da Missão</label>
                <input type="text" data-role="temp-title" placeholder="Ex: Treino de Peito" />
              </div>
              <div class="mt-row">
                <div class="mt-field">
                  <label>Exercício / Item</label>
                  <input type="text" data-role="temp-name" placeholder="Ex: Flexões" />
                </div>
                <div class="mt-field">
                  <label>Séries</label>
                  <input type="number" data-role="temp-series" value="3" min="1" />
                </div>
                <div class="mt-field">
                  <label>Repetições</label>
                  <input type="number" data-role="temp-reps" value="12" min="1" />
                </div>
                <div style="display:flex;align-items:end;">
                  <button class="mt-btn-soft" data-action="add-temp">ADICIONAR</button>
                </div>
              </div>
              <div class="mt-temp-list" data-role="temp-list"></div>
              <div class="mt-actions">
                <button class="mt-cancel" data-action="clear-temp">Limpar tudo</button>
                <button class="mt-submit" data-role="modal-submit" data-action="submit-modal">CRIAR MISSÃO</button>
              </div>
            </div>
          </div>
        </div>

        <div class="mt-modal is-hidden" data-role="confirm-modal">
          <div class="mt-modal-card mt-confirm-card">
            <div class="mt-modal-top">
              <div>
                <div class="mt-confirm-icon" aria-hidden="true"><i class="fas fa-triangle-exclamation"></i></div>
                <h4 data-role="confirm-title">CONFIRMAR AÇÃO</h4>
                <p data-role="confirm-desc">Deseja continuar?</p>
              </div>
              <button class="mt-close" data-action="close-confirm">X</button>
            </div>
            <div class="mt-actions">
              <button class="mt-cancel" data-action="confirm-cancel">CANCELAR</button>
              <button class="mt-submit" data-role="confirm-submit" data-action="confirm-submit">CONFIRMAR</button>
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
