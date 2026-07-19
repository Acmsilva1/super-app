# Robô de dicas — especificação portátil

Documento autossuficiente. Um agente (ou desenvolvedor) deve conseguir recriar o assistente flutuante **somente com o conteúdo deste arquivo**, sem depender de outros repositórios.

---

## Objetivo do produto

Assistente visual fixo no canto inferior direito da tela:

1. **Mascote SVG** (robô) com animações leves (flutuar, acenar, piscar, antena).
2. **Balão de fala estilo quadrinhos** (SVG, fundo branco, rabinho) que mostra, sozinho, dicas em ciclo.
3. **Clique no robô** abre um painel/modal com as dicas para consulta manual (fallback).
4. Saudação breve no balão usando **apenas o primeiro nome** do usuário (quando houver).

---

## Regras de comportamento (obrigatórias)

### Ciclo do balão automático

- Balão **visível por 20_000 ms**.
- Depois **oculto por 20_000 ms**.
- Em seguida mostra outra dica e o ciclo se repete.
- Entrada: lista `messages: string[]` (não vazias).
- Sorteio aleatório entre as mensagens.
- Se houver **mais de uma** mensagem, **não repetir imediatamente** a última exibida.
- Se houver **apenas uma**, pode repetir.
- Se a lista estiver vazia ou o componente desabilitado: **sem balão**.

### Modal / painel

- Clique no robô: esconde o balão, cancela timers e abre o painel.
- Enquanto o painel estiver aberto: **sem balão automático**.
- Ao fechar o painel: aguardar **20_000 ms** oculto e só então retomar o ciclo.
- Dentro do painel: botão “Outra dica” percorre as mensagens (sequencial ou circular).

### Contexto e limpeza

- Se a lista de mensagens **mudar de conteúdo** (outro filtro, outra tela, novos dados): reiniciar o ciclo com a nova lista.
- Se a lista for **igual em conteúdo** após um refresh: **não** reiniciar o timer (evita flicker).
- No unmount: limpar todos os `setTimeout`.
- Respeitar `prefers-reduced-motion: reduce` (desligar loops de animação).

### Privacidade

- Saudação usa só o **primeiro token** do nome completo.
- Exemplos: `"André Silva"` → `"Olá, André!"`; sem nome → `"Olá!"` / `"Ei!"` / `"Oi!"`.
- Não enviar o nome do usuário para APIs só por causa do balão; o nome fica no client.

### Temas / tokens

- Cor do robô via `currentColor` (aplicar `color` ou classe de tema no SVG).
- Placa “DICAS” usa `--primary` e `--primary-foreground` em HSL sem `hsl()` wrapper, no estilo:
  - `--primary: 217 91% 60%;`
  - `--primary-foreground: 0 0% 100%;`
- Se o projeto não tiver esses tokens, definir no `:root` ou trocar por cores fixas.

---

## Stack mínima

- React 18+ (hooks: `useState`, `useEffect`, `useRef`, `useCallback`, `useMemo`).
- `react-dom` (`createPortal`) para o dock fixo no `document.body`.
- CSS global (sem dependência de Tailwind obrigatória no núcleo visual).
- JavaScript (sem TypeScript obrigatório).

---

## Arquivos a criar

```text
MascoteDicas.jsx   # SVG do robô + SVG do balão
TipRobot.jsx       # dock, ciclo 20/20, painel no clique
robo.css           # estilos e animações
```

Importar `robo.css` no bootstrap do app. Montar:

```jsx
<TipRobot
  enabled
  userName={nomeCompletoDoUsuario}
  messages={listaDeFalas}
  label="DICAS"
/>
```

`messages` pode vir de API, store ou constante — este documento não define backend.

---

## Arquivo 1 — `MascoteDicas.jsx`

