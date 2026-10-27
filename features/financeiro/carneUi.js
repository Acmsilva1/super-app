import { CARRO_JULIANA_PARCELAS } from './data/carroJulianaParcelas.js';
import { formatLinhaDigitavel, onlyDigits, renderItfFromLinhaDigitavel } from './boletoFebraban.js';

const STORAGE_KEY = 'superapp_carne_pago_v1';
const PAGO_API = '/api/financeiro?recurso=carne-pago';
const PARCELAS_PAGE_SIZE = 10;
const CARNE_SYNC_IDS = new Set(['carro-juliana']);

/** Toast leve — import dinâmico para não quebrar a prévia estática (sem /lib público). */
async function notify(message) {
  try {
    const { showAppConfirmation } = await import('../../lib/uiConfirmation.js');
    showAppConfirmation(message);
  } catch {
    /* prévia local / offline sem lib */
  }
}

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const money = (value) => Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Carnês reais (PDF). Mock "Moto André" removido — ver seed de limpeza. */
const CARNES = [
  {
    id: 'carro-juliana',
    titulo: 'Carro Juliana',
    banco: 'Bradesco Financiamento',
    contrato: '0001 42.5.029738-4',
    fonte: 'pdf',
    parcelas: CARRO_JULIANA_PARCELAS.map((row) => ({
      ...row,
      linhaDigitavel: formatLinhaDigitavel(row.linhaDigitavel),
      fonte: 'pdf',
    })),
  },
];

function loadPagoMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') return {};
    // Limpa chaves do mock removido (Moto André).
    for (const key of Object.keys(parsed)) {
      if (key.startsWith('moto-andre:')) delete parsed[key];
    }
    return parsed;
  } catch {
    return {};
  }
}

function savePagoMap(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota / private mode */
  }
}

function pagoKey(carneId, numero) {
  return `${carneId}:${numero}`;
}

