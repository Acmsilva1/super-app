const MESES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const PENDENCIA_RE = /^\[Pendência de ([^\]]+)\]\s*(.*)$/i;

/** @param {string} mesAno YYYY-MM */
export function formatMesNome(mesAno) {
  const s = String(mesAno || '');
  const m = s.match(/^(\d{4})-(\d{2})$/);
  if (!m) return s;
  return MESES_PT[Number(m[2]) - 1] || s;
}

/** @param {string} mesAno YYYY-MM */
export function getMesAnoProximo(mesAno, fallbackMesAno = '') {
  const parts = String(mesAno || '').split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  if (!y || !m || m < 1 || m > 12) return fallbackMesAno || '';
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function stripPendenciaMesPrefix(descricao) {
  const raw = String(descricao || '').trim();
  const m = raw.match(PENDENCIA_RE);
  return m ? String(m[2] || '').trim() : raw;
}

export function buildPendenciaMesDescricao(baseDescricao, origemMesAno) {
  const base = stripPendenciaMesPrefix(baseDescricao) || String(baseDescricao || '').trim() || 'Conta';
  return `[Pendência de ${formatMesNome(origemMesAno)}] ${base}`;
}

export function parsePendenciaMesDescricao(descricao) {
  const raw = String(descricao || '').trim();
  const m = raw.match(PENDENCIA_RE);
  if (!m) return { isPendencia: false, mesNome: '', titulo: raw };
  return {
    isPendencia: true,
    mesNome: String(m[1] || '').trim(),
    titulo: String(m[2] || '').trim() || raw,
  };
}
