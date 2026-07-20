const GREETING = 'Olá, tudo bem?';

export function getPrimeiroNome(fullName) {
  const first = String(fullName || '')
    .trim()
    .split(/\s+/)
    .find(Boolean);
  if (!first) return '';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

export function createBalaoDica({ tip, id = 'dica-automatica' }) {
  const wrap = document.createElement('span');
  wrap.id = id;
  wrap.className = 'dicas-robot-balao';
  wrap.setAttribute('role', 'note');
  const greeting = GREETING;
  wrap.innerHTML = `
    <svg viewBox="0 0 248 96" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <path d="M16 4 H196 Q216 4 216 22 V34 L244 28 L216 48 V74 Q216 92 196 92 H16 Q4 92 4 74 V22 Q4 4 16 4 Z"
        fill="#ffffff" stroke="#1f2937" stroke-width="3.2" stroke-linejoin="round" />
      <foreignObject x="12" y="10" width="194" height="72">
        <div xmlns="http://www.w3.org/1999/xhtml" class="dicas-robot-balao-text">
          <strong class="dicas-robot-balao-saudacao"></strong>
          <p class="dicas-robot-balao-dica"></p>
        </div>
      </foreignObject>
    </svg>
  `;
  wrap.querySelector('.dicas-robot-balao-saudacao').textContent = greeting;
  wrap.querySelector('.dicas-robot-balao-dica').textContent = String(tip || '');
  return wrap;
}

export function createMascoteDicas({ className = '', title = 'Robô assistente acenando', color = '#3b82f6' } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', title);
  svg.setAttribute('class', className);
  svg.style.color = color;
  svg.innerHTML = `
    <title>${title}</title>
    <ellipse cx="32" cy="58" rx="14" ry="2.8" fill="rgb(0 0 0 / 0.16)" />
    <line x1="32" y1="10.5" x2="32" y2="15.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
    <circle class="dicas-mascote-antena" cx="32" cy="8" r="2.7" fill="#fbbf24" />
    <rect x="10.5" y="23" width="5" height="10.5" rx="2.5" fill="currentColor" />
    <rect x="48.5" y="23" width="5" height="10.5" rx="2.5" fill="currentColor" />
    <rect x="14.5" y="14.5" width="35" height="27" rx="9.5" fill="currentColor" />
    <rect x="19" y="19" width="26" height="18" rx="7" fill="#ffffff" />
    <circle cx="23.6" cy="31.2" r="1.9" fill="#fca5a5" opacity="0.85" />
    <circle cx="40.4" cy="31.2" r="1.9" fill="#fca5a5" opacity="0.85" />
    <g class="dicas-mascote-eye">
      <circle cx="27.4" cy="27" r="2.9" fill="#1f2937" />
      <circle cx="28.4" cy="26" r="1" fill="#ffffff" />
    </g>
    <g class="dicas-mascote-eye">
      <circle cx="36.6" cy="27" r="2.9" fill="#1f2937" />
      <circle cx="37.6" cy="26" r="1" fill="#ffffff" />
    </g>
    <path d="M27.4 31.6 Q32 35.4 36.6 31.6" fill="none" stroke="#1f2937" stroke-width="1.9" stroke-linecap="round" />
    <rect x="22" y="41" width="20" height="13" rx="5.5" fill="currentColor" />
    <rect x="27.5" y="44.2" width="9" height="6" rx="3" fill="#ffffff" opacity="0.85" />
    <path d="M22.5 44.5 Q17.5 47.5 17.5 52" fill="none" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" />
    <g class="dicas-mascote-arm">
      <path d="M41.5 44.5 Q47 42 49.5 36.5" fill="none" stroke="currentColor" stroke-width="4.2" stroke-linecap="round" />
      <circle cx="50.2" cy="34.8" r="3.2" fill="currentColor" />
    </g>
  `;
  return svg;
}
