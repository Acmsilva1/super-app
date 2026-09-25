import {
  filtrarTabelaNutricional,
  opcoesTabelaNutricional,
  paginarTabelaNutricional,
} from './service/tabelaNutricionalService.js';
import { calcularImc, classificarImc, formatarNumeroSaude } from './service/perfilSaudeService.js';
import {
  createLocalWaterProfile,
  deleteLocalWaterProfile,
  isLocalWaterStorageMode,
  loadLocalWater,
  saveLocalWaterGoal,
  updateLocalWaterProfile,
  updateLocalWaterProgress,
} from './service/consumoAguaLocalService.js';

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
    .saude-page-header { min-width: 0; display: flex; align-items: center; gap: .85rem; }
    .saude-page-header h2 { margin: 0; font-family: "Darker Grotesque", Montserrat, Arial, sans-serif; font-size: clamp(1.55rem, 4vw, 2rem); }
    .saude-page-header p { margin: .2rem 0 0; color: var(--saude-texto-secundario); font-size: .9rem; }
    .saude-btn { min-height: 2.65rem; display: inline-flex; align-items: center; justify-content: center; gap: .45rem; padding: .65rem .9rem; border: 1px solid var(--saude-frame); border-radius: .75rem; background: var(--saude-painel-elevado); color: var(--saude-texto); font: inherit; font-size: .85rem; font-weight: 700; cursor: pointer; }
    .saude-btn:hover:not(:disabled) { background: rgba(50, 119, 70, .28); border-color: var(--saude-grama); }
    .saude-btn:disabled { cursor: not-allowed; opacity: .45; }
    .saude-btn--primary { border-color: var(--saude-grama); background: linear-gradient(135deg, var(--saude-verde), var(--saude-musgo)); color: #fff; box-shadow: 0 8px 22px rgba(0, 0, 0, .24); }
    .saude-btn--primary:hover:not(:disabled) { background: linear-gradient(135deg, var(--saude-grama), var(--saude-verde)); }
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
    .saude-diet-list { overflow: hidden; border: 1px solid rgba(148, 163, 184, .18); border-radius: 1rem; background: var(--saude-painel); box-shadow: 0 14px 30px rgba(0, 0, 0, .24); }
    .saude-diet-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: .85rem; padding: 1rem; }
    .saude-diet-row + .saude-diet-row { border-top: 1px solid rgba(148, 163, 184, .14); }
    .saude-diet-row h3 { margin: 0; font-size: 1rem; text-transform: none; }
    .saude-diet-row p { margin: .3rem 0 0; color: var(--saude-texto-secundario); font-size: .82rem; }
    .saude-diet-meta { display: flex; flex-wrap: wrap; gap: .45rem; margin-top: .55rem; }
    .saude-diet-meta span { padding: .2rem .5rem; border-radius: 999px; background: rgba(149, 193, 31, .1); color: #c9e777; font-size: .7rem; font-weight: 700; }
    .saude-diet-row__actions { display: flex; align-items: center; gap: .4rem; }
    .saude-diet-open { min-height: 2.65rem; padding-inline: .8rem; }
    .saude-diet-form { margin-bottom: 1rem; }
    .saude-diet-form__grid { display: grid; grid-template-columns: 2fr 1fr .55fr; gap: .75rem; }
    .saude-field-group--wide { grid-column: 1 / -1; }
    .saude-diet-days { display: grid; gap: .6rem; margin-top: .9rem; }
    .saude-diet-day-editor, .saude-diet-day { overflow: hidden; border: 1px solid rgba(148, 163, 184, .17); border-radius: .8rem; background: rgba(3, 7, 18, .35); }
    .saude-diet-day-editor summary, .saude-diet-day summary { display: flex; align-items: center; justify-content: space-between; gap: .75rem; padding: .8rem; color: var(--saude-texto); font-weight: 700; cursor: pointer; list-style: none; }
    .saude-diet-day-editor summary::-webkit-details-marker, .saude-diet-day summary::-webkit-details-marker { display: none; }
    .saude-diet-day-editor summary::after, .saude-diet-day summary::after { content: '+'; color: var(--saude-lima); font-size: 1.15rem; }
    .saude-diet-day-editor[open] summary::after, .saude-diet-day[open] summary::after { content: '−'; }
    .saude-diet-day-editor__body { display: grid; grid-template-columns: 1.4fr .55fr .55fr; gap: .7rem; padding: 0 .8rem .8rem; }
    .saude-diet-detail__intro { margin-bottom: 1rem; padding: 1rem; border: 1px solid rgba(148, 163, 184, .18); border-radius: 1rem; background: var(--saude-painel); }
    .saude-diet-detail__intro p { color: var(--saude-texto-secundario); white-space: pre-wrap; }
    .saude-diet-section { margin-top: 1rem; }
    .saude-diet-section h3 { margin: 0 0 .65rem; font-size: .95rem; }
    .saude-diet-copy { margin: 0; color: var(--saude-texto-secundario); font-size: .86rem; line-height: 1.6; white-space: pre-wrap; }
    .saude-diet-day__body { padding: 0 .8rem .9rem; }
    .saude-diet-day__stats { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: .7rem; }
    .saude-diet-day__stats span { padding: .25rem .5rem; border-radius: .55rem; background: rgba(50, 119, 70, .2); color: #d9f5df; font-size: .72rem; }
    .saude-profile-list { display: grid; gap: 1rem; }
    .saude-profile-card { overflow: hidden; border: 1px solid rgba(148, 163, 184, .18); border-radius: 1rem; background: var(--saude-painel); box-shadow: 0 14px 30px rgba(0, 0, 0, .24); }
    .saude-profile-card__header { display: flex; align-items: center; justify-content: space-between; gap: .8rem; padding: 1rem; }
    .saude-profile-card__identity { display: flex; align-items: center; gap: .75rem; min-width: 0; }
    .saude-profile-avatar { width: 3rem; height: 3rem; display: grid; place-items: center; flex: 0 0 auto; border-radius: 50%; background: linear-gradient(135deg, var(--saude-musgo), var(--saude-verde)); color: #fff; font-size: 1.2rem; }
    .saude-profile-card h3 { margin: 0; font-size: 1.05rem; }
    .saude-profile-card__subtitle { margin: .2rem 0 0; color: var(--saude-texto-secundario); font-size: .78rem; }
    .saude-profile-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .6rem; padding: 0 1rem 1rem; }
    .saude-profile-stat { padding: .75rem; border: 1px solid rgba(148, 163, 184, .14); border-radius: .75rem; background: rgba(22, 34, 56, .62); }
    .saude-profile-stat span { display: block; color: var(--saude-texto-secundario); font-size: .68rem; font-weight: 700; text-transform: uppercase; }
    .saude-profile-stat strong { display: block; margin-top: .25rem; font-size: 1rem; }
    .saude-profile-timeline { padding: 0 1rem 1rem; }
    .saude-profile-timeline > summary { padding: .75rem 0; border-top: 1px solid rgba(148, 163, 184, .14); color: var(--saude-lima); font-size: .82rem; font-weight: 700; cursor: pointer; }
    .saude-timeline-list { display: grid; gap: .7rem; margin-top: .3rem; }
    .saude-timeline-item { display: grid; grid-template-columns: 8rem minmax(0, 1fr) auto; align-items: start; gap: .8rem; padding-left: .85rem; border-left: 2px solid var(--saude-verde); }
    .saude-timeline-date { color: var(--saude-texto-secundario); font-size: .75rem; line-height: 1.4; }
    .saude-timeline-values { display: flex; flex-wrap: wrap; gap: .35rem; }
    .saude-timeline-values span { padding: .25rem .5rem; border-radius: .5rem; background: rgba(50, 119, 70, .18); color: #d9f5df; font-size: .72rem; }
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
    .saude-water-card__edit { align-self: center; margin-right: 1rem; }
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
    .saude-water-modal { width: min(100%, 34rem); max-height: min(88vh, 44rem); overflow: auto; padding: 1rem; border: 1px solid rgba(56, 189, 248, .35); border-radius: 1.1rem; background: radial-gradient(circle at 15% 0%, rgba(14, 165, 233, .12), transparent 15rem), #0f172a; box-shadow: 0 24px 70px rgba(0, 0, 0, .55); animation: saude-water-modal-in .24s cubic-bezier(.2,.8,.2,1); }
    .saude-water-modal.is-complete { border-color: rgba(103, 232, 249, .78); box-shadow: 0 24px 70px rgba(0, 0, 0, .55), 0 0 34px rgba(14, 165, 233, .16); }
    .saude-water-modal__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
    .saude-water-modal__header h3 { margin: 0; }
    .saude-water-modal__header p { margin: .25rem 0 0; color: var(--saude-texto-secundario); font-size: .8rem; }
    .saude-water-checks { display: grid; grid-template-columns: repeat(auto-fit, minmax(3.35rem, 1fr)); gap: .65rem; }
    .saude-water-check { position: relative; aspect-ratio: 1; display: grid; place-items: center; overflow: visible; border: 1px solid #334155; border-radius: .85rem; background: #0b1324; color: #718399; font-size: 1.15rem; cursor: pointer; transition: transform .18s ease, border-color .18s ease, background .18s ease, box-shadow .18s ease; }
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
    .saude-water-confetti { position: absolute; top: -1rem; left: 50%; width: .55rem; height: .85rem; border-radius: .16rem; opacity: 0; animation: saude-water-confetti-fall 1.8s ease-out forwards; }
    .saude-water-check:disabled { cursor: wait; opacity: .6; }
    @keyframes saude-water-fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes saude-water-modal-in { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes saude-water-check-pop { 0% { transform: scale(.86); } 55% { transform: scale(1.13); } 100% { transform: scale(1); } }
    @keyframes saude-water-check-icon { 0% { opacity: 0; transform: rotate(-25deg) scale(.35); } 100% { opacity: 1; transform: rotate(0) scale(1); } }
    @keyframes saude-water-droplets { 0% { opacity: .95; transform: translateY(0) scale(.4) rotate(25deg); } 100% { opacity: 0; transform: translateY(-1.5rem) scale(1) rotate(25deg); } }
    @keyframes saude-water-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
    @keyframes saude-water-drift { from { transform: translateX(-2%) scale(.95); } to { transform: translateX(12%) scale(1.08); } }
    @keyframes saude-water-shine { 0%, 45% { transform: translateX(-100%); } 75%, 100% { transform: translateX(100%); } }
    @keyframes saude-water-celebration-in { from { opacity: 0; transform: translateY(-1rem) scale(.94); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes saude-water-confetti-fall { 0% { opacity: 0; transform: translate3d(0, -1rem, 0) rotate(0); } 12% { opacity: 1; } 100% { opacity: 0; transform: translate3d(var(--confetti-x), 72vh, 0) rotate(var(--confetti-rotate)); } }
    @media (prefers-reduced-motion: reduce) {
      .saude-modal-backdrop, .saude-water-modal, .saude-water-card::before, .saude-water-card__icon, .saude-water-progress span::after, .saude-water-check.is-splash, .saude-water-check.is-splash i, .saude-water-check.is-splash::before, .saude-water-check.is-splash::after, .saude-water-celebration, .saude-water-confetti { animation: none !important; }
      .saude-water-confetti { display: none; }
      .saude-water-card, .saude-water-progress span, .saude-water-check { transition: none !important; }
    }
    @media (max-width: 760px) {
      .saude-root { padding: .85rem; }
      .saude-hero__image { width: 3.75rem; height: 3.75rem; }
      .saude-hero { margin-bottom: 1rem; }
      .saude-page-toolbar { align-items: stretch; }
      .saude-page-header { flex: 1; }
      .saude-page-header p { display: none; }
      .saude-btn--insert { flex: 0 0 auto; padding-inline: .8rem; }
      .saude-editor { padding: .85rem; }
      .saude-editor__grid { grid-template-columns: 1fr; }
      .saude-editor__actions { position: sticky; bottom: 0; margin: .85rem -.85rem -.85rem; padding: .75rem .85rem max(.75rem, env(safe-area-inset-bottom)); background: rgba(15, 23, 42, .96); border-top: 1px solid rgba(148, 163, 184, .16); }
      .saude-editor__actions .saude-btn { flex: 1; }
      .saude-diet-form__grid, .saude-diet-day-editor__body { grid-template-columns: 1fr; }
      .saude-diet-row { padding: .8rem; }
      .saude-diet-row__actions { flex-direction: column; }
      .saude-profile-form__grid { grid-template-columns: 1fr; }
      .saude-profile-summary { grid-template-columns: 1fr 1fr; }
      .saude-timeline-item { grid-template-columns: 1fr; gap: .3rem; }
      .saude-water-card { grid-template-columns: minmax(0, 1fr) auto; }
      .saude-water-card__open { padding: .9rem; gap: .75rem; }
      .saude-water-card__icon { width: 2.9rem; height: 2.9rem; }
      .saude-water-profiles { grid-template-columns: 1fr; }
      .saude-water-log { grid-template-columns: 1fr 1fr; }
      .saude-water-log time { grid-column: 1 / -1; }
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
      .saude-page-header h2 { font-size: 1.35rem; }
      .saude-btn--insert span { display: none; }
      .saude-btn--insert { width: 2.8rem; padding: 0; }
      .saude-filters { padding: .8rem; }
      .saude-profile-card__header { align-items: flex-start; }
    }
  </style>
`;

function renderShell(container, content, { loading = false } = {}) {
  container.innerHTML = `
    ${SAUDE_STYLES}
    <main class="saude-root${loading ? ' saude-root--loading' : ''}">
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
}

function renderLoading(container, message = 'Carregando módulo...') {
  renderShell(container, `
    <section class="saude-loading" aria-live="polite" aria-busy="true">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <span>${escapeHtml(message)}</span>
    </section>
  `, { loading: true });
}

function renderHome(container) {
  renderShell(container, `
    <section class="saude-page" aria-labelledby="saude-apps-title">
      <h2 id="saude-apps-title" style="margin:0 0 1rem;font-size:1rem;">Itens do módulo</h2>
      <div class="saude-app-grid">
        <button type="button" class="saude-access-card" data-saude-action="open-tabela-nutricional">
          <span class="saude-access-card__icon"><i class="fas fa-table-list" aria-hidden="true"></i></span>
          <h2>Tabela Nutricional</h2>
          <p>Consulte alimentos e porções equivalentes por categoria.</p>
          <span class="saude-access-card__action">Acessar <i class="fas fa-arrow-right" aria-hidden="true"></i></span>
        </button>
        <button type="button" class="saude-access-card" data-saude-action="open-dietas">
          <span class="saude-access-card__icon"><i class="fas fa-bowl-food" aria-hidden="true"></i></span>
          <h2>Dietas</h2>
          <p>Crie e consulte planos alimentares organizados por dia.</p>
          <span class="saude-access-card__action">Acessar <i class="fas fa-arrow-right" aria-hidden="true"></i></span>
        </button>
        <button type="button" class="saude-access-card" data-saude-action="open-profiles">
          <span class="saude-access-card__icon"><i class="fas fa-user-group" aria-hidden="true"></i></span>
          <h2>Perfil</h2>
          <p>Acompanhe peso, medidas, IMC e a evolução de cada pessoa da família.</p>
          <span class="saude-access-card__action">Acessar <i class="fas fa-arrow-right" aria-hidden="true"></i></span>
        </button>
        <button type="button" class="saude-access-card" data-saude-action="open-water">
          <span class="saude-access-card__icon"><i class="fas fa-droplet" aria-hidden="true"></i></span>
          <h2>Consumo de água</h2>
          <p>Defina sua meta diária, marque cada dose e acompanhe o histórico.</p>
          <span class="saude-access-card__action">Acessar <i class="fas fa-arrow-right" aria-hidden="true"></i></span>
        </button>
      </div>
    </section>
  `);
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

function blankDietDraft() {
  return {
    titulo: '', objetivo: '', duracao_dias: 7, descricao: '', orientacoes_gerais: '', ritual_diario: '', observacoes: '',
    dias: Array.from({ length: 7 }, (_, index) => ({ numero: index + 1, titulo: '', jejum_horas: 12, quantidade_refeicoes: 3, carboidrato: '', conteudo: '' })),
  };
}

function renderDietDayEditor(day, number) {
  return `
    <details class="saude-diet-day-editor" data-diet-day="${number}"${number === 1 ? ' open' : ''}>
      <summary>Dia ${number}${day?.titulo ? ` — ${escapeHtml(day.titulo)}` : ''}</summary>
      <div class="saude-diet-day-editor__body">
        <div class="saude-field-group">
          <label for="diet-dia-${number}-titulo">Estratégia do dia</label>
          <input id="diet-dia-${number}-titulo" name="dia_${number}_titulo" class="saude-field" required maxlength="160" placeholder="Ex.: Desinflamar" value="${escapeHtml(day?.titulo)}">
        </div>
        <div class="saude-field-group">
          <label for="diet-dia-${number}-jejum">Jejum (horas)</label>
          <input id="diet-dia-${number}-jejum" name="dia_${number}_jejum" class="saude-field" type="number" min="0" max="24" required value="${escapeHtml(day?.jejum_horas ?? 12)}">
        </div>
        <div class="saude-field-group">
          <label for="diet-dia-${number}-refeicoes">Refeições</label>
          <input id="diet-dia-${number}-refeicoes" name="dia_${number}_refeicoes" class="saude-field" type="number" min="1" max="12" required value="${escapeHtml(day?.quantidade_refeicoes ?? 3)}">
        </div>
        <div class="saude-field-group saude-field-group--wide">
          <label for="diet-dia-${number}-carboidrato">Estratégia de carboidrato</label>
          <input id="diet-dia-${number}-carboidrato" name="dia_${number}_carboidrato" class="saude-field" maxlength="1000" placeholder="Ex.: Somente no almoço" value="${escapeHtml(day?.carboidrato)}">
        </div>
        <div class="saude-field-group saude-field-group--wide">
          <label for="diet-dia-${number}-conteudo">Refeições e instruções</label>
          <textarea id="diet-dia-${number}-conteudo" name="dia_${number}_conteudo" class="saude-field" required maxlength="12000" rows="7" placeholder="Descreva cada refeição do dia">${escapeHtml(day?.conteudo)}</textarea>
        </div>
      </div>
    </details>`;
}

function renderDietForm(state) {
  if (!state.dietEditorOpen) return '';
  const draft = state.dietDraft || blankDietDraft();
  return `
    <form class="saude-editor saude-diet-form" data-saude-diet-form>
      <h3 class="saude-editor__title">${state.dietEditingId ? 'Editar dieta' : 'Adicionar dieta específica'}</h3>
      <div class="saude-diet-form__grid">
        <div class="saude-field-group"><label for="diet-titulo">Nome da dieta</label><input id="diet-titulo" name="titulo" class="saude-field" required maxlength="160" value="${escapeHtml(draft.titulo)}" placeholder="Ex.: Detox 7 dias"></div>
        <div class="saude-field-group"><label for="diet-objetivo">Objetivo</label><input id="diet-objetivo" name="objetivo" class="saude-field" required maxlength="120" value="${escapeHtml(draft.objetivo)}" placeholder="Ex.: Perder peso"></div>
        <div class="saude-field-group"><label for="diet-duracao">Dias</label><input id="diet-duracao" name="duracao_dias" class="saude-field" data-diet-duration type="number" min="1" max="31" required value="${escapeHtml(draft.duracao_dias)}"></div>
        <div class="saude-field-group saude-field-group--wide"><label for="diet-descricao">Descrição</label><textarea id="diet-descricao" name="descricao" class="saude-field" maxlength="2000" rows="2">${escapeHtml(draft.descricao)}</textarea></div>
        <div class="saude-field-group saude-field-group--wide"><label for="diet-orientacoes">Orientações gerais</label><textarea id="diet-orientacoes" name="orientacoes_gerais" class="saude-field" maxlength="12000" rows="5">${escapeHtml(draft.orientacoes_gerais)}</textarea></div>
        <div class="saude-field-group saude-field-group--wide"><label for="diet-ritual">Ritual diário ou orientações complementares</label><textarea id="diet-ritual" name="ritual_diario" class="saude-field" maxlength="12000" rows="5">${escapeHtml(draft.ritual_diario)}</textarea></div>
      </div>
      <div class="saude-diet-days" data-diet-days>${draft.dias.map((day, index) => renderDietDayEditor(day, index + 1)).join('')}</div>
      <div class="saude-field-group" style="margin-top:.8rem"><label for="diet-observacoes">Observações</label><textarea id="diet-observacoes" name="observacoes" class="saude-field" maxlength="4000" rows="2">${escapeHtml(draft.observacoes)}</textarea></div>
      <div class="saude-editor__actions">
        <button type="button" class="saude-btn" data-saude-action="cancel-diet-editor"${state.busy ? ' disabled' : ''}>Cancelar</button>
        <button type="submit" class="saude-btn saude-btn--primary"${state.busy ? ' disabled' : ''}>${state.busy ? '<i class="fas fa-spinner fa-spin"></i> Salvando' : '<i class="fas fa-check"></i> Salvar dieta'}</button>
      </div>
    </form>`;
}

function renderDietas(container, state) {
  const rows = state.diets || [];
  const content = rows.length ? `<div class="saude-diet-list">${rows.map((diet) => `
    <article class="saude-diet-row">
      <div>
        <h3>${escapeHtml(diet.titulo)}</h3>
        <p>${escapeHtml(diet.descricao || diet.objetivo)}</p>
        <div class="saude-diet-meta"><span>${escapeHtml(diet.objetivo)}</span><span>${escapeHtml(diet.duracao_dias)} dias</span></div>
      </div>
      <div class="saude-diet-row__actions">
        <button type="button" class="saude-btn saude-diet-open" data-saude-action="view-diet" data-saude-id="${escapeHtml(diet.id)}" aria-label="Abrir ${escapeHtml(diet.titulo)}"><i class="fas fa-eye"></i><span>Ver</span></button>
        <button type="button" class="saude-icon-btn" data-saude-action="edit-diet" data-saude-id="${escapeHtml(diet.id)}" aria-label="Editar ${escapeHtml(diet.titulo)}"><i class="fas fa-pencil"></i></button>
        <button type="button" class="saude-icon-btn saude-icon-btn--danger" data-saude-action="delete-diet" data-saude-id="${escapeHtml(diet.id)}" aria-label="Excluir ${escapeHtml(diet.titulo)}"><i class="fas fa-trash"></i></button>
      </div>
    </article>`).join('')}</div>` : '<div class="saude-empty"><i class="fas fa-bowl-food"></i>Nenhuma dieta cadastrada.</div>';

  renderShell(container, `<section class="saude-page" aria-labelledby="dietas-title">
    <div class="saude-page-toolbar">
      <div class="saude-page-header"><button type="button" class="saude-btn" data-saude-action="home" aria-label="Voltar"><i class="fas fa-arrow-left"></i></button><div><h2 id="dietas-title">Dietas</h2><p>Planos alimentares organizados por dia.</p></div></div>
      <button type="button" class="saude-btn saude-btn--primary saude-btn--insert" data-saude-action="add-diet"><i class="fas fa-plus"></i><span>Adicionar dieta</span></button>
    </div>
    ${state.notice ? `<div class="saude-notice${state.notice.type === 'error' ? ' saude-notice--error' : ''}" role="status">${escapeHtml(state.notice.text)}</div>` : ''}
    ${renderDietForm(state)}
    ${content}
  </section>`);
}

function renderDietDetail(container, state, diet) {
  renderShell(container, `<section class="saude-page" aria-labelledby="diet-detail-title">
    <div class="saude-page-toolbar"><div class="saude-page-header"><button type="button" class="saude-btn" data-saude-action="back-diets" aria-label="Voltar para dietas"><i class="fas fa-arrow-left"></i></button><div><h2 id="diet-detail-title">${escapeHtml(diet.titulo)}</h2><p>${escapeHtml(diet.objetivo)} · ${escapeHtml(diet.duracao_dias)} dias</p></div></div></div>
    <div class="saude-diet-detail__intro"><p>${escapeHtml(diet.descricao)}</p>
      ${diet.orientacoes_gerais ? `<div class="saude-diet-section"><h3>Orientações gerais</h3><p class="saude-diet-copy">${escapeHtml(diet.orientacoes_gerais)}</p></div>` : ''}
      ${diet.ritual_diario ? `<div class="saude-diet-section"><h3>Ritual diário</h3><p class="saude-diet-copy">${escapeHtml(diet.ritual_diario)}</p></div>` : ''}
    </div>
    <div class="saude-diet-days">${diet.dias.map((day, index) => `<details class="saude-diet-day"${index === 0 ? ' open' : ''}><summary>Dia ${escapeHtml(day.numero)} — ${escapeHtml(day.titulo)}</summary><div class="saude-diet-day__body"><div class="saude-diet-day__stats"><span>${escapeHtml(day.jejum_horas)}h de jejum</span><span>${escapeHtml(day.quantidade_refeicoes)} refeições</span></div>${day.carboidrato ? `<p class="saude-diet-copy"><strong>Carboidrato:</strong> ${escapeHtml(day.carboidrato)}</p>` : ''}<p class="saude-diet-copy" style="margin-top:.65rem">${escapeHtml(day.conteudo)}</p></div></details>`).join('')}</div>
    ${diet.observacoes ? `<div class="saude-diet-section"><h3>Observações</h3><p class="saude-diet-copy">${escapeHtml(diet.observacoes)}</p></div>` : ''}
  </section>`);
}

async function requestDiets(method, payload) {
  const response = await fetch('/api/saude?resource=dietas', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a operação.');
  return data;
}

async function loadDietas(container, state) {
  renderLoading(container, 'Carregando dietas...');
  try {
    const response = await fetch('/api/saude?resource=dietas', { cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'O endpoint de dietas não respondeu corretamente.');
    state.diets = Array.isArray(data.rows) ? data.rows : [];
    renderDietas(container, state);
  } catch (error) {
    renderError(container, error instanceof Error ? error.message : 'Não foi possível carregar as dietas.');
  }
}

function blankProfileDraft() {
  return { nome: '', sexo: '', data_nascimento: '', data_medicao: todayIsoDate(), peso_kg: '', altura_cm: '', cintura_cm: '', quadril_cm: '', peito_cm: '', braco_cm: '', coxa_cm: '' };
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
  return `<form class="saude-editor" data-saude-profile-form>
    <h3 class="saude-editor__title">${state.profileEditingId ? 'Atualizar perfil' : 'Criar perfil'}</h3>
    <div class="saude-profile-form__grid">
      <div class="saude-field-group"><label for="profile-nome">Nome</label><input id="profile-nome" name="nome" class="saude-field" required maxlength="120" autocomplete="off" value="${escapeHtml(draft.nome)}" placeholder="Ex.: André"></div>
      <div class="saude-field-group"><label for="profile-sexo">Sexo</label><select id="profile-sexo" name="sexo" class="saude-field" required><option value="">Selecione</option>${[['feminino', 'Feminino'], ['masculino', 'Masculino'], ['outro', 'Outro'], ['nao_informado', 'Prefere não informar']].map(([value, label]) => `<option value="${value}"${draft.sexo === value ? ' selected' : ''}>${label}</option>`).join('')}</select></div>
      <div class="saude-field-group"><label for="profile-data-nascimento">Data de nascimento</label><input id="profile-data-nascimento" name="data_nascimento" class="saude-field" type="date" min="1900-01-01" max="${new Date().toISOString().slice(0, 10)}" required value="${escapeHtml(draft.data_nascimento)}"></div>
      <div class="saude-field-group"><label for="profile-data-medicao">Data da medição</label><input id="profile-data-medicao" name="data_medicao" class="saude-field" type="date" required value="${escapeHtml(draft.data_medicao)}"></div>
      <p class="saude-profile-form__section">Dados para o IMC</p>
      ${numberField('peso_kg', 'Peso (kg)', 1, 500, true)}
      ${numberField('altura_cm', 'Altura (cm)', 30, 260, true)}
      <p class="saude-profile-form__section">Medidas opcionais (cm)</p>
      ${numberField('cintura_cm', 'Cintura', 10, 400)}
      ${numberField('quadril_cm', 'Quadril', 10, 400)}
      ${numberField('peito_cm', 'Peito', 10, 400)}
      ${numberField('braco_cm', 'Braço', 5, 200)}
      ${numberField('coxa_cm', 'Coxa', 5, 250)}
    </div>
    <div class="saude-editor__actions"><button type="button" class="saude-btn" data-saude-action="cancel-profile-editor"${state.busy ? ' disabled' : ''}>Cancelar</button><button type="submit" class="saude-btn saude-btn--primary"${state.busy ? ' disabled' : ''}>${state.busy ? '<i class="fas fa-spinner fa-spin"></i> Salvando' : '<i class="fas fa-check"></i> Salvar perfil'}</button></div>
  </form>`;
}

function renderMeasurementForm(state) {
  if (!state.measurementEditorOpen) return '';
  const draft = state.measurementDraft || {};
  const numberField = (name, label, min, max, required = false) => `<div class="saude-field-group"><label for="measurement-${name}">${label}</label><input id="measurement-${name}" name="${name}" class="saude-field" type="number" inputmode="decimal" step="0.1" min="${min}" max="${max}"${required ? ' required' : ''} value="${escapeHtml(draft[name])}"></div>`;
  return `<form class="saude-editor" data-saude-measurement-form>
    <h3 class="saude-editor__title">Editar medição salva</h3>
    <div class="saude-profile-form__grid">
      <div class="saude-field-group"><label for="measurement-data">Data da medição</label><input id="measurement-data" name="data_medicao" class="saude-field" type="date" required value="${escapeHtml(draft.data_medicao)}"></div>
      ${numberField('peso_kg', 'Peso (kg)', 1, 500, true)}
      ${numberField('altura_cm', 'Altura (cm)', 30, 260, true)}
      ${numberField('cintura_cm', 'Cintura (cm)', 10, 400)}
      ${numberField('quadril_cm', 'Quadril (cm)', 10, 400)}
      ${numberField('peito_cm', 'Peito (cm)', 10, 400)}
      ${numberField('braco_cm', 'Braço (cm)', 5, 200)}
      ${numberField('coxa_cm', 'Coxa (cm)', 5, 250)}
    </div>
    <div class="saude-editor__actions"><button type="button" class="saude-btn" data-saude-action="cancel-measurement-editor"${state.busy ? ' disabled' : ''}>Cancelar</button><button type="submit" class="saude-btn saude-btn--primary"${state.busy ? ' disabled' : ''}>${state.busy ? '<i class="fas fa-spinner fa-spin"></i> Salvando' : '<i class="fas fa-check"></i> Salvar medição'}</button></div>
  </form>`;
}

function renderProfileTimeline(profile, state) {
  const history = Array.isArray(profile.historico) ? profile.historico : [];
  if (!history.length) return '';
  const optionalMeasures = [['cintura_cm', 'Cintura'], ['quadril_cm', 'Quadril'], ['peito_cm', 'Peito'], ['braco_cm', 'Braço'], ['coxa_cm', 'Coxa']];
  return `<details class="saude-profile-timeline"><summary>Linha do tempo · ${history.length} ${history.length === 1 ? 'registro' : 'registros'}</summary><div class="saude-timeline-list">${history.map((entry) => `<div class="saude-timeline-item"><time class="saude-timeline-date" datetime="${escapeHtml(entry.registrado_em)}">${escapeHtml(formatDateTime(entry.registrado_em))}</time><div class="saude-timeline-values"><span>${formatarNumeroSaude(entry.peso_kg)} kg</span><span>${formatarNumeroSaude(entry.altura_cm)} cm</span><span>IMC ${formatarNumeroSaude(entry.imc, 2)}</span>${optionalMeasures.filter(([field]) => entry[field] !== null && entry[field] !== undefined).map(([field, label]) => `<span>${label} ${formatarNumeroSaude(entry[field])} cm</span>`).join('')}</div><div><button type="button" class="saude-icon-btn" data-saude-action="edit-measurement" data-saude-profile-id="${escapeHtml(profile.id)}" data-saude-measurement-id="${escapeHtml(entry.id)}" aria-label="Editar medição de ${escapeHtml(formatDateTime(entry.registrado_em))}" title="Editar medição"${state.busy ? ' disabled' : ''}><i class="fas fa-pencil"></i></button><button type="button" class="saude-icon-btn saude-icon-btn--danger" data-saude-action="delete-measurement" data-saude-profile-id="${escapeHtml(profile.id)}" data-saude-measurement-id="${escapeHtml(entry.id)}" aria-label="Excluir medição de ${escapeHtml(formatDateTime(entry.registrado_em))}" title="Excluir medição"${state.busy ? ' disabled' : ''}><i class="fas fa-trash"></i></button></div></div>`).join('')}</div></details>`;
}

function renderProfiles(container, state) {
  const content = state.profiles.length ? `<div class="saude-profile-list">${state.profiles.map((profile) => {
    const age = profileAge(profile.data_nascimento);
    const imc = profile.imc ?? calcularImc(profile.peso_kg, profile.altura_cm);
    const classification = age !== null && age < 20 ? 'Referência varia por idade' : classificarImc(imc);
    return `<article class="saude-profile-card"><div class="saude-profile-card__header"><div class="saude-profile-card__identity"><span class="saude-profile-avatar"><i class="fas fa-user"></i></span><div><h3>${escapeHtml(profile.nome)}</h3><p class="saude-profile-card__subtitle">${escapeHtml(profileSexLabel(profile.sexo))}${age === null ? '' : ` · ${age} ${age === 1 ? 'ano' : 'anos'}`}</p></div></div><button type="button" class="saude-btn" data-saude-action="edit-profile" data-saude-id="${escapeHtml(profile.id)}"><i class="fas fa-pencil"></i> Editar</button></div><div class="saude-profile-summary"><div class="saude-profile-stat"><span>Peso</span><strong>${formatarNumeroSaude(profile.peso_kg)} kg</strong></div><div class="saude-profile-stat"><span>Altura</span><strong>${formatarNumeroSaude(profile.altura_cm)} cm</strong></div><div class="saude-profile-stat"><span>IMC</span><strong>${formatarNumeroSaude(imc, 2)}</strong></div><div class="saude-profile-stat"><span>Referência</span><strong>${escapeHtml(classification)}</strong></div></div>${renderProfileTimeline(profile, state)}</article>`;
  }).join('')}</div>` : '<div class="saude-empty"><i class="fas fa-user-group"></i>Nenhum perfil cadastrado. Crie o primeiro para começar a linha do tempo.</div>';
  renderShell(container, `<section class="saude-page" aria-labelledby="profiles-title"><div class="saude-page-toolbar"><div class="saude-page-header"><button type="button" class="saude-btn" data-saude-action="home" aria-label="Voltar"><i class="fas fa-arrow-left"></i></button><div><h2 id="profiles-title">Perfil</h2><p>Dados atuais e histórico de evolução da família.</p></div></div><button type="button" class="saude-btn saude-btn--primary saude-btn--insert" data-saude-action="add-profile"><i class="fas fa-plus"></i><span>Novo perfil</span></button></div>${state.notice ? `<div class="saude-notice${state.notice.type === 'error' ? ' saude-notice--error' : ''}" role="status">${escapeHtml(state.notice.text)}</div>` : ''}${renderProfileForm(state)}${renderMeasurementForm(state)}${content}</section>`);
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
  if (state.waterModal === 'profile') {
    const editingProfile = state.waterProfiles.find((profile) => String(profile.id) === String(state.waterProfileEditingId));
    return `<div class="saude-modal-backdrop" data-water-modal-backdrop role="presentation">
      <section class="saude-water-modal" role="dialog" aria-modal="true" aria-labelledby="water-profile-title">
        <div class="saude-water-modal__header"><div><h3 id="water-profile-title">${editingProfile ? 'Editar perfil' : 'Novo perfil'}</h3><p>${editingProfile ? 'Renomeie ou exclua este perfil de consumo.' : 'Crie um perfil para separar a meta e o histórico de cada pessoa.'}</p></div><button type="button" class="saude-icon-btn" data-saude-action="close-water-modal" aria-label="Fechar"><i class="fas fa-xmark"></i></button></div>
        <form data-water-profile-form>
          <div class="saude-field-group"><label for="water-profile-name">Nome da pessoa</label><input class="saude-field" id="water-profile-name" name="nome" maxlength="80" required placeholder="Ex.: André" value="${escapeHtml(state.waterProfileDraft.nome)}"></div>
          <div class="saude-editor__actions">${editingProfile ? '<button type="button" class="saude-btn saude-btn--danger" data-saude-action="delete-water-profile"><i class="fas fa-trash"></i> Excluir</button>' : ''}<button type="button" class="saude-btn" data-saude-action="close-water-modal">Cancelar</button><button type="submit" class="saude-btn saude-btn--primary"${state.busy ? ' disabled' : ''}><i class="fas fa-check"></i> ${editingProfile ? 'Salvar' : 'Criar perfil'}</button></div>
        </form>
      </section>
    </div>`;
  }
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
    return `<button type="button" class="saude-water-check" data-saude-action="toggle-water-dose" data-water-dose="${dose}" aria-pressed="${checked}" aria-label="Dose ${dose}: ${checked ? 'tomada' : 'pendente'}"${state.busy ? ' disabled' : ''}><i class="fas fa-check"></i></button>`;
  }).join('');
  const complete = state.waterToday.realizado_doses === state.waterToday.meta_doses;
  const activeProfile = state.waterProfiles.find((profile) => String(profile.id) === String(state.waterProfileId));
  const history = state.waterHistory.length
    ? `<div class="saude-table-wrap">${state.waterHistory.map((row) => `<div class="saude-water-log"><time datetime="${escapeHtml(row.data)}">${escapeHtml(formatWaterDate(row.data))}</time><span>Meta: <strong>${row.meta_doses}</strong></span><span>Realizado: <strong>${row.realizado_doses}</strong></span></div>`).join('')}</div>`
    : '<div class="saude-empty"><i class="fas fa-clock-rotate-left"></i><p>O primeiro registro aparecerá aqui após a virada do dia.</p></div>';
  return `<div class="saude-modal-backdrop" data-water-modal-backdrop role="presentation">
    <section class="saude-water-modal${complete ? ' is-complete' : ''}" role="dialog" aria-modal="true" aria-labelledby="water-tracker-title">
      <div class="saude-water-modal__header"><div><h3 id="water-tracker-title">${escapeHtml(activeProfile?.nome || state.waterConfig.nome)}</h3><p>${escapeHtml(state.waterConfig.nome)}</p><p data-water-modal-status>${complete ? 'Meta do dia concluída! 💧' : `${state.waterToday.realizado_doses} de ${state.waterToday.meta_doses} doses marcadas hoje`}</p></div><button type="button" class="saude-icon-btn" data-saude-action="close-water-modal" aria-label="Fechar"><i class="fas fa-xmark"></i></button></div>
      <div class="saude-water-checks">${checks}</div>
      <div class="saude-water-modal__goal-actions"><button type="button" class="saude-btn" data-saude-action="edit-water-goal"><i class="fas fa-pencil"></i> Editar meta</button></div>
      <section class="saude-water-history" aria-labelledby="water-history-title"><h3 id="water-history-title">Histórico diário</h3>${history}</section>
    </section>
  </div>`;
}

function syncWaterTrackerDom(container, state) {
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
    if (completed) {
      const modal = container.querySelector('.saude-water-modal');
      if (modal) motion.animate(modal, { scale: [1, 1.015, 1] }, { duration: .5, easing: 'ease-out' });
    }
  } catch (_error) {
    // O CSS mantem um feedback simples se Motion nao estiver disponivel.
  }
}

function showWaterCelebration(container, state) {
  container.querySelector('[data-water-celebration]')?.remove();
  if (state.waterCelebrationTimer) clearTimeout(state.waterCelebrationTimer);

  const layer = document.createElement('div');
  layer.className = 'saude-water-celebration-layer';
  layer.dataset.waterCelebration = '';
  layer.setAttribute('aria-live', 'polite');

  const message = document.createElement('div');
  message.className = 'saude-water-celebration';
  message.setAttribute('role', 'status');
  const icon = document.createElement('span');
  icon.className = 'saude-water-celebration__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.innerHTML = '<i class="fas fa-trophy"></i>';
  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = 'Meta concluída!';
  const description = document.createElement('p');
  description.textContent = `Você completou ${state.waterToday.meta_doses} doses de água hoje.`;
  copy.append(title, description);
  message.append(icon, copy);
  layer.appendChild(message);
  container.appendChild(layer);

  const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const motion = globalThis.motion || globalThis.Motion;
  const colors = ['#38bdf8', '#67e8f9', '#95c11f', '#4aa455', '#ffffff'];
  if (!reduceMotion) {
    Array.from({ length: 30 }, (_, index) => {
      const confetti = document.createElement('span');
      const start = 4 + ((index * 37) % 92);
      const drift = ((index * 53) % 180) - 90;
      const rotation = 180 + ((index * 71) % 540);
      confetti.className = 'saude-water-confetti';
      confetti.style.left = `${start}%`;
      confetti.style.background = colors[index % colors.length];
      confetti.style.setProperty('--confetti-x', `${drift}px`);
      confetti.style.setProperty('--confetti-rotate', `${index % 2 ? rotation : -rotation}deg`);
      confetti.style.animationDelay = `${(index % 8) * .045}s`;
      layer.appendChild(confetti);

      if (typeof motion?.animate === 'function') {
        confetti.style.animation = 'none';
        motion.animate(confetti, {
          opacity: [0, 1, 1, 0],
          x: [0, drift * .35, drift],
          y: [-20, 90 + (index % 5) * 18, globalThis.innerHeight * .72],
          rotate: [0, index % 2 ? rotation : -rotation],
          scale: [.6, 1, .75],
        }, { duration: 1.45 + (index % 6) * .08, delay: (index % 8) * .04, easing: 'ease-out' });
      }
    });
  }

  if (!reduceMotion && typeof motion?.animate === 'function') {
    motion.animate(message, { opacity: [0, 1], y: [-18, 0], scale: [.94, 1] }, { duration: .38, easing: 'ease-out' });
    motion.animate(icon, { rotate: [-12, 10, 0], scale: [.7, 1.18, 1] }, { duration: .55, easing: 'ease-out' });
  }

  state.waterCelebrationTimer = setTimeout(() => {
    const finish = typeof motion?.animate === 'function' && !reduceMotion
      ? motion.animate(message, { opacity: [1, 0], y: [0, -12], scale: [1, .97] }, { duration: .25, easing: 'ease-in' })
      : null;
    Promise.resolve(finish?.finished).catch(() => {}).finally(() => layer.remove());
    state.waterCelebrationTimer = null;
  }, reduceMotion ? 1800 : 2500);
}

function renderWater(container, state) {
  const notice = state.notice ? `<div class="saude-notice${state.notice.type === 'error' ? ' saude-notice--error' : ''}" role="status">${escapeHtml(state.notice.text)}</div>` : '';
  const profiles = state.waterProfiles.length
    ? `<div class="saude-water-profiles" aria-label="Perfis de consumo de água">${state.waterProfiles.map((profile) => `<article class="saude-water-profile-wrap"><button type="button" class="saude-water-profile" data-saude-action="open-water-profile" data-water-profile-id="${escapeHtml(profile.id)}" aria-label="Abrir perfil ${escapeHtml(profile.nome)}"><span class="saude-water-profile__avatar"><i class="fas fa-user"></i></span><span class="saude-water-profile__name">${escapeHtml(profile.nome)}</span><span class="saude-water-profile__open-label">Abrir</span></button><button type="button" class="saude-water-profile__edit" data-saude-action="edit-water-profile" data-water-profile-id="${escapeHtml(profile.id)}" aria-label="Editar perfil ${escapeHtml(profile.nome)}"><i class="fas fa-pencil"></i></button></article>`).join('')}</div>`
    : '';
  const content = state.waterProfiles.length
    ? profiles
    : `<div class="saude-empty"><i class="fas fa-users"></i><p>Crie o primeiro perfil para começar a acompanhar o consumo de água.</p><button type="button" class="saude-btn saude-btn--primary" data-saude-action="create-water-profile">Criar perfil</button></div>`;
  const page = `<section class="saude-page" aria-labelledby="water-title">
    <div class="saude-page-toolbar"><div class="saude-page-header"><button type="button" class="saude-btn" data-saude-action="home" aria-label="Voltar"><i class="fas fa-arrow-left"></i></button><div><h2 id="water-title">Consumo de água</h2><p>Marque as doses tomadas durante o dia.</p></div></div><button type="button" class="saude-btn saude-btn--insert" data-saude-action="create-water-profile" aria-label="Novo perfil"><i class="fas fa-user-plus" aria-hidden="true"></i><span>Novo perfil</span></button></div>
    ${notice}${content}${renderWaterModal(state)}
  </section>`;
  const currentPage = container.querySelector('.saude-root > .saude-page');
  if (currentPage) currentPage.outerHTML = page;
  else renderShell(container, page);
}

async function requestWater(method, payload) {
  if (isLocalWaterStorageMode()) {
    if (method === 'GET') return loadLocalWater(undefined, undefined, payload?.profile_id);
    if (method === 'POST' && payload?.action === 'create-profile') return createLocalWaterProfile(payload);
    if (method === 'PATCH' && payload?.action === 'update-profile') return updateLocalWaterProfile(payload);
    if (method === 'DELETE' && payload?.action === 'delete-profile') return deleteLocalWaterProfile(payload);
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
  if (Array.isArray(data.profiles)) state.waterProfiles = data.profiles;
  if (Object.hasOwn(data, 'profile_id')) state.waterProfileId = data.profile_id || null;
  if (Object.hasOwn(data, 'config')) state.waterConfig = data.config || null;
  if (Object.hasOwn(data, 'today')) state.waterToday = data.today || null;
  if (Array.isArray(data.history)) state.waterHistory = data.history;
  if (data.today?.data) state.waterDate = data.today.data;
}

async function loadWater(container, state, silent = false) {
  if (!silent) renderLoading(container, 'Carregando consumo de água...');
  try {
    applyWaterData(state, await requestWater('GET', { profile_id: state.waterProfileId, preserve_profiles: silent }));
    renderWater(container, state);
  } catch (error) {
    renderError(container, error instanceof Error ? error.message : 'Não foi possível carregar o consumo de água.');
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
    profiles: [],
    profileEditorOpen: false,
    profileEditingId: null,
    profileDraft: blankProfileDraft(),
    measurementEditorOpen: false,
    measurementEditingId: null,
    measurementProfileId: null,
    measurementDraft: null,
    waterConfig: null,
    waterProfiles: [],
    waterProfileId: null,
    waterProfileDraft: { nome: '' },
    waterProfileEditingId: null,
    waterToday: null,
    waterHistory: [],
    waterDate: todayIsoDate(),
    waterModal: null,
    waterDraft: { nome: '', meta_doses: 8 },
    waterCelebrationTimer: null,
  };

  const onClick = async (event) => {
    if (event.target.matches('[data-water-modal-backdrop]') && state.waterModal) {
      state.waterModal = null;
      renderWater(container, state);
      return;
    }
    const actionElement = event.target.closest('[data-saude-action]');
    const action = actionElement?.dataset.saudeAction;
    if (action === 'home') {
      state.view = 'home';
      state.waterModal = null;
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
      state.view = 'dietas';
      await loadDietas(container, state);
      return;
    }
    if (action === 'open-profiles' || (action === 'retry' && state.view === 'profiles')) {
      state.view = 'profiles';
      await loadProfiles(container, state);
      return;
    }
    if (action === 'open-water' || (action === 'retry' && state.view === 'water')) {
      state.view = 'water';
      state.waterModal = null;
      state.notice = null;
      await loadWater(container, state);
      return;
    }
    if (action === 'create-water-goal' || action === 'edit-water-goal') {
      if (!state.waterProfileId) {
        state.waterModal = 'profile';
        state.waterProfileDraft = { nome: '' };
        renderWater(container, state);
        return;
      }
      state.waterModal = 'config';
      state.waterDraft = state.waterConfig
        ? { nome: state.waterConfig.nome, meta_doses: state.waterConfig.meta_doses }
        : { nome: '', meta_doses: 8 };
      state.notice = null;
      renderWater(container, state);
      requestAnimationFrame(() => container.querySelector('#water-name')?.focus());
      return;
    }
    if (action === 'create-water-profile') {
      state.waterModal = 'profile';
      state.waterProfileEditingId = null;
      state.waterProfileDraft = { nome: '' };
      state.notice = null;
      renderWater(container, state);
      requestAnimationFrame(() => container.querySelector('#water-profile-name')?.focus());
      return;
    }
    if (action === 'edit-water-profile') {
      const profile = state.waterProfiles.find((row) => String(row.id) === String(actionElement.dataset.waterProfileId));
      if (!profile) return;
      state.waterModal = 'profile';
      state.waterProfileEditingId = profile.id;
      state.waterProfileDraft = { nome: profile.nome };
      state.notice = null;
      renderWater(container, state);
      requestAnimationFrame(() => container.querySelector('#water-profile-name')?.focus());
      return;
    }
    if (action === 'delete-water-profile' && state.waterProfileEditingId && !state.busy) {
      const profile = state.waterProfiles.find((row) => String(row.id) === String(state.waterProfileEditingId));
      if (!profile || !globalThis.confirm(`Excluir o perfil "${profile.nome}" e todo o histórico de água dele?`)) return;
      state.busy = true;
      try {
        applyWaterData(state, await requestWater('DELETE', { action: 'delete-profile', profile_id: profile.id }));
        state.waterModal = null;
        state.waterProfileEditingId = null;
        state.notice = { type: 'success', text: 'Perfil excluído com sucesso.' };
      } catch (error) {
        state.notice = { type: 'error', text: error instanceof Error ? error.message : 'Não foi possível excluir o perfil.' };
      } finally {
        state.busy = false;
        renderWater(container, state);
      }
      return;
    }
    if ((action === 'open-water-profile' || action === 'select-water-profile') && !state.busy) {
      state.waterProfileId = actionElement.dataset.waterProfileId;
      state.waterModal = null;
      state.notice = null;
      state.busy = true;
      try {
        applyWaterData(state, await requestWater('GET', { profile_id: state.waterProfileId, preserve_profiles: true }));
        state.waterModal = state.waterConfig && state.waterToday ? 'tracker' : 'config';
      } catch (error) {
        state.notice = { type: 'error', text: error instanceof Error ? error.message : 'Não foi possível abrir este perfil.' };
      } finally {
        state.busy = false;
        renderWater(container, state);
      }
      return;
    }
    if (action === 'close-water-modal') {
      state.waterModal = null;
      renderWater(container, state);
      return;
    }
    if (action === 'toggle-water-dose' && !state.busy && state.waterToday) {
      const dose = Number(actionElement.dataset.waterDose);
      const isMarking = dose > state.waterToday.realizado_doses;
      const realizado_doses = isMarking ? dose : dose - 1;
      const previousRealizado = state.waterToday.realizado_doses;
      state.busy = true;
      const checkButtons = [...container.querySelectorAll('[data-saude-action="toggle-water-dose"]')];
      checkButtons.forEach((button) => { button.disabled = true; });
      state.waterToday = { ...state.waterToday, realizado_doses };
      syncWaterTrackerDom(container, state);
      if (isMarking) animateWaterDose(container, actionElement, false);
      try {
        applyWaterData(state, await requestWater('PATCH', { profile_id: state.waterProfileId, realizado_doses }));
        syncWaterTrackerDom(container, state);
        const completedNow = isMarking && realizado_doses === state.waterToday.meta_doses;
        if (completedNow) showWaterCelebration(container, state);
      } catch (error) {
        state.waterToday = { ...state.waterToday, realizado_doses: previousRealizado };
        syncWaterTrackerDom(container, state);
        state.notice = { type: 'error', text: error instanceof Error ? error.message : 'Não foi possível marcar a dose.' };
        state.busy = false;
        renderWater(container, state);
      } finally {
        state.busy = false;
        container.querySelectorAll('[data-saude-action="toggle-water-dose"]').forEach((button) => { button.disabled = false; });
      }
      return;
    }
    if (action === 'add-profile') {
      state.profileEditorOpen = true;
      state.profileEditingId = null;
      state.profileDraft = blankProfileDraft();
      state.notice = null;
      renderProfiles(container, state);
      requestAnimationFrame(() => container.querySelector('#profile-nome')?.focus());
      return;
    }
    if (action === 'cancel-profile-editor') {
      state.profileEditorOpen = false;
      state.profileEditingId = null;
      state.profileDraft = blankProfileDraft();
      renderProfiles(container, state);
      return;
    }
    if (action === 'edit-profile') {
      const profile = state.profiles.find((item) => Number(item.id) === Number(actionElement.dataset.saudeId));
      if (!profile) return;
      state.profileEditorOpen = true;
      state.profileEditingId = Number(profile.id);
      state.profileDraft = { ...blankProfileDraft(), ...profile };
      state.notice = null;
      renderProfiles(container, state);
      requestAnimationFrame(() => container.querySelector('#profile-nome')?.focus());
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
      renderProfiles(container, state);
      requestAnimationFrame(() => container.querySelector('#measurement-data')?.focus());
      return;
    }
    if (action === 'cancel-measurement-editor') {
      state.measurementEditorOpen = false;
      state.measurementEditingId = null;
      state.measurementProfileId = null;
      state.measurementDraft = null;
      renderProfiles(container, state);
      return;
    }
    if (action === 'delete-measurement') {
      const profileId = Number(actionElement.dataset.saudeProfileId);
      const measurementId = Number(actionElement.dataset.saudeMeasurementId);
      const profile = state.profiles.find((item) => Number(item.id) === profileId);
      const measurement = profile?.historico?.find((item) => Number(item.id) === measurementId);
      if (!profile || !measurement || !confirm(`Excluir a medição de ${formatDateTime(measurement.registrado_em)}? Esta ação não poderá ser desfeita.`)) return;
      state.busy = true;
      state.notice = null;
      renderProfiles(container, state);
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
      } catch (error) {
        state.notice = { type: 'error', text: error instanceof Error ? error.message : 'Não foi possível excluir a medição.' };
      } finally {
        state.busy = false;
        renderProfiles(container, state);
      }
      return;
    }
    if (action === 'back-diets') {
      state.view = 'dietas';
      renderDietas(container, state);
      return;
    }
    if (action === 'add-diet') {
      state.dietEditorOpen = true;
      state.dietEditingId = null;
      state.dietDraft = blankDietDraft();
      state.notice = null;
      renderDietas(container, state);
      requestAnimationFrame(() => container.querySelector('#diet-titulo')?.focus());
      return;
    }
    if (action === 'cancel-diet-editor') {
      state.dietEditorOpen = false;
      state.dietEditingId = null;
      renderDietas(container, state);
      return;
    }
    if (action === 'view-diet') {
      const diet = state.diets.find((item) => Number(item.id) === Number(actionElement.dataset.saudeId));
      if (diet) renderDietDetail(container, state, diet);
      return;
    }
    if (action === 'edit-diet') {
      const diet = state.diets.find((item) => Number(item.id) === Number(actionElement.dataset.saudeId));
      if (!diet) return;
      state.dietEditorOpen = true;
      state.dietEditingId = Number(diet.id);
      state.dietDraft = JSON.parse(JSON.stringify(diet));
      state.notice = null;
      renderDietas(container, state);
      requestAnimationFrame(() => container.querySelector('#diet-titulo')?.focus());
      return;
    }
    if (action === 'delete-diet') {
      const id = Number(actionElement.dataset.saudeId);
      const diet = state.diets.find((item) => Number(item.id) === id);
      if (!diet || !confirm(`Excluir a dieta "${diet.titulo}"?`)) return;
      try {
        await requestDiets('DELETE', { id });
        state.diets = state.diets.filter((item) => Number(item.id) !== id);
        state.notice = { type: 'success', text: 'Dieta excluída com sucesso.' };
      } catch (error) {
        state.notice = { type: 'error', text: error instanceof Error ? error.message : 'Não foi possível excluir a dieta.' };
      }
      renderDietas(container, state);
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
      if (!row || !confirm(`Excluir "${row.item}"?`)) return;
      state.busy = true;
      actionElement.disabled = true;
      try {
        await requestNutrition('DELETE', { id });
        state.rows = state.rows.filter((item) => Number(item.id) !== id);
        state.notice = { type: 'success', text: 'Item excluído com sucesso.' };
      } catch (error) {
        state.notice = { type: 'error', text: error instanceof Error ? error.message : 'Não foi possível excluir o item.' };
      } finally {
        state.busy = false;
        renderTabelaNutricional(container, state);
      }
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
    const waterProfileForm = event.target.closest('[data-water-profile-form]');
    if (waterProfileForm) {
      event.preventDefault();
      if (state.busy || !waterProfileForm.reportValidity()) return;
      const values = new FormData(waterProfileForm);
      state.waterProfileDraft = { nome: String(values.get('nome') || '').trim() };
      state.busy = true;
      state.notice = null;
      try {
        const editingId = state.waterProfileEditingId;
        applyWaterData(state, await requestWater(editingId ? 'PATCH' : 'POST', {
          action: editingId ? 'update-profile' : 'create-profile',
          ...(editingId ? { profile_id: editingId } : {}),
          ...state.waterProfileDraft,
        }));
        state.waterModal = null;
        state.waterProfileEditingId = null;
        state.notice = { type: 'success', text: editingId ? 'Perfil renomeado com sucesso.' : 'Perfil criado com sucesso.' };
      } catch (error) {
        state.notice = { type: 'error', text: error instanceof Error ? error.message : 'Não foi possível criar o perfil.' };
      } finally {
        state.busy = false;
        renderWater(container, state);
      }
      return;
    }

    const waterGoalForm = event.target.closest('[data-water-goal-form]');
    if (waterGoalForm) {
      event.preventDefault();
      if (state.busy || !waterGoalForm.reportValidity()) return;
      const values = new FormData(waterGoalForm);
      state.waterDraft = {
        profile_id: state.waterProfileId,
        nome: String(values.get('nome') || '').trim(),
        meta_doses: Number(values.get('meta_doses')),
      };
      state.busy = true;
      state.notice = null;
      renderWater(container, state);
      try {
        applyWaterData(state, await requestWater('POST', state.waterDraft));
        state.waterModal = 'tracker';
        state.notice = { type: 'success', text: 'Meta diária salva com sucesso.' };
      } catch (error) {
        state.notice = { type: 'error', text: error instanceof Error ? error.message : 'Não foi possível salvar a meta.' };
      } finally {
        state.busy = false;
        renderWater(container, state);
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
        peso_kg: decimal('peso_kg'), altura_cm: decimal('altura_cm'), cintura_cm: decimal('cintura_cm'), quadril_cm: decimal('quadril_cm'),
        peito_cm: decimal('peito_cm'), braco_cm: decimal('braco_cm'), coxa_cm: decimal('coxa_cm'),
      };
      state.busy = true;
      state.notice = null;
      renderProfiles(container, state);
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
        renderProfiles(container, state);
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
        data_medicao: String(values.get('data_medicao') || ''),
        peso_kg: decimal('peso_kg'),
        altura_cm: decimal('altura_cm'),
        cintura_cm: decimal('cintura_cm'),
        quadril_cm: decimal('quadril_cm'),
        peito_cm: decimal('peito_cm'),
        braco_cm: decimal('braco_cm'),
        coxa_cm: decimal('coxa_cm'),
      };
      state.busy = true;
      state.notice = null;
      renderProfiles(container, state);
      try {
        const editingId = state.profileEditingId;
        const result = await requestProfiles(editingId ? 'PATCH' : 'POST', { ...(editingId ? { id: editingId } : {}), ...state.profileDraft });
        state.profiles = editingId
          ? state.profiles.map((profile) => Number(profile.id) === editingId ? result.row : profile)
          : [...state.profiles, result.row];
        state.profileEditorOpen = false;
        state.profileEditingId = null;
        state.profileDraft = blankProfileDraft();
        state.notice = { type: 'success', text: editingId ? 'Perfil atualizado com sucesso.' : 'Perfil criado e primeiro registro salvo na linha do tempo.' };
      } catch (error) {
        state.notice = { type: 'error', text: error instanceof Error ? error.message : 'Não foi possível salvar o perfil.' };
      } finally {
        state.busy = false;
        renderProfiles(container, state);
      }
      return;
    }

    const dietForm = event.target.closest('[data-saude-diet-form]');
    if (dietForm) {
      event.preventDefault();
      if (state.busy || !dietForm.reportValidity()) return;
      const values = new FormData(dietForm);
      const duration = Math.min(31, Math.max(1, Number(values.get('duracao_dias')) || 1));
      const days = Array.from({ length: duration }, (_, index) => {
        const number = index + 1;
        return {
          numero: number,
          titulo: String(values.get(`dia_${number}_titulo`) || '').trim(),
          jejum_horas: Number(values.get(`dia_${number}_jejum`)),
          quantidade_refeicoes: Number(values.get(`dia_${number}_refeicoes`)),
          carboidrato: String(values.get(`dia_${number}_carboidrato`) || '').trim(),
          conteudo: String(values.get(`dia_${number}_conteudo`) || '').trim(),
        };
      });
      state.dietDraft = {
        titulo: String(values.get('titulo') || '').trim(),
        objetivo: String(values.get('objetivo') || '').trim(),
        duracao_dias: duration,
        descricao: String(values.get('descricao') || '').trim(),
        orientacoes_gerais: String(values.get('orientacoes_gerais') || '').trim(),
        ritual_diario: String(values.get('ritual_diario') || '').trim(),
        observacoes: String(values.get('observacoes') || '').trim(),
        dias: days,
      };
      state.busy = true;
      state.notice = null;
      renderDietas(container, state);
      try {
        const editingId = state.dietEditingId;
        const result = await requestDiets(editingId ? 'PATCH' : 'POST', { ...(editingId ? { id: editingId } : {}), ...state.dietDraft });
        state.diets = editingId
          ? state.diets.map((diet) => Number(diet.id) === editingId ? result.row : diet)
          : [result.row, ...state.diets];
        state.dietEditorOpen = false;
        state.dietEditingId = null;
        state.dietDraft = blankDietDraft();
        state.notice = { type: 'success', text: editingId ? 'Dieta atualizada com sucesso.' : 'Dieta adicionada com sucesso.' };
      } catch (error) {
        state.notice = { type: 'error', text: error instanceof Error ? error.message : 'Não foi possível salvar a dieta.' };
      } finally {
        state.busy = false;
        renderDietas(container, state);
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
    if (event.type === 'change' && event.target.matches('[data-diet-duration]')) {
      const form = event.target.closest('[data-saude-diet-form]');
      const daysContainer = form?.querySelector('[data-diet-days]');
      const duration = Math.min(31, Math.max(1, Number(event.target.value) || 1));
      event.target.value = duration;
      if (daysContainer) {
        while (daysContainer.children.length > duration) daysContainer.lastElementChild.remove();
        while (daysContainer.children.length < duration) {
          const number = daysContainer.children.length + 1;
          daysContainer.insertAdjacentHTML('beforeend', renderDietDayEditor(null, number));
        }
      }
      return;
    }
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
  const waterDayTimer = setInterval(() => {
    if (state.view === 'water' && state.waterDate !== todayIsoDate() && !state.busy) loadWater(container, state);
  }, 60000);
  container._cleanup = () => {
    clearInterval(waterDayTimer);
    if (state.waterCelebrationTimer) clearTimeout(state.waterCelebrationTimer);
    container.querySelector('[data-water-celebration]')?.remove();
    container.removeEventListener('click', onClick);
    container.removeEventListener('submit', onSubmit);
    container.removeEventListener('input', onFilter);
    container.removeEventListener('change', onFilter);
  };

  renderLoading(container);
  try {
    const response = await fetch('/api/saude', { cache: 'no-store' });
    if (!response.ok) throw new Error('O endpoint de Saúde não respondeu corretamente.');
    renderHome(container);
  } catch (error) {
    renderError(container, error instanceof Error ? error.message : 'Não foi possível abrir Saúde.');
  }
}
