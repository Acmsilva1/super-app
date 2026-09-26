import {
  filtrarTabelaNutricional,
  opcoesTabelaNutricional,
  paginarTabelaNutricional,
} from './service/tabelaNutricionalService.js';
import { calcularImc, calcularLarguraGraficoPeso, classificarImc, criarTendenciaPeso, formatarNumeroSaude } from './service/perfilSaudeService.js';
import { countDietItems, createEmptyDietMeals, DIET_MEALS, normalizeDietMeals } from './service/dietasService.js';
import {
  deleteLocalWaterGoal,
  ensureLocalWaterProfileLinkedToHealth,
  isLocalWaterStorageMode,
  loadLocalWater,
  migrateLocalWaterDataToHealthProfiles,
  saveLocalWaterGoal,
  updateLocalWaterProgress,
} from './service/consumoAguaLocalService.js';
import {
  ensureWaterDropMotion,
  refreshWaterVictoryPresentation,
  removeWaterCelebration,
  renderWaterDropHtml,
  syncWaterDropDom,
  WATER_DROP_STYLES,
  waterIntakePercent,
} from './waterDropVisual.js?v=2026-09-26-water-drop-v14';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function todayIsoDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function isSaudeMobileViewport() {
  return globalThis.matchMedia?.('(max-width: 760px)')?.matches ?? false;
}

function formatChartAxisDate(value) {
  const iso = String(value || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [, month, day] = iso.split('-');
    return `${day}/${month}`;
  }
  const formatted = formatDateTime(value);
  return formatted.split(',')[0]?.trim() || formatted;
}

function syncSaudeModalScrollLock(container) {
  const windowContent = container?.closest?.('.window-content');
  if (!windowContent) return;
  const modalOpen = container.querySelector('.saude-modal-backdrop, .saude-confirm-backdrop');
  if (modalOpen) {
    if (!windowContent.classList.contains('is-scroll-locked')) {
      windowContent.dataset.saudeScrollTop = String(windowContent.scrollTop);
      windowContent.classList.add('is-scroll-locked');
    }
    return;
  }
  if (windowContent.classList.contains('is-scroll-locked')) {
    windowContent.classList.remove('is-scroll-locked');
    const scrollTop = Number(windowContent.dataset.saudeScrollTop) || 0;
    delete windowContent.dataset.saudeScrollTop;
    windowContent.scrollTop = scrollTop;
  }
}

function rememberSaudeCheckpoint(patch) {
  globalThis.superApp?.rememberAppCheckpoint?.('saude', patch);
}

function readSaudeCheckpoint() {
  const ui = globalThis.superApp?.uiState;
  return ui?.checkpoint?.appMeta?.saude || ui?.appMeta?.saude || null;
}

