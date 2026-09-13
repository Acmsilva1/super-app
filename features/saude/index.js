import {
  filtrarTabelaNutricional,
  opcoesTabelaNutricional,
  paginarTabelaNutricional,
} from './service/tabelaNutricionalService.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

const SAUDE_STYLES = `
  <style>
    .saude-root {
      --saude-verde: #327746;
      --saude-lima: #95c11f;
      --saude-musgo: #20463c;
      --saude-grama: #4aa455;
      --saude-frame: #d1d3d4;
      --saude-superficie: #f3f7f3;
      --saude-texto: #20463c;
      --saude-texto-secundario: #4b6e61;
      min-height: 100%;
      padding: clamp(1rem, 3vw, 2rem);
      background: linear-gradient(160deg, #f7faf7 0%, #edf5ee 100%);
      color: var(--saude-texto);
      font-family: Montserrat, Arial, sans-serif;
    }
    .saude-loading { min-height: 18rem; display: grid; place-content: center; gap: .75rem; text-align: center; color: var(--saude-texto-secundario); }
    .saude-loading i { color: var(--saude-verde); font-size: 2rem; }
    .saude-hero { display: flex; align-items: center; gap: 1rem; margin: 0 auto 1.5rem; max-width: 76rem; }
    .saude-hero__image { width: 4.5rem; height: 4.5rem; flex: 0 0 auto; border-radius: 1.1rem; object-fit: cover; box-shadow: 0 10px 24px rgba(32, 70, 60, .18); }
    .saude-hero h1 { margin: 0; font-family: "Darker Grotesque", Montserrat, Arial, sans-serif; font-size: clamp(1.8rem, 5vw, 2.5rem); line-height: 1; }
    .saude-hero p { margin: .35rem 0 0; color: var(--saude-texto-secundario); }
    .saude-page { max-width: 76rem; margin: 0 auto; }
    .saude-app-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr)); gap: 1rem; }
    .saude-access-card { min-height: 12rem; padding: 1.35rem; border: 1px solid rgba(50, 119, 70, .18); border-radius: 1.25rem; background: #fff; color: var(--saude-texto); text-align: left; cursor: pointer; box-shadow: 0 12px 30px rgba(32, 70, 60, .08); transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
    .saude-access-card:hover { transform: translateY(-3px); border-color: var(--saude-grama); box-shadow: 0 16px 34px rgba(32, 70, 60, .14); }
    .saude-access-card:focus-visible, .saude-btn:focus-visible, .saude-field:focus-visible { outline: 3px solid rgba(149, 193, 31, .45); outline-offset: 2px; }
    .saude-access-card__icon { width: 3.4rem; height: 3.4rem; display: grid; place-items: center; margin-bottom: 1.2rem; border-radius: 1rem; background: var(--saude-musgo); color: #fff; font-size: 1.4rem; }
    .saude-access-card h2 { margin: 0 0 .5rem; font-size: 1.15rem; }
    .saude-access-card p { margin: 0; color: var(--saude-texto-secundario); line-height: 1.55; }
    .saude-access-card__action { display: inline-flex; align-items: center; gap: .45rem; margin-top: 1.1rem; color: var(--saude-verde); font-size: .85rem; font-weight: 700; }
    .saude-page-header { display: flex; align-items: center; gap: .85rem; margin-bottom: 1.25rem; }
    .saude-page-header h2 { margin: 0; font-family: "Darker Grotesque", Montserrat, Arial, sans-serif; font-size: clamp(1.55rem, 4vw, 2rem); }
    .saude-page-header p { margin: .2rem 0 0; color: var(--saude-texto-secundario); font-size: .9rem; }
    .saude-btn { min-height: 2.65rem; display: inline-flex; align-items: center; justify-content: center; gap: .45rem; padding: .65rem .9rem; border: 1px solid rgba(50, 119, 70, .25); border-radius: .75rem; background: #fff; color: var(--saude-musgo); font: inherit; font-size: .85rem; font-weight: 700; cursor: pointer; }
    .saude-btn:hover:not(:disabled) { background: var(--saude-superficie); border-color: var(--saude-verde); }
    .saude-btn:disabled { cursor: not-allowed; opacity: .45; }
    .saude-filters { display: grid; grid-template-columns: minmax(14rem, 2fr) repeat(2, minmax(10rem, 1fr)); gap: .85rem; margin-bottom: 1rem; padding: 1rem; border: 1px solid rgba(50, 119, 70, .14); border-radius: 1rem; background: #fff; }
    .saude-field-group { display: grid; gap: .35rem; }
    .saude-field-group label { color: var(--saude-texto-secundario); font-size: .76rem; font-weight: 700; }
    .saude-field { width: 100%; min-height: 2.65rem; padding: .65rem .75rem; border: 1px solid var(--saude-frame); border-radius: .7rem; background: #fff; color: var(--saude-texto); font: inherit; }
    .saude-results { margin: 0 0 .65rem; color: var(--saude-texto-secundario); font-size: .82rem; }
    .saude-table-wrap { overflow-x: auto; border: 1px solid rgba(50, 119, 70, .16); border-radius: 1rem; background: #fff; box-shadow: 0 10px 24px rgba(32, 70, 60, .06); }
    .saude-table { width: 100%; border-collapse: collapse; min-width: 52rem; }
    .saude-table th { padding: .85rem; background: var(--saude-musgo); color: #fff; text-align: center; font-size: .76rem; letter-spacing: .02em; }
    .saude-table td { padding: .85rem; border-bottom: 1px solid #e5ece6; color: var(--saude-texto); font-size: .85rem; line-height: 1.45; vertical-align: top; }
    .saude-table tbody tr:last-child td { border-bottom: 0; }
    .saude-table tbody tr:hover { background: var(--saude-superficie); }
    .saude-table td:first-child, .saude-table td:nth-child(2) { white-space: nowrap; }
    .saude-protocol { display: inline-flex; padding: .28rem .55rem; border-radius: 999px; background: rgba(149, 193, 31, .16); color: var(--saude-verde); font-size: .73rem; font-weight: 700; }
    .saude-pagination { display: flex; align-items: center; justify-content: space-between; gap: .75rem; margin-top: 1rem; }
    .saude-pagination__pages { display: flex; align-items: center; justify-content: center; gap: .35rem; flex-wrap: wrap; }
    .saude-pagination__page { min-width: 2.45rem; padding-inline: .55rem; }
    .saude-pagination__page[aria-current="page"] { border-color: var(--saude-verde); background: var(--saude-verde); color: #fff; }
    .saude-empty, .saude-error { padding: 2.5rem 1rem; border: 1px dashed rgba(50, 119, 70, .3); border-radius: 1rem; background: #fff; text-align: center; color: var(--saude-texto-secundario); }
    .saude-empty i, .saude-error i { display: block; margin-bottom: .75rem; color: var(--saude-verde); font-size: 1.8rem; }
    .saude-error i { color: #c32f26; }
    @media (max-width: 760px) {
      .saude-root { padding: 1rem; }
      .saude-hero__image { width: 3.75rem; height: 3.75rem; }
      .saude-filters { grid-template-columns: 1fr; }
      .saude-table-wrap { overflow: visible; border: 0; background: transparent; box-shadow: none; }
      .saude-table { min-width: 0; }
      .saude-table thead { display: none; }
      .saude-table, .saude-table tbody, .saude-table tr, .saude-table td { display: block; width: 100%; }
      .saude-table tbody { display: grid; gap: .75rem; }
      .saude-table tr { padding: .85rem; border: 1px solid rgba(50, 119, 70, .16); border-radius: .9rem; background: #fff; box-shadow: 0 8px 20px rgba(32, 70, 60, .06); }
      .saude-table td { display: grid; grid-template-columns: minmax(7rem, .7fr) 1.3fr; gap: .6rem; padding: .45rem 0; border: 0; white-space: normal !important; }
      .saude-table td::before { content: attr(data-label); color: var(--saude-texto-secundario); font-size: .72rem; font-weight: 700; }
      .saude-pagination { align-items: stretch; flex-wrap: wrap; }
      .saude-pagination > .saude-btn { flex: 1; }
      .saude-pagination__pages { order: -1; width: 100%; }
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
          <p>Consulte alimentos e porções equivalentes por categoria e protocolo.</p>
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
      <td data-label="Categoria" aria-label="Categoria: ${escapeHtml(row.categoria)}">${escapeHtml(row.categoria)}</td>
      <td data-label="Protocolo" aria-label="Protocolo: ${escapeHtml(row.protocolo)}"><span class="saude-protocol">${escapeHtml(row.protocolo)}</span></td>
      <td data-label="Item" aria-label="Item: ${escapeHtml(row.item)}"><strong>${escapeHtml(row.item)}</strong></td>
      <td data-label="Porção / Opções" aria-label="Porção ou opções: ${escapeHtml(row.porcao)}">${escapeHtml(row.porcao)}</td>
    </tr>
  `).join('');
}

