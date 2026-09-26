/** @version water-drop-v14-success-flag */
export const WATER_FILL_DURATION_MS = 520;

export function isWaterDayComplete(today) {
  if (!today) return false;
  const meta = Number(today.meta_doses) || 0;
  const done = Number(today.realizado_doses) || 0;
  return meta > 0 && done >= meta;
}

export function waterIntakePercent(today) {
  const done = Number(today?.realizado_doses) || 0;
  const meta = Number(today?.meta_doses) || 0;
  if (meta <= 0) return 0;
  return Math.min(100, Math.round((done / meta) * 100));
}

function prefersReducedMotion() {
  return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}

function applyFillLevel(drop, fill, percent) {
  const clamped = Math.max(0, Math.min(100, percent));
  fill.style.setProperty('--water-fill', `${clamped}%`);
  fill.dataset.waterFillPct = String(clamped);
  drop.classList.toggle('is-empty', clamped === 0);
}

function animateFillLevel(drop, fill, fromPercent, toPercent) {
  const from = Math.max(0, Math.min(100, fromPercent));
  const to = Math.max(0, Math.min(100, toPercent));

  if (Math.abs(from - to) < 0.4 || prefersReducedMotion()) {
    applyFillLevel(drop, fill, to);
    return Promise.resolve();
  }

  fill.classList.remove('is-filling');
  fill.style.transition = 'none';
  applyFillLevel(drop, fill, from);
  void fill.offsetHeight;

  fill.style.transition = '';
  fill.classList.add('is-filling');
  drop.classList.add('is-pouring');
  applyFillLevel(drop, fill, to);

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      fill.removeEventListener('transitionend', onTransitionEnd);
      fill.classList.remove('is-filling');
      drop.classList.remove('is-pouring');
      resolve();
    };
    const onTransitionEnd = (event) => {
      if (event.target !== fill || event.propertyName !== 'height') return;
      finish();
    };
    fill.addEventListener('transitionend', onTransitionEnd);
    globalThis.setTimeout(finish, WATER_FILL_DURATION_MS + 80);
  });
}

function animatePercentLabel(el, fromPercent, toPercent) {
  if (!el) return;
  const to = Math.round(toPercent);
  if (prefersReducedMotion()) {
    el.textContent = `${to}%`;
    return;
  }
  const from = Math.round(fromPercent);
  if (from === to) {
    el.textContent = `${to}%`;
    return;
  }
  const started = performance.now();
  const duration = WATER_FILL_DURATION_MS * 0.82;
  const tick = (now) => {
    const t = Math.min(1, (now - started) / duration);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = `${Math.round(from + (to - from) * eased)}%`;
    if (t < 1) requestAnimationFrame(tick);
    else el.textContent = `${to}%`;
  };
  requestAnimationFrame(tick);
}

function ensureSuccessFlag(drop) {
  if (!drop || drop.querySelector('[data-water-drop-success]')) return;
  const flag = document.createElement('span');
  flag.className = 'saude-water-drop__success-flag';
  flag.dataset.waterDropSuccess = '';
  flag.setAttribute('role', 'status');
  flag.textContent = 'Sucesso';
  drop.appendChild(flag);
}

export function applyVictoryDropStyle(dropRoot, today) {
  if (!isWaterDayComplete(today)) {
    clearWaterDropVictory(dropRoot);
    return;
  }
  const drop = dropRoot?.querySelector('[data-water-drop]');
  if (!drop) return;
  ensureSuccessFlag(drop);
  const percent = waterIntakePercent(today);
  drop.classList.add('is-full', 'is-victory');
  drop.setAttribute('aria-label', `Meta de água concluída hoje, ${percent} por cento`);
  const fill = drop.querySelector('[data-water-drop-fill]');
  const percentEl = dropRoot.querySelector('[data-water-drop-percent]');
  if (fill) applyFillLevel(drop, fill, percent);
  if (percentEl) percentEl.textContent = `${percent}%`;
}

export function triggerWaterDropVictory(root, today = null) {
  applyVictoryDropStyle(root, today || { realizado_doses: 1, meta_doses: 1 });
}

export function clearWaterDropVictory(root) {
  root?.querySelector('[data-water-drop]')?.classList.remove('is-victory');
}