```jsx
import { useMemo } from 'react'

const GREETINGS_WITH_NAME = ['Olá, {name}!', 'Ei, {name}!', 'Oi, {name}!']
const GREETINGS_WITHOUT_NAME = ['Olá!', 'Ei!', 'Oi!']

/** Extrai só o primeiro nome (mínimo necessário para saudação). */
export function getPrimeiroNome(fullName) {
  const first = String(fullName || '')
    .trim()
    .split(/\s+/)
    .find(Boolean)
  if (!first) return ''
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

function pickGreeting(userName) {
  const name = getPrimeiroNome(userName)
  const pool = name ? GREETINGS_WITH_NAME : GREETINGS_WITHOUT_NAME
  const template = pool[Math.floor(Math.random() * pool.length)] ?? pool[0]
  return name ? template.replace('{name}', name) : template
}

/**
 * Balão de fala estilo quadrinhos (SVG): fundo branco, contorno e rabinho.
 * Texto dinâmico via foreignObject.
 */
export function BalaoDica({ children, className = '', id, userName = '' }) {
  const greeting = useMemo(() => pickGreeting(userName), [children, userName])

  return (
    <span id={id} className={`dicas-robot-balao ${className}`.trim()} role="note">
      <svg
        viewBox="0 0 240 132"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
      >
        <path
          d="M18 4
             H210
             Q232 4 232 26
             V78
             Q232 100 210 100
             H168
             L198 126
             L142 100
             H18
             Q4 100 4 78
             V26
             Q4 4 18 4
             Z"
          fill="#ffffff"
          stroke="#1f2937"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <foreignObject x="14" y="12" width="208" height="82">
          <div xmlns="http://www.w3.org/1999/xhtml" className="dicas-robot-balao-text">
            <strong className="dicas-robot-balao-saudacao">{greeting}</strong>
            <p className="dicas-robot-balao-dica">{children}</p>
          </div>
        </foreignObject>
      </svg>
    </span>
  )
}

/** Mascote SVG: robô acenando. Cor via currentColor (className ou style.color). */
export function MascoteDicas({
  className = '',
  title = 'Robô assistente acenando',
  style,
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      className={className}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <ellipse cx="32" cy="58" rx="14" ry="2.8" fill="rgb(0 0 0 / 0.16)" />
      <line
        x1="32"
        y1="10.5"
        x2="32"
        y2="15.5"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle className="dicas-mascote-antena" cx="32" cy="8" r="2.7" fill="#fbbf24" />
      <rect x="10.5" y="23" width="5" height="10.5" rx="2.5" fill="currentColor" />
      <rect x="48.5" y="23" width="5" height="10.5" rx="2.5" fill="currentColor" />
      <rect x="14.5" y="14.5" width="35" height="27" rx="9.5" fill="currentColor" />
      <rect x="19" y="19" width="26" height="18" rx="7" fill="#ffffff" />
      <circle cx="23.6" cy="31.2" r="1.9" fill="#fca5a5" opacity="0.85" />
      <circle cx="40.4" cy="31.2" r="1.9" fill="#fca5a5" opacity="0.85" />
      <g className="dicas-mascote-eye">
        <circle cx="27.4" cy="27" r="2.9" fill="#1f2937" />
        <circle cx="28.4" cy="26" r="1" fill="#ffffff" />
      </g>
      <g className="dicas-mascote-eye">
        <circle cx="36.6" cy="27" r="2.9" fill="#1f2937" />
        <circle cx="37.6" cy="26" r="1" fill="#ffffff" />
      </g>
      <path
        d="M27.4 31.6 Q32 35.4 36.6 31.6"
        fill="none"
        stroke="#1f2937"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <rect x="22" y="41" width="20" height="13" rx="5.5" fill="currentColor" />
      <rect x="27.5" y="44.2" width="9" height="6" rx="3" fill="#ffffff" opacity="0.85" />
      <path
        d="M22.5 44.5 Q17.5 47.5 17.5 52"
        fill="none"
        stroke="currentColor"
        strokeWidth="4.2"
        strokeLinecap="round"
      />
      <g className="dicas-mascote-arm">
        <path
          d="M41.5 44.5 Q47 42 49.5 36.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="4.2"
          strokeLinecap="round"
        />
        <circle cx="50.2" cy="34.8" r="3.2" fill="currentColor" />
      </g>
    </svg>
  )
}
```

---

## Arquivo 2 — `TipRobot.jsx`

```jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BalaoDica, MascoteDicas } from './MascoteDicas'

const VISIBLE_MS = 20_000
const HIDDEN_MS = 20_000
const EMPTY = []

function normalizeMessages(messages) {
  return Array.from(
    new Set(
      (Array.isArray(messages) ? messages : [])
        .filter((m) => typeof m === 'string' && m.trim().length > 0)
        .map((m) => m.trim()),
    ),
  )
}

function sameList(a, b) {
  return a.length === b.length && a.every((item, i) => item === b[i])
}

/**
 * Assistente flutuante com balão automático e painel no clique.
 *
 * props:
 * - messages: string[]
 * - userName: string (opcional)
 * - enabled: boolean (default true)
 * - label: string da placa (default "DICAS")
 * - accentColor: cor CSS do mascote (default "#3b82f6")
 */
export function TipRobot({
  messages = EMPTY,
  userName = '',
  enabled = true,
  label = 'DICAS',
  accentColor = '#3b82f6',
}) {
  const incoming = useMemo(() => normalizeMessages(messages), [messages])
  const [pool, setPool] = useState(incoming)

  useEffect(() => {
    setPool((prev) => (sameList(prev, incoming) ? prev : incoming))
  }, [incoming])

  const [open, setOpen] = useState(false)
  const [tip, setTip] = useState(null)
  const [panelIndex, setPanelIndex] = useState(0)
  const timerRef = useRef(null)
  const prevTipRef = useRef(null)
  const prevOpenRef = useRef(false)

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    const justClosed = prevOpenRef.current && !open
    prevOpenRef.current = open
    clearTimer()
    setTip(null)

    if (!enabled || open || pool.length === 0) return undefined

    const showNext = () => {
      const previous = prevTipRef.current
      const candidates =
        pool.length > 1 ? pool.filter((m) => m !== previous) : pool
      const next = candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0]
      prevTipRef.current = next
      setTip(next)
      timerRef.current = window.setTimeout(() => {
        setTip(null)
        timerRef.current = window.setTimeout(showNext, HIDDEN_MS)
      }, VISIBLE_MS)
    }

    if (justClosed) {
      timerRef.current = window.setTimeout(showNext, HIDDEN_MS)
    } else {
      showNext()
    }

    return clearTimer
  }, [clearTimer, enabled, open, pool])

  useEffect(() => () => clearTimer(), [clearTimer])

  const openPanel = () => {
    clearTimer()
    setTip(null)
    setOpen(true)
    if (pool.length) {
      setPanelIndex((i) => (i + 1) % pool.length)
    }
  }

  if (!enabled || typeof document === 'undefined') return null

  const trigger = createPortal(
    <div className="dicas-robot-dock">
      <button
        type="button"
        className="dicas-robot-trigger"
        onClick={openPanel}
        aria-expanded={open}
        aria-label={
          tip ? 'Abrir dicas — dica automática disponível' : 'Abrir dicas'
        }
        aria-describedby={tip ? 'dica-automatica' : undefined}
      >
        <span className="dicas-robot-float dicas-robot-stack">
          <span className="dicas-robot-emoji-wrap">
            {tip ? (
              <BalaoDica id="dica-automatica" userName={userName}>
                {tip}
              </BalaoDica>
            ) : null}
            <span aria-hidden="true">
              <MascoteDicas
                className="dicas-robot-mascote"
                style={{ color: accentColor }}
              />
            </span>
          </span>
          <span className="dicas-robot-placa" aria-hidden="true">
            <span className="dicas-robot-placa-icon">💡</span>
            {label}
          </span>
        </span>
      </button>
    </div>,
    document.body,
  )

  const panel =
    open &&
    createPortal(
      <div className="dicas-robot-panel" role="dialog" aria-label="Dicas">
        <div className="dicas-robot-panel-inner">
          <div className="dicas-robot-panel-head">
            <MascoteDicas className="dicas-mascote-avatar" style={{ color: accentColor }} />
            <div>
              <p className="dicas-robot-panel-title">Assistente de dicas</p>
              <p className="dicas-robot-panel-sub">
                {pool.length ? `Dica ${panelIndex + 1} de ${pool.length}` : 'Sem dicas'}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar dicas">
              Fechar
            </button>
          </div>
          {pool.length ? (
            <>
              <p className="dicas-robot-panel-body">{pool[panelIndex]}</p>
              {pool.length > 1 ? (
                <button
                  type="button"
                  className="dicas-robot-panel-next"
                  onClick={() => setPanelIndex((i) => (i + 1) % pool.length)}
                >
                  Outra dica
                </button>
              ) : null}
            </>
          ) : (
            <p className="dicas-robot-panel-body">Nenhuma dica disponível.</p>
          )}
        </div>
      </div>,
      document.body,
    )

  return (
    <>
      {trigger}
      {panel}
    </>
  )
}
```