function renderTabelaNutricional(container, state) {
  const filtered = filtrarTabelaNutricional(state.rows, state.filters);
  const pagination = paginarTabelaNutricional(filtered, state.page);
  state.page = pagination.currentPage;
  const options = opcoesTabelaNutricional(state.rows);

  const tableContent = pagination.totalItems
    ? `<div class="saude-table-wrap">
        <table class="saude-table">
          <thead><tr><th>Categoria</th><th>Protocolo</th><th>Item</th><th>Porção equivalente / Opções</th></tr></thead>
          <tbody>${renderTableRows(pagination.rows)}</tbody>
        </table>
      </div>`
    : `<div class="saude-empty"><i class="fas fa-magnifying-glass" aria-hidden="true"></i>Nenhum item encontrado com os filtros selecionados.</div>`;

  const pageButtons = paginationNumbers(pagination.currentPage, pagination.totalPages)
    .map((page) => `<button type="button" class="saude-btn saude-pagination__page" data-saude-page="${page}"${page === pagination.currentPage ? ' aria-current="page"' : ''}>${page}</button>`)
    .join('');

  renderShell(container, `
    <section class="saude-page" aria-labelledby="tabela-nutricional-title">
      <div class="saude-page-header">
        <button type="button" class="saude-btn" data-saude-action="home" aria-label="Voltar para o início de Saúde"><i class="fas fa-arrow-left" aria-hidden="true"></i></button>
        <div>
          <h2 id="tabela-nutricional-title">Tabela Nutricional</h2>
          <p>Dados fornecidos em tabelas nutricionais dieta.xlsx.</p>
        </div>
      </div>
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
        <div class="saude-field-group">
          <label for="saude-protocolo">Protocolo</label>
          <select id="saude-protocolo" class="saude-field" data-saude-filter="protocolo">
            <option value="">Todos</option>
            ${options.protocolos.map((value) => `<option value="${escapeHtml(value)}"${value === state.filters.protocolo ? ' selected' : ''}>${escapeHtml(value)}</option>`).join('')}
          </select>
        </div>
      </div>
      <p class="saude-results" aria-live="polite">${pagination.totalItems} ${pagination.totalItems === 1 ? 'item encontrado' : 'itens encontrados'}.</p>
      ${tableContent}
      ${pagination.totalItems ? `<nav class="saude-pagination" aria-label="Páginas da tabela nutricional">
        <button type="button" class="saude-btn" data-saude-page="${pagination.currentPage - 1}"${pagination.currentPage === 1 ? ' disabled' : ''}><i class="fas fa-chevron-left" aria-hidden="true"></i> Anterior</button>
        <div class="saude-pagination__pages">${pageButtons}</div>
        <button type="button" class="saude-btn" data-saude-page="${pagination.currentPage + 1}"${pagination.currentPage === pagination.totalPages ? ' disabled' : ''}>Próxima <i class="fas fa-chevron-right" aria-hidden="true"></i></button>
      </nav>` : ''}
    </section>
  `);
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
    rows: [],
    page: 1,
    filters: { busca: '', categoria: '', protocolo: '' },
  };

  const onClick = async (event) => {
    const action = event.target.closest('[data-saude-action]')?.dataset.saudeAction;
    if (action === 'home') {
      renderHome(container);
      return;
    }
    if (action === 'open-tabela-nutricional' || action === 'retry') {
      await loadTabelaNutricional(container, state);
      return;
    }

    const pageButton = event.target.closest('[data-saude-page]');
    if (pageButton && !pageButton.disabled) {
      state.page = Number(pageButton.dataset.saudePage) || 1;
      renderTabelaNutricional(container, state);
      container.scrollTo({ top: 0, behavior: 'smooth' });
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
  container.addEventListener('input', onFilter);
  container.addEventListener('change', onFilter);
  container._cleanup = () => {
    container.removeEventListener('click', onClick);
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