export function refreshWaterVictoryPresentation(_celebrationHost, dropRoot, today, _profileId, { animateFillFrom = null } = {}) {
  const drop = dropRoot;
  if (!drop || !today) return Promise.resolve();

  removeWaterCelebration(dropRoot?.closest?.('.saude-root') || dropRoot);

  if (!isWaterDayComplete(today)) {
    clearWaterDropVictory(drop);
    return syncWaterDropDom(drop, today, { animateFillFrom });
  }

  return syncWaterDropDom(drop, today, { animateFillFrom }).then(() => {
    applyVictoryDropStyle(drop, today);
  });
}

/** Remove camadas legadas de confete/toast que bugavam a tela. */
export function removeWaterCelebration(root) {
  if (!root) return;
  root.querySelectorAll('[data-water-confetti-layer], .saude-water-confetti-layer').forEach((node) => node.remove());
  root.querySelector('[data-water-celebration-toast]')?.remove();
}

export function renderWaterDropHtml(today) {
  const percent = waterIntakePercent(today);
  const completed = Number(today?.realizado_doses) >= Number(today?.meta_doses);
  const bubbles = [0, 1, 2, 3, 4].map((i) => (
    `<span class="saude-water-drop__bubble" style="--bubble-i:${i}; --bubble-x:${12 + i * 16}%" aria-hidden="true"></span>`
  )).join('');

  return `<div class="saude-water-drop${completed ? ' is-full is-victory' : ''}${percent === 0 ? ' is-empty' : ''}" data-water-drop aria-label="Progresso de água hoje, ${percent} por cento">
    <span class="saude-water-drop__emoji" aria-hidden="true">💧</span>
    <div class="saude-water-drop__visual">
      <div class="saude-water-drop__shell">
        <div class="saude-water-drop__pool" data-water-drop-fill data-water-fill-pct="${percent}" style="--water-fill:${percent}%">
          <div class="saude-water-drop__liquid" aria-hidden="true"></div>
          <div class="saude-water-drop__slosh" data-water-drop-slosh>
            <span class="saude-water-drop__wave" aria-hidden="true"></span>
            <span class="saude-water-drop__wave saude-water-drop__wave--alt" aria-hidden="true"></span>
            ${bubbles}
          </div>
        </div>
      </div>
      <span class="saude-water-drop__percent" data-water-drop-percent>${percent}%</span>
    </div>
    <span class="saude-water-drop__success-flag" data-water-drop-success role="status">Sucesso</span>
  </div>`;
}

const waterDropMotionBag = new WeakMap();

function getMotionApi() {
  const root = globalThis.motion || globalThis.Motion;
  if (!root || typeof root.animate !== 'function') return null;
  return { animate: root.animate.bind(root) };
}

function stopMotionPlayback(playback) {
  if (!playback) return;
  if (Array.isArray(playback)) playback.forEach(stopMotionPlayback);
  else {
    try {
      if (typeof playback.stop === 'function') playback.stop();
      else if (typeof playback.cancel === 'function') playback.cancel();
    } catch {
      /* noop */
    }
  }
}

export function stopWaterDropMotion(root) {
  if (!root) return;
  stopMotionPlayback(waterDropMotionBag.get(root));
  waterDropMotionBag.delete(root);
}

export function ensureWaterDropMotion(root) {
  if (!root) return;
  const drop = root.querySelector('[data-water-drop]');
  const slosh = root.querySelector('[data-water-drop-slosh]');
  if (!drop || !slosh || drop.classList.contains('is-empty') || drop.classList.contains('is-victory')) {
    stopWaterDropMotion(root);
    return;
  }
  if (prefersReducedMotion()) return;

  const motion = getMotionApi();
  if (!motion) return;

  stopWaterDropMotion(root);
  const playbacks = [];

  const sloshPlayback = motion.animate(
    slosh,
    { x: [-4, 4], rotate: [-2, 2] },
    { duration: 1.55, repeat: Infinity, direction: 'alternate', easing: 'ease-in-out' },
  );
  if (sloshPlayback) playbacks.push(sloshPlayback);

  drop.querySelectorAll('.saude-water-drop__wave').forEach((wave, index) => {
    const wavePlayback = motion.animate(
      wave,
      { x: [-8, 8] },
      { duration: 1.25 + index * 0.35, repeat: Infinity, direction: 'alternate', easing: 'ease-in-out' },
    );
    if (wavePlayback) playbacks.push(wavePlayback);
  });

  if (playbacks.length) waterDropMotionBag.set(root, playbacks);
}

function scheduleWaterDropMotion(root) {
  if (!root) return;
  const run = () => ensureWaterDropMotion(root);
  requestAnimationFrame(() => {
    run();
    requestAnimationFrame(run);
  });
  globalThis.setTimeout(run, 80);
}