---

## Arquivo 3 — `robo.css`

```css
:root {
  --primary: 217 91% 60%;
  --primary-foreground: 0 0% 100%;
}

@keyframes dicas-robot-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

.dicas-robot-float {
  animation: dicas-robot-float 2.6s ease-in-out infinite;
}

.dicas-robot-stack {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  line-height: 1;
}

.dicas-robot-emoji-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dicas-robot-emoji-wrap::before {
  content: "";
  position: absolute;
  inset: -0.4rem -0.65rem;
  z-index: 0;
  border-radius: 9999px;
  background: radial-gradient(
    circle at 50% 42%,
    hsl(var(--primary) / 0.62),
    hsl(var(--primary) / 0.28) 42%,
    transparent 72%
  );
  filter: blur(11px);
  animation: dicas-robot-glow-pulse 2.6s ease-in-out infinite;
}

.dicas-robot-mascote {
  position: relative;
  z-index: 1;
  display: block;
  width: 3.85rem;
  height: 3.85rem;
  user-select: none;
  filter: drop-shadow(0 3px 6px rgb(0 0 0 / 0.22));
}

.dicas-mascote-avatar {
  display: block;
  width: 2.5rem;
  height: 2.5rem;
  flex-shrink: 0;
}

.dicas-mascote-arm {
  transform-origin: 41.5px 44.5px;
  transform-box: view-box;
  animation: dicas-mascote-wave 1.6s ease-in-out infinite;
}

@keyframes dicas-mascote-wave {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(16deg); }
  50% { transform: rotate(-6deg); }
  75% { transform: rotate(14deg); }
}

.dicas-mascote-eye {
  transform-origin: 32px 27px;
  transform-box: view-box;
  animation: dicas-mascote-blink 4.2s ease-in-out infinite;
}

@keyframes dicas-mascote-blink {
  0%, 92%, 100% { transform: scaleY(1); }
  95% { transform: scaleY(0.12); }
}

.dicas-mascote-antena {
  filter: drop-shadow(0 0 2.5px rgb(251 191 36 / 0.75));
  animation: dicas-mascote-antena 2s ease-in-out infinite;
}

@keyframes dicas-mascote-antena {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

@keyframes dicas-robot-glow-pulse {
  0%, 100% { opacity: 0.72; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.1); }
}

.dicas-robot-balao {
  position: absolute;
  bottom: calc(100% + 0.15rem);
  right: 2.35rem;
  z-index: 2;
  display: block;
  width: clamp(13.5rem, 58vw, 18.5rem);
  max-width: calc(100vw - 4.75rem);
  transform-origin: 92% 100%;
  animation:
    dicas-balao-pop 0.35s ease-out both,
    dicas-balao-bob 2.4s ease-in-out 0.4s infinite;
  pointer-events: none;
  user-select: none;
}

.dicas-robot-balao svg {
  display: block;
  width: 100%;
  height: auto;
  filter: drop-shadow(0 4px 10px rgb(0 0 0 / 0.32));
}

.dicas-robot-balao-text {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  height: 100%;
  overflow: hidden;
  color: #1f2937;
  font-family: "Comic Sans MS", "Segoe Print", "Chalkboard SE", sans-serif;
  text-align: left;
}

.dicas-robot-balao-saudacao {
  display: block;
  font-size: 0.8rem;
  font-weight: 800;
  line-height: 1.2;
}

.dicas-robot-balao-dica {
  margin: 0;
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

@keyframes dicas-balao-pop {
  0% { opacity: 0; transform: scale(0.4); }
  70% { opacity: 1; transform: scale(1.08); }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes dicas-balao-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}

.dicas-robot-placa {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.05rem;
  padding: 0.15rem 0.6rem 0.22rem;
  border-radius: 0.3rem;
  border: 2px solid rgb(180 130 70 / 0.65);
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.22);
  animation: dicas-placa-blink 1.35s ease-in-out infinite;
}

@keyframes dicas-placa-blink {
  0%, 100% {
    opacity: 1;
    box-shadow:
      0 2px 8px rgb(0 0 0 / 0.22),
      0 0 0 0 hsl(var(--primary) / 0);
  }
  50% {
    opacity: 0.62;
    box-shadow:
      0 2px 12px rgb(0 0 0 / 0.28),
      0 0 12px 3px hsl(var(--primary) / 0.75);
  }
}

.dicas-robot-placa-icon {
  font-size: 0.575rem;
  line-height: 1;
}

.dicas-robot-trigger {
  background: transparent !important;
  border: 0;
  padding: 0;
  cursor: pointer;
  box-shadow: none !important;
  outline: none;
}

.dicas-robot-trigger:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 4px;
  border-radius: 8px;
}

.dicas-robot-dock {
  position: fixed;
  right: max(1rem, env(safe-area-inset-right, 0px));
  bottom: max(1rem, env(safe-area-inset-bottom, 0px));
  z-index: 210;
  pointer-events: none;
}

.dicas-robot-dock .dicas-robot-trigger {
  pointer-events: auto;
}

.dicas-robot-panel {
  position: fixed;
  right: max(1rem, env(safe-area-inset-right, 0px));
  bottom: max(6.5rem, calc(env(safe-area-inset-bottom, 0px) + 5.5rem));
  z-index: 220;
  width: min(22rem, calc(100vw - 1.5rem));
}

.dicas-robot-panel-inner {
  border-radius: 1rem;
  border: 1px solid rgb(255 255 255 / 0.12);
  background: rgb(17 24 39 / 0.96);
  color: #f9fafb;
  padding: 1rem;
  box-shadow: 0 16px 40px rgb(0 0 0 / 0.45);
}

.dicas-robot-panel-head {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  margin-bottom: 0.75rem;
}

.dicas-robot-panel-title {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 700;
}

.dicas-robot-panel-sub {
  margin: 0.15rem 0 0;
  font-size: 0.75rem;
  opacity: 0.7;
}

.dicas-robot-panel-head > button {
  margin-left: auto;
  border: 1px solid rgb(255 255 255 / 0.2);
  background: transparent;
  color: inherit;
  border-radius: 0.4rem;
  padding: 0.25rem 0.55rem;
  font-size: 0.75rem;
  cursor: pointer;
}

.dicas-robot-panel-body {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.45;
}

.dicas-robot-panel-next {
  margin-top: 0.75rem;
  width: 100%;
  border: 1px solid hsl(var(--primary) / 0.45);
  background: hsl(var(--primary) / 0.15);
  color: inherit;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

@media (min-width: 640px) {
  .dicas-robot-mascote {
    width: 4.4rem;
    height: 4.4rem;
  }

  .dicas-robot-placa {
    padding: 0.18rem 0.65rem 0.24rem;
    font-size: 0.72rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .dicas-robot-float,
  .dicas-robot-placa,
  .dicas-robot-emoji-wrap::before,
  .dicas-mascote-arm,
  .dicas-mascote-eye,
  .dicas-mascote-antena {
    animation: none;
  }

  .dicas-robot-balao {
    animation: dicas-balao-pop 0.01s both;
  }
}
```

---

## Critérios de aceite (para o agente validar)

1. Robô aparece fixo no canto inferior direito.
2. Com `messages` preenchidas e painel fechado: balão aparece ~20s, some ~20s, volta com outra fala.
3. Com 2+ mensagens: a nova fala não é igual à anterior.
4. Com 1 mensagem: a mesma fala pode repetir.
5. Clique abre painel; balão some; timers param.
6. Fechar painel: espera ~20s e o balão volta.
7. Saudação no balão inclui primeiro nome quando `userName` é informado.
8. Unmount não deixa timers vivos.
9. `enabled={false}` não renderiza o dock.

---

## Exemplo mínimo de integração

```jsx
import './robo.css'
import { TipRobot } from './TipRobot'

export function App() {
  return (
    <TipRobot
      userName="Maria Clara"
      messages={[
        'Dia 5: maior necessidade de reposição.',
        'Dia 8: 25% acima da média de atendimentos.',
        'Dia 3: 50% abaixo da média de atendimentos.',
      ]}
    />
  )
}
```

Fim. Qualquer adaptação de domínio (API, filtros, temas) fica fora deste núcleo: basta alimentar `messages` e `userName`.