const SAUDE_STYLES = `
  <style>
    .saude-root {
      --saude-verde: #327746;
      --saude-lima: #95c11f;
      --saude-musgo: #20463c;
      --saude-grama: #4aa455;
      --saude-frame: #334155;
      --saude-superficie: #111c2f;
      --saude-painel: #0f172a;
      --saude-painel-elevado: #162238;
      --saude-texto: #e5eef5;
      --saude-texto-secundario: #9fb0c3;
      min-height: 100%;
      padding: clamp(1rem, 3vw, 2rem);
      background:
        radial-gradient(circle at 12% 0%, rgba(50, 119, 70, .18), transparent 34rem),
        linear-gradient(160deg, #07101f 0%, #030712 100%);
      color: var(--saude-texto);
      color-scheme: dark;
      font-family: Montserrat, Arial, sans-serif;
    }
    .saude-loading { min-height: 18rem; display: grid; place-content: center; gap: .75rem; text-align: center; color: var(--saude-texto-secundario); }
    .saude-loading i { color: var(--saude-verde); font-size: 2rem; }
    .saude-hero { display: flex; align-items: center; gap: 1rem; margin: 0 auto 1.5rem; max-width: 76rem; }
    .saude-hero__image { width: 4.5rem; height: 4.5rem; flex: 0 0 auto; border: 1px solid rgba(149, 193, 31, .2); border-radius: 1.1rem; object-fit: cover; box-shadow: 0 12px 28px rgba(0, 0, 0, .38); }
    .saude-hero h1 { margin: 0; font-family: "Darker Grotesque", Montserrat, Arial, sans-serif; font-size: clamp(1.8rem, 5vw, 2.5rem); line-height: 1; }
    .saude-hero p { margin: .35rem 0 0; color: var(--saude-texto-secundario); }
    .saude-page { max-width: 76rem; margin: 0 auto; }
    .saude-app-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr)); gap: 1rem; }
    .saude-access-card { min-height: 12rem; padding: 1.35rem; border: 1px solid rgba(148, 163, 184, .2); border-radius: 1.25rem; background: linear-gradient(145deg, rgba(22, 34, 56, .97), rgba(12, 22, 39, .98)); color: var(--saude-texto); text-align: left; cursor: pointer; box-shadow: 0 14px 32px rgba(0, 0, 0, .26); transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
    .saude-access-card:hover { transform: translateY(-3px); border-color: var(--saude-grama); box-shadow: 0 18px 38px rgba(0, 0, 0, .38), 0 0 0 1px rgba(74, 164, 85, .12); }
    .saude-access-card:focus-visible, .saude-btn:focus-visible, .saude-field:focus-visible, .saude-icon-btn:focus-visible { outline: 3px solid rgba(149, 193, 31, .45); outline-offset: 2px; }
    .saude-access-card__icon { width: 3.4rem; height: 3.4rem; display: grid; place-items: center; margin-bottom: 1.2rem; border: 1px solid rgba(149, 193, 31, .2); border-radius: 1rem; background: linear-gradient(135deg, var(--saude-musgo), var(--saude-verde)); color: #fff; font-size: 1.4rem; box-shadow: 0 8px 20px rgba(0, 0, 0, .24); }
    .saude-access-card h2 { margin: 0 0 .5rem; font-size: 1.15rem; }
    .saude-access-card p { margin: 0; color: var(--saude-texto-secundario); line-height: 1.55; }
    .saude-access-card__action { display: inline-flex; align-items: center; gap: .45rem; margin-top: 1.1rem; color: var(--saude-lima); font-size: .85rem; font-weight: 700; }
    .saude-page-toolbar { display: flex; align-items: center; justify-content: space-between; gap: .75rem; margin-bottom: 1rem; }
    .saude-page-toolbar--stack { flex-direction: column; align-items: stretch; }
    .saude-page-header { min-width: 0; display: flex; align-items: center; gap: .85rem; }
    .saude-page-header--profile { align-items: flex-start; }
    .saude-page-header__copy { min-width: 0; flex: 1; }
    .saude-page-header__copy h2 { overflow-wrap: anywhere; word-break: break-word; }
    .saude-profile-detail-subtitle { margin: .25rem 0 0; color: var(--saude-texto-secundario); font-size: .78rem; line-height: 1.45; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; overflow-wrap: anywhere; }
    .saude-profile-detail-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
    .saude-profile-detail-actions .saude-btn { flex: 1 1 9rem; min-height: 2.75rem; }
    .saude-page-header h2 { margin: 0; font-family: "Darker Grotesque", Montserrat, Arial, sans-serif; font-size: clamp(1.55rem, 4vw, 2rem); }
    .saude-page-header p { margin: .2rem 0 0; color: var(--saude-texto-secundario); font-size: .9rem; }
    .saude-btn { min-height: 2.65rem; display: inline-flex; align-items: center; justify-content: center; gap: .45rem; padding: .65rem .9rem; border: 1px solid var(--saude-frame); border-radius: .75rem; background: var(--saude-painel-elevado); color: var(--saude-texto); font: inherit; font-size: .85rem; font-weight: 700; cursor: pointer; }
    .saude-btn:hover:not(:disabled) { background: rgba(50, 119, 70, .28); border-color: var(--saude-grama); }
    .saude-btn:disabled { cursor: not-allowed; opacity: .45; }
    .saude-btn--primary { border-color: var(--saude-grama); background: linear-gradient(135deg, var(--saude-verde), var(--saude-musgo)); color: #fff; box-shadow: 0 8px 22px rgba(0, 0, 0, .24); }
    .saude-btn--primary:hover:not(:disabled) { background: linear-gradient(135deg, var(--saude-grama), var(--saude-verde)); }
    .saude-btn--danger { border-color: rgba(195, 47, 38, .72); color: #fecaca; }
    .saude-btn--danger:hover:not(:disabled) { border-color: #c32f26; background: rgba(195, 47, 38, .18); }
    .saude-editor { margin-bottom: 1rem; padding: 1rem; border: 1px solid rgba(74, 164, 85, .36); border-radius: 1rem; background: linear-gradient(145deg, rgba(22, 34, 56, .98), rgba(12, 22, 39, .98)); box-shadow: 0 14px 30px rgba(0, 0, 0, .25); }
    .saude-editor__title { margin: 0 0 .85rem; font-size: 1rem; }
    .saude-editor__grid { display: grid; grid-template-columns: 1.25fr 1fr 1fr; gap: .75rem; }
    .saude-editor__actions { display: flex; justify-content: flex-end; gap: .65rem; margin-top: .9rem; }
    .saude-filters { display: grid; grid-template-columns: minmax(14rem, 2fr) minmax(10rem, 1fr); gap: .85rem; margin-bottom: 1rem; padding: 1rem; border: 1px solid rgba(148, 163, 184, .18); border-radius: 1rem; background: rgba(15, 23, 42, .94); box-shadow: 0 12px 28px rgba(0, 0, 0, .2); }
    .saude-field-group { min-width: 0; display: grid; gap: .35rem; }
    .saude-field-group label { color: var(--saude-texto-secundario); font-size: .76rem; font-weight: 700; }
    .saude-field { box-sizing: border-box; width: 100%; min-width: 0; min-height: 2.65rem; padding: .65rem .75rem; border: 1px solid var(--saude-frame); border-radius: .7rem; background: #0b1324; color: var(--saude-texto); font: inherit; }
    textarea.saude-field { min-height: 4.35rem; resize: vertical; }
    .saude-field::placeholder { color: #708198; }
    .saude-notice { display: flex; align-items: flex-start; gap: .55rem; margin: 0 0 1rem; padding: .75rem .85rem; border: 1px solid rgba(74, 164, 85, .35); border-radius: .75rem; background: rgba(50, 119, 70, .16); color: #d9f5df; font-size: .82rem; }
    .saude-notice--error { border-color: rgba(195, 47, 38, .5); background: rgba(195, 47, 38, .12); color: #fecaca; }
    .saude-results { margin: 0 0 .65rem; color: var(--saude-texto-secundario); font-size: .82rem; }
    .saude-table-wrap { width: 100%; overflow: hidden; border: 1px solid rgba(148, 163, 184, .18); border-radius: 1rem; background: var(--saude-painel); box-shadow: 0 14px 30px rgba(0, 0, 0, .24); }
    .saude-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .saude-table th { padding: .85rem; background: var(--saude-musgo); color: #fff; text-align: left; font-size: .76rem; letter-spacing: .02em; }
    .saude-table th:nth-child(1) { width: 18%; }
    .saude-table th:nth-child(2) { width: 27%; }
    .saude-table th:nth-child(4) { width: 6.75rem; text-align: center; }
    .saude-table td { padding: .85rem; border-bottom: 1px solid rgba(148, 163, 184, .14); color: var(--saude-texto); font-size: .85rem; line-height: 1.45; vertical-align: top; overflow-wrap: anywhere; }
    .saude-table tbody tr:last-child td { border-bottom: 0; }
    .saude-table tbody tr:hover { background: rgba(74, 164, 85, .08); }
    .saude-table td:first-child { white-space: nowrap; }
    .saude-row-actions { display: flex; align-items: center; justify-content: center; gap: .4rem; }
    .saude-icon-btn { width: 2.6rem; height: 2.6rem; display: inline-grid; place-items: center; border: 1px solid var(--saude-frame); border-radius: .7rem; background: var(--saude-painel-elevado); color: var(--saude-texto); cursor: pointer; }
    .saude-icon-btn:hover:not(:disabled) { border-color: var(--saude-grama); background: rgba(50, 119, 70, .28); }
    .saude-icon-btn--danger { color: #fca5a5; }
    .saude-icon-btn--danger:hover:not(:disabled) { border-color: #c32f26; background: rgba(195, 47, 38, .14); }
    .saude-pagination { display: flex; align-items: center; justify-content: space-between; gap: .75rem; margin-top: 1rem; }
    .saude-pagination__pages { display: flex; align-items: center; justify-content: center; gap: .35rem; flex-wrap: wrap; }
    .saude-pagination__page { min-width: 2.45rem; padding-inline: .55rem; }
    .saude-pagination__page[aria-current="page"] { border-color: var(--saude-verde); background: var(--saude-verde); color: #fff; }
    .saude-empty, .saude-error { padding: 2.5rem 1rem; border: 1px dashed rgba(74, 164, 85, .42); border-radius: 1rem; background: var(--saude-painel); text-align: center; color: var(--saude-texto-secundario); }
    .saude-empty i, .saude-error i { display: block; margin-bottom: .75rem; color: var(--saude-verde); font-size: 1.8rem; }
    .saude-error i { color: #c32f26; }
    .saude-diet-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 16rem), 1fr)); gap: .85rem; }
    .saude-diet-card { width: 100%; min-height: auto; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: .85rem; padding: .9rem 1.1rem; border: 1px solid rgba(74, 164, 85, .3); border-radius: .95rem; background: linear-gradient(145deg, rgba(22, 34, 56, .98), rgba(12, 22, 39, .98)); color: var(--saude-texto); text-align: left; cursor: pointer; box-shadow: 0 10px 24px rgba(0, 0, 0, .22); transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
    .saude-diet-card:hover { transform: translateY(-2px); border-color: var(--saude-grama); box-shadow: 0 14px 28px rgba(0, 0, 0, .32); }
    .saude-diet-card h3 { margin: 0; font-size: 1rem; }
    .saude-diet-card p { margin: .3rem 0 0; color: var(--saude-texto-secundario); font-size: .8rem; line-height: 1.4; }
    .saude-diet-card__arrow { width: 2.25rem; height: 2.25rem; display: grid; place-items: center; border-radius: .65rem; background: rgba(50, 119, 70, .2); color: var(--saude-lima); font-size: .85rem; }
    .saude-diet-meta { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .4rem; }
    .saude-diet-meta span { padding: .15rem .45rem; border-radius: 999px; background: rgba(149, 193, 31, .1); color: #c9e777; font-size: .68rem; font-weight: 700; }
    .saude-diet-profiles { display: flex; align-items: center; gap: .6rem; overflow-x: auto; padding-bottom: .4rem; margin-bottom: 1rem; }
    .saude-diet-profile-tab { display: inline-flex; align-items: center; gap: .55rem; padding: .45rem .85rem; border: 1px solid var(--saude-frame); border-radius: 999px; background: var(--saude-painel-elevado); color: var(--saude-texto-secundario); font-size: .85rem; font-weight: 700; cursor: pointer; white-space: nowrap; transition: all .18s ease; }
    .saude-diet-profile-tab:hover { border-color: var(--saude-grama); color: var(--saude-texto); background: rgba(50, 119, 70, .2); }
    .saude-diet-profile-tab.is-active { border-color: var(--saude-verde); background: linear-gradient(135deg, rgba(50, 119, 70, .55), rgba(32, 70, 60, .75)); color: #fff; box-shadow: 0 4px 14px rgba(0, 0, 0, .25); }
    .saude-diet-profile-tab__avatar { width: 1.55rem; height: 1.55rem; display: grid; place-items: center; border-radius: 50%; background: rgba(255, 255, 255, .15); font-size: .75rem; }
    .saude-diet-profile-tab__badge { padding: .1rem .45rem; border-radius: 999px; background: rgba(0, 0, 0, .3); color: #c9e777; font-size: .68rem; font-weight: 800; }
    .saude-diet-profile-tab.is-active .saude-diet-profile-tab__badge { background: rgba(255, 255, 255, .2); color: #fff; }
    .saude-diet-form { margin-bottom: 1rem; }
    .saude-diet-form__grid { display: grid; grid-template-columns: minmax(10rem, 1fr) 2fr; gap: .75rem; }
    .saude-field-group--wide { grid-column: 1 / -1; }
    .saude-meal-builder { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem; margin-top: 1rem; }
    .saude-meal-card { min-width: 0; padding: .9rem; border: 1px solid rgba(148, 163, 184, .17); border-radius: .9rem; background: rgba(3, 7, 18, .35); }
    .saude-meal-card__header { display: flex; align-items: center; justify-content: space-between; gap: .65rem; }
    .saude-meal-card__header h4 { margin: 0; font-size: .92rem; }
    .saude-meal-card__add { min-height: 2.25rem; padding: .45rem .65rem; }
    .saude-meal-items { display: grid; gap: .5rem; margin-top: .7rem; }
    .saude-meal-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .65rem; align-items: center; padding: .65rem; border-radius: .7rem; background: rgba(22, 34, 56, .8); }
    .saude-meal-item strong, .saude-meal-item span { display: block; overflow-wrap: anywhere; }
    .saude-meal-item span { margin-top: .18rem; color: var(--saude-texto-secundario); font-size: .74rem; }
    .saude-meal-item__actions { display: flex; gap: .3rem; }
    .saude-meal-item__actions .saude-icon-btn { width: 2.15rem; height: 2.15rem; }
    .saude-meal-empty { margin: .7rem 0 0; color: var(--saude-texto-secundario); font-size: .76rem; }
    .saude-diet-modal { width: min(100%, 48rem); max-height: min(90dvh, 52rem); overflow: auto; padding: 1.1rem; border: 1px solid rgba(74, 164, 85, .42); border-radius: 1.1rem; background: radial-gradient(circle at 15% 0%, rgba(50, 119, 70, .16), transparent 18rem), #0f172a; box-shadow: 0 24px 70px rgba(0, 0, 0, .55); }
    .saude-diet-modal--item { width: min(100%, 31rem); }
    .saude-diet-modal__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
    .saude-diet-modal__header h3 { margin: 0; }
    .saude-diet-modal__header p { margin: .3rem 0 0; color: var(--saude-texto-secundario); font-size: .82rem; }
    .saude-diet-detail-meals { display: grid; gap: .75rem; }
    .saude-diet-detail-meal { padding: .85rem; border: 1px solid rgba(148, 163, 184, .16); border-radius: .85rem; background: rgba(3, 7, 18, .35); }
    .saude-diet-detail-meal h4 { margin: 0 0 .55rem; color: #d9f5df; }
    .saude-diet-detail-item { padding: .5rem 0; border-top: 1px solid rgba(148, 163, 184, .12); }
    .saude-diet-detail-item:first-of-type { border-top: 0; }
    .saude-diet-detail-item p { margin: .18rem 0 0; color: var(--saude-texto-secundario); font-size: .78rem; }
    .saude-diet-copy { margin: 0 0 1rem; color: var(--saude-texto-secundario); font-size: .86rem; line-height: 1.6; white-space: pre-wrap; }
    .saude-diet-section { margin-top: 1rem; }
    .saude-diet-legacy { display: grid; gap: .6rem; }
    .saude-diet-legacy details { padding: .75rem; border: 1px solid rgba(148, 163, 184, .16); border-radius: .8rem; }
    .saude-diet-legacy summary { cursor: pointer; font-weight: 700; }
    .saude-diet-legacy p { color: var(--saude-texto-secundario); white-space: pre-wrap; }
    .saude-profile-list { display: grid; gap: 1rem; }
    .saude-profile-card { overflow: hidden; border: 1px solid rgba(148, 163, 184, .18); border-radius: 1rem; background: var(--saude-painel); box-shadow: 0 14px 30px rgba(0, 0, 0, .24); }
    .saude-profile-card__header { display: flex; align-items: center; justify-content: space-between; gap: .8rem; padding: 1rem; }
    .saude-profile-card__identity { display: flex; align-items: center; gap: .75rem; min-width: 0; flex: 1; }
    .saude-profile-card__identity-copy { min-width: 0; flex: 1; }
    .saude-profile-card__identity-copy h3 { overflow-wrap: anywhere; word-break: break-word; line-height: 1.25; }
    .saude-profile-avatar { width: 3rem; height: 3rem; display: grid; place-items: center; flex: 0 0 auto; border-radius: 50%; background: linear-gradient(135deg, var(--saude-musgo), var(--saude-verde)); color: #fff; font-size: 1.2rem; }
    .saude-profile-card h3 { margin: 0; font-size: 1.05rem; }
    .saude-profile-card__subtitle { margin: .2rem 0 0; color: var(--saude-texto-secundario); font-size: .78rem; }
    .saude-profile-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .6rem; padding: 0 1rem 1rem; }
    .saude-profile-summary--detail { padding: 0 0 1rem; }
    .saude-profile-stat { min-width: 0; padding: .75rem; border: 1px solid rgba(148, 163, 184, .14); border-radius: .75rem; background: rgba(22, 34, 56, .62); }
    .saude-profile-stat span { display: block; color: var(--saude-texto-secundario); font-size: .72rem; font-weight: 700; letter-spacing: 0; line-height: 1.25; }
    .saude-profile-stat strong { display: block; margin-top: .35rem; font-size: 1rem; line-height: 1.25; overflow-wrap: anywhere; }
    .saude-profile-timeline { padding: 0 1rem 1rem; }
    .saude-profile-timeline > summary { padding: .75rem 0; border-top: 1px solid rgba(148, 163, 184, .14); color: var(--saude-lima); font-size: .82rem; font-weight: 700; cursor: pointer; }
    .saude-timeline-list { display: grid; gap: .7rem; margin-top: .3rem; }
    .saude-timeline-item { display: grid; grid-template-columns: 8rem minmax(0, 1fr) auto; align-items: start; gap: .8rem; padding-left: .85rem; border-left: 2px solid var(--saude-verde); }
    .saude-timeline-date { color: var(--saude-texto-secundario); font-size: .75rem; line-height: 1.4; }
    .saude-timeline-values { display: flex; flex-wrap: wrap; gap: .35rem; }
    .saude-timeline-values span { padding: .25rem .5rem; border-radius: .5rem; background: rgba(50, 119, 70, .18); color: #d9f5df; font-size: .72rem; }
    .saude-profile-timeline--water > summary { color: #7dd3fc; }
    .saude-timeline-item--water { border-left-color: #38bdf8; }
    .saude-timeline-item--water .saude-timeline-values span { background: rgba(14, 165, 233, .2); color: #e0f2fe; }
    .saude-profile-card__identity-btn { display: flex; align-items: center; gap: .75rem; min-width: 0; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; padding: 0; font: inherit; }
    .saude-profile-card__actions { display: flex; align-items: center; gap: .5rem; flex-shrink: 0; }
    .saude-weight-trend { margin: 0 0 1rem; overflow: hidden; border: 1px solid rgba(149, 193, 31, .24); border-radius: .85rem; background: linear-gradient(145deg, rgba(32, 70, 60, .34), rgba(15, 23, 42, .96)); box-shadow: 0 10px 24px rgba(0, 0, 0, .18); }
    .saude-weight-trend--panel { box-sizing: border-box; width: calc(100% + 2 * clamp(1rem, 3vw, 2rem)); max-width: none; margin-inline: calc(-1 * clamp(1rem, 3vw, 2rem)); border-radius: 0; border-inline: 0; }
    .saude-weight-trend > summary { list-style: none; padding: .75rem .9rem; cursor: pointer; }
    .saude-weight-trend > summary::-webkit-details-marker { display: none; }
    .saude-weight-trend > summary:focus-visible { outline: 2px solid var(--saude-lima); outline-offset: -3px; }
    .saude-weight-trend__header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
    .saude-weight-trend__header h3 { margin: 0; font-size: 1rem; }
    .saude-weight-trend__header p { margin: .1rem 0 0; color: var(--saude-texto-secundario); font-size: .72rem; }
    .saude-weight-trend__change { flex: 0 0 auto; color: var(--saude-lima); font-size: .82rem; font-weight: 800; }
    .saude-weight-trend__toggle { color: var(--saude-texto-secundario); transition: transform .2s ease; }
    .saude-weight-trend[open] .saude-weight-trend__toggle { transform: rotate(180deg); }
    .saude-weight-trend__viewport { overflow-x: auto; overflow-y: hidden; padding: .15rem .75rem .65rem; border-top: 1px solid rgba(148, 163, 184, .12); scrollbar-color: var(--saude-verde) rgba(148, 163, 184, .12); scrollbar-width: thin; }
    .saude-weight-trend__chart { width: 100%; height: auto; max-width: none; display: block; overflow: visible; }
    .saude-weight-trend__grid { stroke: rgba(148, 163, 184, .16); stroke-width: 1; }
    .saude-weight-trend__area { fill: url(#saude-weight-gradient); }
    .saude-weight-trend__line { fill: none; stroke: var(--saude-lima); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
    .saude-weight-trend__point { fill: var(--saude-painel); stroke: var(--saude-lima); stroke-width: 3; }
    .saude-weight-trend__label { fill: var(--saude-texto); font-size: 12px; font-weight: 700; text-anchor: middle; }
    .saude-weight-trend__date { fill: var(--saude-texto-secundario); font-size: 11px; text-anchor: middle; }
    .saude-profile-modules { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr)); gap: 1rem; margin-top: .85rem; }
    .saude-profile-module { padding: 1rem; border: 1px solid rgba(74, 164, 85, .28); border-radius: 1rem; background: linear-gradient(145deg, rgba(12, 22, 39, .92), rgba(8, 16, 30, .96)); }
    .saude-profile-module__header { display: flex; align-items: center; justify-content: space-between; gap: .75rem; margin-bottom: .75rem; flex-wrap: wrap; }
    .saude-profile-module__header h4 { margin: 0; font-size: .95rem; display: flex; align-items: center; gap: .45rem; color: #d9f5df; }
    .saude-profile-module--diets .saude-diet-grid { gap: .65rem; }
    .saude-profile-module--diets .saude-diet-card { min-height: auto; padding: .75rem .95rem; }
    .saude-section-title { font-size: 1.05rem; font-weight: 700; margin: 1.5rem 0 .5rem; color: var(--saude-lima); display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
    .saude-profile-detail { display: flex; flex-direction: column; gap: .25rem; }
    .saude-profile-detail .saude-profile-timeline { padding-inline: 0; }
    .saude-profile-form__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; }
    .saude-profile-form__section { grid-column: 1 / -1; margin: .25rem 0 0; color: var(--saude-lima); font-size: .78rem; font-weight: 700; text-transform: uppercase; }
    .saude-water-card { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: stretch; overflow: hidden; border: 1px solid rgba(56, 189, 248, .32); border-radius: 1.1rem; background: linear-gradient(145deg, rgba(12, 42, 65, .96), rgba(12, 22, 39, .98)); box-shadow: 0 14px 30px rgba(0, 0, 0, .24); transition: border-color .25s ease, box-shadow .25s ease, transform .25s ease; }
    .saude-water-card::before { content: ''; position: absolute; inset: -60% 35% -60% -20%; pointer-events: none; background: radial-gradient(circle, rgba(56, 189, 248, .13), transparent 65%); animation: saude-water-drift 6s ease-in-out infinite alternate; }
    .saude-water-card:hover { transform: translateY(-2px); border-color: rgba(103, 232, 249, .62); box-shadow: 0 18px 38px rgba(0, 0, 0, .34), 0 0 28px rgba(14, 165, 233, .09); }
    .saude-water-card.is-complete { border-color: rgba(103, 232, 249, .9); box-shadow: 0 16px 38px rgba(0, 0, 0, .32), 0 0 30px rgba(14, 165, 233, .2); }
    .saude-water-card__open { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 1rem; padding: 1.15rem; border: 0; background: transparent; color: var(--saude-texto); text-align: left; cursor: pointer; }
    .saude-water-card__icon { width: 3.4rem; height: 3.4rem; display: grid; place-items: center; border-radius: 1rem; background: linear-gradient(135deg, #0369a1, #38bdf8); color: #fff; font-size: 1.35rem; box-shadow: 0 8px 22px rgba(14, 165, 233, .2); animation: saude-water-float 2.8s ease-in-out infinite; }
    .saude-water-card h3 { margin: 0; font-size: 1.05rem; }
    .saude-water-card p { margin: .3rem 0 0; color: var(--saude-texto-secundario); font-size: .8rem; }
    .saude-water-progress { height: .45rem; margin-top: .7rem; overflow: hidden; border-radius: 999px; background: rgba(148, 163, 184, .18); }
    .saude-water-progress span { position: relative; display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #0369a1, #0ea5e9, #67e8f9); transition: width .35s ease; }
    .saude-water-progress span::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgba(255,255,255,.7), transparent); transform: translateX(-100%); animation: saude-water-shine 2.4s ease-in-out infinite; }
    .saude-water-card__actions { align-self: center; display: flex; gap: .4rem; margin-right: 1rem; }
    .saude-water-profiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
    .saude-water-profile-wrap { position: relative; min-height: 10.5rem; overflow: hidden; border: 1px solid rgba(56, 189, 248, .3); border-radius: 1.15rem; background: radial-gradient(circle at 12% 10%, rgba(56, 189, 248, .17), transparent 9rem), linear-gradient(145deg, rgba(12, 42, 65, .96), rgba(12, 22, 39, .98)); box-shadow: 0 16px 34px rgba(0, 0, 0, .26); transition: transform .22s ease, border-color .22s ease, box-shadow .22s ease; }
    .saude-water-profile-wrap:hover { transform: translateY(-3px); border-color: rgba(103, 232, 249, .65); box-shadow: 0 20px 42px rgba(0, 0, 0, .34), 0 0 28px rgba(14, 165, 233, .1); }
    .saude-water-profile { width: 100%; min-height: 10.5rem; display: grid; place-items: center; align-content: center; gap: .7rem; padding: 1.35rem; border: 0; background: transparent; color: var(--saude-texto); cursor: pointer; text-align: center; }
    .saude-water-profile__avatar { width: 4rem; height: 4rem; display: grid; place-items: center; border-radius: 1.2rem; background: linear-gradient(135deg, #0369a1, #38bdf8); color: #fff; font-size: 1.45rem; box-shadow: 0 10px 26px rgba(14, 165, 233, .24); }
    .saude-water-profile__name { font-size: 1.08rem; font-weight: 800; }
    .saude-water-profile__open-label { color: #67e8f9; font-size: .76rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
    .saude-water-profile__edit { position: absolute; top: .7rem; right: .7rem; z-index: 2; width: 2.25rem; height: 2.25rem; display: grid; place-items: center; border: 1px solid rgba(148, 163, 184, .25); border-radius: .7rem; background: rgba(15, 23, 42, .82); color: #94a3b8; cursor: pointer; }
    .saude-water-profile__edit:hover { background: rgba(56, 189, 248, .12); color: #67e8f9; }
    .saude-water-history { margin-top: 1.2rem; }
    .saude-water-history h3 { margin: 0 0 .65rem; font-size: .95rem; }
    .saude-water-log { display: grid; grid-template-columns: minmax(7rem, .7fr) 1fr 1fr; gap: .75rem; padding: .8rem .9rem; border-bottom: 1px solid rgba(148, 163, 184, .14); font-size: .82rem; }
    .saude-water-log:last-child { border-bottom: 0; }
    .saude-water-log span { color: var(--saude-texto-secundario); }
    .saude-water-log strong { color: var(--saude-texto); }
    .saude-water-modal__goal-actions { display: flex; justify-content: flex-end; margin-top: .85rem; }
    .saude-modal-backdrop { position: fixed; inset: 0; z-index: 10020; display: grid; place-items: center; padding: 1rem; background: rgba(2, 6, 23, .78); backdrop-filter: blur(5px); animation: saude-water-fade .18s ease-out; }
    .saude-confirm-backdrop { position: fixed; inset: 0; z-index: 10060; display: grid; place-items: center; padding: 1rem; background: rgba(2, 6, 23, .82); backdrop-filter: blur(7px); animation: saude-water-fade .18s ease-out; }
    .saude-confirm-dialog { width: min(100%, 29rem); overflow: hidden; border: 1px solid rgba(195, 47, 38, .48); border-radius: 1.1rem; background: linear-gradient(145deg, #162238, #0f172a); box-shadow: 0 26px 80px rgba(0, 0, 0, .6); animation: saude-water-modal-in .22s cubic-bezier(.2,.8,.2,1); }
    .saude-confirm-dialog__body { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .9rem; padding: 1.15rem; }
    .saude-confirm-dialog__icon { width: 3rem; height: 3rem; display: grid; place-items: center; border-radius: .9rem; background: rgba(195, 47, 38, .14); color: #fca5a5; font-size: 1.15rem; }
    .saude-confirm-dialog h3 { margin: 0; font-size: 1.05rem; }
    .saude-confirm-dialog p { margin: .4rem 0 0; color: var(--saude-texto-secundario); font-size: .84rem; line-height: 1.55; }
    .saude-confirm-dialog__actions { display: flex; justify-content: flex-end; gap: .65rem; padding: .85rem 1.15rem 1.15rem; }
    .saude-success-toast { position: fixed; top: max(1rem, env(safe-area-inset-top)); right: 1rem; z-index: 10080; width: min(calc(100% - 2rem), 25rem); display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: .75rem; padding: .85rem; border: 1px solid rgba(149, 193, 31, .55); border-radius: 1rem; background: linear-gradient(135deg, rgba(32, 70, 60, .98), rgba(50, 119, 70, .98)); color: #fff; box-shadow: 0 18px 48px rgba(0, 0, 0, .4), 0 0 28px rgba(74, 164, 85, .14); animation: saude-success-toast-in .3s cubic-bezier(.2,.9,.3,1.15); }
    .saude-success-toast__icon { width: 2.6rem; height: 2.6rem; display: grid; place-items: center; border-radius: .8rem; background: rgba(255, 255, 255, .14); color: #d9f99d; font-size: 1.05rem; }
    .saude-success-toast strong { display: block; font-size: .9rem; }
    .saude-success-toast p { margin: .2rem 0 0; color: rgba(255, 255, 255, .86); font-size: .78rem; line-height: 1.4; }
    .saude-success-toast__close { width: 2.2rem; height: 2.2rem; display: grid; place-items: center; border: 0; border-radius: .65rem; background: transparent; color: rgba(255, 255, 255, .8); cursor: pointer; }
    .saude-success-toast__close:hover { background: rgba(255, 255, 255, .12); color: #fff; }
    .saude-water-modal { width: min(100%, 34rem); max-height: min(88dvh, 44rem); overflow: auto; padding: 1rem; border: 1px solid rgba(56, 189, 248, .35); border-radius: 1.1rem; background: radial-gradient(circle at 15% 0%, rgba(14, 165, 233, .12), transparent 15rem), #0f172a; box-shadow: 0 24px 70px rgba(0, 0, 0, .55); animation: saude-water-modal-in .24s cubic-bezier(.2,.8,.2,1); }
    .saude-water-modal.is-complete { border-color: rgba(103, 232, 249, .78); box-shadow: 0 24px 70px rgba(0, 0, 0, .55), 0 0 34px rgba(14, 165, 233, .16); }
    .saude-water-modal__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
    .saude-water-modal__header h3 { margin: 0; }
    .saude-water-modal__header p { margin: .25rem 0 0; color: var(--saude-texto-secundario); font-size: .8rem; }
    ${WATER_DROP_STYLES}
    .saude-water-check:hover:not(:disabled) { transform: translateY(-2px); border-color: rgba(56, 189, 248, .65); }
    .saude-water-check[aria-pressed="true"] { border-color: #38bdf8; background: linear-gradient(135deg, #0369a1, #0ea5e9); color: #fff; box-shadow: 0 7px 18px rgba(14, 165, 233, .22); }
    .saude-water-check.is-splash { animation: saude-water-check-pop .5s cubic-bezier(.2,.9,.3,1.25); }
    .saude-water-check.is-splash i { animation: saude-water-check-icon .45s ease-out; }
    .saude-water-check.is-splash::before, .saude-water-check.is-splash::after { content: ''; position: absolute; z-index: 2; width: .45rem; height: .65rem; pointer-events: none; border-radius: 55% 45% 60% 40%; background: #67e8f9; opacity: 0; animation: saude-water-droplets .65s ease-out; }
    .saude-water-check.is-splash::before { box-shadow: -1.5rem -.2rem 0 -.08rem #38bdf8, 1.35rem -.65rem 0 -.12rem #7dd3fc; }
    .saude-water-check.is-splash::after { box-shadow: -1rem 1rem 0 -.12rem #0ea5e9, 1.5rem .8rem 0 -.08rem #67e8f9; animation-delay: .04s; }
    .saude-water-motion-drop { position: absolute; left: 50%; top: 50%; z-index: 3; width: .42rem; height: .58rem; pointer-events: none; border-radius: 55% 45% 60% 40%; background: linear-gradient(160deg, #d9faff, #38bdf8); opacity: 0; }
    .saude-water-celebration-layer { position: fixed; inset: 0; z-index: 10040; overflow: hidden; pointer-events: none; }
    .saude-water-celebration { position: absolute; top: max(1.25rem, env(safe-area-inset-top)); left: 0; right: 0; width: min(calc(100% - 2rem), 27rem); margin-inline: auto; padding: .9rem 1rem; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: .8rem; border: 1px solid rgba(103, 232, 249, .7); border-radius: 1rem; background: linear-gradient(135deg, rgba(3, 105, 161, .97), rgba(15, 118, 110, .97)); color: #fff; box-shadow: 0 18px 48px rgba(0, 0, 0, .38), 0 0 30px rgba(56, 189, 248, .2); animation: saude-water-celebration-in .42s cubic-bezier(.2,.9,.25,1.15); }
    .saude-water-celebration__icon { width: 2.75rem; height: 2.75rem; display: grid; place-items: center; border-radius: 50%; background: rgba(255, 255, 255, .18); font-size: 1.25rem; }
    .saude-water-celebration strong { display: block; font-size: 1rem; }
    .saude-water-celebration p { margin: .2rem 0 0; color: rgba(255, 255, 255, .88); font-size: .8rem; }
    .saude-water-check:disabled { cursor: not-allowed; opacity: .5; }
    @keyframes saude-water-fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes saude-water-modal-in { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes saude-water-check-pop { 0% { transform: scale(.86); } 55% { transform: scale(1.13); } 100% { transform: scale(1); } }
    @keyframes saude-water-check-icon { 0% { opacity: 0; transform: rotate(-25deg) scale(.35); } 100% { opacity: 1; transform: rotate(0) scale(1); } }
    @keyframes saude-water-droplets { 0% { opacity: .95; transform: translateY(0) scale(.4) rotate(25deg); } 100% { opacity: 0; transform: translateY(-1.5rem) scale(1) rotate(25deg); } }
    @keyframes saude-water-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
    @keyframes saude-water-drift { from { transform: translateX(-2%) scale(.95); } to { transform: translateX(12%) scale(1.08); } }
    @keyframes saude-water-shine { 0%, 45% { transform: translateX(-100%); } 75%, 100% { transform: translateX(100%); } }
    @keyframes saude-water-celebration-in { from { opacity: 0; transform: translateY(-1rem) scale(.94); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes saude-success-toast-in { from { opacity: 0; transform: translateY(-.8rem) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @media (prefers-reduced-motion: reduce) {
      .saude-modal-backdrop, .saude-confirm-backdrop, .saude-confirm-dialog, .saude-success-toast, .saude-water-modal, .saude-water-card::before, .saude-water-card__icon, .saude-water-progress span::after, .saude-water-check.is-splash, .saude-water-check.is-splash i, .saude-water-check.is-splash::before, .saude-water-check.is-splash::after,       .saude-water-celebration, .saude-water-drop__success-flag { animation: none !important; }
      .saude-water-card, .saude-water-progress span, .saude-water-check, .saude-water-drop__pool { transition: none !important; }
      .saude-water-drop.is-victory .saude-water-drop__liquid, .saude-water-drop.is-victory .saude-water-drop__shell { animation: none !important; }
    }
    @media (max-width: 760px) {
      .saude-root--compact-hero .saude-hero { display: none; }
      .saude-root { padding: .85rem max(.65rem, env(safe-area-inset-right)) max(1.65rem, calc(.85rem + env(safe-area-inset-bottom))) max(.65rem, env(safe-area-inset-left)); }
      .saude-hero__image { width: 3.75rem; height: 3.75rem; }
      .saude-hero { margin-bottom: 1rem; gap: .75rem; }
      .saude-page-toolbar { align-items: stretch; }
      .saude-page-header { flex: 1; min-width: 0; }
      .saude-page-header p { display: none; }
      .saude-profile-detail-subtitle { display: block; }
      .saude-page-toolbar--stack { gap: .65rem; margin-bottom: .85rem; }
      .saude-page-header--profile .saude-btn .saude-btn__label { display: none; }
      .saude-page-header--profile .saude-btn { min-width: 2.65rem; padding-inline: .75rem; }
      .saude-profile-detail-actions { display: grid; grid-template-columns: 1fr 1fr; gap: .5rem; }
      .saude-profile-detail-actions .saude-btn { flex: none; width: 100%; font-size: .8rem; padding-inline: .55rem; }
      .saude-profile-card__header { flex-direction: column; align-items: stretch; gap: .75rem; padding: .85rem; }
      .saude-profile-card__identity-btn { width: 100%; }
      .saude-profile-card__actions { display: grid; grid-template-columns: 1fr 1fr; width: 100%; }
      .saude-profile-card__actions .saude-btn { width: 100%; justify-content: center; min-height: 2.75rem; font-size: .8rem; }
      .saude-profile-card__actions .saude-btn span { display: inline; }
      .saude-btn--insert { flex: 0 0 auto; padding-inline: .8rem; }
      .saude-editor { padding: .85rem; }
      .saude-editor__grid { grid-template-columns: 1fr; }
      .saude-editor__actions { position: sticky; bottom: 0; margin: .85rem -.85rem -.85rem; padding: .75rem .85rem max(.75rem, env(safe-area-inset-bottom)); background: rgba(15, 23, 42, .96); border-top: 1px solid rgba(148, 163, 184, .16); }
      .saude-editor__actions .saude-btn { flex: 1; }
      .saude-diet-form__grid, .saude-meal-builder { grid-template-columns: 1fr; }
      .saude-diet-card { min-height: auto; padding: .85rem 1rem; }
      .saude-profile-form__grid { grid-template-columns: 1fr; }
      .saude-profile-summary { grid-template-columns: 1fr 1fr; gap: .5rem; padding-inline: .85rem; }
      .saude-profile-summary--detail { padding-inline: 0; }
      .saude-profile-stat { padding: .6rem .55rem; }
      .saude-profile-stat span { font-size: .7rem; }
      .saude-profile-stat strong { font-size: .9rem; margin-top: .2rem; }
      .saude-weight-trend { border-radius: .75rem; }
      .saude-weight-trend--panel { width: 100%; max-width: 100%; margin-inline: 0; border-inline: 1px solid rgba(149, 193, 31, .24); border-radius: .75rem; }
      .saude-weight-trend__header { flex-wrap: wrap; }
      .saude-weight-trend__change { width: 100%; text-align: left; margin-top: .15rem; }
      .saude-weight-trend > summary { padding: .65rem .75rem; }
      .saude-weight-trend__header { gap: .5rem; }
      .saude-weight-trend__header h3 { font-size: .88rem; }
      .saude-weight-trend__change { font-size: .72rem; }
      .saude-weight-trend__chart { height: auto; }
      .saude-weight-trend__viewport { padding: .1rem .5rem .5rem; -webkit-overflow-scrolling: touch; overscroll-behavior-x: contain; }
      .saude-weight-trend__chart--mobile { width: auto; max-width: none; display: block; }
      .saude-diet-modal .saude-editor__actions { position: sticky; bottom: 0; margin: .85rem -1.1rem -1.1rem; padding: .75rem 1.1rem max(.75rem, env(safe-area-inset-bottom)); background: rgba(15, 23, 42, .96); border-top: 1px solid rgba(148, 163, 184, .16); z-index: 2; }
      .saude-diet-modal .saude-editor__actions .saude-btn { flex: 1; }
      .saude-timeline-item { grid-template-columns: 1fr; gap: .3rem; }
      .saude-water-card { grid-template-columns: 1fr; }
      .saude-water-card__open { padding: .9rem .9rem .75rem; gap: .75rem; }
      .saude-water-card__icon { width: 2.9rem; height: 2.9rem; font-size: 1.15rem; }
      .saude-water-card h3 { font-size: .95rem; }
      .saude-water-card__actions { margin: 0; padding: 0 .85rem .85rem; justify-content: flex-end; }
      .saude-section-title { font-size: .92rem; margin-top: 1.15rem; }
      .saude-profile-timeline { padding-inline: .85rem; }
      .saude-profile-timeline > summary { font-size: .78rem; line-height: 1.35; }
      .saude-modal-backdrop { padding: max(.65rem, env(safe-area-inset-top)) .65rem max(.65rem, env(safe-area-inset-bottom)); align-items: flex-end; }
      .saude-water-modal { width: 100%; max-height: min(92dvh, 52rem); border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
      .saude-water-profiles { grid-template-columns: 1fr; }
      .saude-water-log { grid-template-columns: 1fr 1fr; }
      .saude-water-log time { grid-column: 1 / -1; }
      .saude-confirm-dialog__body { grid-template-columns: 1fr; }
      .saude-confirm-dialog__actions { flex-direction: column-reverse; }
      .saude-confirm-dialog__actions .saude-btn { width: 100%; }
      .saude-success-toast { top: max(.75rem, env(safe-area-inset-top)); right: .75rem; width: calc(100% - 1.5rem); }
      .saude-diet-open span { display: none; }
      .saude-filters { grid-template-columns: 1fr; }
      .saude-table-wrap { overflow: hidden; border: 1px solid rgba(148, 163, 184, .18); border-radius: .85rem; background: var(--saude-painel); box-shadow: 0 10px 24px rgba(0, 0, 0, .2); }
      .saude-table thead { display: none; }
      .saude-table, .saude-table tbody, .saude-table tr, .saude-table td { display: block; width: 100%; }
      .saude-table tbody { display: block; }
      .saude-table tr { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "tipo acoes" "item acoes" "porcao acoes"; column-gap: .75rem; padding: .75rem .8rem; background: transparent; }
      .saude-table tr + tr { border-top: 1px solid rgba(148, 163, 184, .16); }
      .saude-table tr:hover { background: rgba(74, 164, 85, .06); }
      .saude-table td { padding: 0; border: 0; white-space: normal !important; }
      .saude-table td[data-label="Tipo da tabela"] { grid-area: tipo; color: var(--saude-lima); font-size: .68rem; font-weight: 700; line-height: 1.3; text-transform: uppercase; }
      .saude-table td[data-label="Nome do item"] { grid-area: item; margin-top: .2rem; font-size: .9rem; line-height: 1.35; }
      .saude-table td[data-label="Quantidade da porção"] { grid-area: porcao; margin-top: .25rem; color: var(--saude-texto-secundario); font-size: .78rem; line-height: 1.35; }
      .saude-table td[data-label="Quantidade da porção"]::before { content: 'Porção: '; color: #718399; font-size: .68rem; font-weight: 700; text-transform: uppercase; }
      .saude-table td[data-label="Ações"] { grid-area: acoes; width: auto; align-self: center; }
      .saude-row-actions { flex-direction: column; justify-content: center; gap: .35rem; }
      .saude-icon-btn { width: 2.65rem; height: 2.65rem; }
      .saude-pagination { align-items: stretch; flex-wrap: wrap; }
      .saude-pagination > .saude-btn { flex: 1; }
      .saude-pagination__pages { order: -1; width: 100%; }
    }
    @media (max-width: 420px) {
      .saude-hero p { font-size: .8rem; }
      .saude-page-header h2 { font-size: 1.2rem; line-height: 1.15; }
      .saude-btn--insert span { display: none; }
      .saude-btn--insert { width: 2.8rem; padding: 0; }
      .saude-filters { padding: .8rem; }
      .saude-profile-detail-actions { grid-template-columns: 1fr; }
      .saude-profile-card__actions { grid-template-columns: 1fr; }
      .saude-profile-summary { grid-template-columns: 1fr; }
      .saude-profile-summary--detail { grid-template-columns: 1fr 1fr; }
    }
  </style>
`;