export function syncWaterDropDom(root, today, { animateFillFrom = null } = {}) {
  if (!root || !today) return Promise.resolve();
  const percent = waterIntakePercent(today);
  const completed = Number(today.realizado_doses) >= Number(today.meta_doses);
  const drop = root.querySelector('[data-water-drop]');
  const fill = root.querySelector('[data-water-drop-fill]');
  const percentEl = root.querySelector('[data-water-drop-percent]');

  if (!drop || !fill) return Promise.resolve();

  drop.classList.toggle('is-full', completed);
  if (!completed) drop.classList.remove('is-victory');
  drop.setAttribute('aria-label', `Progresso de água hoje, ${percent} por cento`);

  const shouldAnimateFill = animateFillFrom != null && Number.isFinite(Number(animateFillFrom));
  let fillDone = Promise.resolve();

  if (shouldAnimateFill) {
    const from = Number(animateFillFrom);
    animatePercentLabel(percentEl, from, percent);
    fillDone = animateFillLevel(drop, fill, from, percent);
    fillDone.then(() => {
      if (!completed) scheduleWaterDropMotion(root);
    });
  } else {
    applyFillLevel(drop, fill, percent);
    if (percentEl) percentEl.textContent = `${percent}%`;
    if (!completed) scheduleWaterDropMotion(root);
  }

  return fillDone;
}

