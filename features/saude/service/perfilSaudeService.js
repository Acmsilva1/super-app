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

export function criarTendenciaPeso(historico, width = 640, height = 180, padding = 28) {
  const registros = (Array.isArray(historico) ? historico : [])
    .map((item) => ({ ...item, peso_kg: Number(item?.peso_kg), timestamp: new Date(item?.registrado_em).getTime() }))
    .filter((item) => Number.isFinite(item.peso_kg) && Number.isFinite(item.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
  if (!registros.length) return { registros: [], pontos: [], polyline: '', variacao: null };

  const pesos = registros.map((item) => item.peso_kg);
  const min = Math.min(...pesos);
  const max = Math.max(...pesos);
  const intervalo = max - min;
  const pontos = registros.map((item, index) => ({
    ...item,
    x: registros.length === 1 ? width / 2 : padding + ((index / (registros.length - 1)) * (width - (padding * 2))),
    y: intervalo === 0 ? height / 2 : padding + (((max - item.peso_kg) / intervalo) * (height - (padding * 2))),
  }));
  return {
    registros,
    pontos,
    polyline: pontos.map((ponto) => `${ponto.x.toFixed(1)},${ponto.y.toFixed(1)}`).join(' '),
    variacao: Number((registros.at(-1).peso_kg - registros[0].peso_kg).toFixed(1)),
  };
}