function renderShell(container, content, { loading = false, compactHero = false } = {}) {
  container.innerHTML = `
    ${SAUDE_STYLES}
    <main class="saude-root${loading ? ' saude-root--loading' : ''}${compactHero ? ' saude-root--compact-hero' : ''}">
      <header class="saude-hero">
        <img class="saude-hero__image" src="/icone%20saude.png" alt="" aria-hidden="true">
        <div>
          <h1>Saúde</h1>
          <p>Consulte suas informações de saúde e nutrição.</p>
        </div>
      </header>
      ${content}
    </main>
  `;
  requestAnimationFrame(() => syncSaudeModalScrollLock(container));
}

function requestSaudeConfirmation(container, {
  title = 'Confirmar exclusão',
  message,
  confirmLabel = 'Excluir',
} = {}) {
  return new Promise((resolve) => {
    container.querySelector('[data-saude-confirm-backdrop]')?.remove();
    const previousFocus = document.activeElement;
    const backdrop = document.createElement('div');
    backdrop.className = 'saude-confirm-backdrop';
    backdrop.dataset.saudeConfirmBackdrop = '';
    backdrop.innerHTML = `<section class="saude-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="saude-confirm-title" aria-describedby="saude-confirm-message"><div class="saude-confirm-dialog__body"><div class="saude-confirm-dialog__icon"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i></div><div><h3 id="saude-confirm-title">${escapeHtml(title)}</h3><p id="saude-confirm-message">${escapeHtml(message)}</p></div></div><div class="saude-confirm-dialog__actions"><button type="button" class="saude-btn" data-saude-confirm="cancel">Cancelar</button><button type="button" class="saude-btn saude-btn--danger" data-saude-confirm="accept">${escapeHtml(confirmLabel)}</button></div></section>`;

    let settled = false;
    const finish = (accepted) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeydown);
      backdrop.remove();
      syncSaudeModalScrollLock(container);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
      resolve(accepted);
    };
    const onKeydown = (event) => {
      if (event.key === 'Escape') finish(false);
    };
    backdrop.addEventListener('click', (event) => {
      event.stopPropagation();
      const action = event.target.closest('[data-saude-confirm]')?.dataset.saudeConfirm;
      if (event.target === backdrop || action === 'cancel') finish(false);
      if (action === 'accept') finish(true);
    });
    document.addEventListener('keydown', onKeydown);
    (container.querySelector('.saude-root') || container).append(backdrop);
    requestAnimationFrame(() => {
      syncSaudeModalScrollLock(container);
      backdrop.querySelector('[data-saude-confirm="cancel"]')?.focus();
    });
  });
}

function showSaudeSuccess(container, message) {
  container.querySelector('[data-saude-success-toast]')?.remove();
  const toast = document.createElement('div');
  toast.className = 'saude-success-toast';
  toast.dataset.saudeSuccessToast = '';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `<div class="saude-success-toast__icon"><i class="fas fa-check" aria-hidden="true"></i></div><div><strong>Ação concluída</strong><p>${escapeHtml(message)}</p></div><button type="button" class="saude-success-toast__close" aria-label="Fechar mensagem"><i class="fas fa-xmark" aria-hidden="true"></i></button>`;
  const remove = () => toast.remove();
  toast.querySelector('.saude-success-toast__close')?.addEventListener('click', remove);
  (container.querySelector('.saude-root') || container).append(toast);
  setTimeout(remove, 3600);
}

function renderLoading(container, message = 'Carregando módulo...') {
  renderShell(container, `
    <section class="saude-loading" aria-live="polite" aria-busy="true">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <span>${escapeHtml(message)}</span>
    </section>
  `, { loading: true });
}

function renderHome(container, state) {
  if (state) state.view = 'profiles';
  renderProfiles(container, state);
}

function currentHealthProfile(state) {
  return state.profiles.find((p) => Number(p.id) === Number(state.selectedProfileId)) || null;
}

function healthProfileByWaterKey(state, profileKey) {
  if (profileKey == null || profileKey === '') return null;
  return state.profiles.find((p) => String(p.id) === String(profileKey)) || null;
}

function waterProfileKeyFromAction(actionElement, state) {
  const fromButton = actionElement?.dataset?.waterProfileId;
  if (fromButton) return String(fromButton);
  if (state.view === 'profile-detail' && state.selectedProfileId != null) return String(state.selectedProfileId);
  if (state.waterProfileId != null && state.waterProfileId !== '') return String(state.waterProfileId);
  return null;
}

function waterTrackerDisplayName(state) {
  const health = healthProfileByWaterKey(state, state.waterProfileId);
  if (health?.nome) return health.nome;
  const water = state.waterProfiles.find((profile) => String(profile.id) === String(state.waterProfileId));
  return water?.nome || state.waterConfig?.nome || 'Consumo de água';
}

function renderActiveSaudeView(container, state) {
  if (state.view === 'profile-detail') renderProfileDetail(container, state);
  else if (state.view === 'profiles') renderProfiles(container, state);
  else if (state.view === 'water') {
    state.view = 'profiles';
    renderProfiles(container, state);
  } else if (state.view === 'dietas') renderDietas(container, state);
  else if (state.view === 'tabela-nutricional') renderTabelaNutricional(container, state);
  else renderProfiles(container, state);
}

async function syncWaterWithHealthProfile(state, healthProfile) {
  if (!healthProfile) return;
  const profileKey = String(healthProfile.id);
  state.waterProfileId = profileKey;
  if (isLocalWaterStorageMode()) {
    ensureLocalWaterProfileLinkedToHealth(healthProfile);
    applyWaterData(state, loadLocalWater(undefined, undefined, profileKey, { strict: true, healthProfile }));
    return;
  }
  applyWaterData(state, await requestWater('GET', { profile_id: profileKey, preserve_profiles: true }));
}

