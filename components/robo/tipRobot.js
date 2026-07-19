import { createBalaoDica, createMascoteDicas, getPrimeiroNome } from './mascoteDicas.js';
import { HIDDEN_MS, VISIBLE_MS, normalizeMessages, pickNextTip, sameList } from './tipRobotCore.js';

const state = {
  mounted: false,
  enabled: true,
  open: false,
  tip: null,
  panelIndex: 0,
  pool: [],
  userName: '',
  label: 'DICAS',
  accentColor: '#0ea5e9',
  timerId: null,
  prevTip: null,
  dockEl: null,
  panelEl: null,
  balaoHost: null,
  triggerBtn: null,
};

function clearTimer() {
  if (state.timerId != null) {
    window.clearTimeout(state.timerId);
    state.timerId = null;
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderBalao() {
  if (!state.balaoHost) return;
  state.balaoHost.innerHTML = '';
  if (!state.tip || state.open) return;
  state.balaoHost.appendChild(
    createBalaoDica({ tip: state.tip, userName: state.userName, id: 'dica-automatica' }),
  );
  if (state.triggerBtn) {
    state.triggerBtn.setAttribute('aria-describedby', 'dica-automatica');
    state.triggerBtn.setAttribute('aria-label', 'Abrir dicas — dica automática disponível');
  }
}

function clearBalao() {
  if (state.balaoHost) state.balaoHost.innerHTML = '';
  if (state.triggerBtn) {
    state.triggerBtn.removeAttribute('aria-describedby');
    state.triggerBtn.setAttribute('aria-label', 'Abrir dicas');
  }
}

function scheduleCycle(justClosed = false) {
  clearTimer();
  state.tip = null;
  clearBalao();

  if (!state.enabled || state.open || !state.pool.length || !state.mounted) return;

  const showNext = () => {
    if (!state.mounted || state.open || !state.enabled) return;
    const next = pickNextTip(state.pool, state.prevTip);
    state.prevTip = next;
    state.tip = next;
    renderBalao();
    state.timerId = window.setTimeout(() => {
      state.tip = null;
      clearBalao();
      state.timerId = window.setTimeout(showNext, HIDDEN_MS);
    }, VISIBLE_MS);
  };

  if (justClosed) {
    state.timerId = window.setTimeout(showNext, HIDDEN_MS);
  } else {
    showNext();
  }
}

function closePanel() {
  state.open = false;
  if (state.panelEl) {
    state.panelEl.remove();
    state.panelEl = null;
  }
  if (state.triggerBtn) state.triggerBtn.setAttribute('aria-expanded', 'false');
  scheduleCycle(true);
}

function openPanel() {
  clearTimer();
  state.tip = null;
  clearBalao();
  state.open = true;
  if (state.triggerBtn) state.triggerBtn.setAttribute('aria-expanded', 'true');
  if (state.pool.length) {
    state.panelIndex = (state.panelIndex + 1) % state.pool.length;
  }
  renderPanel();
}

function renderPanel() {
  if (state.panelEl) state.panelEl.remove();
  if (!state.open || !state.mounted) return;

  const panel = document.createElement('div');
  panel.className = 'dicas-robot-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Dicas');
  const tipText = state.pool.length ? state.pool[state.panelIndex] : 'Nenhuma dica disponível.';
  const sub = state.pool.length
    ? `Dica ${state.panelIndex + 1} de ${state.pool.length}`
    : 'Sem dicas';
  const firstName = getPrimeiroNome(state.userName);

  panel.innerHTML = `
    <div class="dicas-robot-panel-inner">
      <div class="dicas-robot-panel-head">
        <div class="dicas-robot-panel-avatar" data-avatar></div>
        <div>
          <p class="dicas-robot-panel-title">Assistente de dicas</p>
          <p class="dicas-robot-panel-sub">${escapeHtml(sub)}${firstName ? ` · ${escapeHtml(firstName)}` : ''}</p>
        </div>
        <button type="button" data-close aria-label="Fechar dicas">Fechar</button>
      </div>
      <p class="dicas-robot-panel-body" data-body></p>
      ${state.pool.length > 1 ? '<button type="button" class="dicas-robot-panel-next" data-next>Outra dica</button>' : ''}
    </div>
  `;
  panel.querySelector('[data-avatar]').appendChild(
    createMascoteDicas({ className: 'dicas-mascote-avatar', color: state.accentColor }),
  );
  panel.querySelector('[data-body]').textContent = tipText;
  panel.querySelector('[data-close]')?.addEventListener('click', () => closePanel());
  panel.querySelector('[data-next]')?.addEventListener('click', () => {
    state.panelIndex = (state.panelIndex + 1) % state.pool.length;
    renderPanel();
  });

  document.body.appendChild(panel);
  state.panelEl = panel;
}

function buildDock() {
  const dock = document.createElement('div');
  dock.className = 'dicas-robot-dock';
  dock.innerHTML = `
    <button type="button" class="dicas-robot-trigger" aria-expanded="false" aria-label="Abrir dicas">
      <span class="dicas-robot-float dicas-robot-stack">
        <span class="dicas-robot-emoji-wrap">
          <span class="dicas-robot-balao-host" data-balao></span>
          <span aria-hidden="true" data-mascote></span>
        </span>
        <span class="dicas-robot-placa" aria-hidden="true">
          <span class="dicas-robot-placa-icon">💡</span>
          ${escapeHtml(state.label)}
        </span>
      </span>
    </button>
  `;
  const mascoteHost = dock.querySelector('[data-mascote]');
  mascoteHost.appendChild(
    createMascoteDicas({ className: 'dicas-robot-mascote', color: state.accentColor }),
  );
  state.triggerBtn = dock.querySelector('.dicas-robot-trigger');
  state.balaoHost = dock.querySelector('[data-balao]');
  state.triggerBtn.addEventListener('click', () => openPanel());
  document.body.appendChild(dock);
  state.dockEl = dock;
}

export const TipRobot = {
  mount(options = {}) {
    if (typeof document === 'undefined') return;
    const nextPool = normalizeMessages(options.messages);
    const nextName = String(options.userName || '');
    const nextEnabled = options.enabled !== false;
    const nextLabel = String(options.label || 'DICAS');
    const nextColor = String(options.accentColor || '#0ea5e9');

    if (state.mounted) {
      const poolChanged = !sameList(state.pool, nextPool);
      state.userName = nextName;
      state.enabled = nextEnabled;
      state.label = nextLabel;
      state.accentColor = nextColor;
      if (poolChanged) {
        state.pool = nextPool;
        if (!state.open) scheduleCycle(false);
      }
      if (!state.enabled) {
        this.destroy();
        state.enabled = false;
      }
      return;
    }

    state.pool = nextPool;
    state.userName = nextName;
    state.enabled = nextEnabled;
    state.label = nextLabel;
    state.accentColor = nextColor;
    state.open = false;
    state.tip = null;
    state.panelIndex = 0;
    state.prevTip = null;
    state.mounted = true;

    if (!state.enabled || !state.pool.length) {
      state.mounted = false;
      return;
    }

    buildDock();
    scheduleCycle(false);
  },

  destroy() {
    clearTimer();
    state.tip = null;
    state.open = false;
    if (state.panelEl) {
      state.panelEl.remove();
      state.panelEl = null;
    }
    if (state.dockEl) {
      state.dockEl.remove();
      state.dockEl = null;
    }
    state.balaoHost = null;
    state.triggerBtn = null;
    state.mounted = false;
  },

  setEnabled(enabled) {
    state.enabled = Boolean(enabled);
    if (!state.enabled) this.destroy();
  },

  setUserName(userName) {
    state.userName = String(userName || '');
    if (state.tip && !state.open) renderBalao();
  },
};

if (typeof window !== 'undefined') {
  window.TipRobot = TipRobot;
}

export default TipRobot;
