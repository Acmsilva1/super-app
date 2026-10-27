/**
 * Conversão linha digitável (47) → código de barras (44) Febraban
 * e renderização Interleaved 2 of 5 (ITF) em SVG.
 */

const ITF_PATTERNS = {
  0: '00110',
  1: '10001',
  2: '01001',
  3: '11000',
  4: '00101',
  5: '10100',
  6: '01100',
  7: '00011',
  8: '10010',
  9: '01010',
};

/** Remove pontuação e espaços; retorna só dígitos. */
export function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * Formata 47 dígitos no padrão visual da linha digitável.
 * @param {string} digits47
 */
export function formatLinhaDigitavel(digits47) {
  const d = onlyDigits(digits47);
  if (d.length !== 47) return String(digits47 ?? '');
  return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d.slice(32, 33)} ${d.slice(33, 47)}`;
}

/**
 * Linha digitável (47 dígitos, com ou sem máscara) → código de barras (44 dígitos).
 * @param {string} linhaDigitavel
 * @returns {string}
 */
export function linhaDigitavelToCodigoBarras(linhaDigitavel) {
  const d = onlyDigits(linhaDigitavel);
  if (d.length !== 47) {
    throw new Error(`Linha digitável inválida: esperado 47 dígitos, veio ${d.length}`);
  }
  // banco(3) + moeda(1) + DV geral(1) + fator(4)+valor(10) + campo livre(25)
  // Campo livre = digitos livres dos campos 1–3 (sem os 3 DVs de campo).
  return (
    d.slice(0, 3)
    + d.slice(3, 4)
    + d.slice(32, 33)
    + d.slice(33, 47)
    + d.slice(4, 9)
    + d.slice(10, 20)
    + d.slice(21, 31)
  );
}

/**
 * Gera SVG ITF a partir dos 44 dígitos do código de barras.
 * @param {string} codigo44
 * @param {{ height?: number, module?: number, quiet?: number }} [opts]
 * @returns {string} markup SVG
 */
export function renderItfSvg(codigo44, opts = {}) {
  const digits = onlyDigits(codigo44);
  if (digits.length !== 44 || digits.length % 2 !== 0) {
    throw new Error(`Código de barras ITF inválido: esperado 44 dígitos, veio ${digits.length}`);
  }

  const module = Math.max(1, Number(opts.module) || 1.2);
  const height = Math.max(24, Number(opts.height) || 56);
  const quiet = Math.max(0, Number(opts.quiet) ?? 10) * module;
  const narrow = module;
  const wide = module * 2.5;

  /** @type {{ w: number, black: boolean }[]} */
  const bars = [];

  // Start: nBnBnB → narrow bar, narrow space, narrow bar, narrow space
  bars.push({ w: narrow, black: true });
  bars.push({ w: narrow, black: false });
  bars.push({ w: narrow, black: true });
  bars.push({ w: narrow, black: false });

  for (let i = 0; i < digits.length; i += 2) {
    const barsPat = ITF_PATTERNS[digits[i]];
    const spacesPat = ITF_PATTERNS[digits[i + 1]];
    for (let j = 0; j < 5; j += 1) {
      bars.push({ w: barsPat[j] === '1' ? wide : narrow, black: true });
      bars.push({ w: spacesPat[j] === '1' ? wide : narrow, black: false });
    }
  }

  // Stop: Wnn → wide bar, narrow space, narrow bar
  bars.push({ w: wide, black: true });
  bars.push({ w: narrow, black: false });
  bars.push({ w: narrow, black: true });

  const contentWidth = bars.reduce((sum, b) => sum + b.w, 0);
  const width = quiet * 2 + contentWidth;

  let x = quiet;
  const rects = [];
  for (const bar of bars) {
    if (bar.black) {
      rects.push(`<rect x="${x.toFixed(2)}" y="0" width="${bar.w.toFixed(2)}" height="${height}" fill="#000"/>`);
    }
    x += bar.w;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Código de barras do boleto" viewBox="0 0 ${width.toFixed(2)} ${height}" width="100%" height="${height}" preserveAspectRatio="xMidYMid meet">${rects.join('')}</svg>`;
}

/**
 * Atalho: linha digitável → SVG ITF.
 * @param {string} linhaDigitavel
 * @param {{ height?: number, module?: number, quiet?: number }} [opts]
 */
export function renderItfFromLinhaDigitavel(linhaDigitavel, opts) {
  return renderItfSvg(linhaDigitavelToCodigoBarras(linhaDigitavel), opts);
}
