#!/usr/bin/env node
/**
 * UX Component Analyst — varredura estática do frontend React.
 *
 * Objetivo: apontar riscos de UX/acessibilidade/responsividade antes de produção.
 * Não substitui testes visuais nem Lighthouse; complementa o lint.
 *
 * Uso:
 *   node scripts/ux-component-analyst.cjs
 *   node scripts/ux-component-analyst.cjs --json reports/ux-audit.json
 *   node scripts/ux-component-analyst.cjs --fail-on warning
 *   node scripts/ux-component-analyst.cjs --only-text
 *   node scripts/ux-component-analyst.cjs --path web/features/pendencias
 */

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const DEFAULT_SCAN_DIRS = [
  path.join(ROOT, "web", "features"),
  path.join(ROOT, "web", "shared"),
];
const EXTENSIONS = new Set([".html", ".jsx", ".js", ".tsx", ".ts"]);
const IGNORE_DIRS = new Set(["node_modules", "dist", "build", "__tests__", "coverage"]);

const SEVERITY = {
  critical: 3,
  warning: 2,
  info: 1,
};

/** Regras de varredura focadas só em copy visível (acentuação / encoding). */
const TEXT_SCAN_RULE_IDS = new Set(["UX_TEXT_ENCODING", "UX_ACCENT_MISSING_PT"]);

/** ruleId emitido por cada issue de texto (inclui sub-regras de mojibake). */
const TEXT_ISSUE_RULES = new Set([
  "UX_ENCODING_MOJIBAKE",
  "UX_ENCODING_DOUBLE",
  "UX_ENCODING_LATIN",
  "UX_ACCENT_MISSING_PT",
]);

const SKIP_LINE_RE = /^\s*(\/\/|\*|import |export |console\.|eslint-disable|@type)/;

