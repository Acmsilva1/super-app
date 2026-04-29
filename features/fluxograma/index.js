/* index.js - Orchestration for Fluxograma */

import {
    state, loadFromLocalStorage, saveToLocalStorage,
    NODE_MIN_WIDTH, NODE_MIN_HEIGHT, NODE_MAX_WIDTH_AUTO, NODE_MAX_WIDTH_MANUAL,
    NODE_MAX_HEIGHT_MANUAL, NODE_PADDING_X, NODE_PADDING_Y, NODE_LINE_HEIGHT,
    NODE_HANDLE_SIZE, RULER_SIZE, RULER_STEP
} from './model/flowchartModel.js';

import {
    sanitizeFilename, getNodeWidth, getNodeHeight, updateNodeMetrics,
    getConnectionGeometry, pointToSegmentDistance, pointToCubicDistance,
    getTextColorByFill, drawNodeShape, drawArrowHead, drawLinesCentered,
    getNodeHandles
} from './service/flowchartService.js';

const el = id => document.getElementById("flux-" + id);
function fluxRoot() {
    return document.getElementById("fluxograma-root");
}

const FLUX_PALETTE = [
    "#ffffff", "#d1d5db", "#fde68a", "#f59e0b",
    "#f97316", "#ef4444", "#ec4899", "#a855f7",
    "#6366f1", "#3b82f6", "#06b6d4", "#14b8a6",
    "#22c55e", "#84cc16", "#65a30d", "#1f2937"
];
const DEFAULT_ACTIVE_COLOR = "#3b82f6";

