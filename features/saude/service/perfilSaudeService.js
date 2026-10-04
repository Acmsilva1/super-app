export function calcularImc(pesoKg, alturaCm) {
  const peso = Number(pesoKg);
  const altura = Number(alturaCm);
  if (!Number.isFinite(peso) || !Number.isFinite(altura) || peso <= 0 || altura <= 0) return null;
  return Number((peso / ((altura / 100) ** 2)).toFixed(2));
}

export function classificarImc(imc) {
  const valor = Number(imc);
  if (!Number.isFinite(valor) || valor <= 0) return '';
  if (valor < 18.5) return 'Baixo peso';
  if (valor < 25) return 'Peso adequado';
  if (valor < 30) return 'Sobrepeso';
  if (valor < 35) return 'Obesidade grau I';
  if (valor < 40) return 'Obesidade grau II';
  return 'Obesidade grau III';
}

export function formatarNumeroSaude(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function calcularLarguraGraficoPeso(historyLength, { mobile = false } = {}) {
  const count = Math.max(1, Number(historyLength) || 0);
  const spacing = mobile ? 64 : 112;
  const minWidth = mobile ? 240 : 560;
  return Math.max(minWidth, 56 + (count - 1) * spacing);
}

function normalizarPadding(padding) {
  if (padding && typeof padding === 'object') {
    const valor = (key) => (Number.isFinite(Number(padding[key])) ? Number(padding[key]) : 28);
    return { top: valor('top'), right: valor('right'), bottom: valor('bottom'), left: valor('left') };
  }
  const uniforme = Number.isFinite(Number(padding)) ? Number(padding) : 28;
  return { top: uniforme, right: uniforme, bottom: uniforme, left: uniforme };
}

export function criarTendenciaPeso(historico, width = 640, height = 180, padding = 28) {
  const registros = (Array.isArray(historico) ? historico : [])
    .map((item) => ({ ...item, peso_kg: Number(item?.peso_kg), timestamp: new Date(item?.registrado_em).getTime() }))
    .filter((item) => Number.isFinite(item.peso_kg) && Number.isFinite(item.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
  if (!registros.length) return { registros: [], pontos: [], polyline: '', variacao: null };

  const pad = normalizarPadding(padding);
  const pesos = registros.map((item) => item.peso_kg);
  const min = Math.min(...pesos);
  const max = Math.max(...pesos);
  const intervalo = max - min;
  const larguraUtil = width - pad.left - pad.right;
  const alturaUtil = height - pad.top - pad.bottom;
  const pontos = registros.map((item, index) => ({
    ...item,
    x: registros.length === 1 ? pad.left + (larguraUtil / 2) : pad.left + ((index / (registros.length - 1)) * larguraUtil),
    y: intervalo === 0 ? pad.top + (alturaUtil / 2) : pad.top + (((max - item.peso_kg) / intervalo) * alturaUtil),
  }));
  return {
    registros,
    pontos,
    polyline: pontos.map((ponto) => `${ponto.x.toFixed(1)},${ponto.y.toFixed(1)}`).join(' '),
    variacao: Number((registros.at(-1).peso_kg - registros[0].peso_kg).toFixed(1)),
  };
}

/** Curva cúbica monotônica (Fritsch–Carlson): suaviza sem criar picos inexistentes nos dados. */
export function criarCurvaSuave(pontos) {
  const lista = (Array.isArray(pontos) ? pontos : []).filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y));
  if (!lista.length) return '';
  const fmt = (n) => n.toFixed(1);
  if (lista.length === 1) return `M ${fmt(lista[0].x)} ${fmt(lista[0].y)}`;

  const n = lista.length;
  const dx = [];
  const inclinacoes = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx[i] = lista[i + 1].x - lista[i].x;
    inclinacoes[i] = dx[i] === 0 ? 0 : (lista[i + 1].y - lista[i].y) / dx[i];
  }
  const tangentes = new Array(n);
  tangentes[0] = inclinacoes[0];
  tangentes[n - 1] = inclinacoes[n - 2];
  for (let i = 1; i < n - 1; i += 1) {
    tangentes[i] = inclinacoes[i - 1] * inclinacoes[i] <= 0 ? 0 : (inclinacoes[i - 1] + inclinacoes[i]) / 2;
  }
  for (let i = 0; i < n - 1; i += 1) {
    if (inclinacoes[i] === 0) {
      tangentes[i] = 0;
      tangentes[i + 1] = 0;
      continue;
    }
    const a = tangentes[i] / inclinacoes[i];
    const b = tangentes[i + 1] / inclinacoes[i];
    const soma = (a * a) + (b * b);
    if (soma > 9) {
      const t = 3 / Math.sqrt(soma);
      tangentes[i] = t * a * inclinacoes[i];
      tangentes[i + 1] = t * b * inclinacoes[i];
    }
  }

  let caminho = `M ${fmt(lista[0].x)} ${fmt(lista[0].y)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const terco = dx[i] / 3;
    const c1x = lista[i].x + terco;
    const c1y = lista[i].y + (tangentes[i] * terco);
    const c2x = lista[i + 1].x - terco;
    const c2y = lista[i + 1].y - (tangentes[i + 1] * terco);
    caminho += ` C ${fmt(c1x)} ${fmt(c1y)} ${fmt(c2x)} ${fmt(c2y)} ${fmt(lista[i + 1].x)} ${fmt(lista[i + 1].y)}`;
  }
  return caminho;
}
