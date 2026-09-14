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