async function syncDietsForHealthProfile(state, healthProfile) {
  if (!healthProfile) return;
  const profileId = Number(healthProfile.id);
  state.dietSelectedProfileId = profileId;
  const response = await fetch(`/api/saude?resource=dietas&profile_id=${profileId}`, { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível carregar as dietas.');
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const others = (state.diets || []).filter((diet) => Number(diet.perfil_id) !== profileId);
  state.diets = [...rows, ...others];
}

function dietsForProfile(state, profileId) {
  return (state.diets || []).filter((diet) => Number(diet.perfil_id) === Number(profileId));
}

function renderProfileDietSection(profile, state) {
  const rows = dietsForProfile(state, profile.id);
  const list = rows.length
    ? `<div class="saude-diet-grid">${rows.map((diet) => `
      <button type="button" class="saude-diet-card" data-saude-action="view-diet" data-saude-id="${escapeHtml(diet.id)}" aria-label="Abrir ${escapeHtml(diet.titulo)}">
        <div>
          <h3>${escapeHtml(diet.titulo)}</h3>
          <div class="saude-diet-meta"><span>${countDietItems(diet.refeicoes)} itens</span></div>
        </div>
        <span class="saude-diet-card__arrow"><i class="fas fa-chevron-right"></i></span>
      </button>`).join('')}</div>`
    : '<p class="saude-meal-empty" style="margin:0">Nenhuma dieta cadastrada para este perfil.</p>';
  return `
    <article class="saude-profile-module saude-profile-module--diets" aria-labelledby="profile-diets-title">
      <div class="saude-profile-module__header">
        <h4 id="profile-diets-title"><i class="fas fa-utensils"></i> Dietas</h4>
        <button type="button" class="saude-btn saude-btn--primary saude-meal-card__add" data-saude-action="add-diet"><i class="fas fa-plus"></i> Nova dieta</button>
      </div>
      ${list}
    </article>`;
}

function paginationNumbers(currentPage, totalPages) {
  const candidates = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  return [...candidates]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
}

function renderTableRows(rows) {
  return rows.map((row) => `
    <tr>
      <td data-label="Tipo da tabela">${escapeHtml(row.categoria)}</td>
      <td data-label="Nome do item"><strong>${escapeHtml(row.item)}</strong></td>
      <td data-label="Quantidade da porção">${escapeHtml(row.porcao)}</td>
      <td data-label="Ações">
        <div class="saude-row-actions">
          <button type="button" class="saude-icon-btn" data-saude-action="edit" data-saude-id="${escapeHtml(row.id)}" aria-label="Editar ${escapeHtml(row.item)}" title="Editar"><i class="fas fa-pencil" aria-hidden="true"></i></button>
          <button type="button" class="saude-icon-btn saude-icon-btn--danger" data-saude-action="delete" data-saude-id="${escapeHtml(row.id)}" aria-label="Excluir ${escapeHtml(row.item)}" title="Excluir"><i class="fas fa-trash" aria-hidden="true"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderEditor(state, options) {
  if (!state.editorOpen) return '';
  const draft = state.draft || {};
  return `
    <form class="saude-editor" data-saude-form>
      <h3 class="saude-editor__title">${state.editingId ? 'Editar item' : 'Inserir item'}</h3>
      <div class="saude-editor__grid">
        <div class="saude-field-group">
          <label for="saude-item">Nome do item</label>
          <input id="saude-item" name="item" class="saude-field" maxlength="200" required autocomplete="off" placeholder="Ex.: Peito de frango" value="${escapeHtml(draft.item)}">
        </div>
        <div class="saude-field-group">
          <label for="saude-tipo-tabela">Tipo da tabela</label>
          <input id="saude-tipo-tabela" name="categoria" class="saude-field" maxlength="80" required autocomplete="off" list="saude-tipos-tabela" placeholder="Ex.: Proteínas" value="${escapeHtml(draft.categoria)}">
          <datalist id="saude-tipos-tabela">${options.categorias.map((value) => `<option value="${escapeHtml(value)}"></option>`).join('')}</datalist>
        </div>
        <div class="saude-field-group">
          <label for="saude-porcao">Quantidade da porção</label>
          <textarea id="saude-porcao" name="porcao" class="saude-field" maxlength="2000" required rows="2" placeholder="Ex.: 100 g">${escapeHtml(draft.porcao)}</textarea>
        </div>
      </div>
      <div class="saude-editor__actions">
        <button type="button" class="saude-btn" data-saude-action="cancel-editor"${state.busy ? ' disabled' : ''}>Cancelar</button>
        <button type="submit" class="saude-btn saude-btn--primary"${state.busy ? ' disabled' : ''}>${state.busy ? '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Salvando' : '<i class="fas fa-check" aria-hidden="true"></i> Salvar'}</button>
      </div>
    </form>`;
}

function renderTabelaNutricional(container, state) {
  const filtered = filtrarTabelaNutricional(state.rows, state.filters);
  const pagination = paginarTabelaNutricional(filtered, state.page);
  state.page = pagination.currentPage;
  const options = opcoesTabelaNutricional(state.rows);

  const tableContent = pagination.totalItems
    ? `<div class="saude-table-wrap">
        <table class="saude-table">
          <thead><tr><th>Tipo da tabela</th><th>Nome do item</th><th>Quantidade da porção</th><th>Ações</th></tr></thead>
          <tbody>${renderTableRows(pagination.rows)}</tbody>
        </table>
      </div>`
    : `<div class="saude-empty"><i class="fas fa-magnifying-glass" aria-hidden="true"></i>Nenhum item encontrado com os filtros selecionados.</div>`;

  const pageButtons = paginationNumbers(pagination.currentPage, pagination.totalPages)
    .map((page) => `<button type="button" class="saude-btn saude-pagination__page" data-saude-page="${page}"${page === pagination.currentPage ? ' aria-current="page"' : ''}>${page}</button>`)
    .join('');

  renderShell(container, `
    <section class="saude-page" aria-labelledby="tabela-nutricional-title">
      <div class="saude-page-toolbar">
        <div class="saude-page-header">
          <button type="button" class="saude-btn" data-saude-action="home" aria-label="Voltar para o início de Saúde"><i class="fas fa-arrow-left" aria-hidden="true"></i></button>
          <div>
            <h2 id="tabela-nutricional-title">Tabela Nutricional</h2>
            <p>Cadastre e organize alimentos por tipo de tabela.</p>
          </div>
        </div>
        <button type="button" class="saude-btn saude-btn--primary saude-btn--insert" data-saude-action="insert"${state.busy ? ' disabled' : ''}><i class="fas fa-plus" aria-hidden="true"></i><span>Inserir</span></button>
      </div>
      ${state.notice ? `<div class="saude-notice${state.notice.type === 'error' ? ' saude-notice--error' : ''}" role="status"><i class="fas ${state.notice.type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-check'}" aria-hidden="true"></i><span>${escapeHtml(state.notice.text)}</span></div>` : ''}
      ${renderEditor(state, options)}
      <div class="saude-filters">
        <div class="saude-field-group">
          <label for="saude-busca">Buscar item</label>
          <input id="saude-busca" class="saude-field" type="search" placeholder="Ex.: frango, arroz, morango" value="${escapeHtml(state.filters.busca)}" data-saude-filter="busca">
        </div>
        <div class="saude-field-group">
          <label for="saude-categoria">Categoria</label>
          <select id="saude-categoria" class="saude-field" data-saude-filter="categoria">
            <option value="">Todas</option>
            ${options.categorias.map((value) => `<option value="${escapeHtml(value)}"${value === state.filters.categoria ? ' selected' : ''}>${escapeHtml(value)}</option>`).join('')}
          </select>
        </div>
      </div>
      <p class="saude-results" aria-live="polite">${pagination.totalItems} ${pagination.totalItems === 1 ? 'item encontrado' : 'itens encontrados'}.</p>
      ${tableContent}
      ${pagination.totalItems ? `<div class="saude-pagination" role="navigation" aria-label="Páginas da tabela nutricional">
        <button type="button" class="saude-btn" data-saude-page="${pagination.currentPage - 1}"${pagination.currentPage === 1 ? ' disabled' : ''}><i class="fas fa-chevron-left" aria-hidden="true"></i> Anterior</button>
        <div class="saude-pagination__pages">${pageButtons}</div>
        <button type="button" class="saude-btn" data-saude-page="${pagination.currentPage + 1}"${pagination.currentPage === pagination.totalPages ? ' disabled' : ''}>Próxima <i class="fas fa-chevron-right" aria-hidden="true"></i></button>
      </div>` : ''}
    </section>
  `);
}

function blankDietDraft(profileId = null) {
  return {
    perfil_id: profileId ? Number(profileId) : null,
    titulo: '',
    observacoes: '',
    refeicoes: createEmptyDietMeals(),
  };
}

function dietDraftFromDiet(diet) {
  return {
    perfil_id: diet?.perfil_id ? Number(diet.perfil_id) : null,
    titulo: String(diet?.titulo || ''),
    observacoes: String(diet?.observacoes || ''),
    refeicoes: normalizeDietMeals(diet?.refeicoes),
  };
}

function captureDietFormFields(container, state) {
  const form = container.querySelector('[data-saude-diet-form]');
  if (!form) return;
  const values = new FormData(form);
  const perfilId = Number(values.get('perfil_id'));
  state.dietDraft = {
    ...state.dietDraft,
    perfil_id: perfilId || state.dietDraft?.perfil_id || null,
    titulo: String(values.get('titulo') || '').trim(),
    observacoes: String(values.get('observacoes') || '').trim(),
  };
}

function renderDietMealEditor(meal) {
  const items = meal.itens.length
    ? `<div class="saude-meal-items">${meal.itens.map((item, index) => `<div class="saude-meal-item"><div><strong>${escapeHtml(item.nome)}</strong><span>${escapeHtml(item.quantidade)}${item.observacao ? ` · ${escapeHtml(item.observacao)}` : ''}</span></div><div class="saude-meal-item__actions"><button type="button" class="saude-icon-btn" data-saude-action="edit-diet-item" data-meal-type="${escapeHtml(meal.tipo)}" data-item-index="${index}" aria-label="Editar ${escapeHtml(item.nome)}"><i class="fas fa-pencil"></i></button><button type="button" class="saude-icon-btn saude-icon-btn--danger" data-saude-action="delete-diet-item" data-meal-type="${escapeHtml(meal.tipo)}" data-item-index="${index}" aria-label="Excluir ${escapeHtml(item.nome)}"><i class="fas fa-trash"></i></button></div></div>`).join('')}</div>`
    : '<p class="saude-meal-empty">Nenhum item adicionado.</p>';
  return `<section class="saude-meal-card" aria-labelledby="meal-${escapeHtml(meal.tipo)}"><div class="saude-meal-card__header"><h4 id="meal-${escapeHtml(meal.tipo)}">${escapeHtml(meal.titulo)}</h4><button type="button" class="saude-btn saude-meal-card__add" data-saude-action="add-diet-item" data-meal-type="${escapeHtml(meal.tipo)}"><i class="fas fa-plus"></i> Item</button></div>${items}</section>`;
}

function renderDietForm(state) {
  if (!state.dietEditorOpen) return '';
  const profiles = state.profiles || [];
  const inProfileDetail = state.view === 'profile-detail';
  const draft = state.dietDraft || blankDietDraft(state.dietSelectedProfileId);
  const selectedProfileId = inProfileDetail
    ? (state.selectedProfileId || draft.perfil_id || state.dietSelectedProfileId)
    : (draft.perfil_id || state.dietSelectedProfileId || (profiles[0]?.id ?? ''));
  const lockedProfile = profiles.find((p) => Number(p.id) === Number(selectedProfileId));
  const profileField = inProfileDetail && selectedProfileId
    ? `<input type="hidden" name="perfil_id" value="${escapeHtml(selectedProfileId)}"><div class="saude-field-group"><label>Nome da dieta</label><input id="diet-titulo" name="titulo" class="saude-field" required maxlength="160" value="${escapeHtml(draft.titulo)}" placeholder="Ex.: Plano alimentar hipertrofia"></div>`
    : `<div class="saude-field-group">
              <label for="diet-perfil">Perfil</label>
              <select id="diet-perfil" name="perfil_id" class="saude-field" required>
                <option value="">Selecione o perfil</option>
                ${profiles.map((p) => `<option value="${escapeHtml(p.id)}"${Number(p.id) === Number(selectedProfileId) ? ' selected' : ''}>${escapeHtml(p.nome)}</option>`).join('')}
              </select>
            </div>
            <div class="saude-field-group">
              <label for="diet-titulo">Nome da dieta</label>
              <input id="diet-titulo" name="titulo" class="saude-field" required maxlength="160" value="${escapeHtml(draft.titulo)}" placeholder="Ex.: Plano alimentar hipertrofia">
            </div>`;
  return `
    <div class="saude-modal-backdrop" data-diet-form-backdrop role="presentation">
      <section class="saude-diet-modal" role="dialog" aria-modal="true" aria-labelledby="diet-form-title">
        <div class="saude-diet-modal__header">
          <div>
            <h3 id="diet-form-title">${state.dietEditingId ? 'Editar dieta' : 'Adicionar dieta'}</h3>
            <p>${inProfileDetail && lockedProfile ? `Plano alimentar de ${escapeHtml(lockedProfile.nome)}.` : 'Organize o plano alimentar e alimentos por refeição.'}</p>
          </div>
          <button type="button" class="saude-icon-btn" data-saude-action="cancel-diet-editor" aria-label="Fechar"><i class="fas fa-xmark"></i></button>
        </div>
        <form class="saude-diet-form" data-saude-diet-form style="margin:0;padding:0;background:transparent;border:0;box-shadow:none;">
          <div class="saude-diet-form__grid">${profileField}</div>
          <div class="saude-meal-builder">${normalizeDietMeals(draft.refeicoes).map(renderDietMealEditor).join('')}</div>
          <div class="saude-field-group" style="margin-top:.8rem"><label for="diet-observacoes">Observações</label><textarea id="diet-observacoes" name="observacoes" class="saude-field" maxlength="4000" rows="2">${escapeHtml(draft.observacoes)}</textarea></div>
          <div class="saude-editor__actions">
            <button type="button" class="saude-btn" data-saude-action="cancel-diet-editor"${state.busy ? ' disabled' : ''}>Cancelar</button>
            <button type="submit" class="saude-btn saude-btn--primary"${state.busy ? ' disabled' : ''}>${state.busy ? '<i class="fas fa-spinner fa-spin"></i> Salvando' : '<i class="fas fa-check"></i> Salvar dieta'}</button>
          </div>
        </form>
      </section>
    </div>`;
}

function renderDietOverlay(state) {
  if (state.dietModal === 'item') {
    const meal = DIET_MEALS.find((entry) => entry.tipo === state.dietItemMealType);
    const editing = Number.isInteger(state.dietItemEditingIndex);
    return `<div class="saude-modal-backdrop" data-diet-modal-backdrop role="presentation"><section class="saude-diet-modal saude-diet-modal--item" role="dialog" aria-modal="true" aria-labelledby="diet-item-title"><div class="saude-diet-modal__header"><div><h3 id="diet-item-title">${editing ? 'Editar item' : 'Adicionar item'}</h3><p>${escapeHtml(meal?.titulo || '')}</p></div><button type="button" class="saude-icon-btn" data-saude-action="close-diet-modal" aria-label="Fechar"><i class="fas fa-xmark"></i></button></div><form data-diet-item-form><div class="saude-field-group"><label for="diet-item-name">Nome do alimento</label><input id="diet-item-name" name="nome" class="saude-field" required maxlength="160" value="${escapeHtml(state.dietItemDraft.nome)}" placeholder="Ex.: Arroz integral"></div><div class="saude-field-group" style="margin-top:.75rem"><label for="diet-item-quantity">Quantidade</label><input id="diet-item-quantity" name="quantidade" class="saude-field" required maxlength="120" value="${escapeHtml(state.dietItemDraft.quantidade)}" placeholder="Ex.: 100 g ou 2 unidades"></div><div class="saude-field-group" style="margin-top:.75rem"><label for="diet-item-note">Observação (opcional)</label><textarea id="diet-item-note" name="observacao" class="saude-field" maxlength="500" rows="3" placeholder="Ex.: Sem açúcar">${escapeHtml(state.dietItemDraft.observacao)}</textarea></div><div class="saude-editor__actions"><button type="button" class="saude-btn" data-saude-action="close-diet-modal">Cancelar</button><button type="submit" class="saude-btn saude-btn--primary"><i class="fas fa-check"></i> Salvar item</button></div></form></section></div>`;
  }
  if (state.dietModal !== 'detail') return '';
  const diet = state.diets.find((item) => Number(item.id) === Number(state.dietSelectedId));
  if (!diet) return '';
  const profile = (state.profiles || []).find((p) => Number(p.id) === Number(diet.perfil_id));
  const showProfileName = state.view !== 'profile-detail' && profile;
  const meals = normalizeDietMeals(diet.refeicoes).filter((meal) => meal.itens.length > 0);
  const mealContent = meals.length
    ? `<div class="saude-diet-detail-meals">${meals.map((meal) => `<section class="saude-diet-detail-meal"><h4>${escapeHtml(meal.titulo)}</h4>${meal.itens.map((item) => `<div class="saude-diet-detail-item"><strong>${escapeHtml(item.nome)} — ${escapeHtml(item.quantidade)}</strong>${item.observacao ? `<p>${escapeHtml(item.observacao)}</p>` : ''}</div>`).join('')}</section>`).join('')}</div>`
    : '<div class="saude-empty"><i class="fas fa-bowl-food"></i>Nenhum item cadastrado nesta dieta.</div>';
  return `<div class="saude-modal-backdrop" data-diet-modal-backdrop role="presentation"><section class="saude-diet-modal" role="dialog" aria-modal="true" aria-labelledby="diet-detail-title"><div class="saude-diet-modal__header"><div><h3 id="diet-detail-title">${escapeHtml(diet.titulo)}</h3>${showProfileName ? `<p style="margin:.25rem 0 0;color:var(--saude-lima);font-size:.82rem;font-weight:700;"><i class="fas fa-user"></i> ${escapeHtml(profile.nome)}</p>` : ''}</div><button type="button" class="saude-icon-btn" data-saude-action="close-diet-modal" aria-label="Fechar"><i class="fas fa-xmark"></i></button></div>${mealContent}${diet.observacoes ? `<div class="saude-diet-section"><h4>Observações</h4><p class="saude-diet-copy">${escapeHtml(diet.observacoes)}</p></div>` : ''}<div class="saude-editor__actions"><button type="button" class="saude-btn saude-btn--danger" data-saude-action="delete-diet" data-saude-id="${escapeHtml(diet.id)}"><i class="fas fa-trash"></i> Excluir</button><button type="button" class="saude-btn" data-saude-action="edit-diet" data-saude-id="${escapeHtml(diet.id)}"><i class="fas fa-pencil"></i> Editar</button><button type="button" class="saude-btn saude-btn--primary" data-saude-action="close-diet-modal">Fechar</button></div></section></div>`;
}

function renderDietas(container, state) {
  const rows = state.diets || [];
  const profiles = state.profiles || [];
  const hasProfiles = profiles.length > 0;
  const selectedProfileId = state.dietSelectedProfileId || (hasProfiles ? profiles[0].id : null);
  const visibleRows = hasProfiles
    ? rows.filter((diet) => Number(diet.perfil_id) === Number(selectedProfileId))
    : [];

  let content = '';
  if (!hasProfiles) {
    content = `
      <div class="saude-empty">
        <i class="fas fa-user-plus" aria-hidden="true"></i>
        <p><strong>Nenhum perfil cadastrado.</strong></p>
        <p>É necessário criar um perfil antes de cadastrar dietas.</p>
        <button type="button" class="saude-btn saude-btn--primary" data-saude-action="open-profiles"><i class="fas fa-plus"></i> Criar primeiro perfil</button>
      </div>
    `;
  } else {
    const profileTabs = `
      <div class="saude-diet-profiles" role="tablist" aria-label="Perfis da família">
        ${profiles.map((p) => {
          const active = Number(p.id) === Number(selectedProfileId);
          const count = rows.filter((d) => Number(d.perfil_id) === Number(p.id)).length;
          return `
            <button type="button" class="saude-diet-profile-tab${active ? ' is-active' : ''}" role="tab" aria-selected="${active}" data-saude-action="select-diet-profile" data-profile-id="${escapeHtml(p.id)}">
              <span class="saude-diet-profile-tab__avatar"><i class="fas fa-user"></i></span>
              <span class="saude-diet-profile-tab__name">${escapeHtml(p.nome)}</span>
              <span class="saude-diet-profile-tab__badge">${count}</span>
            </button>
          `;
        }).join('')}
      </div>
    `;

    const dietList = visibleRows.length ? `<div class="saude-diet-grid">${visibleRows.map((diet) => `
      <button type="button" class="saude-diet-card" data-saude-action="view-diet" data-saude-id="${escapeHtml(diet.id)}" aria-label="Abrir ${escapeHtml(diet.titulo)}">
        <div>
          <h3>${escapeHtml(diet.titulo)}</h3>
          <div class="saude-diet-meta"><span>${countDietItems(diet.refeicoes)} itens</span></div>
        </div>
        <span class="saude-diet-card__arrow"><i class="fas fa-chevron-right"></i></span>
      </button>`).join('')}</div>` : '<div class="saude-empty"><i class="fas fa-bowl-food"></i>Nenhuma dieta cadastrada para este perfil.</div>';

    content = `${profileTabs}${dietList}`;
  }

  renderShell(container, `<section class="saude-page" aria-labelledby="dietas-title">
    <div class="saude-page-toolbar">
      <div class="saude-page-header"><button type="button" class="saude-btn" data-saude-action="home" aria-label="Voltar"><i class="fas fa-arrow-left"></i></button><div><h2 id="dietas-title">Dietas</h2><p>Planos alimentares organizados por perfil e refeição.</p></div></div>
      <button type="button" class="saude-btn saude-btn--primary saude-btn--insert" data-saude-action="add-diet"${hasProfiles ? '' : ' disabled title="Crie um perfil primeiro"'}><i class="fas fa-plus"></i><span>Adicionar dieta</span></button>
    </div>
    ${state.notice ? `<div class="saude-notice${state.notice.type === 'error' ? ' saude-notice--error' : ''}" role="status">${escapeHtml(state.notice.text)}</div>` : ''}
    ${renderDietForm(state)}
    ${content}${renderDietOverlay(state)}
  </section>`);
}

async function requestDiets(method, payload) {
  const response = await fetch('/api/saude?resource=dietas', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}

async function loadDietas(container, state) {
  renderLoading(container, 'Carregando dietas e perfis...');
  try {
    const [dietsResponse, profilesResponse] = await Promise.all([
      fetch('/api/saude?resource=dietas', { cache: 'no-store' }),
      fetch('/api/saude?resource=perfis', { cache: 'no-store' }),
    ]);
    const dietsData = await dietsResponse.json().catch(() => ({}));
    const profilesData = await profilesResponse.json().catch(() => ({}));
    if (!dietsResponse.ok) throw new Error(dietsData.error || 'O endpoint de dietas não respondeu corretamente.');
    if (!profilesResponse.ok) throw new Error(profilesData.error || 'O endpoint de perfis não respondeu corretamente.');
    state.diets = Array.isArray(dietsData.rows) ? dietsData.rows : [];
    state.profiles = Array.isArray(profilesData.rows) ? profilesData.rows : [];
    if (state.profiles.length > 0) {
      if (!state.dietSelectedProfileId || !state.profiles.some((p) => Number(p.id) === Number(state.dietSelectedProfileId))) {
        state.dietSelectedProfileId = state.profiles[0].id;
      }
    } else {
      state.dietSelectedProfileId = null;
    }
    renderActiveSaudeView(container, state);
  } catch (error) {
    renderError(container, error instanceof Error ? error.message : 'Não foi possível carregar as dietas.');
  }
}

function blankProfileDraft() {
  return { nome: '', sexo: '', data_nascimento: '', data_medicao: todayIsoDate(), peso_kg: '', altura_cm: '' };
}

function profileAge(birthDate) {
  const birth = new Date(`${birthDate}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data indisponível';
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function dateInputFromTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return todayIsoDate();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function profileSexLabel(value) {
  return ({ feminino: 'Feminino', masculino: 'Masculino', outro: 'Outro', nao_informado: 'Prefere não informar' })[value] || value;
}

function renderProfileForm(state) {
  if (!state.profileEditorOpen) return '';
  const draft = state.profileDraft || blankProfileDraft();
  const numberField = (name, label, min, max, required = false) => `<div class="saude-field-group"><label for="profile-${name}">${label}</label><input id="profile-${name}" name="${name}" class="saude-field" type="number" inputmode="decimal" step="0.1" min="${min}" max="${max}"${required ? ' required' : ''} value="${escapeHtml(draft[name])}"></div>`;
  return `
    <div class="saude-modal-backdrop" data-profile-modal-backdrop role="presentation">
      <section class="saude-diet-modal" style="width:min(100%, 38rem);" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title">
        <div class="saude-diet-modal__header">
          <div>
            <h3 id="profile-editor-title">${state.profileEditingId ? 'Atualizar perfil' : 'Criar perfil'}</h3>
            <p>Informe os dados para acompanhamento de saúde.</p>
          </div>
          <button type="button" class="saude-icon-btn" data-saude-action="cancel-profile-editor" aria-label="Fechar"><i class="fas fa-xmark"></i></button>
        </div>
        <form data-saude-profile-form>
          <div class="saude-profile-form__grid">
            <div class="saude-field-group"><label for="profile-nome">Nome</label><input id="profile-nome" name="nome" class="saude-field" required maxlength="120" autocomplete="off" value="${escapeHtml(draft.nome)}" placeholder="Ex.: André"></div>
            <div class="saude-field-group"><label for="profile-sexo">Sexo</label><select id="profile-sexo" name="sexo" class="saude-field" required><option value="">Selecione</option>${[['feminino', 'Feminino'], ['masculino', 'Masculino'], ['outro', 'Outro'], ['nao_informado', 'Prefere não informar']].map(([value, label]) => `<option value="${value}"${draft.sexo === value ? ' selected' : ''}>${label}</option>`).join('')}</select></div>
            <div class="saude-field-group"><label for="profile-data-nascimento">Data de nascimento</label><input id="profile-data-nascimento" name="data_nascimento" class="saude-field" type="date" min="1900-01-01" max="${new Date().toISOString().slice(0, 10)}" required value="${escapeHtml(draft.data_nascimento)}"></div>
            <p class="saude-profile-form__section">Dados para o IMC</p>
            ${numberField('peso_kg', 'Peso (kg)', 1, 500, true)}
            ${numberField('altura_cm', 'Altura (cm)', 30, 260, true)}
          </div>
          <div class="saude-editor__actions">
            <button type="button" class="saude-btn" data-saude-action="cancel-profile-editor"${state.busy ? ' disabled' : ''}>Cancelar</button>
            <button type="submit" class="saude-btn saude-btn--primary"${state.busy ? ' disabled' : ''}>${state.busy ? '<i class="fas fa-spinner fa-spin"></i> Salvando' : '<i class="fas fa-check"></i> Salvar perfil'}</button>
          </div>
        </form>
      </section>
    </div>`;
}

function renderMeasurementForm(state) {
  if (!state.measurementEditorOpen) return '';
  const draft = state.measurementDraft || {};
  const numberField = (name, label, min, max, required = false) => `<div class="saude-field-group"><label for="measurement-${name}">${label}</label><input id="measurement-${name}" name="${name}" class="saude-field" type="number" inputmode="decimal" step="0.1" min="${min}" max="${max}"${required ? ' required' : ''} value="${escapeHtml(draft[name])}"></div>`;
  return `
    <div class="saude-modal-backdrop" data-measurement-modal-backdrop role="presentation">
      <section class="saude-diet-modal" style="width:min(100%, 38rem);" role="dialog" aria-modal="true" aria-labelledby="measurement-editor-title">
        <div class="saude-diet-modal__header">
          <div>
            <h3 id="measurement-editor-title">Editar medição salva</h3>
            <p>Corrija os valores registrados nesta data.</p>
          </div>
          <button type="button" class="saude-icon-btn" data-saude-action="cancel-measurement-editor" aria-label="Fechar"><i class="fas fa-xmark"></i></button>
        </div>
        <form data-saude-measurement-form>
          <div class="saude-profile-form__grid">
            <div class="saude-field-group"><label for="measurement-data">Data da medição</label><input id="measurement-data" name="data_medicao" class="saude-field" type="date" required value="${escapeHtml(draft.data_medicao)}"></div>
            ${numberField('peso_kg', 'Peso (kg)', 1, 500, true)}
            ${numberField('altura_cm', 'Altura (cm)', 30, 260, true)}
          </div>
          <div class="saude-editor__actions">
            <button type="button" class="saude-btn" data-saude-action="cancel-measurement-editor"${state.busy ? ' disabled' : ''}>Cancelar</button>
            <button type="submit" class="saude-btn saude-btn--primary"${state.busy ? ' disabled' : ''}>${state.busy ? '<i class="fas fa-spinner fa-spin"></i> Salvando' : '<i class="fas fa-check"></i> Salvar medição'}</button>
          </div>
        </form>
      </section>
    </div>`;
}

function renderWeightForm(state) {
  if (!state.weightEditorOpen) return '';
  const draft = state.weightDraft || {};
  return `
    <div class="saude-modal-backdrop" data-weight-modal-backdrop role="presentation">
      <section class="saude-diet-modal saude-diet-modal--item" role="dialog" aria-modal="true" aria-labelledby="weight-editor-title">
        <div class="saude-diet-modal__header">
          <div><h3 id="weight-editor-title">Ajustar peso</h3><p>O momento deste registro será salvo automaticamente.</p></div>
          <button type="button" class="saude-icon-btn" data-saude-action="cancel-weight-editor" aria-label="Fechar"><i class="fas fa-xmark"></i></button>
        </div>
        <form data-saude-weight-form>
          <div class="saude-field-group"><label for="weight-value">Novo peso (kg)</label><input id="weight-value" name="peso_kg" class="saude-field" type="number" inputmode="decimal" step="0.1" min="1" max="500" required value="${escapeHtml(draft.peso_kg)}"></div>
          <div class="saude-editor__actions"><button type="button" class="saude-btn" data-saude-action="cancel-weight-editor">Cancelar</button><button type="submit" class="saude-btn saude-btn--primary"${state.busy ? ' disabled' : ''}>${state.busy ? '<i class="fas fa-spinner fa-spin"></i> Salvando' : '<i class="fas fa-weight-scale"></i> Registrar peso'}</button></div>
        </form>
      </section>
    </div>`;
}

function renderWeightTrend(profile) {
  const historyLength = Array.isArray(profile.historico) ? profile.historico.length : 0;
  const mobileChart = isSaudeMobileViewport();
  const chartWidth = calcularLarguraGraficoPeso(historyLength, { mobile: mobileChart });
  const chartPadding = mobileChart ? 22 : 28;
  const trend = criarTendenciaPeso(profile.historico, chartWidth, 180, chartPadding);
  if (!trend.pontos.length) return '';
  const first = trend.pontos[0];
  const last = trend.pontos.at(-1);
  const variationLabel = trend.variacao === 0 ? 'Peso estável' : `${trend.variacao > 0 ? '+' : ''}${formatarNumeroSaude(trend.variacao)} kg no período`;
  const areaPoints = `${first.x.toFixed(1)},152 ${trend.polyline} ${last.x.toFixed(1)},152`;
  const showAllDateLabels = !mobileChart || trend.pontos.length <= 4;
  const showAllWeightLabels = !mobileChart || trend.pontos.length <= 5;
  const chartPointsMarkup = trend.pontos.map((point, index) => {
    const isEdge = index === 0 || index === trend.pontos.length - 1;
    const weightLabel = showAllWeightLabels || isEdge ? `${formatarNumeroSaude(point.peso_kg)} kg` : '';
    const dateLabel = showAllDateLabels || isEdge ? formatChartAxisDate(point.registrado_em) : '';
    return `<g><circle class="saude-weight-trend__point" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="5"><title>${formatarNumeroSaude(point.peso_kg)} kg em ${escapeHtml(formatDateTime(point.registrado_em))}</title></circle>${weightLabel ? `<text class="saude-weight-trend__label" x="${point.x.toFixed(1)}" y="${Math.max(14, point.y - 12).toFixed(1)}">${weightLabel}</text>` : ''}${dateLabel ? `<text class="saude-weight-trend__date" x="${point.x.toFixed(1)}" y="174">${escapeHtml(dateLabel)}</text>` : ''}</g>`;
  }).join('');
  const scrollHint = mobileChart
    ? 'Deslize horizontalmente para ver todas as medições'
    : 'Use a rolagem horizontal para consultar todas as medições';
  return `<details class="saude-weight-trend saude-weight-trend--panel">
    <summary aria-controls="weight-trend-chart"><div class="saude-weight-trend__header"><div><h3 id="weight-trend-title">Tendência de peso</h3><p>${trend.pontos.length} ${trend.pontos.length === 1 ? 'medição registrada' : 'medições registradas'} · toque para visualizar</p></div><span class="saude-weight-trend__change">${escapeHtml(variationLabel)}</span><i class="fas fa-chevron-down saude-weight-trend__toggle" aria-hidden="true"></i></div></summary>
    <div class="saude-weight-trend__viewport" id="weight-trend-chart" tabindex="0" aria-label="${escapeHtml(scrollHint)}">
    <svg class="saude-weight-trend__chart${mobileChart ? ' saude-weight-trend__chart--mobile' : ''}" style="min-width:${chartWidth}px" viewBox="0 0 ${chartWidth} 180" role="img" aria-labelledby="weight-trend-title">
      <defs><linearGradient id="saude-weight-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#95c11f" stop-opacity=".28"/><stop offset="1" stop-color="#95c11f" stop-opacity="0"/></linearGradient></defs>
      <line class="saude-weight-trend__grid" x1="${chartPadding}" y1="28" x2="${chartWidth - chartPadding}" y2="28"/><line class="saude-weight-trend__grid" x1="${chartPadding}" y1="90" x2="${chartWidth - chartPadding}" y2="90"/><line class="saude-weight-trend__grid" x1="${chartPadding}" y1="152" x2="${chartWidth - chartPadding}" y2="152"/>
      ${trend.pontos.length > 1 ? `<polygon class="saude-weight-trend__area" points="${areaPoints}"/><polyline class="saude-weight-trend__line" points="${trend.polyline}"/>` : ''}
      ${chartPointsMarkup}
    </svg></div>
  </details>`;
}

function renderProfileTimeline(profile, state) {
  const history = Array.isArray(profile.historico) ? profile.historico : [];
  if (!history.length) return '';
  const countLabel = `${history.length} ${history.length === 1 ? 'registro' : 'registros'}`;
  return `<details class="saude-profile-timeline"><summary>Linha do tempo · Peso e IMC · ${countLabel}</summary><div class="saude-timeline-list">${history.map((entry) => `<div class="saude-timeline-item"><time class="saude-timeline-date" datetime="${escapeHtml(entry.registrado_em)}">${escapeHtml(formatDateTime(entry.registrado_em))}</time><div class="saude-timeline-values"><span>${formatarNumeroSaude(entry.peso_kg)} kg</span><span>${formatarNumeroSaude(entry.altura_cm)} cm</span><span>IMC ${formatarNumeroSaude(entry.imc, 2)}</span></div><div><button type="button" class="saude-icon-btn" data-saude-action="edit-measurement" data-saude-profile-id="${escapeHtml(profile.id)}" data-saude-measurement-id="${escapeHtml(entry.id)}" aria-label="Editar medição de ${escapeHtml(formatDateTime(entry.registrado_em))}" title="Editar medição"${state.busy ? ' disabled' : ''}><i class="fas fa-pencil"></i></button><button type="button" class="saude-icon-btn saude-icon-btn--danger" data-saude-action="delete-measurement" data-saude-profile-id="${escapeHtml(profile.id)}" data-saude-measurement-id="${escapeHtml(entry.id)}" aria-label="Excluir medição de ${escapeHtml(formatDateTime(entry.registrado_em))}" title="Excluir medição"${state.busy ? ' disabled' : ''}><i class="fas fa-trash"></i></button></div></div>`).join('')}</div></details>`;
}

/** Linha do tempo de água: só dias já fechados (history da API), sem o log do dia corrente. */
function waterTimelineSavedRows(history) {
  if (!Array.isArray(history) || !history.length) return [];
  return [...history]
    .map((row) => ({ ...row }))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));
}

function cacheWaterHistoryForProfile(state, profileId, data) {
  if (!profileId) return;
  state.waterHistoryByProfile = state.waterHistoryByProfile || {};
  const config = Object.hasOwn(data, 'config') ? data.config : null;
  const history = Array.isArray(data.history) ? data.history : [];
  state.waterHistoryByProfile[String(profileId)] = {
    config,
    rows: waterTimelineSavedRows(history),
  };
}

async function fetchWaterSnapshotForProfile(profile) {
  const profileKey = String(profile.id);
  if (isLocalWaterStorageMode()) {
    return loadLocalWater(undefined, undefined, profileKey, { strict: true, healthProfile: profile });
  }
  return requestWater('GET', { profile_id: profileKey, preserve_profiles: true });
}

async function hydrateWaterHistoriesForProfiles(state) {
  if (!state.profiles.length) {
    state.waterHistoryByProfile = {};
    return;
  }
  state.waterHistoryByProfile = state.waterHistoryByProfile || {};
  const snapshots = await Promise.all(state.profiles.map(async (profile) => {
    try {
      const data = await fetchWaterSnapshotForProfile(profile);
      return [String(profile.id), data];
    } catch {
      return [String(profile.id), null];
    }
  }));
  snapshots.forEach(([profileId, data]) => {
    if (data) cacheWaterHistoryForProfile(state, profileId, data);
    else state.waterHistoryByProfile[profileId] = { config: null, rows: [] };
  });
}

function getWaterTimelineRows(profile, state) {
  const profileKey = String(profile.id);
  const onDetail = state.view === 'profile-detail' && Number(state.selectedProfileId) === Number(profile.id);
  if (onDetail) return waterTimelineSavedRows(state.waterHistory);
  return state.waterHistoryByProfile?.[profileKey]?.rows || [];
}

function renderWaterTimeline(profile, state) {
  const rows = getWaterTimelineRows(profile, state);
  if (!rows.length) return '';
  const countLabel = `${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}`;
  return `<details class="saude-profile-timeline saude-profile-timeline--water"><summary>Linha do tempo · Água · ${countLabel}</summary><div class="saude-timeline-list">${rows.map((row) => {
    const complete = Number(row.realizado_doses) >= Number(row.meta_doses);
    return `<div class="saude-timeline-item saude-timeline-item--water"><time class="saude-timeline-date" datetime="${escapeHtml(row.data)}">${escapeHtml(formatWaterDate(row.data))}</time><div class="saude-timeline-values"><span>Meta ${row.meta_doses} doses</span><span>Realizado ${row.realizado_doses} doses</span>${complete ? '<span>Meta OK</span>' : ''}</div></div>`;
  }).join('')}</div></details>`;
}

function renderProfiles(container, state) {
  const content = state.profiles.length ? `<div class="saude-profile-list">${state.profiles.map((profile) => {
    const age = profileAge(profile.data_nascimento);
    const imc = profile.imc ?? calcularImc(profile.peso_kg, profile.altura_cm);
    const classification = age !== null && age < 20 ? 'Referência varia por idade' : classificarImc(imc);
    return `<article class="saude-profile-card">
      <div class="saude-profile-card__header">
        <button type="button" class="saude-profile-card__identity-btn" data-saude-action="open-profile-detail" data-saude-id="${escapeHtml(profile.id)}" aria-label="Abrir painel de ${escapeHtml(profile.nome)}">
          <span class="saude-profile-avatar"><i class="fas fa-user"></i></span>
          <div class="saude-profile-card__identity-copy">
            <h3>${escapeHtml(profile.nome)}</h3>
            <p class="saude-profile-card__subtitle">${escapeHtml(profileSexLabel(profile.sexo))}${age === null ? '' : ` · ${age} ${age === 1 ? 'ano' : 'anos'}`}</p>
          </div>
        </button>
        <div class="saude-profile-card__actions">
          <button type="button" class="saude-btn" data-saude-action="edit-profile" data-saude-id="${escapeHtml(profile.id)}"><i class="fas fa-pencil"></i> Editar</button>
          <button type="button" class="saude-btn saude-btn--primary" data-saude-action="open-profile-detail" data-saude-id="${escapeHtml(profile.id)}"><span>Abrir</span> <i class="fas fa-arrow-right"></i></button>
        </div>
      </div>
      <div class="saude-profile-summary">
        <div class="saude-profile-stat"><span>Peso</span><strong>${formatarNumeroSaude(profile.peso_kg)} kg</strong></div>
        <div class="saude-profile-stat"><span>Altura</span><strong>${formatarNumeroSaude(profile.altura_cm)} cm</strong></div>
        <div class="saude-profile-stat"><span>IMC</span><strong>${formatarNumeroSaude(imc, 2)}</strong></div>
        <div class="saude-profile-stat"><span>Referência</span><strong>${escapeHtml(classification)}</strong></div>
      </div>
      ${renderProfileTimeline(profile, state)}
      ${renderWaterTimeline(profile, state)}
    </article>`;
  }).join('')}</div>` : '<div class="saude-empty"><i class="fas fa-user-group"></i><p>Nenhum perfil cadastrado.</p><button type="button" class="saude-btn saude-btn--primary" data-saude-action="add-profile"><i class="fas fa-plus"></i> Criar primeiro perfil</button></div>';

  renderShell(container, `<section class="saude-page" aria-labelledby="profiles-title">
    <div class="saude-page-toolbar">
      <div class="saude-page-header">
        <div><h2 id="profiles-title">Minha Saúde</h2><p>Selecione um perfil para acessar hábitos e dados de saúde.</p></div>
      </div>
      <button type="button" class="saude-btn saude-btn--primary saude-btn--insert" data-saude-action="add-profile"><i class="fas fa-plus"></i><span>Novo perfil</span></button>
    </div>
    ${state.notice ? `<div class="saude-notice${state.notice.type === 'error' ? ' saude-notice--error' : ''}" role="status">${escapeHtml(state.notice.text)}</div>` : ''}
    ${renderProfileForm(state)}
    ${renderMeasurementForm(state)}
    ${content}
  </section>`);
}

function renderProfileDetail(container, state) {
  const profile = state.profiles.find((p) => Number(p.id) === Number(state.selectedProfileId)) || state.profiles[0];
  if (!profile) {
    state.view = 'profiles';
    renderProfiles(container, state);
    return;
  }
  const age = profileAge(profile.data_nascimento);
  const imc = profile.imc ?? calcularImc(profile.peso_kg, profile.altura_cm);
  const classification = age !== null && age < 20 ? 'Referência varia por idade' : classificarImc(imc);

  const waterToday = state.waterToday;
  const waterConfig = state.waterConfig;
  const waterDone = waterToday?.realizado_doses ?? 0;
  const waterMeta = waterToday?.meta_doses ?? waterConfig?.meta_doses ?? 8;
  const waterPercent = Math.min(100, Math.round((waterDone / Math.max(1, waterMeta)) * 100));
  const waterComplete = waterToday && waterDone >= waterMeta;

  const waterCard = `
    <article class="saude-water-card${waterComplete ? ' is-complete' : ''}">
      <button type="button" class="saude-water-card__open" data-saude-action="open-water-tracker" data-water-profile-id="${escapeHtml(profile.id)}" aria-label="Abrir consumo de água de ${escapeHtml(profile.nome)}">
        <span class="saude-water-card__icon"><i class="fas fa-droplet"></i></span>
        <div>
          <h3>Consumo de água</h3>
          <p data-water-card-status>${waterToday ? `${waterDone} de ${waterMeta} doses hoje` : (waterConfig ? `Meta: ${waterMeta} doses diárias` : 'Definir meta de doses diárias')}</p>
          <div class="saude-water-progress"><span data-water-progress-fill style="width: ${waterPercent}%"></span></div>
        </div>
      </button>
      <div class="saude-water-card__actions">${waterConfig ? `<button type="button" class="saude-icon-btn" data-saude-action="edit-water-goal" data-water-profile-id="${escapeHtml(profile.id)}" aria-label="Editar meta de água" title="Editar meta"><i class="fas fa-pencil"></i></button><button type="button" class="saude-icon-btn saude-icon-btn--danger" data-saude-action="delete-water-goal" data-water-profile-id="${escapeHtml(profile.id)}" aria-label="Excluir acompanhamento de água" title="Excluir"><i class="fas fa-trash"></i></button>` : `<button type="button" class="saude-icon-btn" data-saude-action="create-water-goal" data-water-profile-id="${escapeHtml(profile.id)}" aria-label="Criar meta de água" title="Criar meta"><i class="fas fa-plus"></i></button>`}</div>
    </article>
  `;

  renderShell(container, `<section class="saude-page saude-profile-detail" aria-labelledby="profile-detail-title">
    <div class="saude-page-toolbar saude-page-toolbar--stack">
      <div class="saude-page-header saude-page-header--profile">
        <button type="button" class="saude-btn" data-saude-action="open-profiles" aria-label="Voltar aos perfis"><i class="fas fa-arrow-left"></i> <span class="saude-btn__label">Perfis</span></button>
        <div class="saude-page-header__copy">
          <h2 id="profile-detail-title">${escapeHtml(profile.nome)}</h2>
          <p class="saude-profile-detail-subtitle">${escapeHtml(profileSexLabel(profile.sexo))}${age === null ? '' : ` · ${age} ${age === 1 ? 'ano' : 'anos'}`}${profile.data_medicao ? ` · Medição: ${escapeHtml(formatDateTime(profile.data_medicao))}` : ''}</p>
        </div>
      </div>
      <div class="saude-profile-detail-actions">
        <button type="button" class="saude-btn saude-btn--primary" data-saude-action="adjust-weight" data-saude-id="${escapeHtml(profile.id)}"><i class="fas fa-weight-scale"></i> <span>Ajustar peso</span></button>
        <button type="button" class="saude-btn" data-saude-action="edit-profile" data-saude-id="${escapeHtml(profile.id)}"><i class="fas fa-pencil"></i> <span>Editar perfil</span></button>
      </div>
    </div>
    ${renderWeightTrend(profile)}
    ${state.notice ? `<div class="saude-notice${state.notice.type === 'error' ? ' saude-notice--error' : ''}" role="status">${escapeHtml(state.notice.text)}</div>` : ''}
    ${renderProfileForm(state)}
    ${renderMeasurementForm(state)}
    ${renderWeightForm(state)}

    <div class="saude-profile-summary saude-profile-summary--detail">
      <div class="saude-profile-stat"><span>Peso</span><strong>${formatarNumeroSaude(profile.peso_kg)} kg</strong></div>
      <div class="saude-profile-stat"><span>Altura</span><strong>${formatarNumeroSaude(profile.altura_cm)} cm</strong></div>
      <div class="saude-profile-stat"><span>IMC</span><strong>${formatarNumeroSaude(imc, 2)}</strong></div>
      <div class="saude-profile-stat"><span>Referência</span><strong>${escapeHtml(classification)}</strong></div>
    </div>
    ${renderProfileTimeline(profile, state)}
    ${renderWaterTimeline(profile, state)}

    <h3 class="saude-section-title"><i class="fas fa-heart-pulse"></i> Hábitos & Cuidados</h3>
    <div class="saude-profile-modules">
      ${waterCard}
      ${renderProfileDietSection(profile, state)}
    </div>

    ${renderWaterModal(state)}
    ${renderDietForm(state)}
    ${renderDietOverlay(state)}
  </section>`, { compactHero: true });
  requestAnimationFrame(() => paintWaterTrackerUi(container, state));
}

async function requestProfiles(method, payload) {
  const response = await fetch('/api/saude?resource=perfis', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível salvar o perfil.');
  return data;
}

async function requestProfileMeasurement(payload) {
  const response = await fetch('/api/saude?resource=perfil-medidas', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar a medição.');
  return data;
}

async function createWeightMeasurement(payload) {
  const response = await fetch('/api/saude?resource=perfil-medidas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível registrar o peso.');
  return data;
}

async function deleteProfileMeasurement(id) {
  const response = await fetch('/api/saude?resource=perfil-medidas', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível excluir a medição.');
  return data;
}

async function loadProfiles(container, state) {
  renderLoading(container, 'Carregando perfis...');
  try {
    const response = await fetch('/api/saude?resource=perfis', { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'O endpoint de perfis não respondeu corretamente.');
    state.profiles = Array.isArray(data.rows) ? data.rows : [];
    if (isLocalWaterStorageMode() && state.profiles.length) {
      migrateLocalWaterDataToHealthProfiles(state.profiles);
    }
    await hydrateWaterHistoriesForProfiles(state);
    renderProfiles(container, state);
  } catch (error) {
    renderError(container, error instanceof Error ? error.message : 'Não foi possível carregar os perfis.');
  }
}

function formatWaterDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return String(value || '');
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(`${value}T12:00:00-03:00`));
}

function renderWaterModal(state) {
  if (state.waterModal === 'config') {
    return `<div class="saude-modal-backdrop" data-water-modal-backdrop role="presentation">
      <section class="saude-water-modal" role="dialog" aria-modal="true" aria-labelledby="water-config-title">
        <div class="saude-water-modal__header"><div><h3 id="water-config-title">${state.waterConfig ? 'Editar meta' : 'Criar meta de água'}</h3><p>Dê um nome ao item e informe quantas doses pretende tomar por dia.</p></div><button type="button" class="saude-icon-btn" data-saude-action="close-water-modal" aria-label="Fechar"><i class="fas fa-xmark"></i></button></div>
        <form data-water-goal-form>
          <div class="saude-editor__grid">
            <div class="saude-field-group"><label for="water-name">Nome da meta</label><input class="saude-field" id="water-name" name="nome" maxlength="80" required placeholder="Ex.: Garrafa 500 ml" value="${escapeHtml(state.waterDraft.nome)}"></div>
            <div class="saude-field-group"><label for="water-goal">Doses por dia</label><input class="saude-field" id="water-goal" name="meta_doses" type="number" min="1" max="100" step="1" required value="${escapeHtml(state.waterDraft.meta_doses)}"></div>
          </div>
          <div class="saude-editor__actions"><button type="button" class="saude-btn" data-saude-action="close-water-modal">Cancelar</button><button type="submit" class="saude-btn saude-btn--primary"${state.busy ? ' disabled' : ''}><i class="fas fa-check"></i> Salvar meta</button></div>
        </form>
      </section>
    </div>`;
  }
  if (state.waterModal !== 'tracker' || !state.waterConfig || !state.waterToday) return '';
  const checks = Array.from({ length: state.waterToday.meta_doses }, (_, index) => {
    const dose = index + 1;
    const checked = dose <= state.waterToday.realizado_doses;
    return `<button type="button" class="saude-water-check" data-saude-action="toggle-water-dose" data-water-dose="${dose}" aria-pressed="${checked}" aria-label="Dose ${dose}: ${checked ? 'tomada' : 'pendente'}"><i class="fas fa-check"></i></button>`;
  }).join('');
  const complete = state.waterToday.realizado_doses === state.waterToday.meta_doses;
  const trackerTitle = escapeHtml(waterTrackerDisplayName(state));
  const history = state.waterHistory.length
    ? `<div class="saude-table-wrap">${state.waterHistory.map((row) => `<div class="saude-water-log"><time datetime="${escapeHtml(row.data)}">${escapeHtml(formatWaterDate(row.data))}</time><span>Meta: <strong>${row.meta_doses}</strong></span><span>Realizado: <strong>${row.realizado_doses}</strong></span></div>`).join('')}</div>`
    : '<div class="saude-empty"><i class="fas fa-clock-rotate-left"></i><p>O primeiro registro aparecerá aqui após a virada do dia.</p></div>';
  return `<div class="saude-modal-backdrop" data-water-modal-backdrop role="presentation">
    <section class="saude-water-modal${complete ? ' is-complete' : ''}" role="dialog" aria-modal="true" aria-labelledby="water-tracker-title">
      <div class="saude-water-modal__header"><div><h3 id="water-tracker-title">${trackerTitle}</h3><p>${escapeHtml(state.waterConfig.nome)} · meta diária</p><p data-water-modal-status>${complete ? 'Meta do dia concluída! 💧' : `${state.waterToday.realizado_doses} de ${state.waterToday.meta_doses} doses marcadas hoje`}</p></div><button type="button" class="saude-icon-btn" data-saude-action="close-water-modal" aria-label="Fechar"><i class="fas fa-xmark"></i></button></div>
      <div class="saude-water-checks">${checks}</div>
      ${renderWaterDropHtml(state.waterToday)}
      <section class="saude-water-history" aria-labelledby="water-history-title"><h3 id="water-history-title">Histórico diário</h3>${history}</section>
    </section>
  </div>`;
}

function unlockWaterDoseButtons(container) {
  container?.querySelectorAll('[data-saude-action="toggle-water-dose"]').forEach((button) => {
    button.disabled = false;
    button.removeAttribute('disabled');
  });
}

function remountWaterTrackerModal(container, state) {
  if (state.waterModal !== 'tracker' || !state.waterConfig || !state.waterToday) return;
  const html = renderWaterModal(state);
  if (!html) return;
  const existing = container.querySelector('[data-water-modal-backdrop]');
  if (existing) existing.outerHTML = html;
}

function syncWaterTrackerDom(container, state, { skipWaterDrop = false } = {}) {
  if (!state.waterToday) return;
  const completed = state.waterToday.realizado_doses === state.waterToday.meta_doses;
  container.querySelectorAll('[data-saude-action="toggle-water-dose"]').forEach((button) => {
    const dose = Number(button.dataset.waterDose);
    const checked = dose <= state.waterToday.realizado_doses;
    button.setAttribute('aria-pressed', String(checked));
    button.setAttribute('aria-label', `Dose ${dose}: ${checked ? 'tomada' : 'pendente'}`);
  });
  const modalStatus = container.querySelector('[data-water-modal-status]');
  if (modalStatus) modalStatus.textContent = completed
    ? 'Meta do dia concluída! 💧'
    : `${state.waterToday.realizado_doses} de ${state.waterToday.meta_doses} doses marcadas hoje`;
  const cardStatus = container.querySelector('[data-water-card-status]');
  if (cardStatus) cardStatus.textContent = `${state.waterToday.realizado_doses} de ${state.waterToday.meta_doses} doses hoje`;
  const progress = container.querySelector('[data-water-progress-fill]');
  if (progress) progress.style.width = `${Math.round((state.waterToday.realizado_doses / state.waterToday.meta_doses) * 100)}%`;
  container.querySelector('.saude-water-modal')?.classList.toggle('is-complete', completed);
  container.querySelector('.saude-water-card')?.classList.toggle('is-complete', completed);
  if (!skipWaterDrop) {
    refreshWaterVictoryPresentation(container, container, state.waterToday, state.waterProfileId);
  }
}

function paintWaterTrackerUi(container, state, { animateFillFrom = null } = {}) {
  if (state.waterModal !== 'tracker' || !state.waterToday) return;
  refreshWaterVictoryPresentation(container, container, state.waterToday, state.waterProfileId, { animateFillFrom })
    .then(() => {
      if (Number(state.waterToday.realizado_doses) < Number(state.waterToday.meta_doses)) {
        ensureWaterDropMotion(container);
      }
    });
}

function animateWaterDose(container, button, completed) {
  if (!button || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
  const motion = globalThis.motion || globalThis.Motion;
  button.classList.remove('is-splash');
  void button.offsetWidth;
  button.classList.add('is-splash');
  setTimeout(() => button.classList.remove('is-splash'), 700);
  if (typeof motion?.animate !== 'function') return;

  try {
    motion.animate(button, { scale: [1, .9, 1.12, 1], y: [0, 2, -2, 0] }, { duration: .42, easing: 'cubic-bezier(.2,.8,.2,1)' });
    const icon = button.querySelector('i');
    if (icon) motion.animate(icon, { rotate: [-18, 8, 0], scale: [.45, 1.2, 1] }, { duration: .38, easing: 'ease-out' });

    const vectors = [[-26, -22], [25, -28], [-22, 22], [28, 18]];
    vectors.forEach(([x, y], index) => {
      const drop = document.createElement('span');
      drop.className = 'saude-water-motion-drop';
      button.appendChild(drop);
      const animation = motion.animate(drop, {
        opacity: [.95, .8, 0], x: [0, x], y: [0, y], scale: [.35, 1, .65], rotate: [0, index % 2 ? 22 : -22],
      }, { duration: .55, easing: 'ease-out' });
      Promise.resolve(animation?.finished).catch(() => {}).finally(() => drop.remove());
    });

    const waterIcon = container.querySelector('.saude-water-card__icon');
    if (waterIcon) motion.animate(waterIcon, { y: [0, -6, 0], scale: [1, 1.08, 1] }, { duration: .45, easing: 'ease-out' });
    const dropVisual = container.querySelector('.saude-water-drop__visual');
    if (dropVisual) motion.animate(dropVisual, { scale: [1, 1.06, 1], y: [0, -3, 0] }, { duration: .48, easing: 'ease-out' });
    if (completed) {
      const modal = container.querySelector('.saude-water-modal');
      if (modal) motion.animate(modal, { scale: [1, 1.015, 1] }, { duration: .5, easing: 'ease-out' });
    }
  } catch (_error) {
    // O CSS mantem um feedback simples se Motion nao estiver disponivel.
  }
}

function showWaterCelebration(container, state) {
  if (state.waterCelebrationTimer) clearTimeout(state.waterCelebrationTimer);
  removeWaterCelebration(container);
  refreshWaterVictoryPresentation(container, container, state.waterToday, state.waterProfileId);
}

async function requestWater(method, payload) {
  if (isLocalWaterStorageMode()) {
    if (method === 'GET') return loadLocalWater(undefined, undefined, payload?.profile_id);
    if (method === 'DELETE' && payload?.action === 'delete-goal') return deleteLocalWaterGoal(payload);
    if (method === 'POST') return saveLocalWaterGoal(payload);
    if (method === 'PATCH') return updateLocalWaterProgress(payload);
    throw new Error('Operação local de consumo de água não suportada.');
  }
  const params = new URLSearchParams({ resource: 'consumo-agua' });
  if (method === 'GET' && payload?.profile_id) params.set('profile_id', payload.profile_id);
  if (method === 'GET' && payload?.preserve_profiles) params.set('include_profiles', '0');
  const response = await fetch(`/api/saude?${params}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(payload && method !== 'GET' && method !== 'HEAD' ? { body: JSON.stringify(payload) } : {}),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar o consumo de água.');
  return data;
}

function applyWaterData(state, data) {
  if (!data || typeof data !== 'object') return;
  if (Array.isArray(data.profiles)) state.waterProfiles = data.profiles;
  if ('profile_id' in data) state.waterProfileId = data.profile_id || null;
  if ('config' in data) state.waterConfig = data.config || null;
  if ('today' in data) {
    state.waterToday = data.today
      ? { ...(state.waterToday || {}), ...data.today }
      : null;
  }
  if (Array.isArray(data.history)) state.waterHistory = data.history;
  if (data.today?.data) state.waterDate = data.today.data;
  const profileId = data.profile_id ?? state.waterProfileId;
  if (profileId && ('config' in data || 'today' in data || Array.isArray(data.history))) {
    cacheWaterHistoryForProfile(state, profileId, {
      config: state.waterConfig,
      history: state.waterHistory,
    });
  }
}

function renderError(container, message) {
  renderShell(container, `
    <section class="saude-page saude-error" role="alert">
      <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
      <p>${escapeHtml(message)}</p>
      <button type="button" class="saude-btn" data-saude-action="retry">Tentar novamente</button>
    </section>
  `);
}

async function requestNutrition(method, payload) {
  const response = await fetch('/api/saude?resource=tabelas-nutricionais', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}

function focusEditor(container) {
  requestAnimationFrame(() => container.querySelector('#saude-item')?.focus());
}

async function loadTabelaNutricional(container, state) {
  if (state.rows.length) {
    renderTabelaNutricional(container, state);
    return;
  }

  renderLoading(container, 'Carregando tabela nutricional...');
  try {
    const response = await fetch('/api/saude?resource=tabelas-nutricionais', { cache: 'no-store' });
    if (!response.ok) throw new Error('O endpoint da tabela nutricional não respondeu corretamente.');
    const data = await response.json();
    state.rows = Array.isArray(data.rows) ? data.rows : [];
    renderTabelaNutricional(container, state);
  } catch (error) {
    renderError(container, error instanceof Error ? error.message : 'Não foi possível carregar a tabela nutricional.');
  }
}

export async function renderSaudeContent(container) {
  if (!container) return;
  if (typeof container._cleanup === 'function') container._cleanup();

  const state = {
    view: 'home',
    rows: [],
    page: 1,
    filters: { busca: '', categoria: '' },
    editorOpen: false,
    editingId: null,
    draft: { item: '', categoria: '', porcao: '' },
    busy: false,
    notice: null,
    diets: [],
    dietEditorOpen: false,
    dietEditingId: null,
    dietDraft: blankDietDraft(),
    dietModal: null,
    dietSelectedId: null,
    dietSelectedProfileId: null,
    dietItemMealType: null,
    dietItemEditingIndex: null,
    dietItemDraft: { nome: '', quantidade: '', observacao: '' },
    profiles: [],
    profileEditorOpen: false,
    profileEditingId: null,
    profileDraft: blankProfileDraft(),
    measurementEditorOpen: false,
    measurementEditingId: null,
    measurementProfileId: null,
    measurementDraft: null,
    weightEditorOpen: false,
    weightProfileId: null,
    weightDraft: null,
    waterConfig: null,
    waterProfiles: [],
    waterProfileId: null,
    waterProfileDraft: { nome: '' },
    waterProfileEditingId: null,
    waterToday: null,
    waterHistory: [],
    waterHistoryByProfile: {},
    waterDate: todayIsoDate(),
    waterModal: null,
    waterDraft: { nome: '', meta_doses: 8 },
    waterCelebrationTimer: null,
    waterDoseSyncing: false,
  };

  const onClick = async (event) => {
    if (event.target.matches('[data-diet-modal-backdrop]') && state.dietModal) {
      state.dietModal = null;
      state.dietItemMealType = null;
      state.dietItemEditingIndex = null;
      renderActiveSaudeView(container, state);
      return;
    }
    if (event.target.matches('[data-diet-form-backdrop]') && state.dietEditorOpen) {
      state.dietEditorOpen = false;
      state.dietEditingId = null;
      renderActiveSaudeView(container, state);
      return;
    }
    if (event.target.matches('[data-water-modal-backdrop]') && state.waterModal) {
      state.waterModal = null;
      renderActiveSaudeView(container, state);
      return;
    }
    const actionElement = event.target.closest('[data-saude-action]');
    const action = actionElement?.dataset.saudeAction;
    if (action === 'home') {
      state.view = 'home';
      state.waterModal = null;
      state.dietModal = null;
      state.notice = null;
      renderHome(container);
      return;
    }
    if (action === 'retry' && state.view === 'home') {
      await renderSaudeContent(container);
      return;
    }
    if (action === 'open-tabela-nutricional' || (action === 'retry' && state.view === 'tabela-nutricional')) {
      state.view = 'tabela-nutricional';
      await loadTabelaNutricional(container, state);
      return;
    }
    if (action === 'open-dietas' || (action === 'retry' && state.view === 'dietas')) {
      state.view = 'profiles';
      state.dietModal = null;
      state.dietEditorOpen = false;
      state.notice = null;
      await loadProfiles(container, state);
      return;
    }
    if (action === 'open-profiles' || (action === 'retry' && state.view === 'profiles')) {
      removeWaterCelebration(container);
      state.view = 'profiles';
      rememberSaudeCheckpoint({ view: 'profiles', selectedProfileId: null });
      await loadProfiles(container, state);
      return;
    }
    if (action === 'open-water' || (action === 'retry' && state.view === 'water')) {
      state.view = 'profiles';
      state.waterModal = null;
      state.notice = null;
      await loadProfiles(container, state);
      return;
    }
    if (action === 'create-water-goal' || action === 'edit-water-goal') {
      const profileKey = waterProfileKeyFromAction(actionElement, state);
      const previousWaterProfileId = state.waterProfileId;
      const healthProfile = healthProfileByWaterKey(state, profileKey) || currentHealthProfile(state);
      if (healthProfile) {
        state.waterProfileId = String(healthProfile.id);
        if (isLocalWaterStorageMode()) ensureLocalWaterProfileLinkedToHealth(healthProfile);
      } else if (profileKey) {
        state.waterProfileId = profileKey;
      }
      if (String(previousWaterProfileId) !== String(state.waterProfileId)) {
        removeWaterCelebration(container);
      }
      if (!state.waterProfileId) {
        state.notice = { type: 'error', text: 'Abra um perfil de saúde antes de configurar a água.' };
        renderActiveSaudeView(container, state);
        return;
      }
      state.waterModal = 'config';
      state.waterDraft = state.waterConfig
        ? { nome: state.waterConfig.nome, meta_doses: state.waterConfig.meta_doses }
        : { nome: '', meta_doses: 8 };
      state.notice = null;
      renderActiveSaudeView(container, state);
      requestAnimationFrame(() => container.querySelector('#water-name')?.focus());
      return;
    }
    if (action === 'delete-water-goal' && state.waterConfig && !state.busy) {
      const confirmed = await requestSaudeConfirmation(container, {
        title: 'Excluir acompanhamento de água?',
        message: `A meta "${state.waterConfig.nome}" e todo o histórico de consumo serão excluídos. O perfil de saúde será preservado.`,
      });
      if (!confirmed) return;
      state.busy = true;
      state.notice = null;
      try {
        applyWaterData(state, await requestWater('DELETE', { action: 'delete-goal', profile_id: state.waterProfileId }));
        state.waterModal = null;
        state.notice = { type: 'success', text: 'Acompanhamento de água excluído com sucesso.' };
      } catch (error) {
        state.notice = { type: 'error', text: error instanceof Error ? error.message : 'Não foi possível excluir o acompanhamento de água.' };
      } finally {
        state.busy = false;
        renderActiveSaudeView(container, state);
      }
      return;
    }
    if (action === 'open-profile-detail') {
      const profileId = Number(actionElement.dataset.saudeId);
      const healthProfile = state.profiles.find((p) => Number(p.id) === profileId);
      if (!healthProfile) return;
      removeWaterCelebration(container);
      state.selectedProfileId = profileId;
      state.view = 'profile-detail';
      state.profileEditorOpen = false;
      state.measurementEditorOpen = false;
      state.waterModal = null;
      state.notice = null;
      renderLoading(container, 'Carregando perfil...');
      try {
        await Promise.all([
          syncWaterWithHealthProfile(state, healthProfile),
          syncDietsForHealthProfile(state, healthProfile),
        ]);
        rememberSaudeCheckpoint({ view: 'profile-detail', selectedProfileId: profileId });
        renderProfileDetail(container, state);
      } catch (error) {
        renderError(container, error instanceof Error ? error.message : 'Não foi possível abrir o perfil.');
      }
      return;
    }
    if (action === 'open-water-tracker') {
      const profileKey = waterProfileKeyFromAction(actionElement, state);
      const previousWaterProfileId = state.waterProfileId;
      const healthProfile = healthProfileByWaterKey(state, profileKey) || currentHealthProfile(state);
      if (healthProfile) {
        state.waterProfileId = String(healthProfile.id);
        if (isLocalWaterStorageMode()) {
          ensureLocalWaterProfileLinkedToHealth(healthProfile);
          applyWaterData(state, loadLocalWater(undefined, undefined, state.waterProfileId, { strict: true, healthProfile }));
        }
      } else if (profileKey) {
        state.waterProfileId = profileKey;
      }
      if (String(previousWaterProfileId) !== String(state.waterProfileId)) {
        removeWaterCelebration(container);
      }
      state.waterModal = state.waterConfig && state.waterToday ? 'tracker' : 'config';
      renderActiveSaudeView(container, state);
      return;
    }
    if (action === 'close-water-modal') {
      state.waterModal = null;
      renderActiveSaudeView(container, state);
      return;
    }
    if (action === 'toggle-water-dose' && !state.waterDoseSyncing && state.waterToday) {
      const dose = Number(actionElement.dataset.waterDose);
      const isMarking = dose > state.waterToday.realizado_doses;
      const realizado_doses = isMarking ? dose : dose - 1;
      const previousRealizado = state.waterToday.realizado_doses;
      state.waterDoseSyncing = true;
      const fillFromPercent = waterIntakePercent({ ...state.waterToday, realizado_doses: previousRealizado });
      state.waterToday = { ...state.waterToday, realizado_doses };
      syncWaterTrackerDom(container, state, { skipWaterDrop: true });
      refreshWaterVictoryPresentation(container, container, state.waterToday, state.waterProfileId, { animateFillFrom: fillFromPercent });
      if (isMarking) animateWaterDose(container, actionElement, false);
      try {
        applyWaterData(state, await requestWater('PATCH', { profile_id: state.waterProfileId, realizado_doses }));
        syncWaterTrackerDom(container, state, { skipWaterDrop: true });
        const completedNow = isMarking && realizado_doses === state.waterToday.meta_doses;
        if (completedNow) showWaterCelebration(container, state);
        else refreshWaterVictoryPresentation(container, container, state.waterToday, state.waterProfileId);
      } catch (error) {
        const rollbackFrom = waterIntakePercent(state.waterToday);
        state.waterToday = { ...state.waterToday, realizado_doses: previousRealizado };
        refreshWaterVictoryPresentation(container, container, state.waterToday, state.waterProfileId, { animateFillFrom: rollbackFrom });
        syncWaterTrackerDom(container, state, { skipWaterDrop: true });
        state.notice = { type: 'error', text: error instanceof Error ? error.message : 'Não foi possível marcar a dose.' };
      } finally {
        state.waterDoseSyncing = false;
        if (state.view === 'profile-detail') {
          renderProfileDetail(container, state);
        } else {
          syncWaterTrackerDom(container, state, { skipWaterDrop: true });
        }
      }
      return;
    }
    if (action === 'add-profile') {
      state.profileEditorOpen = true;
      state.profileEditingId = null;
      state.profileDraft = blankProfileDraft();
      state.notice = null;
      if (state.view === 'profile-detail') renderProfileDetail(container, state);
      else renderProfiles(container, state);
      requestAnimationFrame(() => container.querySelector('#profile-nome')?.focus());
      return;
    }
    if (action === 'cancel-profile-editor') {
      state.profileEditorOpen = false;
      state.profileEditingId = null;
      state.profileDraft = blankProfileDraft();
      if (state.view === 'profile-detail') renderProfileDetail(container, state);
      else renderProfiles(container, state);
      return;
    }
    if (action === 'edit-profile') {
      const profile = state.profiles.find((item) => Number(item.id) === Number(actionElement.dataset.saudeId));
      if (!profile) return;
      state.profileEditorOpen = true;
      state.profileEditingId = Number(profile.id);
      state.profileDraft = { ...blankProfileDraft(), ...profile };
      state.notice = null;
      if (state.view === 'profile-detail') renderProfileDetail(container, state);
      else renderProfiles(container, state);
      requestAnimationFrame(() => container.querySelector('#profile-nome')?.focus());
      return;
    }
    if (action === 'adjust-weight') {
      const profile = state.profiles.find((item) => Number(item.id) === Number(actionElement.dataset.saudeId));
      if (!profile) return;
      state.profileEditorOpen = false;
      state.measurementEditorOpen = false;
      state.weightEditorOpen = true;
      state.weightProfileId = Number(profile.id);
      state.weightDraft = { peso_kg: profile.peso_kg };
      state.notice = null;
      renderProfileDetail(container, state);
      requestAnimationFrame(() => container.querySelector('#weight-value')?.select());
      return;
    }
    if (action === 'cancel-weight-editor') {
      state.weightEditorOpen = false;
      state.weightProfileId = null;
      state.weightDraft = null;
      renderProfileDetail(container, state);
      return;
    }
    if (action === 'edit-measurement') {
      const profile = state.profiles.find((item) => Number(item.id) === Number(actionElement.dataset.saudeProfileId));
      const measurement = profile?.historico?.find((item) => Number(item.id) === Number(actionElement.dataset.saudeMeasurementId));
      if (!profile || !measurement) return;
      state.profileEditorOpen = false;
      state.measurementEditorOpen = true;
      state.measurementEditingId = Number(measurement.id);
      state.measurementProfileId = Number(profile.id);
      state.measurementDraft = { ...measurement, data_medicao: dateInputFromTimestamp(measurement.registrado_em) };
      state.notice = null;
      if (state.view === 'profile-detail') renderProfileDetail(container, state);
      else renderProfiles(container, state);
      requestAnimationFrame(() => container.querySelector('#measurement-data')?.focus());
      return;
    }
    if (action === 'cancel-measurement-editor') {
      state.measurementEditorOpen = false;
      state.measurementEditingId = null;
      state.measurementProfileId = null;
      state.measurementDraft = null;
      if (state.view === 'profile-detail') renderProfileDetail(container, state);
      else renderProfiles(container, state);
      return;
    }
    if (action === 'delete-measurement') {
      const profileId = Number(actionElement.dataset.saudeProfileId);
      const measurementId = Number(actionElement.dataset.saudeMeasurementId);
      const profile = state.profiles.find((item) => Number(item.id) === profileId);
      const measurement = profile?.historico?.find((item) => Number(item.id) === measurementId);
      if (!profile || !measurement) return;
      const confirmed = await requestSaudeConfirmation(container, {
        title: 'Excluir medição?',
        message: `A medição de ${formatDateTime(measurement.registrado_em)} será excluída permanentemente. Esta ação não poderá ser desfeita.`,
      });
      if (!confirmed) return;
      state.busy = true;
      state.notice = null;
      renderProfiles(container, state);
      let deleted = false;
      try {
        const result = await deleteProfileMeasurement(measurementId);
        state.profiles = state.profiles.map((item) => Number(item.id) === profileId ? result.row : item);
        if (state.measurementEditingId === measurementId) {
          state.measurementEditorOpen = false;
          state.measurementEditingId = null;
          state.measurementProfileId = null;
          state.measurementDraft = null;
        }
        state.notice = { type: 'success', text: 'Medição excluída com sucesso.' };
        deleted = true;
      } catch (error) {
        state.notice = { type: 'error', text: error instanceof Error ? error.message : 'Não foi possível excluir a medição.' };
      } finally {
        state.busy = false;
        renderProfiles(container, state);
      }
      if (deleted) showSaudeSuccess(container, 'Medição excluída com sucesso.');
      return;
    }
    if (action === 'select-diet-profile') {
      state.dietSelectedProfileId = Number(actionElement.dataset.profileId);
      renderActiveSaudeView(container, state);
      return;
    }
    if (action === 'add-diet') {
      const profileId = state.view === 'profile-detail'
        ? (state.selectedProfileId || currentHealthProfile(state)?.id)
        : state.dietSelectedProfileId;
      if (!state.profiles || !state.profiles.length) {
        state.notice = { type: 'error', text: 'Crie um perfil antes de cadastrar dietas.' };
        renderActiveSaudeView(container, state);
        return;
      }
      if (!profileId) {
        state.notice = { type: 'error', text: 'Abra um perfil de saúde antes de cadastrar dietas.' };
        renderActiveSaudeView(container, state);
        return;
      }
      state.dietSelectedProfileId = Number(profileId);
      state.dietEditorOpen = true;
      state.dietEditingId = null;
      state.dietDraft = blankDietDraft(profileId);
      state.dietModal = null;
      state.notice = null;
      renderActiveSaudeView(container, state);
      requestAnimationFrame(() => container.querySelector('#diet-titulo')?.focus());
      return;
    }
    if (action === 'cancel-diet-editor') {
      state.dietEditorOpen = false;
      state.dietEditingId = null;
      state.dietModal = null;
      renderActiveSaudeView(container, state);
      return;
    }
    if (action === 'view-diet') {
      const diet = state.diets.find((item) => Number(item.id) === Number(actionElement.dataset.saudeId));
      if (diet) {
        state.dietSelectedId = Number(diet.id);
        state.dietModal = 'detail';
        renderActiveSaudeView(container, state);
      }
      return;
    }
    if (action === 'close-diet-modal') {
      state.dietModal = null;
      state.dietItemMealType = null;
      state.dietItemEditingIndex = null;
      renderActiveSaudeView(container, state);
      return;
    }
    if (action === 'add-diet-item') {
      captureDietFormFields(container, state);
      state.dietItemMealType = actionElement.dataset.mealType;
      state.dietItemEditingIndex = null;
      state.dietItemDraft = { nome: '', quantidade: '', observacao: '' };
      state.dietModal = 'item';
      renderActiveSaudeView(container, state);
      requestAnimationFrame(() => container.querySelector('#diet-item-name')?.focus());
      return;
    }
    if (action === 'edit-diet-item') {
      captureDietFormFields(container, state);
      const mealType = actionElement.dataset.mealType;
      const itemIndex = Number(actionElement.dataset.itemIndex);
      const meal = normalizeDietMeals(state.dietDraft.refeicoes).find((entry) => entry.tipo === mealType);
      const item = meal?.itens[itemIndex];
      if (!item) return;
      state.dietItemMealType = mealType;
      state.dietItemEditingIndex = itemIndex;
      state.dietItemDraft = { ...item };
      state.dietModal = 'item';
      renderActiveSaudeView(container, state);
      requestAnimationFrame(() => container.querySelector('#diet-item-name')?.focus());
      return;
    }
    if (action === 'delete-diet-item') {
      captureDietFormFields(container, state);
      const mealType = actionElement.dataset.mealType;
      const itemIndex = Number(actionElement.dataset.itemIndex);
      const meals = normalizeDietMeals(state.dietDraft.refeicoes);
      const item = meals.find((meal) => meal.tipo === mealType)?.itens[itemIndex];
      if (!item) return;
      const confirmed = await requestSaudeConfirmation(container, {
        title: 'Remover alimento?',
        message: `O item "${item.nome}" será removido desta refeição.`,
        confirmLabel: 'Remover',
      });
      if (!confirmed) return;
      state.dietDraft.refeicoes = meals.map((meal) => meal.tipo === mealType
        ? { ...meal, itens: meal.itens.filter((_, index) => index !== itemIndex) }
        : meal);
      renderActiveSaudeView(container, state);
      showSaudeSuccess(container, 'Alimento removido da refeição.');
      return;
    }
    if (action === 'edit-diet') {
      const diet = state.diets.find((item) => Number(item.id) === Number(actionElement.dataset.saudeId));
      if (!diet) return;
      state.dietEditorOpen = true;
      state.dietEditingId = Number(diet.id);
      state.dietDraft = dietDraftFromDiet(diet);
      if (diet.perfil_id) state.dietSelectedProfileId = Number(diet.perfil_id);
      state.dietModal = null;
      state.notice = null;
      renderActiveSaudeView(container, state);
      requestAnimationFrame(() => container.querySelector('#diet-titulo')?.focus());
      return;
    }
    if (action === 'delete-diet') {
      const id = Number(actionElement.dataset.saudeId);
      const diet = state.diets.find((item) => Number(item.id) === id);
      if (!diet) return;
      const confirmed = await requestSaudeConfirmation(container, {
        title: 'Excluir dieta?',
        message: `A dieta "${diet.titulo}" e todos os seus itens serão excluídos permanentemente.`,
      });
      if (!confirmed) return;
      let deleted = false;
      try {
        await requestDiets('DELETE', { id });
        state.diets = state.diets.filter((item) => Number(item.id) !== id);
        state.dietModal = null;
        state.dietSelectedId = null;
        state.dietEditorOpen = false;
        state.dietEditingId = null;
        state.notice = { type: 'success', text: 'Dieta excluída com sucesso.' };
        deleted = true;
      } catch (error) {
        state.notice = { type: 'error', text: error instanceof Error ? error.message : 'Não foi possível excluir a dieta.' };
      }
      renderActiveSaudeView(container, state);
      if (deleted) showSaudeSuccess(container, 'Dieta excluída com sucesso.');
      return;
    }
    if (action === 'insert') {
      state.editorOpen = true;
      state.editingId = null;
      state.draft = { item: '', categoria: '', porcao: '' };
      state.notice = null;
      renderTabelaNutricional(container, state);
      focusEditor(container);
      return;
    }
    if (action === 'cancel-editor') {
      state.editorOpen = false;
      state.editingId = null;
      state.draft = { item: '', categoria: '', porcao: '' };
      renderTabelaNutricional(container, state);
      return;
    }
    if (action === 'edit') {
      const id = Number(actionElement.dataset.saudeId);
      const row = state.rows.find((item) => Number(item.id) === id);
      if (!row) return;
      state.editorOpen = true;
      state.editingId = id;
      state.draft = { item: row.item, categoria: row.categoria, porcao: row.porcao };
      state.notice = null;
      renderTabelaNutricional(container, state);
      focusEditor(container);
      return;
    }
    if (action === 'delete') {
      const id = Number(actionElement.dataset.saudeId);
      const row = state.rows.find((item) => Number(item.id) === id);
      if (!row) return;
      const confirmed = await requestSaudeConfirmation(container, {
        title: 'Excluir item nutricional?',
        message: `O item "${row.item}" será excluído da tabela nutricional.`,
      });
      if (!confirmed) return;
      state.busy = true;
      actionElement.disabled = true;
      let deleted = false;
      try {
        await requestNutrition('DELETE', { id });
        state.rows = state.rows.filter((item) => Number(item.id) !== id);
        state.notice = { type: 'success', text: 'Item excluído com sucesso.' };
        deleted = true;
      } catch (error) {
        state.notice = { type: 'error', text: error instanceof Error ? error.message : 'Não foi possível excluir o item.' };
      } finally {
        state.busy = false;
        renderTabelaNutricional(container, state);
      }
      if (deleted) showSaudeSuccess(container, 'Item da tabela nutricional excluído com sucesso.');
      return;
    }

    const pageButton = event.target.closest('[data-saude-page]');
    if (pageButton && !pageButton.disabled) {
      state.page = Number(pageButton.dataset.saudePage) || 1;
      renderTabelaNutricional(container, state);
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const onSubmit = async (event) => {
    const weightForm = event.target.closest('[data-saude-weight-form]');
    if (weightForm) {
      event.preventDefault();
      if (state.busy || !weightForm.reportValidity()) return;
      const profile = state.profiles.find((item) => Number(item.id) === Number(state.weightProfileId));
      if (!profile) return;
      const values = new FormData(weightForm);
      state.weightDraft = { peso_kg: Number(String(values.get('peso_kg') || '').replace(',', '.')) };
      state.busy = true;
      state.notice = null;
      renderProfileDetail(container, state);
      try {
        const result = await createWeightMeasurement({ perfil_id: profile.id, peso_kg: state.weightDraft.peso_kg });
        state.profiles = state.profiles.map((item) => Number(item.id) === Number(profile.id) ? result.row : item);
        state.weightEditorOpen = false;
        state.weightProfileId = null;
        state.weightDraft = null;
        state.notice = { type: 'success', text: 'Novo peso registrado na linha do tempo.' };
      } catch (error) {
        state.notice = { type: 'error', text: error instanceof Error ? error.message : 'Não foi possível registrar o peso.' };
      } finally {
        state.busy = false;
        renderProfileDetail(container, state);
      }
      return;
    }

    const waterGoalForm = event.target.closest('[data-water-goal-form]');
    if (waterGoalForm) {
      event.preventDefault();
      if (state.busy || !waterGoalForm.reportValidity()) return;
      const values = new FormData(waterGoalForm);
      const healthProfile = healthProfileByWaterKey(state, state.waterProfileId) || currentHealthProfile(state);
      state.waterDraft = {
        profile_id: state.waterProfileId,
        health_profile_nome: healthProfile?.nome,
        nome: String(values.get('nome') || '').trim(),
        meta_doses: Number(values.get('meta_doses')),
      };
      const fillBeforeGoalSave = state.waterToday ? waterIntakePercent(state.waterToday) : 0;
      state.busy = true;
      state.notice = null;
      renderActiveSaudeView(container, state);
      try {
        applyWaterData(state, await requestWater('POST', state.waterDraft));
        state.waterModal = 'tracker';
        state.notice = { type: 'success', text: 'Meta diária salva com sucesso.' };
      } catch (error) {
        state.notice = { type: 'error', text: error instanceof Error ? error.message : 'Não foi possível salvar a meta.' };
      } finally {
        state.busy = false;
        renderActiveSaudeView(container, state);
        requestAnimationFrame(() => {
          paintWaterTrackerUi(container, state, { animateFillFrom: fillBeforeGoalSave });
        });
      }
      return;
    }

    const measurementForm = event.target.closest('[data-saude-measurement-form]');
    if (measurementForm) {
      event.preventDefault();
      if (state.busy || !measurementForm.reportValidity()) return;
      const values = new FormData(measurementForm);
      const decimal = (name) => {
        const value = String(values.get(name) || '').trim();
        return value === '' ? null : Number(value.replace(',', '.'));
      };
      state.measurementDraft = {
        data_medicao: String(values.get('data_medicao') || ''),
        peso_kg: decimal('peso_kg'),
        altura_cm: decimal('altura_cm'),
      };
      state.busy = true;
      state.notice = null;
      if (state.view === 'profile-detail') renderProfileDetail(container, state);
      else renderProfiles(container, state);
      try {
        const result = await requestProfileMeasurement({ id: state.measurementEditingId, ...state.measurementDraft });
        state.profiles = state.profiles.map((profile) => Number(profile.id) === state.measurementProfileId ? result.row : profile);
        state.measurementEditorOpen = false;
        state.measurementEditingId = null;
        state.measurementProfileId = null;
        state.measurementDraft = null;
        state.notice = { type: 'success', text: 'Medição corrigida sem criar um novo registro.' };
      } catch (error) {
        state.notice = { type: 'error', text: error instanceof Error ? error.message : 'Não foi possível atualizar a medição.' };
      } finally {
        state.busy = false;
        if (state.view === 'profile-detail') renderProfileDetail(container, state);
        else renderProfiles(container, state);
      }
      return;
    }

    const profileForm = event.target.closest('[data-saude-profile-form]');
    if (profileForm) {
      event.preventDefault();
      if (state.busy || !profileForm.reportValidity()) return;
      const values = new FormData(profileForm);
      const decimal = (name) => {
        const value = String(values.get(name) || '').trim();
        return value === '' ? null : Number(value.replace(',', '.'));
      };
      state.profileDraft = {
        nome: String(values.get('nome') || '').trim(),
        sexo: String(values.get('sexo') || ''),
        data_nascimento: String(values.get('data_nascimento') || ''),
        data_medicao: state.profileDraft?.data_medicao || todayIsoDate(),
        peso_kg: decimal('peso_kg'),
        altura_cm: decimal('altura_cm'),
      };
      state.busy = true;
      state.notice = null;
      if (state.view === 'profile-detail') renderProfileDetail(container, state);
      else renderProfiles(container, state);
      try {
        const editingId = state.profileEditingId;
        const result = await requestProfiles(editingId ? 'PATCH' : 'POST', { ...(editingId ? { id: editingId } : {}), ...state.profileDraft });
        state.profiles = editingId
          ? state.profiles.map((profile) => Number(profile.id) === editingId ? result.row : profile)
          : [...state.profiles, result.row];
        state.profileEditorOpen = false;
        state.profileEditingId = null;
        state.profileDraft = blankProfileDraft();
        state.notice = { type: 'success', text: editingId ? 'Perfil atualizado com sucesso.' : 'Perfil criado com sucesso.' };
        if (!editingId && result.row?.id) {
          state.selectedProfileId = Number(result.row.id);
          state.waterProfileId = Number(result.row.id);
          state.view = 'profile-detail';
          try {
            applyWaterData(state, await requestWater('GET', { profile_id: result.row.id, preserve_profiles: true }));
          } catch {
            // fallback quietly
          }
        }
      } catch (error) {
        state.notice = { type: 'error', text: error instanceof Error ? error.message : 'Não foi possível salvar o perfil.' };
      } finally {
        state.busy = false;
        if (state.view === 'profile-detail') renderProfileDetail(container, state);
        else renderProfiles(container, state);
      }
      return;
    }

    const dietItemForm = event.target.closest('[data-diet-item-form]');
    if (dietItemForm) {
      event.preventDefault();
      if (!dietItemForm.reportValidity()) return;
      const values = new FormData(dietItemForm);
      const item = {
        nome: String(values.get('nome') || '').trim(),
        quantidade: String(values.get('quantidade') || '').trim(),
        observacao: String(values.get('observacao') || '').trim(),
      };
      state.dietDraft.refeicoes = normalizeDietMeals(state.dietDraft.refeicoes).map((meal) => {
        if (meal.tipo !== state.dietItemMealType) return meal;
        const items = [...meal.itens];
        if (Number.isInteger(state.dietItemEditingIndex)) items[state.dietItemEditingIndex] = item;
        else items.push(item);
        return { ...meal, itens: items };
      });
      state.dietModal = null;
      state.dietItemMealType = null;
      state.dietItemEditingIndex = null;
      state.dietItemDraft = { nome: '', quantidade: '', observacao: '' };
      renderActiveSaudeView(container, state);
      return;
    }

    const dietForm = event.target.closest('[data-saude-diet-form]');
    if (dietForm) {
      event.preventDefault();
      if (state.busy || !dietForm.reportValidity()) return;
      const values = new FormData(dietForm);
      const perfilId = Number(values.get('perfil_id'));
      if (!perfilId) {
        state.notice = { type: 'error', text: 'Selecione um perfil para a dieta.' };
        renderActiveSaudeView(container, state);
        return;
      }
      state.dietDraft = {
        perfil_id: perfilId,
        titulo: String(values.get('titulo') || '').trim(),
        observacoes: String(values.get('observacoes') || '').trim(),
        refeicoes: normalizeDietMeals(state.dietDraft.refeicoes),
      };
      if (countDietItems(state.dietDraft.refeicoes) === 0) {
        state.notice = { type: 'error', text: 'Adicione pelo menos um alimento antes de salvar a dieta.' };
        renderActiveSaudeView(container, state);
        return;
      }
      state.busy = true;
      state.notice = null;
      renderActiveSaudeView(container, state);
      try {
        const editingId = state.dietEditingId;
        const result = await requestDiets(editingId ? 'PATCH' : 'POST', { ...(editingId ? { id: editingId } : {}), ...state.dietDraft });
        state.diets = editingId
          ? state.diets.map((diet) => Number(diet.id) === editingId ? result.row : diet)
          : [result.row, ...state.diets];
        state.dietSelectedProfileId = result.row.perfil_id || perfilId;
        state.dietEditorOpen = false;
        state.dietEditingId = null;
        state.dietSelectedId = result.row.id;
        state.dietDraft = blankDietDraft(state.dietSelectedProfileId);
        state.notice = { type: 'success', text: editingId ? 'Dieta atualizada com sucesso.' : 'Dieta adicionada com sucesso.' };
      } catch (error) {
        state.notice = { type: 'error', text: error instanceof Error ? error.message : 'Não foi possível salvar a dieta.' };
      } finally {
        state.busy = false;
        renderActiveSaudeView(container, state);
      }
      return;
    }

    const form = event.target.closest('[data-saude-form]');
    if (!form || state.busy) return;
    event.preventDefault();
    if (!form.reportValidity()) return;

    const formData = new FormData(form);
    state.draft = {
      item: String(formData.get('item') || '').trim(),
      categoria: String(formData.get('categoria') || '').trim(),
      porcao: String(formData.get('porcao') || '').trim(),
    };
    state.busy = true;
    state.notice = null;
    renderTabelaNutricional(container, state);

    try {
      const editingId = state.editingId;
      const result = await requestNutrition(editingId ? 'PATCH' : 'POST', {
        ...(editingId ? { id: editingId } : {}),
        ...state.draft,
      });
      if (editingId) {
        state.rows = state.rows.map((row) => Number(row.id) === editingId ? result.row : row);
      } else {
        state.rows = [result.row, ...state.rows];
        state.page = 1;
      }
      state.editorOpen = false;
      state.editingId = null;
      state.draft = { item: '', categoria: '', porcao: '' };
      state.notice = { type: 'success', text: editingId ? 'Item atualizado com sucesso.' : 'Item inserido com sucesso.' };
    } catch (error) {
      state.notice = { type: 'error', text: error instanceof Error ? error.message : 'Não foi possível salvar o item.' };
    } finally {
      state.busy = false;
      renderTabelaNutricional(container, state);
      if (state.editorOpen) focusEditor(container);
    }
  };

  const onFilter = (event) => {
    const key = event.target.dataset.saudeFilter;
    if (!key || (event.type === 'input' && key !== 'busca') || (event.type === 'change' && key === 'busca')) return;
    state.filters[key] = event.target.value;
    state.page = 1;
    renderTabelaNutricional(container, state);
    if (key === 'busca') {
      requestAnimationFrame(() => {
        const input = container.querySelector('[data-saude-filter="busca"]');
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      });
    }
  };

  container.addEventListener('click', onClick);
  container.addEventListener('submit', onSubmit);
  container.addEventListener('input', onFilter);
  container.addEventListener('change', onFilter);
  let viewportResizeTimer = null;
  const onViewportChange = () => {
    clearTimeout(viewportResizeTimer);
    viewportResizeTimer = setTimeout(() => {
      if (state.view !== 'profile-detail' || state.selectedProfileId == null) return;
      if (state.waterModal || state.dietEditorOpen || state.profileEditorOpen || state.measurementEditorOpen || state.weightEditorOpen) return;
      renderProfileDetail(container, state);
    }, 180);
  };
  window.addEventListener('resize', onViewportChange);
  const waterDayTimer = setInterval(async () => {
    if (state.busy || state.waterDate === todayIsoDate()) return;
    if (state.view === 'profile-detail') {
      const healthProfile = currentHealthProfile(state);
      if (!healthProfile) return;
      try {
        await syncWaterWithHealthProfile(state, healthProfile);
        renderProfileDetail(container, state);
      } catch (_error) { /* mantém último estado válido */ }
      return;
    }
  }, 60000);
  container._cleanup = () => {
    clearInterval(waterDayTimer);
    clearTimeout(viewportResizeTimer);
    window.removeEventListener('resize', onViewportChange);
    if (state.waterCelebrationTimer) clearTimeout(state.waterCelebrationTimer);
    container.querySelector('[data-water-celebration]')?.remove();
    const windowContent = container.closest('.window-content');
    if (windowContent) {
      windowContent.classList.remove('is-scroll-locked');
      delete windowContent.dataset.saudeScrollTop;
    }
    container.removeEventListener('click', onClick);
    container.removeEventListener('submit', onSubmit);
    container.removeEventListener('input', onFilter);
    container.removeEventListener('change', onFilter);
  };

  renderLoading(container);
  try {
    const response = await fetch('/api/saude?resource=perfis', { cache: 'no-store' });
    if (!response.ok) throw new Error('O endpoint de Saúde não respondeu corretamente.');
    const data = await response.json().catch(() => ({}));
    state.profiles = Array.isArray(data.rows) ? data.rows : [];
    if (isLocalWaterStorageMode() && state.profiles.length) {
      migrateLocalWaterDataToHealthProfiles(state.profiles);
    }
    await hydrateWaterHistoriesForProfiles(state);
    const checkpoint = readSaudeCheckpoint();
    const checkpointProfileId = Number(checkpoint?.selectedProfileId);
    const restoreProfile = checkpoint?.view === 'profile-detail'
      && Number.isFinite(checkpointProfileId)
      && state.profiles.some((profile) => Number(profile.id) === checkpointProfileId);
    if (restoreProfile) {
      const healthProfile = state.profiles.find((profile) => Number(profile.id) === checkpointProfileId);
      state.selectedProfileId = checkpointProfileId;
      state.view = 'profile-detail';
      try {
        await Promise.all([
          syncWaterWithHealthProfile(state, healthProfile),
          syncDietsForHealthProfile(state, healthProfile),
        ]);
        renderProfileDetail(container, state);
      } catch (_error) {
        state.view = 'profiles';
        renderProfiles(container, state);
      }
    } else {
      state.view = 'profiles';
      renderProfiles(container, state);
    }
  } catch (error) {
    renderError(container, error instanceof Error ? error.message : 'Não foi possível abrir Saúde.');
  }
}
