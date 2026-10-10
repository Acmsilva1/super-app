import { brazilMonth } from './service/simulador.js';

const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const money = value => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const label = value => Math.abs(value) >= 1000
  ? (value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil'
  : value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

export function monthTotals(data) {
  const tables = data.tabelas || {};
  const count = ['receitas', 'gastos_variados', 'despesas_fixas'].reduce((sum, key) => sum + (tables[key]?.length || 0), 0);
  const income = Number(data.dashboard?.receitas || 0);
  const fixed = Number(data.dashboard?.despesas_fixas || 0);
  const daily = Number(data.dashboard?.despesas_variadas || 0);
  if (![income, fixed, daily].every(Number.isFinite)) throw new Error('Totais inválidos');
  return { mes: data.mes_ano, receita: income, fixa: fixed, extrato: daily, despesa: Math.round((fixed + daily) * 100) / 100, hasData: count > 0 };
}

export async function renderFinanceTrend(host, { currentData, year, onYearChange } = {}) {
  if (!document.querySelector('link[data-finance-trend]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '/features/financeiro/tendencia.css'; link.dataset.financeTrend = 'true';
    document.head.append(link);
  }
  const [currentYear, currentMonth] = brazilMonth().split('-').map(Number);
  let selected = Number(year) || currentYear;
  let generation = 0;
  host.className = 'fin-trend';
  host.innerHTML = `<header class="fin-trend-header"><h3>Evolução financeira</h3><select aria-label="Ano do gráfico"></select></header>
    <div class="fin-trend-legend"><span><i></i>Receitas</span><span><i></i>Despesas totais</span></div>
    <div class="fin-trend-viewport" tabindex="0" aria-label="Gráfico anual; deslize para consultar todos os meses"></div>
    <div class="fin-trend-detail" role="status" aria-live="polite"></div><p class="fin-trend-note"></p>`;
  const select = host.querySelector('select'), view = host.querySelector('.fin-trend-viewport');
  const detail = host.querySelector('.fin-trend-detail'), note = host.querySelector('.fin-trend-note');
  const firstYear = Math.min(currentYear - 15, selected);
  for (let y = currentYear; y >= firstYear; y--) {
    const option = document.createElement('option'); option.value = y; option.textContent = y; select.append(option);
  }
  select.value = String(selected);

  async function load() {
    const ticket = ++generation;
    selected = Number(select.value);
    onYearChange?.(selected);
    view.replaceChildren(); detail.textContent = 'Carregando evolução financeira…'; note.textContent = '';
    const count = selected === currentYear ? currentMonth : 12;
    try {
      const rows = [];
      // Reutiliza a rota autenticada existente, com no máximo três consultas simultâneas.
      for (let start = 0; start < count; start += 3) {
        const batch = await Promise.all(Array.from({ length: Math.min(3, count - start) }, async (_, offset) => {
          const mes = `${selected}-${String(start + offset + 1).padStart(2, '0')}`;
          if (currentData?.mes_ano === mes) return monthTotals(currentData);
          const response = await fetch(`/api/financeiro?secao=data&mes_ano=${mes}`, { cache: 'no-store' });
          if (!response.ok) throw new Error('Consulta indisponível');
          const data = await response.json();
          if (data.mes_ano !== mes || !data.dashboard || !data.tabelas) throw new Error('Resposta inválida');
          return monthTotals(data);
        }));
        if (ticket !== generation || !host.isConnected) return;
        rows.push(...batch);
      }
      draw(rows);
    } catch {
      if (ticket !== generation || !host.isConnected) return;
      view.replaceChildren(); detail.textContent = 'Não foi possível carregar o gráfico. ';
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Tentar novamente';
      retry.addEventListener('click', load); detail.append(retry);
    }
  }

  function draw(rows) {
    if (!rows.some(row => row.hasData)) {
      detail.textContent = 'Nenhum registro financeiro neste ano.'; return;
    }
    const values = rows.filter(r => r.hasData).flatMap(r => [r.receita, r.despesa]);
    const min = Math.min(0, ...values), max = Math.max(1, ...values) * 1.15;
    const x = i => 38 + i * 64, y = value => 205 - (value - min) / (max - min) * 158;
    const path = key => {
      let connected = false;
      return rows.map((r, i) => {
        if (!r.hasData) { connected = false; return ''; }
        const result = `${connected ? 'L' : 'M'} ${x(i)} ${y(r[key])}`;
        connected = true; return result;
      }).join(' ');
    };
    view.innerHTML = `<svg viewBox="0 0 780 250" role="group" aria-label="Receitas e despesas mensais de ${selected}">
      ${[47, 126, 205].map(py => `<line class="fin-trend-grid" x1="24" y1="${py}" x2="760" y2="${py}"/>`).join('')}
      ${[['receita', '#95c11f', -14], ['despesa', '#7dd3fc', 21]].map(([key, color, offset]) =>
        `<path class="fin-trend-line" stroke="${color}" d="${path(key)}"/>` + rows.map((r, i) => !r.hasData ? '' :
          `<circle class="fin-trend-point" stroke="${color}" cx="${x(i)}" cy="${y(r[key])}" r="4.5"/><text class="fin-trend-label" x="${x(i)}" y="${y(r[key]) + offset}">${label(r[key])}</text>`).join('')).join('')}
      ${months.map((mes, i) => `<text class="fin-trend-date" x="${x(i)}" y="239">${mes}${selected === currentYear && i === currentMonth - 1 ? '*' : ''}</text>`).join('')}
      ${rows.map((r, i) => !r.hasData ? '' : `<rect data-month="${i}" x="${x(i) - 28}" y="20" width="56" height="220" fill="transparent" tabindex="0" role="button" aria-label="Valores de ${months[i]}"/>`).join('')}</svg>`;
    const show = index => {
      const r = rows[index];
      detail.textContent = `${months[index]}: receita ${money(r.receita)} · despesas ${money(r.despesa)} · sobra ${money(r.receita - r.despesa)}`;
    };
    view.querySelectorAll('[data-month]').forEach(node => {
      node.addEventListener('click', () => show(Number(node.dataset.month)));
      node.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); show(Number(node.dataset.month)); }
      });
    });
    detail.textContent = 'Toque em um mês para ver os valores.';
    note.textContent = 'Despesas = fixas + extrato diário. Meses sem registros ficam sem pontos.' +
      (selected === currentYear ? ' Mês atual parcial (*).' : '');
  }
  select.addEventListener('change', load);
  await load();
}