export const WATER_DROP_STYLES = `
    .saude-water-checks { display: grid; grid-template-columns: repeat(auto-fill, minmax(2.35rem, 1fr)); gap: .45rem; }
    .saude-water-check { position: relative; aspect-ratio: 1; min-height: 2.35rem; display: grid; place-items: center; overflow: visible; border: 1px solid #334155; border-radius: .55rem; background: #0b1324; color: #718399; font-size: .72rem; cursor: pointer; transition: transform .18s ease, border-color .18s ease, background .18s ease, box-shadow .18s ease; }
    .saude-water-drop { display: flex; flex-direction: column; align-items: center; margin: .5rem 0 1rem; }
    .saude-water-drop__emoji { font-size: 1.5rem; line-height: 1; margin-bottom: -.15rem; filter: drop-shadow(0 4px 10px rgba(14, 165, 233, .25)); pointer-events: none; transition: transform .28s ease; }
    .saude-water-drop.is-pouring .saude-water-drop__emoji { transform: translateY(-1px) scale(1.03); }
    .saude-water-drop__visual { position: relative; width: 4.25rem; height: 4.25rem; filter: drop-shadow(0 10px 22px rgba(14, 165, 233, .22)); }
    .saude-water-drop__shell { position: absolute; inset: 0; transform: rotate(45deg); border-radius: 0 72% 72% 72%; overflow: hidden; background: rgba(11, 19, 36, .92); border: 2px solid rgba(56, 189, 248, .5); box-shadow: inset 0 0 20px rgba(14, 165, 233, .1), 0 10px 28px rgba(0, 0, 0, .28); container-type: size; container-name: saude-drop; transition: transform .45s cubic-bezier(.22, 1, .36, 1), box-shadow .35s ease, border-color .35s ease; }
    .saude-water-drop.is-pouring .saude-water-drop__shell { transform: rotate(45deg) scale(1.015); }
    .saude-water-drop__pool { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: var(--water-fill, 0%); overflow: hidden; transition: height .52s cubic-bezier(.32, .72, .28, 1); will-change: height; }
    .saude-water-drop__pool.is-filling { transition-duration: .52s; transition-timing-function: cubic-bezier(.22, 1, .36, 1); }
    .saude-water-drop__liquid { position: absolute; left: -20%; bottom: 0; width: 140%; height: 100cqh; background: linear-gradient(180deg, #a5f3fc 0%, #38bdf8 38%, #0284c7 100%); pointer-events: none; }
    .saude-water-drop.is-victory .saude-water-drop__liquid { background: linear-gradient(180deg, #fffbeb 0%, #fde047 28%, #f59e0b 58%, #b45309 100%); animation: saude-water-gold-pulse 1.05s ease-in-out infinite; }
    .saude-water-drop.is-victory .saude-water-drop__wave { background: rgba(255, 255, 255, .55); }
    .saude-water-drop.is-victory .saude-water-drop__shell { border-color: rgba(253, 224, 71, .95); box-shadow: inset 0 0 28px rgba(251, 191, 36, .45), 0 0 32px rgba(245, 158, 11, .35); animation: saude-water-gold-shell-pulse 1.05s ease-in-out infinite; }
    .saude-water-drop.is-victory .saude-water-drop__percent { color: #fffbeb; text-shadow: 0 1px 8px rgba(120, 53, 15, .85), 0 0 14px rgba(251, 191, 36, .55); }
    .saude-water-drop.is-victory .saude-water-drop__emoji { filter: drop-shadow(0 4px 12px rgba(251, 191, 36, .45)); }
    .saude-water-drop__slosh { position: absolute; left: -15%; right: -15%; top: -1px; height: 1rem; pointer-events: none; animation: saude-water-slosh 1.65s ease-in-out infinite; }
    .saude-water-drop.is-victory .saude-water-drop__slosh { animation: saude-water-slosh-victory 1.2s ease-in-out infinite; }
    .saude-water-drop__wave { position: absolute; top: 0; left: -30%; width: 160%; height: 12px; background: rgba(255, 255, 255, .32); border-radius: 45%; animation: saude-water-drop-wave 2.4s ease-in-out infinite; pointer-events: none; }
    .saude-water-drop__wave--alt { top: 3px; opacity: .5; height: 10px; animation-duration: 3s; animation-delay: -.4s; }
    .saude-water-drop__bubble { position: absolute; left: var(--bubble-x, 50%); bottom: 0; width: .32rem; height: .32rem; margin-left: -.16rem; border-radius: 50%; background: rgba(255, 255, 255, .78); pointer-events: none; animation: saude-water-bubble-rise 2.1s ease-in infinite; animation-delay: calc(var(--bubble-i, 0) * -.38s); }
    .saude-water-drop.is-victory .saude-water-drop__bubble { background: rgba(255, 251, 235, .92); animation-duration: 1.6s; }
    .saude-water-drop.is-empty .saude-water-drop__pool { height: 0 !important; }
    .saude-water-drop.is-empty .saude-water-drop__bubble { opacity: 0; animation: none; }
    .saude-water-drop__percent { position: absolute; inset: 0; display: grid; place-items: center; transform: rotate(-45deg); font-size: .92rem; font-weight: 800; letter-spacing: -.02em; color: #f0f9ff; text-shadow: 0 1px 6px rgba(2, 6, 23, .85), 0 0 12px rgba(14, 165, 233, .35); z-index: 2; pointer-events: none; }
    .saude-water-drop.is-full .saude-water-drop__percent { color: #fff; }
    .saude-water-drop__success-flag { display: none; margin-top: .45rem; padding: .22rem .85rem; border-radius: 999px; font-size: .72rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #422006; background: linear-gradient(180deg, #fef3c7 0%, #fbbf24 48%, #d97706 100%); border: 1px solid rgba(251, 191, 36, .9); box-shadow: 0 0 14px rgba(251, 191, 36, .35); pointer-events: none; }
    .saude-water-drop.is-victory .saude-water-drop__success-flag { display: inline-block; animation: saude-water-success-glow 1.05s ease-in-out infinite; }
    @keyframes saude-water-drop-wave { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(-18%); } }
    @keyframes saude-water-slosh { 0%, 100% { transform: translateX(0) rotate(0deg); } 25% { transform: translateX(-3px) rotate(-1.8deg); } 75% { transform: translateX(3px) rotate(1.8deg); } }
    @keyframes saude-water-slosh-victory { 0%, 100% { transform: translateX(0) rotate(0deg); } 50% { transform: translateX(5px) rotate(2.5deg); } }
    @keyframes saude-water-bubble-rise { 0% { transform: translateY(0); opacity: 0; } 12% { opacity: .95; } 100% { transform: translateY(-2.75rem); opacity: 0; } }
    @keyframes saude-water-gold-pulse { 0%, 100% { filter: brightness(1) saturate(1); } 50% { filter: brightness(1.28) saturate(1.12); } }
    @keyframes saude-water-gold-shell-pulse { 0%, 100% { box-shadow: inset 0 0 28px rgba(251, 191, 36, .4), 0 0 28px rgba(245, 158, 11, .28); } 50% { box-shadow: inset 0 0 34px rgba(253, 224, 71, .55), 0 0 40px rgba(245, 158, 11, .48); } }
    @keyframes saude-water-success-glow { 0%, 100% { filter: brightness(1); box-shadow: 0 0 14px rgba(251, 191, 36, .35); } 50% { filter: brightness(1.18); box-shadow: 0 0 22px rgba(253, 224, 71, .55); } }
`;
