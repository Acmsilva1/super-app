import {
  filtrarTabelaNutricional,
  opcoesTabelaNutricional,
  paginarTabelaNutricional,
} from './service/tabelaNutricionalService.js';
import { calcularImc, classificarImc, formatarNumeroSaude } from './service/perfilSaudeService.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function todayIsoDate() {
  const now = new Date();
  const localDate = new Date(now.getTime() - (now.getTimezoneOffset() * 60000));
  return localDate.toISOString().slice(0, 10);
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
  };

  const onClick = async (event) => {
    const actionElement = event.target.closest('[data-saude-action]');
    const action = actionElement?.dataset.saudeAction;
    if (action === 'home') {
      state.view = 'home';
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
  container._cleanup = () => {
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