function ensureStyles() {
  if (document.querySelector('link[data-finance-carne]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/features/financeiro/carne.css';
  link.dataset.financeCarne = 'true';
  document.head.append(link);
}

function barcodeMarkup(linhaDigitavel, real) {
  try {
    const svg = renderItfFromLinhaDigitavel(linhaDigitavel, { height: 56, module: 1.15, quiet: 8 });
    const caption = real
      ? 'Código de barras ITF (Febraban) · gerado da linha digitável'
      : 'Código ITF a partir de linha mock · não é boleto real';
    return `
      <div class="fin-carne-barcode" role="img" aria-label="${esc(caption)}">${svg}</div>
      <p class="fin-carne-barcode__caption">${esc(caption)}</p>`;
  } catch {
    return `<p class="fin-carne-barcode__caption">Não foi possível gerar o código de barras.</p>`;
  }
}

function confirmDialog(title, message, { confirmLabel = 'Confirmar', cancelLabel = 'Cancelar' } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'app-confirm-overlay';
    overlay.innerHTML = `
      <div class="app-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="carne-confirm-title" aria-describedby="carne-confirm-message">
        <h4 id="carne-confirm-title">${esc(title)}</h4>
        <p id="carne-confirm-message">${esc(message)}</p>
        <div class="app-confirm-actions">
          <button type="button" class="app-confirm-btn cancel">${esc(cancelLabel)}</button>
          <button type="button" class="app-confirm-btn confirm">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    const onKey = (e) => { if (e.key === 'Escape') cleanup(false); };
    const cleanup = (result) => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(result);
    };
    overlay.querySelector('.cancel').onclick = () => cleanup(false);
    overlay.querySelector('.confirm').onclick = () => cleanup(true);
    overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    overlay.querySelector('.cancel').focus();
  });
}

export async function renderCarne(host) {
  ensureStyles();
  host.className = 'fin-carne';
  const pagoMap = loadPagoMap();
  let view = { name: 'list' };
  let carne = null;
  let parcela = null;
  let parcelasPage = 1;

  const countPago = (item) => item.parcelas.reduce(
    (sum, row) => sum + (pagoMap[pagoKey(item.id, row.numero)] ? 1 : 0),
    0,
  );

  const isPago = (carneId, numero) => Boolean(pagoMap[pagoKey(carneId, numero)]);

  async function persistPago(carneId, numero, value) {
    if (!CARNE_SYNC_IDS.has(carneId)) return;
    try {
      await fetch(PAGO_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carne_id: carneId, parcela_numero: numero, pago: Boolean(value) }),
        cache: 'no-store',
      });
    } catch {
      /* offline / prévia: localStorage já salvou */
    }
  }

  function setPago(carneId, numero, value) {
    const key = pagoKey(carneId, numero);
    if (value) pagoMap[key] = true;
    else delete pagoMap[key];
    savePagoMap(pagoMap);
    void persistPago(carneId, numero, value);
  }

  async function hydratePagoFromServer() {
    try {
      const response = await fetch(PAGO_API, { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      for (const row of data.rows || []) {
        if (!CARNE_SYNC_IDS.has(row.carne_id)) continue;
        pagoMap[pagoKey(row.carne_id, row.parcela_numero)] = true;
      }
      savePagoMap(pagoMap);
    } catch {
      /* mantém cache local */
    }
  }

  async function copyLinha(text) {
    try {
      await navigator.clipboard.writeText(onlyDigits(text));
      await notify('Linha digitável copiada.');
    } catch {
      await notify('Não foi possível copiar. Selecione o texto manualmente.');
    }
  }

  function renderList() {
    host.innerHTML = `
      <ul class="fin-carne-cards" aria-label="Seus carnês">
        ${CARNES.map((item) => {
          const pagos = countPago(item);
          return `<li>
            <button type="button" class="fin-carne-card" data-open-carne="${esc(item.id)}">
              <span class="fin-carne-card__title">${esc(item.titulo)}</span>
              <span class="fin-carne-card__meta">${esc(item.banco)} · ${esc(item.contrato)}</span>
              <span class="fin-carne-card__stats">${item.parcelas.length} parcelas · <strong>${pagos} pagas</strong> · ${money(item.parcelas[0].valor)}</span>
            </button>
          </li>`;
        }).join('')}
      </ul>`;
  }

  function renderParcelas() {
    const pagos = countPago(carne);
    const total = carne.parcelas.length;
    const totalPages = Math.max(1, Math.ceil(total / PARCELAS_PAGE_SIZE));
    if (parcelasPage > totalPages) parcelasPage = totalPages;
    if (parcelasPage < 1) parcelasPage = 1;
    const start = (parcelasPage - 1) * PARCELAS_PAGE_SIZE;
    const pageRows = carne.parcelas.slice(start, start + PARCELAS_PAGE_SIZE);
    const from = total === 0 ? 0 : start + 1;
    const to = Math.min(start + pageRows.length, total);
    const progressPct = total ? Math.round((pagos / total) * 100) : 0;

    host.innerHTML = `
      <div class="fin-carne-subnav">
        <button type="button" class="fin-link-btn" data-carne-back>← Voltar aos carnês</button>
      </div>
      <div class="fin-carne-summary" aria-label="Resumo do carnê">
        <div class="fin-carne-summary__top">
          <div>
            <p class="fin-carne-summary__title">${esc(carne.titulo)}</p>
            <p class="fin-carne-summary__meta">${esc(carne.banco)} · ${esc(carne.contrato)}</p>
          </div>
          <p class="fin-carne-summary__count"><strong>${pagos}</strong>/${total} pagas</p>
        </div>
        <div class="fin-carne-summary__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progressPct}" aria-label="Progresso de pagamento">
          <span style="width:${progressPct}%"></span>
        </div>
      </div>
      <ul class="fin-carne-parcelas" aria-label="Parcelas do carnê">
        ${pageRows.map((row) => {
          const paid = isPago(carne.id, row.numero);
          return `<li>
            <button type="button" class="fin-carne-parcela" data-open-parcela="${row.numero}">
              <span class="fin-carne-parcela__main">
                <span class="fin-carne-parcela__title">Parcela ${row.numero}</span>
                <span class="fin-carne-parcela__meta">Vence ${esc(row.vencimento)}</span>
              </span>
              <span class="fin-carne-parcela__side">
                <span class="fin-carne-parcela__valor">${money(row.valor)}</span>
                <span class="fin-carne-badge ${paid ? '' : 'fin-carne-badge--pending'}">${paid ? 'PAGO' : 'Em aberto'}</span>
              </span>
              <span class="fin-carne-parcela__chevron" aria-hidden="true">›</span>
            </button>
          </li>`;
        }).join('')}
      </ul>
      <nav class="fin-carne-pager" aria-label="Paginação das parcelas">
        <button type="button" class="fin-btn fin-btn--ghost fin-carne-pager__btn" data-carne-page="prev"${parcelasPage <= 1 ? ' disabled' : ''}>Anterior</button>
        <p class="fin-carne-pager__status" aria-live="polite">${from}–${to} de ${total} · pág. ${parcelasPage}/${totalPages}</p>
        <button type="button" class="fin-btn fin-btn--ghost fin-carne-pager__btn" data-carne-page="next"${parcelasPage >= totalPages ? ' disabled' : ''}>Próxima</button>
      </nav>`;
  }

  function renderDetail() {
    const paid = isPago(carne.id, parcela.numero);
    const real = carne.fonte === 'pdf' || parcela.fonte === 'pdf';
    host.innerHTML = `
      <div class="fin-carne-detail">
        <div class="fin-carne-subnav">
          <button type="button" class="fin-link-btn" data-carne-back>← Voltar às parcelas</button>
        </div>
        <div class="fin-carne-detail__head">
          <div>
            <h3 class="fin-carne-detail__title">Parcela ${parcela.numero}</h3>
            <p class="fin-carne-detail__meta">${esc(carne.titulo)} · vence ${esc(parcela.vencimento)} · ${money(parcela.valor)}</p>
          </div>
          <div class="fin-carne-seal" ${paid ? '' : 'hidden'} aria-label="Parcela paga">PAGO</div>
        </div>
        <label class="fin-carne-pago-row">
          <input type="checkbox" data-carne-pago ${paid ? 'checked' : ''}>
          Marcar como pago
        </label>
        <div class="fin-carne-paybox" data-carne-paybox ${paid ? 'hidden' : ''} aria-disabled="${paid ? 'true' : 'false'}">
          <div class="fin-carne-linha" aria-disabled="${paid ? 'true' : 'false'}">
            <span class="fin-carne-linha__label">${real ? 'Linha digitável' : 'Linha digitável (mock)'}</span>
            <p class="fin-carne-linha__code" data-linha>${esc(parcela.linhaDigitavel)}</p>
            ${barcodeMarkup(parcela.linhaDigitavel, real)}
          </div>
          <div class="fin-carne-actions" style="margin-top:10px">
            <button type="button" class="fin-btn" data-carne-copy ${paid ? 'disabled' : ''}>Copiar linha digitável</button>
          </div>
        </div>
      </div>`;
  }

  function paint() {
    if (view.name === 'list') renderList();
    else if (view.name === 'parcelas') renderParcelas();
    else renderDetail();
  }

  host.onclick = async (event) => {
    const openCarne = event.target.closest('[data-open-carne]');
    if (openCarne) {
      carne = CARNES.find((item) => item.id === openCarne.dataset.openCarne) || null;
      if (!carne) return;
      parcelasPage = 1;
      view = { name: 'parcelas' };
      paint();
      return;
    }

    const pageBtn = event.target.closest('[data-carne-page]');
    if (pageBtn && carne && view.name === 'parcelas') {
      if (pageBtn.disabled) return;
      const dir = pageBtn.dataset.carnePage;
      if (dir === 'prev') parcelasPage -= 1;
      if (dir === 'next') parcelasPage += 1;
      paint();
      host.querySelector('.fin-carne-summary')?.scrollIntoView({ block: 'nearest' });
      return;
    }

    const openParcela = event.target.closest('[data-open-parcela]');
    if (openParcela && carne) {
      const numero = Number(openParcela.dataset.openParcela);
      parcela = carne.parcelas.find((row) => row.numero === numero) || null;
      if (!parcela) return;
      view = { name: 'detail' };
      paint();
      return;
    }

    if (event.target.closest('[data-carne-back]')) {
      if (view.name === 'detail') {
        view = { name: 'parcelas' };
        parcela = null;
      } else {
        view = { name: 'list' };
        carne = null;
        parcelasPage = 1;
      }
      paint();
      return;
    }

    if (event.target.closest('[data-carne-copy]') && carne && parcela) {
      if (isPago(carne.id, parcela.numero)) return;
      await copyLinha(parcela.linhaDigitavel);
    }
  };

  host.onchange = async (event) => {
    const input = event.target.closest('[data-carne-pago]');
    if (!input || !carne || !parcela) return;
    if (!input.checked) {
      const ok = await confirmDialog(
        'Desmarcar como pago?',
        'A linha digitável e o código de barras voltam a ficar disponíveis.',
        { confirmLabel: 'Desmarcar', cancelLabel: 'Manter pago' },
      );
      if (!ok) {
        input.checked = true;
        return;
      }
      setPago(carne.id, parcela.numero, false);
      await notify('Parcela reaberta.');
      paint();
      return;
    }
    setPago(carne.id, parcela.numero, true);
    await notify('Parcela marcada como paga.');
    paint();
  };

  void hydratePagoFromServer().then(() => paint());
  paint();
}