const CODE_STRING_SKIP_RE =
  /^(?:VIEW_[A-Z0-9_]+|[A-Z][A-Z0-9_]{2,}|\/[\w/.-]+|#[0-9a-f]{3,8}|[a-z]+(?:-[a-z]+)+)$/i;

/** Palavras comuns em UI pt-BR sem acento (ordem: formas mais longas primeiro). */
const PT_MISSING_ACCENT_CHECKS = [
  { re: /\bpendencias\b/i, suggested: "pendências" },
  { re: /\bpendencia\b/i, suggested: "pendência" },
  { re: /\burgencias\b/i, suggested: "urgências" },
  { re: /\burgencia\b/i, suggested: "urgência" },
  { re: /\binternacoes\b/i, suggested: "internações" },
  { re: /\binternacao\b/i, suggested: "internação" },
  { re: /\binformacoes\b/i, suggested: "informações" },
  { re: /\binformacao\b/i, suggested: "informação" },
  { re: /\bconfiguracoes\b/i, suggested: "configurações" },
  { re: /\bconfiguracao\b/i, suggested: "configuração" },
  { re: /\batualizacoes\b/i, suggested: "atualizações" },
  { re: /\batualizacao\b/i, suggested: "atualização" },
  { re: /\bindisponivel\b/i, suggested: "indisponível" },
  { re: /\bdisponivel\b/i, suggested: "disponível" },
  { re: /\bpermanencia\b/i, suggested: "permanência" },
  { re: /\btransferencia\b/i, suggested: "transferência" },
  { re: /\bconvenio\b/i, suggested: "convênio" },
  { re: /\bobito\b/i, suggested: "óbito" },
  { re: /\bmedica(?!ção)/i, suggested: "médica" },
  { re: /\bmedico(?!s)/i, suggested: "médico" },
  { re: /\bnao informado\b/i, suggested: "não informado" },
  { re: /\bsessao\b/i, suggested: "sessão" },
  { re: /\boperacao\b/i, suggested: "operação" },
  { re: /\bautenticacao\b/i, suggested: "autenticação" },
  { re: /\bobrigatorios\b/i, suggested: "obrigatórios" },
  { re: /\bobrigatorio\b/i, suggested: "obrigatório" },
  { re: /\busuarios\b/i, suggested: "usuários" },
  { re: /\busuario\b/i, suggested: "usuário" },
  { re: /\bpermissoes\b/i, suggested: "permissões" },
  { re: /\bpermissao\b/i, suggested: "permissão" },
  { re: /\bremocao\b/i, suggested: "remoção" },
  { re: /\bsolicitacao\b/i, suggested: "solicitação" },
  { re: /\bconexao\b/i, suggested: "conexão" },
  { re: /\brequisicao\b/i, suggested: "requisição" },
  { re: /\balteracoes\b/i, suggested: "alterações" },
  { re: /\binvalidos\b/i, suggested: "inválidos" },
  { re: /\binvalido\b/i, suggested: "inválido" },
  { re: /\bnao conferem\b/i, suggested: "não conferem" },
  { re: /\besta demorando\b/i, suggested: "está demorando" },
  { re: /\bMes vigente\b/, suggested: "Mês vigente" },
  { re: /\bocupacao\b/i, suggested: "ocupação" },
];

const MOJIBAKE_CHECKS = [
  {
    id: "UX_ENCODING_DOUBLE",
    re: /ÃƒÂ|Ãƒâ€|ÃƒÂ§|ÃƒÆ|Ã¢â‚¬|â€™|â€œ|â€\u009d|Ãƒ¢ââ€š¬/,
    message: "Mojibake duplo ou aspas/travessão corrompidos — texto exibido com lixo (ex.: Ãƒ§Ãƒ£o).",
  },
  {
    id: "UX_ENCODING_LATIN",
    re: /Ãƒ[§£©íáóúãõêªº³´µ]|ÃƒÆ'|ÃƒÆ"/,
    message: "Mojibake Latin-1/UTF-8 (ex.: Ãƒ§Ãƒ£o, Ãƒ©) — usuário verá caracteres errados.",
  },
  {
    id: "UX_ENCODING_MOJIBAKE",
    re: /Ã[¡©­®íóúãõêôç§£ªº]|Â[\s\u00a0]|â€[™œž"]|\uFFFD/,
    message: "Encoding UTF-8 quebrado (Latin-1/Windows-1252) — usuário verá caracteres errados.",
  },
];

const COMMENT_ONLY_LINE_RE = /^\s*(\/\/|\/\*|\{\s*\/\*)/;

function isCommentOnlyLine(line) {
  const t = line.trim();
  return COMMENT_ONLY_LINE_RE.test(t) || (t.startsWith("{/*") && t.endsWith("*/}"));
}

function isLikelyUserFacingString(text, line) {
  const t = String(text || "").trim();
  if (!t || t.length < 3) return false;
  if (CODE_STRING_SKIP_RE.test(t)) return false;
  if (/^[\w.-]+\/[\w./-]+$/.test(t)) return false;
  if (/\.(jsx?|tsx?|css|json|png|svg|woff2?)$/i.test(t)) return false;
  if (line.includes("legacyNames") && line.includes(t)) return false;
  if (/\\u00[0-9a-f]{2}/i.test(line) && new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(line)) {
    return false;
  }
  if (!/[A-Za-zÀ-ÿ]{3,}/.test(t)) return false;
  if (/\$\{/.test(t)) return false;
  if (/^[a-z][a-zA-Z0-9]*$/.test(t) && !/\s/.test(t) && t.length < 24) return false;
  return true;
}

function collectUiStringsFromLine(line) {
  /** @type {Array<{ text: string, kind: string }>} */
  const found = [];
  const seen = new Set();

  const add = (text, kind) => {
    const normalized = String(text || "").trim();
    if (!normalized || seen.has(normalized)) return;
    if (!isLikelyUserFacingString(normalized, line)) return;
    seen.add(normalized);
    found.push({ text: normalized, kind });
  };

  for (const m of line.matchAll(/>([^<{}][^<]*?)</g)) {
    add(m[1].trim(), "jsx");
  }

  for (const m of line.matchAll(
    /set(?:Error|ActiveError|PasswordError)\(\s*["']([^"']{3,})["']/g
  )) {
    add(m[1], "error-message");
  }

  for (const m of line.matchAll(/\blabel_pt\s*:\s*["']([^"']+)["']/g)) {
    add(m[1], "label-pt");
  }

  for (const m of line.matchAll(
    /(?:label|title|aria-label|placeholder|description|message|tooltip|heading|subtitle)\s*[:=]\s*["']([^"']+)["']/gi
  )) {
    add(m[1], "prop");
  }

  for (const m of line.matchAll(/\blabel\s*:\s*["']([^"']+)["']/g)) {
    add(m[1], "object-label");
  }

  for (const m of line.matchAll(/\{"([^"\\]{4,140})"\}/g)) {
    add(m[1], "jsx-expr");
  }

  return found;
}

function lineHasEncodingMojibake(line) {
  if (isCommentOnlyLine(line)) return null;
  if (/legacyNames/.test(line)) return null;
  for (const check of MOJIBAKE_CHECKS) {
    if (check.re.test(line)) return check;
  }
  return null;
}

function findMissingAccentInText(text) {
  for (const check of PT_MISSING_ACCENT_CHECKS) {
    const match = text.match(check.re);
    if (match) {
      return {
        matchedText: match[0],
        suggested: check.suggested,
        label: `${match[0]} → ${check.suggested}`,
      };
    }
  }
  return null;
}

function withTextCategory(issue) {
  return { ...issue, category: "text" };
}

/** @type {Array<{ id: string, severity: keyof typeof SEVERITY, title: string, test: (ctx: RuleContext) => void }>} */
const RULES = [
  {
    id: "A11Y_BUTTON_NO_LABEL",
    severity: "critical",
    title: "Botão só com ícone sem aria-label nem texto visível",
    test({ file, lines, addIssue }) {
      lines.forEach((line, index) => {
        if (!/<Button\b|<button\b/.test(line)) return;
        const block = lines.slice(index, Math.min(lines.length, index + 6)).join("\n");
        if (/aria-label=/.test(block)) return;
        if (/size=["']icon["']/.test(block) && !/<(?:[A-Z][a-zA-Z]+)\s*[^>]*\/>\s*<\//.test(block)) {
          if (/<(?:[A-Z][a-zA-Z]+)\s*/.test(block)) {
            addIssue({
              ruleId: "A11Y_BUTTON_NO_LABEL",
              severity: "critical",
              file,
              line: index + 1,
              message: "Botão size=\"icon\" sem aria-label.",
              snippet: line.trim(),
            });
          }
          return;
        }
        const hasVisibleText = />\s*[A-Za-zÀ-ú0-9][^<{]{1,40}\s*</.test(block);
        if (hasVisibleText) return;
        const hasIconOnly =
          /<(?:[A-Z][a-zA-Z]+)\s+[^/]*\/>\s*<\//.test(block) ||
          (/<(?:[A-Z][a-zA-Z]+)\s*/.test(line) && !/>[^<]+</.test(block));
        if (!hasIconOnly) return;
        addIssue({
          ruleId: "A11Y_BUTTON_NO_LABEL",
          severity: "critical",
          file,
          line: index + 1,
          message: "Botão provável só com ícone sem aria-label.",
          snippet: line.trim(),
        });
      });
    },
  },
  {
    id: "A11Y_CLICKABLE_DIV",
    severity: "critical",
    title: "Elemento clicável sem semântica de botão",
    test({ file, lines, addIssue }) {
      lines.forEach((line, index) => {
        if (!/\bonClick=/.test(line)) return;
        if (/<(?:button|Button|a|Link)\b/.test(line)) return;
        if (!/<(?:div|span|tr|li|td)\b/.test(line)) return;

        const windowStart = Math.max(0, index - 1);
        const windowEnd = Math.min(lines.length, index + 5);
        const block = lines.slice(windowStart, windowEnd).join("\n");
        if (/role=["']button["']/.test(block) && /tabIndex=\{?0\}?/.test(block) && /onKeyDown=/.test(block)) {
          return;
        }
        addIssue({
          ruleId: "A11Y_CLICKABLE_DIV",
          severity: "critical",
          file,
          line: index + 1,
          message:
            "onClick em elemento não-button sem role=\"button\", tabIndex={0} e onKeyDown (Enter/Espaço).",
          snippet: line.trim(),
        });
      });
    },
  },
  {
    id: "A11Y_IMG_NO_ALT",
    severity: "critical",
    title: "Imagem sem alt",
    test({ file, lines, addIssue }) {
      lines.forEach((line, index) => {
        if (!/<img\b/i.test(line)) return;
        if (/\balt=/.test(line)) return;
        addIssue({
          ruleId: "A11Y_IMG_NO_ALT",
          severity: "critical",
          file,
          line: index + 1,
          message: "<img> sem atributo alt.",
          snippet: line.trim(),
        });
      });
    },
  },
  {
    id: "RESP_FLEX_NO_MIN_W0",
    severity: "warning",
    title: "Flex filho truncável sem min-w-0",
    test({ file, lines, addIssue }) {
      lines.forEach((line, index) => {
        if (!/\bflex-1\b/.test(line) && !/\btruncate\b/.test(line)) return;
        if (/\bmin-w-0\b/.test(line)) return;
        if (!/className=/.test(line)) return;
        addIssue({
          ruleId: "RESP_FLEX_NO_MIN_W0",
          severity: "warning",
          file,
          line: index + 1,
          message: "flex-1/truncate sem min-w-0 — risco de overflow e sobreposição.",
          snippet: line.trim(),
        });
      });
    },
  },
  {
    id: "RESP_ABSOLUTE_POSITION",
    severity: "warning",
    title: "Posicionamento absolute em layout denso",
    test({ file, lines, addIssue }) {
      lines.forEach((line, index) => {
        if (!/\babsolute\b/.test(line)) return;
        if (/inset-0/.test(line) && /(?:modal|overlay|backdrop|fixed inset)/i.test(line)) return;
        addIssue({
          ruleId: "RESP_ABSOLUTE_POSITION",
          severity: "warning",
          file,
          line: index + 1,
          message:
            "Classe absolute fora de overlay/modal — pode sobrepor vizinhos em telas pequenas ou com zoom.",
          snippet: line.trim(),
        });
      });
    },
  },
  {
    id: "RESP_SCALE_TRANSFORM",
    severity: "warning",
    title: "transform scale sem contenção de overflow",
    test({ file, content, lines, addIssue }) {
      const hasScale = /transform:\s*[`'"]\s*scale\(/i.test(content) || /scale\(\$\{/.test(content);
      if (!hasScale) return;
      const hasOverflowGuard =
        /overflow-hidden/.test(content) ||
        /overflow:\s*["']hidden["']/.test(content) ||
        /ResizeObserver/.test(content) ||
        /getBoundingClientRect/.test(content);
      if (hasOverflowGuard) return;
      const line = lines.findIndex((l) => /scale\(/.test(l));
      addIssue({
        ruleId: "RESP_SCALE_TRANSFORM",
        severity: "warning",
        file,
        line: line >= 0 ? line + 1 : 1,
        message:
          "Zoom/scale visual detectado sem overflow-hidden ou medição adaptativa — risco de cobrir cards vizinhos.",
        snippet: lines[line >= 0 ? line : 0]?.trim() || "",
      });
    },
  },
  {
    id: "RESP_NOWRAP_CLUSTER",
    severity: "warning",
    title: "Cluster nowrap denso sem estratégia de compactação",
    test({ file, lines, addIssue }) {
      lines.forEach((line, index) => {
        if (!/\bflex-nowrap\b/.test(line)) return;
        const block = lines.slice(index, Math.min(lines.length, index + 8)).join("\n");
        if (/TransferSector|useAdaptive|ResizeObserver|xl:hidden|@\[min-width:/.test(block)) return;
        if (/whitespace-nowrap/.test(block) && /truncate|min-w-0|overflow-hidden/.test(block)) return;
        addIssue({
          ruleId: "RESP_NOWRAP_CLUSTER",
          severity: "warning",
          file,
          line: index + 1,
          message:
            "Grupo flex-nowrap com possíveis badges/tags — verifique fallback compacto (bolinha/tooltip) em telas estreitas.",
          snippet: line.trim(),
        });
      });
    },
  },
  {
    id: "UX_TOUCH_TARGET_SMALL",
    severity: "warning",
    title: "Alvo de toque muito pequeno",
    test({ file, lines, addIssue }) {
      lines.forEach((line, index) => {
        const isInteractive =
          /<button\b|<Button\b|\bonClick=/.test(line) ||
          (/\brole=["']button["']/.test(line) && /onClick=/.test(lines.slice(Math.max(0, index - 1), index + 2).join(" ")));
        if (!isInteractive) return;
        if (/h-\[(?:2|2\.5|3|3\.5|4)rem\]|w-\[(?:2|2\.5|3|3\.5|4)rem\]|h-6\b|w-6\b|size-6\b/.test(line)) return;
        if (/h-\[1\.(?:0|1|2)rem\]|w-2\.5|h-2\.5|w-2\b|h-2\b|text-\[10px\]/.test(line)) {
          addIssue({
            ruleId: "UX_TOUCH_TARGET_SMALL",
            severity: "warning",
            file,
            line: index + 1,
            message: "Controle interativo com área visual pequena (< ~32px) — difícil em touch e zoom alto.",
            snippet: line.trim(),
          });
        }
      });
    },
  },
  {
    id: "UX_TRUNCATE_NO_TITLE",
    severity: "info",
    title: "Texto truncado sem title/tooltip",
    test({ file, lines, addIssue }) {
      lines.forEach((line, index) => {
        if (!/\btruncate\b/.test(line)) return;
        const block = lines.slice(Math.max(0, index - 1), Math.min(lines.length, index + 2)).join("\n");
        if (/\btitle=/.test(block) || /<Tooltip\b/.test(block)) return;
        addIssue({
          ruleId: "UX_TRUNCATE_NO_TITLE",
          severity: "info",
          file,
          line: index + 1,
          message: "truncate sem title/Tooltip — conteúdo oculto pode ser ilegível.",
          snippet: line.trim(),
        });
      });
    },
  },
  {
    id: "UX_LOADING_STATE",
    severity: "warning",
    title: "Fetch/dados assíncronos sem feedback de loading visível",
    test({ file, content, lines, addIssue }) {
      const fetches =
        (content.match(/\bfetch\s*\(/g) || []).length +
        (content.match(/\buseQuery\b/g) || []).length +
        (content.match(/\buseBackendConnection\b/g) || []).length;
      if (fetches === 0) return;
      const hasLoadingUi =
        /\bloading\b/i.test(content) &&
        (/<(?:Skeleton|Spinner|Loader|Loading)/i.test(content) ||
          /Carregando|carregando|Aguarde|spinner|animate-spin/.test(content));
      if (hasLoadingUi) return;
      const line = lines.findIndex((l) => /\bfetch\s*\(|useQuery\b/.test(l));
      addIssue({
        ruleId: "UX_LOADING_STATE",
        severity: "warning",
        file,
        line: line >= 0 ? line + 1 : 1,
        message: "Componente busca dados mas não evidencia estado de carregamento na UI.",
        snippet: lines[line >= 0 ? line : 0]?.trim() || "",
      });
    },
  },
  {
    id: "UX_ERROR_STATE",
    severity: "warning",
    title: "Tratamento de erro ausente ou só console",
    test({ file, content, lines, addIssue }) {
      if (!/\bfetch\s*\(|useQuery\b/.test(content)) return;
      const hasErrorUi =
        /\berror\b/i.test(content) &&
        (/<Alert/i.test(content) ||
          /AlertTriangle/.test(content) ||
          /indisponível|indisponivel|Erro ao|Falha ao|tente novamente/i.test(content));
      if (hasErrorUi) return;
      if (!/catch\s*\(|\.catch\(/.test(content) && !/\berror\b/.test(content)) {
        const line = lines.findIndex((l) => /\bfetch\s*\(|useQuery\b/.test(l));
        addIssue({
          ruleId: "UX_ERROR_STATE",
          severity: "warning",
          file,
          line: line >= 0 ? line + 1 : 1,
          message: "Sem mensagem amigável de erro para falha de API/dados.",
          snippet: lines[line >= 0 ? line : 0]?.trim() || "",
        });
      }
    },
  },
  {
    id: "UX_TEXT_ENCODING",
    severity: "critical",
    title: "Texto visível com encoding corrompido (mojibake)",
    test({ file, lines, addIssue }) {
      lines.forEach((line, index) => {
        if (SKIP_LINE_RE.test(line)) return;
        if (isCommentOnlyLine(line)) return;
        if (/legacyNames/.test(line)) return;
        for (const check of MOJIBAKE_CHECKS) {
          if (!check.re.test(line)) continue;
          addIssue(
            withTextCategory({
              ruleId: check.id,
              severity: "critical",
              file,
              line: index + 1,
              message: check.message,
              snippet: line.trim(),
              kind: "encoding",
            })
          );
          break;
        }
      });
    },
  },
  {
    id: "UX_ACCENT_MISSING_PT",
    severity: "warning",
    title: "Copy visível em pt-BR sem acentuação",
    test({ file, lines, addIssue }) {
      lines.forEach((line, index) => {
        if (SKIP_LINE_RE.test(line)) return;
        if (/legacyNames/.test(line)) return;
        const uiStrings = collectUiStringsFromLine(line);
        for (const { text, kind } of uiStrings) {
          const accent = findMissingAccentInText(text);
          if (!accent) continue;
          addIssue(
            withTextCategory({
              ruleId: "UX_ACCENT_MISSING_PT",
              severity: "warning",
              file,
              line: index + 1,
              message: `Texto visível (${kind}) sem acento: ${accent.label}`,
              snippet: line.trim(),
              matchedText: accent.matchedText,
              suggestion: accent.suggested,
              uiText: text,
              kind: "accent",
            })
          );
        }
      });
    },
  },
  {
    id: "UX_HARDCODED_COLOR_ONLY",
    severity: "info",
    title: "Cor hardcoded sem variante de tema escuro",
    test({ file, lines, addIssue }) {
      lines.forEach((line, index) => {
        if (!/style=\{\{[^}]*color:\s*["']#/.test(line)) return;
        if (/isLight|isDark|var\(--/.test(line)) return;
        addIssue({
          ruleId: "UX_HARDCODED_COLOR_ONLY",
          severity: "info",
          file,
          line: index + 1,
          message: "Cor inline fixa — conferir contraste nos temas dark-green/dark-blue.",
          snippet: line.trim(),
        });
      });
    },
  },
  {
    id: "UX_MODAL_NO_ESCAPE",
    severity: "info",
    title: "Modal/dialog sem indício de fechamento por overlay ou Escape",
    test({ file, content, lines, addIssue }) {
      const isModalFile = /Modal|Dialog|dialog/.test(path.basename(file));
      if (!isModalFile && !/<Dialog\b|fixed inset-0/.test(content)) return;
      if (!/fixed inset-0|DialogContent|<Dialog\b/.test(content)) return;
      const hasClose =
        /onOpenChange=|handleOverlayClick|onClick=\{.*close|Escape|onKeyDown=.*Escape/i.test(content);
      if (hasClose) return;
      const line = lines.findIndex((l) => /fixed inset-0|<Dialog\b/.test(l));
      addIssue({
        ruleId: "UX_MODAL_NO_ESCAPE",
        severity: "info",
        file,
        line: line >= 0 ? line + 1 : 1,
        message: "Modal/overlay — verifique fechamento por clique fora, Escape ou botão visível.",
        snippet: lines[line >= 0 ? line : 0]?.trim() || "",
      });
    },
  },
];

function parseArgs(argv) {
  const args = {
    json: null,
    failOn: "critical",
    paths: [],
    verbose: false,
    onlyText: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json" && argv[i + 1]) {
      args.json = argv[++i];
    } else if (arg === "--fail-on" && argv[i + 1]) {
      args.failOn = argv[++i];
    } else if (arg === "--path" && argv[i + 1]) {
      args.paths.push(path.resolve(ROOT, argv[++i]));
    } else if (arg === "--verbose") {
      args.verbose = true;
    } else if (arg === "--only-text") {
      args.onlyText = true;
    } else if (arg === "--self-test") {
      args.selfTest = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    }
  }
  if (args.paths.length === 0) args.paths = DEFAULT_SCAN_DIRS;
  return args;
}

function printHelp() {
  console.log(`
UX Component Analyst
--------------------
  node scripts/ux-component-analyst.cjs [opções]

Opções:
  --path <dir>       Pasta extra ou alternativa (pode repetir)
  --json <arquivo>   Salva relatório JSON
  --fail-on <nivel>  Falha com exit 1 se houver issues (critical|warning|info)
  --only-text        Mostra só acentuação/encoding (copy visível)
  --self-test        Valida heurísticas de texto (sem varrer o projeto)
  --verbose          Lista arquivos sem issues
  -h, --help         Ajuda
`);
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  const stat = fs.statSync(dir);
  if (stat.isFile()) {
    if (EXTENSIONS.has(path.extname(dir))) out.push(dir);
    return out;
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function featureOf(file) {
  const parts = rel(file).split("/");
  const idx = parts.indexOf("features");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  if (parts.includes("shared")) return "shared";
  return "other";
}

function color(text, code) {
  return `\u001b[${code}m${text}\u001b[0m`;
}

const SEV_COLOR = {
  critical: (t) => color(t, "31"),
  warning: (t) => color(t, "33"),
  info: (t) => color(t, "36"),
};

function isTextIssue(issue) {
  return issue.category === "text" || TEXT_ISSUE_RULES.has(issue.ruleId);
}

function printTextIssueLine(issue) {
  const paint = SEV_COLOR[issue.severity] || ((t) => t);
  const kindBadge =
    issue.kind === "encoding"
      ? color(" ENCODING ", "45;30")
      : issue.kind === "accent"
        ? color(" ACENTO ", "43;30")
        : color(" TEXTO ", "44;30");

  console.log(
    kindBadge +
      paint(` [${issue.severity.toUpperCase()}]`) +
      ` ${rel(issue.file)}:${issue.line}  ${color(issue.ruleId, "90")}`
  );
  console.log(`  ${issue.message}`);

  if (issue.matchedText && issue.suggestion) {
    console.log(
      `  ${color("Corrigir:", "32")} ${color(issue.matchedText, "31")} ${color("→", "90")} ${color(issue.suggestion, "32;1")}`
    );
  }

  if (issue.uiText) {
    console.log(`  ${color("Texto na UI:", "90")} "${issue.uiText}"`);
  }

  if (issue.snippet) {
    const highlight = issue.matchedText
      ? issue.snippet.replace(
          new RegExp(issue.matchedText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
          (m) => color(m, "41;37")
        )
      : issue.snippet;
    console.log(`  > ${highlight.slice(0, 160)}`);
  }

  console.log("");
}

function run() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const startedAt = new Date();
  const files = [...new Set(args.paths.flatMap((p) => walkFiles(p)))].sort();
  /** @type {Array<any>} */
  const issues = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split(/\r?\n/);
    /** @type {RuleContext} */
    const ctx = {
      file,
      content,
      lines,
      addIssue(issue) {
        issues.push(issue);
      },
    };
    for (const rule of args.onlyText ? RULES.filter((r) => TEXT_SCAN_RULE_IDS.has(r.id)) : RULES) {
      try {
        rule.test(ctx);
      } catch (error) {
        issues.push({
          ruleId: "INTERNAL_RULE_ERROR",
          severity: "warning",
          file,
          line: 1,
          message: `Falha ao executar regra ${rule.id}: ${error.message}`,
          snippet: "",
        });
      }
    }
  }

  issues.sort((a, b) => {
    const sd = SEVERITY[b.severity] - SEVERITY[a.severity];
    if (sd !== 0) return sd;
    return a.file.localeCompare(b.file) || a.line - b.line;
  });

  const visibleIssues = args.onlyText ? issues.filter(isTextIssue) : issues;

  const counts = { critical: 0, warning: 0, info: 0 };
  for (const issue of visibleIssues) counts[issue.severity] += 1;

  const byFeature = {};
  for (const issue of visibleIssues) {
    const feat = featureOf(issue.file);
    byFeature[feat] = (byFeature[feat] || 0) + 1;
  }

  const byRule = {};
  for (const issue of visibleIssues) {
    byRule[issue.ruleId] = (byRule[issue.ruleId] || 0) + 1;
  }

  const textIssues = visibleIssues.filter(isTextIssue);
  const otherIssues = visibleIssues.filter((i) => !isTextIssue(i));

  const report = {
    tool: "ux-component-analyst",
    version: "1.2.0",
    scannedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    roots: args.paths.map((p) => rel(p)),
    filesScanned: files.length,
    rulesApplied: args.onlyText
      ? RULES.filter((r) => TEXT_SCAN_RULE_IDS.has(r.id)).length
      : RULES.length,
    onlyText: args.onlyText,
    summary: {
      total: visibleIssues.length,
      text: textIssues.length,
      ...counts,
    },
    byFeature,
    byRule,
    issues: visibleIssues.map((i) => ({
      ...i,
      file: rel(i.file),
    })),
  };

  console.log("");
  console.log(color("=== UX Component Analyst ===", "1;35"));
  const modeLabel = args.onlyText ? color(" [somente texto]", "35") : "";
  console.log(
    `Scan: ${startedAt.toLocaleString("pt-BR")} | Arquivos: ${files.length} | Regras: ${report.rulesApplied}${modeLabel}`
  );
  console.log(
    `Issues: ${visibleIssues.length} (${SEV_COLOR.critical(`${counts.critical} críticas`)}, ${SEV_COLOR.warning(`${counts.warning} avisos`)}, ${SEV_COLOR.info(`${counts.info} info`)})` +
      (textIssues.length > 0 ? ` | ${color(`${textIssues.length} texto (acento/encoding)`, "35")}` : "")
  );
  console.log("");

  if (visibleIssues.length === 0) {
    console.log(color("Nenhum ponto de atenção encontrado nas heurísticas configuradas.", "32"));
  } else {
    if (textIssues.length > 0) {
      console.log(color("━━━ Texto visível: acentuação / encoding ━━━", "1;35"));
      console.log(
        color(
          `  ${textIssues.filter((i) => i.kind === "encoding").length} encoding · ${textIssues.filter((i) => i.kind === "accent").length} acentuação`,
          "90"
        )
      );
      console.log("");
      for (const issue of textIssues) printTextIssueLine(issue);
    }

    if (otherIssues.length > 0) {
      if (textIssues.length > 0) {
        console.log(color("━━━ Demais regras UX / a11y ━━━", "1"));
        console.log("");
      }
      for (const issue of otherIssues) {
        const paint = SEV_COLOR[issue.severity] || ((t) => t);
        console.log(
          paint(`[${issue.severity.toUpperCase()}]`) +
            ` ${rel(issue.file)}:${issue.line}  ${color(issue.ruleId, "90")}`
        );
        console.log(`  ${issue.message}`);
        if (issue.snippet) console.log(`  > ${issue.snippet.slice(0, 140)}`);
        console.log("");
      }
    }

    console.log(color("--- Por feature ---", "1"));
    Object.entries(byFeature)
      .sort((a, b) => b[1] - a[1])
      .forEach(([feat, n]) => console.log(`  ${feat}: ${n}`));

    console.log(color("--- Top regras ---", "1"));
    Object.entries(byRule)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .forEach(([ruleId, n]) => console.log(`  ${ruleId}: ${n}`));
  }

  if (args.verbose) {
    const withIssues = new Set(visibleIssues.map((i) => i.file));
    const clean = files.filter((f) => !withIssues.has(f));
    console.log("");
    console.log(color(`Arquivos limpos (${clean.length}):`, "90"));
    clean.slice(0, 20).forEach((f) => console.log(`  ${rel(f)}`));
    if (clean.length > 20) console.log(`  ... +${clean.length - 20}`);
  }

  if (args.json) {
    const outPath = path.resolve(ROOT, args.json);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log("");
    console.log(`Relatório JSON: ${rel(outPath)}`);
  }

  console.log("");
  console.log(color("Dica:", "90") + " combine com preview manual, zoom do painel e Lighthouse a11y.");

  const failLevel = SEVERITY[args.failOn] || SEVERITY.critical;
  const shouldFail = visibleIssues.some((i) => SEVERITY[i.severity] >= failLevel);
  process.exit(shouldFail ? 1 : 0);
}

/**
 * @typedef {{ file: string, content: string, lines: string[], addIssue: (issue: any) => void }} RuleContext
 */

/** Casos mínimos para regressão das heurísticas de texto (rodar com --self-test). */
const TEXT_SELF_TEST_FIXTURES = [
  {
    name: "acento em setError",
    line: '        setError("Preencha todos os campos obrigatorios.");',
    expectAccent: "obrigatorios",
    expectEncoding: false,
  },
  {
    name: "acento em title",
    line: 'title="Ha uma solicitacao de transferencia de leito"',
    expectAccent: "solicitacao",
    expectEncoding: false,
  },
  {
    name: "acento em label_pt",
    line: "  { id: 'x', label_pt: 'Alta, remocao ou transferencia' },",
    expectAccent: "remocao",
    expectEncoding: false,
  },
  {
    name: "mojibake em setError (Latin)",
    line: "setError('Aguardando dados de ocupaÃƒ§Ãƒ£o...');",
    expectAccent: false,
    expectEncoding: true,
  },
  {
    name: "mojibake simples em JSX",
    line: "<p>Nenhum conteÃºdo para exibir no momento.</p>",
    expectAccent: false,
    expectEncoding: true,
  },
  {
    name: "ignora comentário",
    line: "  // animaÃ§Ã£o de borda no card",
    expectAccent: false,
    expectEncoding: false,
    commentOnly: true,
  },
  {
    name: "ignora legacyNames",
    line: '    legacyNames: ["ocupaÃƒ§Ãƒ£o por unidade", "ocupacao geral"],',
    expectAccent: false,
    expectEncoding: false,
  },
  {
    name: "não confunde medicação",
    line: "description: 'Tempo aguardando medicação',",
    expectAccent: false,
    expectEncoding: false,
  },
];

function runTextSelfTest() {
  let failed = 0;
  console.log(color("=== UX Component Analyst — self-test (texto) ===", "1;35"));
  for (const fixture of TEXT_SELF_TEST_FIXTURES) {
    const encoding = lineHasEncodingMojibake(fixture.line);
    const accents = collectUiStringsFromLine(fixture.line)
      .map((s) => findMissingAccentInText(s.text))
      .filter(Boolean);

    const hasEncoding = Boolean(encoding);
    const accentHit = accents[0]?.matchedText || null;

    const encodingOk = fixture.commentOnly
      ? !hasEncoding
      : hasEncoding === Boolean(fixture.expectEncoding);
    const accentOk = fixture.expectAccent
      ? accentHit && accentHit.toLowerCase() === fixture.expectAccent.toLowerCase()
      : accents.length === 0;

    if (encodingOk && accentOk) {
      console.log(color(`  OK`, "32") + `  ${fixture.name}`);
    } else {
      failed += 1;
      console.log(color(`  FAIL`, "31") + `  ${fixture.name}`);
      if (!encodingOk) {
        console.log(
          `       encoding: esperado=${Boolean(fixture.expectEncoding)} obtido=${hasEncoding}`
        );
      }
      if (!accentOk) {
        console.log(
          `       acento: esperado=${fixture.expectAccent || "nenhum"} obtido=${accentHit || "nenhum"}`
        );
      }
    }
  }
  console.log("");
  if (failed > 0) {
    console.log(color(`${failed} fixture(s) falharam`, "31"));
    process.exit(1);
  }
  console.log(color("Todos os fixtures de texto passaram.", "32"));
  process.exit(0);
}

const exported = {
  PT_MISSING_ACCENT_CHECKS,
  MOJIBAKE_CHECKS,
  collectUiStringsFromLine,
  findMissingAccentInText,
  lineHasEncodingMojibake,
  isCommentOnlyLine,
  isLikelyUserFacingString,
  TEXT_SELF_TEST_FIXTURES,
  runTextSelfTest,
};

if (require.main === module) {
  const args = parseArgs(process.argv);
  if (args.selfTest) {
    runTextSelfTest();
  } else {
    run();
  }
} else {
  module.exports = exported;
}