function normalizeHexColor(value, fallback = "#000000") {
    const input = String(value || "").trim().toLowerCase();
    if (!/^#?[0-9a-f]{3}([0-9a-f]{3})?$/.test(input)) return fallback;
    let hex = input.startsWith("#") ? input : `#${input}`;
    if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    return hex;
}

function ensureActiveColor() {
    state.activeColor = normalizeHexColor(state.activeColor || DEFAULT_ACTIVE_COLOR, DEFAULT_ACTIVE_COLOR);
}

function isPaletteColor(value) {
    const hex = normalizeHexColor(value, "");
    return FLUX_PALETTE.includes(hex);
}

function getSelectedConnection() {
    return state.selectedConnectionIndex !== null ? state.connections[state.selectedConnectionIndex] : null;
}

function getSelectionColor() {
    const selectedConn = getSelectedConnection();
    if (selectedConn) return normalizeHexColor(selectedConn.color || "#000000", "#000000");
    const t = getSelectedText();
    if (t) return normalizeHexColor(t.color || "#1a1f28", "#1a1f28");
    const n = getSelectedNode();
    if (n) return normalizeHexColor(n.color || "#ffffff", "#ffffff");
    if (state.isConnecting) return normalizeHexColor(state.activeColor || DEFAULT_ACTIVE_COLOR, DEFAULT_ACTIVE_COLOR);
    return null;
}

function renderColorPalette() {
    const container = el("colorPalette");
    if (!container) return;
    container.innerHTML = FLUX_PALETTE.map((color) =>
        `<button type="button" class="flux-color-swatch" data-flux-color="${color}" aria-label="Cor ${color}" title="${color}" style="background:${color};"></button>`
    ).join("");
}

function syncColorPaletteUI() {
    ensureActiveColor();
    const paletteEl = el("colorPalette");
    const currentSwatchEl = el("currentColorSwatch");
    const currentTextEl = el("currentColorText");
    const activeSwatchEl = el("activeColorSwatch");
    const activeTextEl = el("activeColorText");

    if (!paletteEl || !currentSwatchEl || !currentTextEl || !activeSwatchEl || !activeTextEl) return;

    const current = getSelectionColor();
    const currentLabel = current
        ? (isPaletteColor(current) ? current.toUpperCase() : `CUSTOM ${current.toUpperCase()}`)
        : "Sem seleção";
    currentSwatchEl.style.background = current || "transparent";
    currentSwatchEl.classList.toggle("is-empty", !current);
    currentTextEl.textContent = currentLabel;

    activeSwatchEl.style.background = state.activeColor;
    activeSwatchEl.classList.remove("is-empty");
    activeTextEl.textContent = state.activeColor.toUpperCase();

    paletteEl.querySelectorAll("[data-flux-color]").forEach((btn) => {
        const swatchColor = normalizeHexColor(btn.getAttribute("data-flux-color"), "");
        const isActive = swatchColor === state.activeColor;
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
}

// --- UI Orchestration Functions ---

function setProjectTitle() {
    if (!window.__SUPERAPP_FLUX_EMBED__) {
        document.title = `${state.projectName} - Flowchart Creator`;
    }
}

function applyCanvasSize() {
    const c = el("canvas"), r = el("renderView"), wrap = el("canvasWrap"), dpr = window.devicePixelRatio || 1;
    state.canvasWidth = state.viewportWidth;
    state.canvasHeight = state.viewportHeight;
    c.style.width = `${state.viewportWidth}px`;
    c.style.height = `${state.viewportHeight}px`;
    c.width = Math.floor(state.viewportWidth * dpr);
    c.height = Math.floor(state.viewportHeight * dpr);
    c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    r.style.width = `${state.viewportWidth}px`;
    r.style.height = `${state.viewportHeight}px`;
    wrap.style.width = `${state.viewportWidth}px`;
    wrap.style.height = `${state.viewportHeight}px`;
}

function resizeCanvas(scale = true) {
    const scroll = el("canvasScroll"), w = Math.max(320, Math.floor(scroll.clientWidth - 2)), h = Math.max(260, Math.floor(scroll.clientHeight - 2));
    state.viewportWidth = w;
    state.viewportHeight = h;
    applyCanvasSize();
    positionInlineEditor();
    positionInlineTextEditor();
}

function addNode() {
    if (state.isViewMode) return;
    const baseX = state.cameraX + 40, baseY = state.cameraY + 40, n = {
        id: state.nextId,
        x: baseX + Math.random() * Math.max(80, state.viewportWidth - NODE_MIN_WIDTH - 120),
        y: baseY + Math.random() * Math.max(80, state.viewportHeight - NODE_MIN_HEIGHT - 120),
        text: "Digite aqui",
        w: NODE_MIN_WIDTH,
        h: NODE_MIN_HEIGHT,
        manualSize: false,
        shape: "rect",
        color: "#ffffff"
    };
    state.nodes.push(n);
    state.nextId++;
    state.selectedNode = n.id;
    saveToLocalStorage();
    updateUI();
    startInlineEdit(n.id);
    showStatus("Novo nó criado.", "success");
}

function getTextFont(t) {
    return `700 ${Math.max(16, Number(t?.fontSize) || 24)}px Segoe UI`;
}

function updateTextMetrics(ctx, t) {
    ctx.font = getTextFont(t);
    const value = (t?.text || "Texto").trim() || "Texto";
    t.text = value;
    t.w = Math.max(40, Math.ceil(ctx.measureText(value).width));
    t.h = Math.max(28, Math.ceil((Number(t?.fontSize) || 24) * 1.2));
}

function addTextLabel() {
    if (state.isViewMode) return;
    hideInlineEditor(true);
    hideInlineTextEditor(true);
    const ctx = el("canvas").getContext("2d");
    const t = {
        id: state.nextId,
        x: state.cameraX + 80,
        y: state.cameraY + 90,
        text: "Texto",
        color: "#1a1f28",
        fontSize: 24
    };
    updateTextMetrics(ctx, t);
    state.texts.push(t);
    state.nextId++;
    state.selectedNode = null;
    state.selectedConnectionIndex = null;
    state.selectedTextId = t.id;
    saveToLocalStorage();
    updateUI();
    startInlineTextEdit(t.id);
    showStatus("Texto criado.", "success");
}

function onNodeTextInput() {
    if (state.inlineEditNodeId === null) return;
    const n = state.nodes.find(x => x.id === state.inlineEditNodeId);
    if (!n) return;
    n.text = el("nodeEditText").value;
    const ctx = el("canvas").getContext("2d");
    updateNodeMetrics(ctx, n);
    positionInlineEditor();
    saveToLocalStorage();
    drawCanvas();
    if (state.isViewMode) renderReadOnlyView();
}

function onInlineTextInput() {
    if (state.inlineEditTextId === null) return;
    const t = state.texts.find(x => x.id === state.inlineEditTextId);
    if (!t) return;
    t.text = el("freeTextEdit").value;
    updateTextMetrics(el("canvas").getContext("2d"), t);
    positionInlineTextEditor();
    saveToLocalStorage();
    drawCanvas();
    if (state.isViewMode) renderReadOnlyView();
}

function getSelectedNode() {
    return state.selectedNode === null ? null : state.nodes.find(n => n.id === state.selectedNode) || null;
}

function getSelectedText() {
    return state.selectedTextId === null ? null : state.texts.find(t => t.id === state.selectedTextId) || null;
}

function updateDisconnectActionBtn() {
    const b = el("disconnectActionBtn");
    if (!b) return;
    b.textContent = state.isDisconnecting ? "Cancelar desconexao" : "Desconectar nos";
    b.disabled = state.isViewMode || (!state.isDisconnecting && state.selectedNode === null && state.selectedConnectionIndex === null);
}

function updateMenuForSelection() {
    ensureActiveColor();
    const n = getSelectedNode(), shapeEl = el("nodeShapeSelect"), connEl = el("connectionTypeSelect"), selectedConn = getSelectedConnection(), paletteEl = el("colorPalette");
    if (!shapeEl || !connEl) return;
    shapeEl.disabled = !n || state.isViewMode;
    if (paletteEl) paletteEl.classList.toggle("is-disabled", !!state.isViewMode);
    connEl.disabled = state.isViewMode;
    if (selectedConn) {
        connEl.value = selectedConn.type || "arrow";
    } else if (n) {
        shapeEl.value = n.shape || "rect";
    }
    syncColorPaletteUI();
}

function setSelectedNodeShape(v) {
    const n = getSelectedNode();
    if (!n || state.isViewMode) return;
    n.shape = v;
    saveToLocalStorage();
    drawCanvas();
    if (state.isViewMode) renderReadOnlyView();
}

function setSelectedNodeColor(v) {
    if (state.isViewMode) return;
    const nextColor = normalizeHexColor(v, state.activeColor || DEFAULT_ACTIVE_COLOR);
    state.activeColor = nextColor;
    const selectedConn = getSelectedConnection();
    if (selectedConn) {
        selectedConn.color = nextColor;
        saveToLocalStorage();
        updateUI();
        showStatus("Cor da conexão atualizada.", "success");
        return;
    }
    const t = getSelectedText();
    if (t) {
        t.color = nextColor;
        saveToLocalStorage();
        updateUI();
        showStatus("Cor do texto atualizada.", "success");
        return;
    }
    const n = getSelectedNode();
    if (!n) {
        syncColorPaletteUI();
        return;
    }
    n.color = nextColor;
    saveToLocalStorage();
    updateUI();
    showStatus("Cor do nó atualizada.", "success");
}

function setConnectionType(v) {
    if (state.isViewMode) return;
    if (state.selectedConnectionIndex === null) return;
    const c = state.connections[state.selectedConnectionIndex];
    if (!c) return;
    c.type = v || "arrow";
    saveToLocalStorage();
    updateUI();
    showStatus("Tipo de conexão atualizado.", "success");
}

function toggleConnectionFromMenu() {
    if (state.isConnecting) cancelConnection(); else startConnection();
}

function toggleDisconnectFromMenu() {
    if (state.isDisconnecting) cancelDisconnect(); else startDisconnect();
}

function deleteNode() {
    if (state.selectedTextId !== null) {
        state.texts = state.texts.filter(t => t.id !== state.selectedTextId);
        state.selectedTextId = null;
        hideInlineTextEditor(false);
        saveToLocalStorage();
        updateUI();
        showStatus("Texto excluído.", "success");
        return;
    }
    if (state.selectedNode === null) return;
    const id = state.selectedNode;
    state.nodes = state.nodes.filter(n => n.id !== id);
    state.connections = state.connections.filter(c => c.from !== id && c.to !== id);
    state.selectedNode = null;
    state.selectedConnectionIndex = null;
    state.isConnecting = false;
    state.connectingFrom = null;
    state.isDisconnecting = false;
    state.disconnectFrom = null;
    hideInlineEditor(false);
    saveToLocalStorage();
    updateUI();
    showStatus("Nó excluído.", "success");
}

function startConnection() {
    if (state.isViewMode || state.selectedNode === null) return;
    hideInlineEditor(true);
    state.selectedConnectionIndex = null;
    state.isDisconnecting = false;
    state.disconnectFrom = null;
    state.isConnecting = true;
    state.connectingFrom = state.selectedNode;
    ensureActiveColor();
    updateUI();
    showStatus("Selecione o nó de destino.", "info");
}

function cancelConnection() {
    state.isConnecting = false;
    state.connectingFrom = null;
    updateUI();
    showStatus("Conexão cancelada.", "info");
}

function startDisconnect() {
    if (state.isViewMode) return;
    if (state.selectedConnectionIndex !== null && state.connections[state.selectedConnectionIndex]) {
        const c = state.connections[state.selectedConnectionIndex];
        state.connections.splice(state.selectedConnectionIndex, 1);
        state.selectedConnectionIndex = null;
        saveToLocalStorage();
        updateUI();
        showStatus("Conexão removida.", "success");
        return;
    }
    if (state.selectedNode === null) return;
    hideInlineEditor(true);
    state.isConnecting = false;
    state.connectingFrom = null;
    state.isDisconnecting = true;
    state.disconnectFrom = state.selectedNode;
    updateUI();
    showStatus("Selecione o nó de destino para desconectar.", "info");
}

function cancelDisconnect() {
    state.isDisconnecting = false;
    state.disconnectFrom = null;
    updateUI();
    showStatus("Desconexão cancelada.", "info");
}

function finishConnection(to) {
    if (!state.isConnecting || state.connectingFrom === null) return;
    if (state.connectingFrom === to) return showStatus("Não é possível conectar um nó a ele mesmo.", "error");
    if (state.connections.some(c => c.from === state.connectingFrom && c.to === to && ((c.type || "arrow") === (el("connectionTypeSelect")?.value || "arrow")))) return showStatus("Essa conexão já existe.", "info");
    ensureActiveColor();
    state.connections.push({
        from: state.connectingFrom,
        to,
        type: (el("connectionTypeSelect")?.value || "arrow"),
        color: state.activeColor
    });
    state.isConnecting = false;
    state.connectingFrom = null;
    saveToLocalStorage();
    updateUI();
    showStatus("Conexão criada.", "success");
}

function finishDisconnect(to) {
    if (!state.isDisconnecting || state.disconnectFrom === null) return;
    if (state.disconnectFrom === to) return showStatus("Selecione um nó diferente para desconectar.", "error");
    const before = state.connections.length;
    state.connections = state.connections.filter(c => !((c.from === state.disconnectFrom && c.to === to) || (c.from === to && c.to === state.disconnectFrom)));
    const removed = before - state.connections.length;
    state.isDisconnecting = false;
    state.disconnectFrom = null;
    state.selectedConnectionIndex = null;
    saveToLocalStorage();
    updateUI();
    showStatus(removed ? `Conexão removida (${removed}).` : "Nenhuma conexão encontrada entre esses nós.", "info");
}

function getNodeAtPosition(x, y) {
    for (let i = state.nodes.length - 1; i >= 0; i--) {
        const n = state.nodes[i], nw = getNodeWidth(n), nh = getNodeHeight(n);
        if (x >= n.x && x <= n.x + nw && y >= n.y && y <= n.y + nh) return n;
    }
    return null;
}

function getTextAtPosition(x, y) {
    for (let i = state.texts.length - 1; i >= 0; i--) {
        const t = state.texts[i];
        const tw = Number(t.w) || 0;
        const th = Number(t.h) || 0;
        if (x >= t.x && x <= t.x + tw && y >= t.y && y <= t.y + th) return t;
    }
    return null;
}

function getConnectionAtPosition(x, y, threshold = 14) {
    for (let i = state.connections.length - 1; i >= 0; i--) {
        const cn = state.connections[i], g = getConnectionGeometry(state, cn);
        if (!g) continue;
        const type = cn.type || "arrow";
        const d = type === "curve" ? pointToCubicDistance(x, y, g) : pointToSegmentDistance(x, y, g.x1, g.y1, g.x2, g.y2);
        if (d <= threshold) return i;
    }
    return null;
}

function getCanvasPoint(e) {
    const r = el("canvas").getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    return { x: sx + state.cameraX, y: sy + state.cameraY };
}

function getResizeHandleAt(n, x, y) {
    for (const h of getNodeHandles(n)) {
        if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.key;
    }
    return null;
}

function drawCanvas() {
    const c = el("canvas"), ctx = c.getContext("2d");
    ctx.clearRect(0, 0, state.canvasWidth, state.canvasHeight);
    /* Área de desenho sempre no visual claro (igual ao fluxograma.html original); só o chrome usa dark mode. */
    ctx.fillStyle = "#f7f8fa";
    ctx.fillRect(0, 0, state.canvasWidth, state.canvasHeight);
    ctx.strokeStyle = "#e4e8ef"; ctx.lineWidth = 1;
    const grid = 50, startX = -((state.cameraX % grid) + grid) % grid, startY = -((state.cameraY % grid) + grid) % grid;
    for (let x = startX; x < state.canvasWidth; x += grid) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, state.canvasHeight); ctx.stroke(); }
    for (let y = startY; y < state.canvasHeight; y += grid) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(state.canvasWidth, y); ctx.stroke(); }
    state.nodes.forEach(n => updateNodeMetrics(ctx, n));
    state.texts.forEach(t => updateTextMetrics(ctx, t));
    state.nodes.forEach(n => {
        const nw = getNodeWidth(n), nh = getNodeHeight(n), sx = n.x - state.cameraX, sy = n.y - state.cameraY;
        if (sx + nw < 0 || sy + nh < 0 || sx > state.canvasWidth || sy > state.canvasHeight) return;
        const sel = n.id === state.selectedNode, from = n.id === state.connectingFrom, fill = n.color || "#ffffff";
        ctx.fillStyle = sel ? "#214f83" : from ? "#3d8d43" : fill; ctx.strokeStyle = sel ? "#214f83" : from ? "#3d8d43" : "#cfd6e2";
        ctx.lineWidth = 2.5; drawNodeShape(ctx, n.shape || "rect", sx, sy, nw, nh);
        ctx.fillStyle = sel || from ? "#fff" : getTextColorByFill(fill);
        ctx.font = "600 16px Segoe UI"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; drawLinesCentered(ctx, n._lines, sx + nw / 2, sy + nh / 2, NODE_LINE_HEIGHT);
        if (sel && !state.isViewMode) { const hs = NODE_HANDLE_SIZE; ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#214f83"; ctx.lineWidth = 1.5; for (const h of getNodeHandles(n)) { const hx = h.x - state.cameraX, hy = h.y - state.cameraY; ctx.fillRect(hx, hy, hs, hs); ctx.strokeRect(hx, hy, hs, hs); } }
    });
    state.connections.forEach((cn, idx) => {
        const g = getConnectionGeometry(state, cn);
        if (!g) return;
        const fx = g.x1 - state.cameraX, fy = g.y1 - state.cameraY, tx = g.x2 - state.cameraX, ty = g.y2 - state.cameraY, c1x = g.c1x - state.cameraX, c1y = g.c1y - state.cameraY, c2x = g.c2x - state.cameraX, c2y = g.c2y - state.cameraY;
        const sel = idx === state.selectedConnectionIndex, type = cn.type || "arrow", base = cn.color || "#000000";
        ctx.strokeStyle = sel ? "#f59e0b" : base; ctx.fillStyle = sel ? "#f59e0b" : base; ctx.lineWidth = sel ? 4 : 2.5; ctx.setLineDash(type === "line" ? [10, 6] : []); ctx.beginPath(); ctx.moveTo(fx, fy); if (type === "curve") ctx.bezierCurveTo(c1x, c1y, c2x, c2y, tx, ty); else ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
        const endA = type === "curve" ? Math.atan2(ty - c2y, tx - c2x) : Math.atan2(ty - fy, tx - fx), startA = type === "curve" ? Math.atan2(c1y - fy, c1x - fx) : endA + Math.PI, s = 14;
        if (type === "arrow" || type === "both" || type === "curve") drawArrowHead(ctx, tx, ty, endA, s); if (type === "both") drawArrowHead(ctx, fx, fy, startA, s);
    });
    state.texts.forEach(t => {
        const sx = t.x - state.cameraX, sy = t.y - state.cameraY, tw = Number(t.w) || 0, th = Number(t.h) || 0;
        if (sx + tw < 0 || sy + th < 0 || sx > state.canvasWidth || sy > state.canvasHeight) return;
        ctx.font = getTextFont(t);
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = t.color || "#1a1f28";
        ctx.fillText(t.text || "Texto", sx, sy);
        if (t.id === state.selectedTextId && !state.isViewMode) {
            ctx.save();
            ctx.strokeStyle = "#214f83";
            ctx.setLineDash([5, 4]);
            ctx.strokeRect(sx - 4, sy - 4, tw + 8, th + 8);
            ctx.restore();
        }
    });
    ctx.fillStyle = "rgba(247,248,250,.92)"; ctx.fillRect(0, 0, state.canvasWidth, RULER_SIZE); ctx.fillRect(0, 0, RULER_SIZE, state.canvasHeight); ctx.strokeStyle = "rgba(110,118,129,.35)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, RULER_SIZE + .5); ctx.lineTo(state.canvasWidth, RULER_SIZE + .5); ctx.stroke(); ctx.beginPath(); ctx.moveTo(RULER_SIZE + .5, 0); ctx.lineTo(RULER_SIZE + .5, state.canvasHeight); ctx.stroke(); ctx.fillStyle = "#dfe3e9"; ctx.fillRect(0, 0, RULER_SIZE, RULER_SIZE); ctx.font = "10px Segoe UI"; ctx.fillStyle = "#6b7280"; ctx.textAlign = "left"; ctx.textBaseline = "top";
    const rulerStartX = -((state.cameraX % RULER_STEP) + RULER_STEP) % RULER_STEP;
    for (let x = rulerStartX; x < state.canvasWidth; x += RULER_STEP) { if (x < RULER_SIZE) continue; const worldX = Math.round(state.cameraX + x); ctx.strokeStyle = "rgba(110,118,129,.35)"; ctx.beginPath(); ctx.moveTo(x + .5, RULER_SIZE); ctx.lineTo(x + .5, RULER_SIZE - 6); ctx.stroke(); ctx.fillText(String(worldX), x + 2, 2); }
    const rulerStartY = -((state.cameraY % RULER_STEP) + RULER_STEP) % RULER_STEP;
    for (let y = rulerStartY; y < state.canvasHeight; y += RULER_STEP) { if (y < RULER_SIZE) continue; const worldY = Math.round(state.cameraY + y); ctx.strokeStyle = "rgba(110,118,129,.35)"; ctx.beginPath(); ctx.moveTo(RULER_SIZE, y + .5); ctx.lineTo(RULER_SIZE - 6, y + .5); ctx.stroke(); ctx.save(); ctx.translate(2, y + 2); ctx.rotate(-Math.PI / 2); ctx.fillText(String(worldY), 0, 0); ctx.restore(); }
}

function renderReadOnlyView() {
    const box = el("renderView"), ctx = el("canvas").getContext("2d");
    box.innerHTML = ""; const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${state.viewportWidth} ${state.viewportHeight}`); svg.setAttribute("width", "100%"); svg.setAttribute("height", "100%");
    const defs = document.createElementNS(ns, "defs"), marker = document.createElementNS(ns, "marker"), markerStart = document.createElementNS(ns, "marker"), path = document.createElementNS(ns, "path"), pathStart = document.createElementNS(ns, "path");
    marker.setAttribute("id", "arrow"); marker.setAttribute("markerWidth", "12"); marker.setAttribute("markerHeight", "9"); marker.setAttribute("refX", "12"); marker.setAttribute("refY", "4.5"); marker.setAttribute("orient", "auto"); marker.setAttribute("markerUnits", "strokeWidth"); path.setAttribute("d", "M0,0 L12,4.5 L0,9 z"); path.setAttribute("fill", "context-stroke"); marker.appendChild(path); markerStart.setAttribute("id", "arrowStart"); markerStart.setAttribute("markerWidth", "12"); markerStart.setAttribute("markerHeight", "9"); markerStart.setAttribute("refX", "0"); markerStart.setAttribute("refY", "4.5"); markerStart.setAttribute("orient", "auto"); markerStart.setAttribute("markerUnits", "strokeWidth"); pathStart.setAttribute("d", "M12,0 L0,4.5 L12,9 z"); pathStart.setAttribute("fill", "context-stroke"); markerStart.appendChild(pathStart); defs.appendChild(marker); defs.appendChild(markerStart); svg.appendChild(defs);
    state.nodes.forEach(n => updateNodeMetrics(ctx, n));
    state.texts.forEach(t => updateTextMetrics(ctx, t));
    state.nodes.forEach(n => {
        const nw = getNodeWidth(n), nh = getNodeHeight(n), sx = n.x - state.cameraX, sy = n.y - state.cameraY;
        if (sx + nw < 0 || sy + nh < 0 || sx > state.viewportWidth || sy > state.viewportHeight) return;
        const g = document.createElementNS(ns, "g"), t = document.createElementNS(ns, "text"), lines = (n._lines && n._lines.length) ? n._lines : ["Nó sem texto"], shape = (n.shape || "rect");
        let shp; if (shape === "ellipse") { shp = document.createElementNS(ns, "ellipse"); shp.setAttribute("cx", String(sx + nw / 2)); shp.setAttribute("cy", String(sy + nh / 2)); shp.setAttribute("rx", String(nw / 2)); shp.setAttribute("ry", String(nh / 2)); } else if (shape === "diamond") { shp = document.createElementNS(ns, "polygon"); shp.setAttribute("points", `${sx + nw / 2},${sy} ${sx + nw},${sy + nh / 2} ${sx + nw / 2},${sy + nh} ${sx},${sy + nh / 2}`); } else if (shape === "hexagon") { const d = Math.min(nw * 0.22, 44); shp = document.createElementNS(ns, "polygon"); shp.setAttribute("points", `${sx + d},${sy} ${sx + nw - d},${sy} ${sx + nw},${sy + nh / 2} ${sx + nw - d},${sy + nh} ${sx + d},${sy + nh} ${sx},${sy + nh / 2}`); } else { shp = document.createElementNS(ns, "rect"); shp.setAttribute("x", String(sx)); shp.setAttribute("y", String(sy)); shp.setAttribute("width", String(nw)); shp.setAttribute("height", String(nh)); shp.setAttribute("rx", "8"); }
        shp.setAttribute("fill", n.color || "#ffffff"); shp.setAttribute("stroke", "#cfd6e2"); shp.setAttribute("stroke-width", "2"); t.setAttribute("x", String(sx + nw / 2)); t.setAttribute("text-anchor", "middle"); t.setAttribute("fill", getTextColorByFill(n.color || "#ffffff")); t.setAttribute("font-size", "16"); t.setAttribute("font-family", "Segoe UI, sans-serif");
        const startY = sy + (nh - (lines.length * NODE_LINE_HEIGHT)) / 2 + 14; for (let idx = 0; idx < lines.length; idx++) { const sp = document.createElementNS(ns, "tspan"); sp.setAttribute("x", String(sx + nw / 2)); sp.setAttribute("y", String(startY + idx * NODE_LINE_HEIGHT)); sp.textContent = lines[idx] || " "; t.appendChild(sp); } g.appendChild(shp); g.appendChild(t); svg.appendChild(g);
    });
    state.connections.forEach(cn => {
        const g = getConnectionGeometry(state, cn);
        if (!g) return;
        const type = cn.type || "arrow", base = cn.color || "#000000";
        let edge; if (type === "curve") { edge = document.createElementNS(ns, "path"); edge.setAttribute("d", `M ${g.x1 - state.cameraX} ${g.y1 - state.cameraY} C ${g.c1x - state.cameraX} ${g.c1y - state.cameraY}, ${g.c2x - state.cameraX} ${g.c2y - state.cameraY}, ${g.x2 - state.cameraX} ${g.y2 - state.cameraY}`); } else { edge = document.createElementNS(ns, "line"); edge.setAttribute("x1", String(g.x1 - state.cameraX)); edge.setAttribute("y1", String(g.y1 - state.cameraY)); edge.setAttribute("x2", String(g.x2 - state.cameraX)); edge.setAttribute("y2", String(g.y2 - state.cameraY)); }
        edge.setAttribute("fill", "none"); edge.setAttribute("stroke", base); edge.setAttribute("stroke-width", "2.5"); if (type === "line") edge.setAttribute("stroke-dasharray", "10 6"); if (type === "arrow" || type === "both" || type === "curve") edge.setAttribute("marker-end", "url(#arrow)"); if (type === "both") edge.setAttribute("marker-start", "url(#arrowStart)"); svg.appendChild(edge);
    });
    state.texts.forEach(t => {
        const sx = t.x - state.cameraX, sy = t.y - state.cameraY;
        if (sx + (Number(t.w) || 0) < 0 || sy + (Number(t.h) || 0) < 0 || sx > state.viewportWidth || sy > state.viewportHeight) return;
        const label = document.createElementNS(ns, "text");
        label.setAttribute("x", String(sx));
        label.setAttribute("y", String(sy + (Number(t.fontSize) || 24)));
        label.setAttribute("fill", t.color || "#1a1f28");
        label.setAttribute("font-size", String(Number(t.fontSize) || 24));
        label.setAttribute("font-weight", "700");
        label.setAttribute("font-family", "Segoe UI, sans-serif");
        label.textContent = t.text || "Texto";
        svg.appendChild(label);
    });
    box.appendChild(svg);
}

function focusNodeEditor() {
    if (state.inlineEditNodeId === null) return;
    const i = el("nodeEditText"); i.focus(); i.setSelectionRange(i.value.length, i.value.length);
}

function positionInlineEditor() {
    if (state.inlineEditNodeId === null) return;
    const n = state.nodes.find(x => x.id === state.inlineEditNodeId), i = el("nodeEditText");
    if (!n || state.isViewMode) { i.style.display = "none"; return; }
    const nw = getNodeWidth(n), nh = getNodeHeight(n), sx = n.x - state.cameraX, sy = n.y - state.cameraY;
    if (sx + nw < 0 || sy + nh < 0 || sx > state.viewportWidth || sy > state.viewportHeight) { i.style.display = "none"; return; }
    i.style.left = `${sx}px`; i.style.top = `${sy}px`; i.style.width = `${nw}px`; i.style.height = `${nh}px`; i.style.display = "block";
}

function positionInlineTextEditor() {
    if (state.inlineEditTextId === null) return;
    const t = state.texts.find(x => x.id === state.inlineEditTextId), i = el("freeTextEdit");
    if (!t || state.isViewMode) { i.style.display = "none"; return; }
    const sx = t.x - state.cameraX, sy = t.y - state.cameraY;
    if (sx + (Number(t.w) || 0) < 0 || sy + (Number(t.h) || 0) < 0 || sx > state.viewportWidth || sy > state.viewportHeight) { i.style.display = "none"; return; }
    i.style.left = `${sx}px`;
    i.style.top = `${sy}px`;
    i.style.width = `${Math.max(80, (Number(t.w) || 0) + 24)}px`;
    i.style.height = `${Math.max(30, (Number(t.h) || 0) + 8)}px`;
    i.style.font = getTextFont(t);
    i.style.color = t.color || "#1a1f28";
    i.style.display = "block";
}

function startInlineEdit(nodeId) {
    if (state.isViewMode) return;
    hideInlineTextEditor(true);
    const n = state.nodes.find(x => x.id === nodeId);
    if (!n) return;
    updateNodeMetrics(el("canvas").getContext("2d"), n);
    state.inlineEditNodeId = nodeId;
    const i = el("nodeEditText"); i.value = n.text || ""; i.style.display = "block"; positionInlineEditor(); focusNodeEditor(); drawCanvas();
}

function startInlineTextEdit(textId) {
    if (state.isViewMode) return;
    hideInlineEditor(true);
    const t = state.texts.find(x => x.id === textId);
    if (!t) return;
    updateTextMetrics(el("canvas").getContext("2d"), t);
    state.inlineEditTextId = textId;
    const i = el("freeTextEdit");
    i.value = t.text || "";
    i.style.display = "block";
    positionInlineTextEditor();
    i.focus();
    i.setSelectionRange(i.value.length, i.value.length);
    drawCanvas();
}

function hideInlineEditor(commit = true) {
    const i = el("nodeEditText"); if (state.inlineEditNodeId === null) { i.style.display = "none"; return; }
    const n = state.nodes.find(x => x.id === state.inlineEditNodeId);
    if (commit && n) { n.text = i.value.trim() || "Nó sem texto"; updateNodeMetrics(el("canvas").getContext("2d"), n); }
    state.inlineEditNodeId = null; i.style.display = "none"; saveToLocalStorage(); drawCanvas();
}

function hideInlineTextEditor(commit = true) {
    const i = el("freeTextEdit");
    if (state.inlineEditTextId === null) { i.style.display = "none"; return; }
    const t = state.texts.find(x => x.id === state.inlineEditTextId);
    if (commit && t) {
        t.text = i.value.trim() || "Texto";
        updateTextMetrics(el("canvas").getContext("2d"), t);
    }
    state.inlineEditTextId = null;
    i.style.display = "none";
    saveToLocalStorage();
    drawCanvas();
}

function updateUI() {
    drawCanvas(); const connected = new Set();
    state.connections.forEach(c => { connected.add(c.from); connected.add(c.to); });
    el("totalNodes").textContent = state.nodes.length; el("totalConnections").textContent = state.connections.length; el("connectedNodes").textContent = connected.size;
    updateDisconnectActionBtn(); updateMenuForSelection();
    if (state.isViewMode) { hideInlineEditor(false); hideInlineTextEditor(false); el("canvas").style.display = "none"; el("renderView").style.display = "block"; renderReadOnlyView(); }
    else { el("renderView").style.display = "none"; el("canvas").style.display = "block"; positionInlineEditor(); positionInlineTextEditor(); }
}

function toggleViewMode() {
    state.isViewMode = !state.isViewMode;
    const root = fluxRoot();
    if (root) root.classList.toggle("view", state.isViewMode);
    if (state.isConnecting) cancelConnection(); if (state.isDisconnecting) cancelDisconnect();
    el("viewModeBtn").textContent = state.isViewMode ? "Editar" : "Visualizar"; updateUI();
    showStatus(state.isViewMode ? "Modo visualização ativo." : "Modo edição ativo.", "info");
}

function renameProject() { el("projectNameInput").value = state.projectName; el("renameModal").style.display = "flex"; el("projectNameInput").focus(); }
function closeRenameModal() { el("renameModal").style.display = "none"; }
function saveProjectName() { const n = el("projectNameInput").value.trim(); if (!n) return; state.projectName = n; setProjectTitle(); saveToLocalStorage(); closeRenameModal(); showStatus(`Projeto renomeado para "${n}".`, "success"); }

function centerView() {
    hideInlineEditor(false); hideInlineTextEditor(false);
    if (!state.nodes.length && !state.texts.length) { state.cameraX = 0; state.cameraY = 0; updateUI(); showStatus("Visão centralizada no ponto inicial.", "info"); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.nodes.forEach(n => { const nw = getNodeWidth(n), nh = getNodeHeight(n); minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x + nw); maxY = Math.max(maxY, n.y + nh); });
    state.texts.forEach(t => { minX = Math.min(minX, t.x); minY = Math.min(minY, t.y); maxX = Math.max(maxX, t.x + (Number(t.w) || 0)); maxY = Math.max(maxY, t.y + (Number(t.h) || 0)); });
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    state.cameraX = cx - state.viewportWidth / 2; state.cameraY = cy - state.viewportHeight / 2; updateUI(); showStatus("Visão centralizada nos dados.", "success");
}

let statusTimer = null;
function showStatus(msg, type) {
    const s = el("statusMessage"); if (statusTimer) clearTimeout(statusTimer);
    s.textContent = msg; s.className = `status ${type}`; requestAnimationFrame(() => s.classList.add("active"));
    statusTimer = setTimeout(() => s.classList.remove("active"), 3200);
}

function exportToPNG() {
    drawCanvas(); const c = el("canvas"), a = document.createElement("a");
    a.href = c.toDataURL("image/png"); a.download = `${sanitizeFilename(state.projectName)}.png`; a.click();
    showStatus("PNG exportado.", "success");
}

function setupCanvasInteractions() {
    const c = el("canvas"), i = el("nodeEditText"), tInput = el("freeTextEdit");
    let activePointerId = null, startX = 0, startY = 0, downNodeId = null, downTextId = null, downConnectionIndex = null, wasSelectedOnDown = false, wasTextSelectedOnDown = false, isPanning = false, panStartClientX = 0, panStartClientY = 0, panStartCameraX = 0, panStartCameraY = 0, isResizing = false, resizeNodeId = null, resizeHandle = null, resizeStart = { x: 0, y: 0, w: 0, h: 0, nx: 0, ny: 0 }, pointerMap = new Map(), isPinching = false, pinchNodeId = null, pinchStartDist = 0, pinchStart = { w: 0, h: 0, x: 0, y: 0 };
    i.addEventListener("input", onNodeTextInput); i.addEventListener("blur", () => hideInlineEditor(true)); i.addEventListener("pointerdown", e => e.stopPropagation());
    tInput.addEventListener("input", onInlineTextInput); tInput.addEventListener("blur", () => hideInlineTextEditor(true)); tInput.addEventListener("pointerdown", e => e.stopPropagation());
    c.addEventListener("pointerdown", e => {
        if (state.isViewMode) return;
        pointerMap.set(e.pointerId, { x: e.clientX, y: e.clientY }); const { x, y } = getCanvasPoint(e), n = getNodeAtPosition(x, y), t = n ? null : getTextAtPosition(x, y);
        startX = x; startY = y; downNodeId = n ? n.id : null; downTextId = t ? t.id : null; wasSelectedOnDown = !!n && state.selectedNode === n.id; wasTextSelectedOnDown = !!t && state.selectedTextId === t.id;
        if (state.isConnecting) { if (n) finishConnection(n.id); else showStatus("Toque em um nó para conectar.", "info"); return; }
        if (state.isDisconnecting) { if (n) finishDisconnect(n.id); else showStatus("Toque em um nó para desconectar.", "info"); return; }
        if (pointerMap.size === 2 && state.selectedNode !== null) {
            const sn = state.nodes.find(v => v.id === state.selectedNode);
            if (sn) {
                const pts = [...pointerMap.values()];
                const p1 = { x: pts[0].x - el("canvas").getBoundingClientRect().left + state.cameraX, y: pts[0].y - el("canvas").getBoundingClientRect().top + state.cameraY };
                const p2 = { x: pts[1].x - el("canvas").getBoundingClientRect().left + state.cameraX, y: pts[1].y - el("canvas").getBoundingClientRect().top + state.cameraY };
                const w = getNodeWidth(sn), h = getNodeHeight(sn);
                const in1 = p1.x >= sn.x && p1.x <= sn.x + w && p1.y >= sn.y && p1.y <= sn.y + h;
                const in2 = p2.x >= sn.x && p2.x <= sn.x + w && p2.y >= sn.y && p2.y <= sn.y + h;
                if (in1 && in2) { isPinching = true; pinchNodeId = sn.id; pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1; pinchStart = { w: w, h: h, x: sn.x, y: sn.y }; sn.manualSize = true; c.style.cursor = "grabbing"; return; }
            }
        }
        if (!n && !t) {
            downConnectionIndex = getConnectionAtPosition(x, y); activePointerId = e.pointerId; panStartClientX = e.clientX; panStartClientY = e.clientY; panStartCameraX = state.cameraX; panStartCameraY = state.cameraY; c.setPointerCapture(e.pointerId);
            if (downConnectionIndex !== null) { c.style.cursor = "pointer"; return; }
            state.selectedNode = null; state.selectedTextId = null; state.selectedConnectionIndex = null; hideInlineEditor(true); hideInlineTextEditor(true); updateUI(); isPanning = true; c.style.cursor = "grabbing"; return;
        }
        if (t) {
            if (state.inlineEditTextId !== t.id) hideInlineTextEditor(true);
            hideInlineEditor(true);
            state.selectedNode = null;
            state.selectedConnectionIndex = null;
            state.selectedTextId = t.id;
            state.draggingTextId = t.id;
            state.dragOffsetX = x - t.x;
            state.dragOffsetY = y - t.y;
            state.hasDragged = false;
            activePointerId = e.pointerId;
            c.setPointerCapture(e.pointerId);
            c.style.cursor = "grabbing";
            drawCanvas();
            return;
        }
        if (state.inlineEditNodeId !== n.id) hideInlineEditor(true);
        hideInlineTextEditor(true);
        state.selectedConnectionIndex = null;
        state.selectedTextId = null;
        if (state.selectedNode === n.id) {
            const handle = getResizeHandleAt(n, x, y);
            if (handle) { isResizing = true; resizeNodeId = n.id; resizeHandle = handle; resizeStart = { x, y, w: getNodeWidth(n), h: getNodeHeight(n), nx: n.x, ny: n.y }; n.manualSize = true; activePointerId = e.pointerId; c.setPointerCapture(e.pointerId); c.style.cursor = "nwse-resize"; return; }
        }
        state.draggingNodeId = n.id; state.dragOffsetX = x - n.x; state.dragOffsetY = y - n.y; state.hasDragged = false; activePointerId = e.pointerId; c.setPointerCapture(e.pointerId); c.style.cursor = "grabbing";
    });
    c.addEventListener("pointermove", e => {
        const r = c.getBoundingClientRect(); if (pointerMap.has(e.pointerId)) pointerMap.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (state.isViewMode) return;
        if (isPinching && pinchNodeId !== null && pointerMap.size >= 2) {
            const pts = [...pointerMap.values()]; const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1; const scale = dist / pinchStartDist;
            const n = state.nodes.find(v => v.id === pinchNodeId); if (!n) return;
            const nw = Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH_MANUAL, pinchStart.w * scale));
            const nh = Math.max(NODE_MIN_HEIGHT, Math.min(NODE_MAX_HEIGHT_MANUAL, pinchStart.h * scale));
            const cx = pinchStart.x + pinchStart.w / 2, cy = pinchStart.y + pinchStart.h / 2;
            n.w = nw; n.h = nh; n.x = cx - nw / 2; n.y = cy - nh / 2; updateNodeMetrics(el("canvas").getContext("2d"), n); positionInlineEditor(); drawCanvas(); return;
        }
        if (activePointerId !== e.pointerId) return;
        if (!isPanning && downConnectionIndex !== null) { const moved = Math.hypot(e.clientX - panStartClientX, e.clientY - panStartClientY) > 6; if (moved) { isPanning = true; c.style.cursor = "grabbing"; } }
        if (isPanning) { const dx = e.clientX - panStartClientX, dy = e.clientY - panStartClientY; state.cameraX = panStartCameraX - dx; state.cameraY = panStartCameraY - dy; positionInlineEditor(); positionInlineTextEditor(); drawCanvas(); return; }
        if (isResizing && resizeNodeId !== null) {
            const n = state.nodes.find(v => v.id === resizeNodeId); if (!n) return;
            const p = { x: e.clientX - r.left + state.cameraX, y: e.clientY - r.top + state.cameraY }, dx = p.x - resizeStart.x, dy = p.y - resizeStart.y;
            let w = resizeStart.w, h = resizeStart.h, x = resizeStart.nx, y = resizeStart.ny;
            if (resizeHandle === "se") { w = resizeStart.w + dx; h = resizeStart.h + dy; }
            if (resizeHandle === "sw") { w = resizeStart.w - dx; h = resizeStart.h + dy; x = resizeStart.nx + dx; }
            if (resizeHandle === "ne") { w = resizeStart.w + dx; h = resizeStart.h - dy; y = resizeStart.ny + dy; }
            if (resizeHandle === "nw") { w = resizeStart.w - dx; h = resizeStart.h - dy; x = resizeStart.nx + dx; y = resizeStart.ny + dy; }
            n.w = Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH_MANUAL, w)); n.h = Math.max(NODE_MIN_HEIGHT, Math.min(NODE_MAX_HEIGHT_MANUAL, h)); n.x = x; n.y = y; updateNodeMetrics(el("canvas").getContext("2d"), n); positionInlineEditor(); drawCanvas(); return;
        }
        if (state.draggingTextId !== null) {
            const t = state.texts.find(x => x.id === state.draggingTextId); if (!t) return;
            const { x, y } = getCanvasPoint(e), nx = x - state.dragOffsetX, ny = y - state.dragOffsetY;
            if (Math.abs(t.x - nx) > 1 || Math.abs(t.y - ny) > 1) state.hasDragged = true; t.x = nx; t.y = ny; positionInlineTextEditor(); drawCanvas(); return;
        }
        if (state.draggingNodeId === null) return;
        const n = state.nodes.find(x => x.id === state.draggingNodeId); if (!n) return;
        const { x, y } = getCanvasPoint(e), nx = x - state.dragOffsetX, ny = y - state.dragOffsetY;
        if (Math.abs(n.x - nx) > 1 || Math.abs(n.y - ny) > 1) state.hasDragged = true; n.x = nx; n.y = ny; positionInlineEditor(); drawCanvas();
    });
    const endPointer = (e) => {
        pointerMap.delete(e.pointerId); if (isPinching && pointerMap.size < 2) { isPinching = false; pinchNodeId = null; saveToLocalStorage(); drawCanvas(); return; }
        if (activePointerId !== e.pointerId) return;
        if (isPanning) { isPanning = false; activePointerId = null; downNodeId = null; downTextId = null; downConnectionIndex = null; wasSelectedOnDown = false; wasTextSelectedOnDown = false; c.style.cursor = "crosshair"; return; }
        if (isResizing) { isResizing = false; resizeNodeId = null; resizeHandle = null; activePointerId = null; saveToLocalStorage(); drawCanvas(); c.style.cursor = "crosshair"; return; }
        const p = getCanvasPoint(e), moved = Math.hypot(p.x - startX, p.y - startY) > 6; if ((state.draggingNodeId !== null || state.draggingTextId !== null) && state.hasDragged) saveToLocalStorage();
        if (!moved && downConnectionIndex !== null && !state.isViewMode && !state.isConnecting) {
            hideInlineEditor(false); hideInlineTextEditor(false); state.selectedNode = null; state.selectedTextId = null; state.selectedConnectionIndex = downConnectionIndex; updateUI();
        } else if (!moved && downTextId !== null && !state.isViewMode && !state.isConnecting) {
            if (wasTextSelectedOnDown) { startInlineTextEdit(downTextId); } else { hideInlineEditor(false); hideInlineTextEditor(false); state.selectedNode = null; state.selectedTextId = downTextId; state.selectedConnectionIndex = null; updateUI(); }
        } else if (!moved && downNodeId !== null && !state.isViewMode && !state.isConnecting) {
            if (wasSelectedOnDown) { startInlineEdit(downNodeId); } else { hideInlineEditor(false); hideInlineTextEditor(false); state.selectedNode = downNodeId; state.selectedTextId = null; state.selectedConnectionIndex = null; updateUI(); }
        }
        state.draggingNodeId = null; state.draggingTextId = null; state.hasDragged = false; activePointerId = null; downNodeId = null; downTextId = null; downConnectionIndex = null; wasSelectedOnDown = false; wasTextSelectedOnDown = false; c.style.cursor = "crosshair";
    };
    c.addEventListener("pointerup", endPointer); c.addEventListener("pointercancel", endPointer);
    c.addEventListener("lostpointercapture", () => { state.draggingNodeId = null; state.draggingTextId = null; state.hasDragged = false; activePointerId = null; downNodeId = null; downTextId = null; downConnectionIndex = null; wasSelectedOnDown = false; wasTextSelectedOnDown = false; isPanning = false; isResizing = false; isPinching = false; resizeNodeId = null; resizeHandle = null; pinchNodeId = null; pointerMap.clear(); c.style.cursor = "crosshair"; });
}

// Global Exports for HTML
window.addNode = addNode;
window.addTextLabel = addTextLabel;
window.toggleConnectionFromMenu = toggleConnectionFromMenu;
window.centerView = centerView;
window.deleteNode = deleteNode;
window.exportToPNG = exportToPNG;
window.renameProject = renameProject;
window.toggleViewMode = toggleViewMode;
window.toggleDisconnectFromMenu = toggleDisconnectFromMenu;
window.closeRenameModal = closeRenameModal;
window.saveProjectName = saveProjectName;

function onWindowResize() {
    resizeCanvas(true);
    updateUI();
}

export function bootFluxograma(opts = {}) {
    const root = fluxRoot();
    if (!root || !el("canvas")) return;
    if (root._fluxOnResize) {
        window.removeEventListener("resize", root._fluxOnResize);
    }
    if (opts.skipLocalLoad !== true) {
        loadFromLocalStorage();
    }
    ensureActiveColor();
    setProjectTitle();
    resizeCanvas(false);
    setupCanvasInteractions();
    renderColorPalette();
    const delegChange = (e) => {
        const id = e.target.id;
        if (id === "flux-nodeShapeSelect") setSelectedNodeShape(e.target.value);
        else if (id === "flux-connectionTypeSelect") setConnectionType(e.target.value);
    };
    const delegClick = (e) => {
        const btn = e.target.closest("[data-flux-color]");
        if (!btn || state.isViewMode) return;
        setSelectedNodeColor(btn.getAttribute("data-flux-color"));
    };
    if (root._fluxDelegChange) root.removeEventListener("change", root._fluxDelegChange);
    if (root._fluxDelegClick) root.removeEventListener("click", root._fluxDelegClick);
    root.addEventListener("change", delegChange);
    root.addEventListener("click", delegClick);
    root._fluxDelegChange = delegChange;
    root._fluxDelegClick = delegClick;
    const renameModal = el("renameModal");
    if (renameModal) {
        if (root._fluxRenameClick) renameModal.removeEventListener("click", root._fluxRenameClick);
        const onRenameBackdrop = (e) => {
            if (e.target === renameModal) closeRenameModal();
        };
        renameModal.addEventListener("click", onRenameBackdrop);
        root._fluxRenameClick = onRenameBackdrop;
    }
    root._fluxOnResize = onWindowResize;
    window.addEventListener("resize", root._fluxOnResize);
    updateUI();
    showStatus("Pronto para criar seu fluxograma.", "success");
}

export function afterExternalHydrate() {
    hideInlineEditor(false);
    hideInlineTextEditor(false);
    setProjectTitle();
    if (el("canvasScroll")) resizeCanvas(false);
    updateUI();
    saveToLocalStorage();
}

