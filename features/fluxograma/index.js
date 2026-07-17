/* index.js - Orchestration for Fluxograma */

import {
    state, loadFromLocalStorage, saveToLocalStorage,
    NODE_MIN_WIDTH, NODE_MIN_HEIGHT, NODE_MAX_WIDTH_AUTO, NODE_MAX_WIDTH_MANUAL,
    NODE_MAX_HEIGHT_MANUAL, NODE_PADDING_X, NODE_PADDING_Y, NODE_LINE_HEIGHT,
    NODE_HANDLE_SIZE
} from './model/flowchartModel.js';

import {
    sanitizeFilename, getNodeWidth, getNodeHeight, updateNodeMetrics,
    getConnectionGeometry, getNodeConnectionPoint, getConnectorPoint,
    pointToSegmentDistance, pointToCubicDistance,
    getTextColorByFill, drawNodeShape, drawArrowHead, drawLinesCentered,
    getNodeHandles, getNodePorts, getNearestNodePort
} from './service/flowchartService.js';

import {
    EXPORT_PADDING,
    MAX_EXPORT_CANVAS_EDGE,
    buildExportFileName,
    getExportPageRects,
    getGraphContentBounds,
    shouldSplitIntoTwoPages
} from './service/exportPngService.js';

const el = id => document.getElementById("flux-" + id);
function fluxRoot() {
    return document.getElementById("fluxograma-root");
}

const FLUX_PALETTE = [
    "#d1d5db", "#fde68a", "#f59e0b",
    "#f97316", "#ef4444", "#ec4899", "#a855f7",
    "#6366f1", "#3b82f6", "#06b6d4", "#14b8a6",
    "#22c55e", "#84cc16", "#65a30d", "#1f2937"
];
const DEFAULT_ACTIVE_COLOR = "#d1d5db";
const DEFAULT_NODE_SHAPE = "rect";
const NODE_SHAPE_LABELS = {
    rect: "Retangulo",
    ellipse: "Elipse",
    diamond: "Losango",
    hexagon: "Hexagono"
};
const NODE_SHAPE_OPTIONS = ["rect", "ellipse", "diamond", "hexagon"];
const MIN_CANVAS_ZOOM = 0.65;
const MAX_CANVAS_ZOOM = 1.85;
const CANVAS_ZOOM_STEP = 0.12;
const PORT_HOVER_RADIUS = 18;
const PORT_MAGNET_RADIUS = 26;

function normalizeHexColor(value, fallback = "#000000") {
    const input = String(value || "").trim().toLowerCase();
    if (!/^#?[0-9a-f]{3}([0-9a-f]{3})?$/.test(input)) return fallback;
    let hex = input.startsWith("#") ? input : `#${input}`;
    if (hex.length === 4) hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    return hex;
}

function getNodeAccent(node) {
    return normalizeHexColor(node?.color || state.activeColor || DEFAULT_ACTIVE_COLOR, DEFAULT_ACTIVE_COLOR);
}

function ensureActiveColor() {
    state.activeColor = normalizeHexColor(state.activeColor || DEFAULT_ACTIVE_COLOR, DEFAULT_ACTIVE_COLOR);
}

function normalizeCanvasZoom(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 1;
    return Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, n));
}

function isPaletteColor(value) {
    const hex = normalizeHexColor(value, "");
    return FLUX_PALETTE.includes(hex);
}

function normalizeNodeShape(value, fallback = DEFAULT_NODE_SHAPE) {
    const shape = String(value || "").trim().toLowerCase();
    return NODE_SHAPE_OPTIONS.includes(shape) ? shape : fallback;
}

function getShapeLabel(shape) {
    return NODE_SHAPE_LABELS[normalizeNodeShape(shape)] || NODE_SHAPE_LABELS[DEFAULT_NODE_SHAPE];
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

function setCanvasCursor(c, value) {
    if (c && c.style.cursor !== value) {
        c.style.cursor = value;
    }
}

function drawStartNodeBadge(ctx, port, cameraX, cameraY) {
    const px = port.px - cameraX;
    const py = port.py - cameraY;
    const offset = 17;
    const badgeSize = 18;
    let bx = px;
    let by = py;

    if (port.key === "left") bx -= offset + badgeSize * 0.5;
    else if (port.key === "right") bx += offset - badgeSize * 0.5;
    else if (port.key === "top") by -= offset + badgeSize * 0.5;
    else if (port.key === "bottom") by += offset - badgeSize * 0.5;

    ctx.save();
    ctx.translate(bx, by);
    ctx.shadowBlur = 14;
    ctx.shadowColor = "rgba(125, 211, 252, 0.35)";
    ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
    ctx.strokeStyle = "rgba(125, 211, 252, 0.92)";
    ctx.lineWidth = 1.5;
    if (typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(-badgeSize / 2, -badgeSize / 2, badgeSize, badgeSize, 7);
        ctx.fill();
        ctx.stroke();
    } else {
        ctx.beginPath();
        ctx.arc(0, 0, badgeSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#7dd3fc";
    ctx.beginPath();
    if (port.key === "left") {
        ctx.moveTo(-3, 0);
        ctx.lineTo(3, -4);
        ctx.lineTo(3, 4);
    } else if (port.key === "right") {
        ctx.moveTo(3, 0);
        ctx.lineTo(-3, -4);
        ctx.lineTo(-3, 4);
    } else if (port.key === "top") {
        ctx.moveTo(0, -3);
        ctx.lineTo(-4, 3);
        ctx.lineTo(4, 3);
    } else {
        ctx.moveTo(0, 3);
        ctx.lineTo(-4, -3);
        ctx.lineTo(4, -3);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
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

function resetActiveColor() {
    if (state.isViewMode) return;
    state.activeColor = DEFAULT_ACTIVE_COLOR;
    const selectedConn = getSelectedConnection();
    if (selectedConn) {
        selectedConn.color = "#22c55e";
    } else {
        const node = getSelectedNode();
        if (node) node.color = DEFAULT_ACTIVE_COLOR;
        const text = getSelectedText();
        if (text) text.color = "#1a1f28";
    }
    saveToLocalStorage();
    syncColorPaletteUI();
    updateUI();
    showStatus("Cor redefinida para o cinza original.", "success");
    closeColorModal();
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
        shape: state.defaultNodeShape || DEFAULT_NODE_SHAPE,
        color: state.activeColor || DEFAULT_ACTIVE_COLOR
    };
    state.nodes.push(n);
    state.nextId++;
    setNodeSelection([n.id]);
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
    setTextSelection([t.id]);
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

function uniqueIds(values) {
    return [...new Set((Array.isArray(values) ? values : []).filter((v) => Number.isInteger(v)))];
}

function getSelectedNodeIds() {
    const ids = uniqueIds(state.selectedNodeIds);
    if (ids.length) return ids;
    return state.selectedNode === null ? [] : [state.selectedNode];
}

function getSelectedTextIds() {
    const ids = uniqueIds(state.selectedTextIds);
    if (ids.length) return ids;
    return state.selectedTextId === null ? [] : [state.selectedTextId];
}

function getSelectedConnectionIndexes() {
    const indexes = uniqueIds(state.selectedConnectionIndexes);
    if (indexes.length) return indexes;
    return state.selectedConnectionIndex === null ? [] : [state.selectedConnectionIndex];
}

function clearSelectionState() {
    state.selectedNode = null;
    state.selectedTextId = null;
    state.selectedConnectionIndex = null;
    state.selectedNodeIds = [];
    state.selectedTextIds = [];
    state.selectedConnectionIndexes = [];
}

function setNodeSelection(ids = []) {
    const uniq = uniqueIds(ids);
    state.selectedNodeIds = uniq;
    state.selectedNode = uniq[0] ?? null;
    state.selectedTextId = null;
    state.selectedTextIds = [];
    state.selectedConnectionIndex = null;
    state.selectedConnectionIndexes = [];
}

function setTextSelection(ids = []) {
    const uniq = uniqueIds(ids);
    state.selectedTextIds = uniq;
    state.selectedTextId = uniq[0] ?? null;
    state.selectedNode = null;
    state.selectedNodeIds = [];
    state.selectedConnectionIndex = null;
    state.selectedConnectionIndexes = [];
}

function setConnectionSelection(indexes = []) {
    const uniq = uniqueIds(indexes);
    state.selectedConnectionIndexes = uniq;
    state.selectedConnectionIndex = uniq[0] ?? null;
    state.selectedNode = null;
    state.selectedNodeIds = [];
    state.selectedTextId = null;
    state.selectedTextIds = [];
}

function isNodeSelected(nodeOrId) {
    const id = typeof nodeOrId === "object" ? nodeOrId?.id : nodeOrId;
    return getSelectedNodeIds().includes(id);
}

function isTextSelected(textOrId) {
    const id = typeof textOrId === "object" ? textOrId?.id : textOrId;
    return getSelectedTextIds().includes(id);
}

function applyShapeToSelectedNodes(shape) {
    const nextShape = normalizeNodeShape(shape);
    const ids = getSelectedNodeIds();
    if (ids.length) {
        const selected = new Set(ids);
        state.nodes.forEach((node) => {
            if (selected.has(node.id)) node.shape = nextShape;
        });
    }
    state.defaultNodeShape = nextShape;
}

function normalizeSelectionRect(box) {
    if (!box) return null;
    const x1 = Math.min(box.x1, box.x2);
    const y1 = Math.min(box.y1, box.y2);
    const x2 = Math.max(box.x1, box.x2);
    const y2 = Math.max(box.y1, box.y2);
    return { x1, y1, x2, y2 };
}

function getNodeWorldRect(n) {
    return {
        x1: n.x,
        y1: n.y,
        x2: n.x + getNodeWidth(n),
        y2: n.y + getNodeHeight(n)
    };
}

function getTextWorldRect(t) {
    return {
        x1: t.x,
        y1: t.y,
        x2: t.x + (Number(t.w) || 0),
        y2: t.y + (Number(t.h) || 0)
    };
}

function rectsIntersect(a, b) {
    if (!a || !b) return false;
    return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2);
}

function selectItemsInRect(box) {
    const rect = normalizeSelectionRect(box);
    if (!rect) return;
    const nodeIds = state.nodes.filter((n) => rectsIntersect(rect, getNodeWorldRect(n))).map((n) => n.id);
    const textIds = state.texts.filter((t) => rectsIntersect(rect, getTextWorldRect(t))).map((t) => t.id);
    const connectionIndexes = state.connections
        .map((cn, idx) => ({ idx, bounds: getConnectionWorldBounds(cn) }))
        .filter((item) => item.bounds && rectsIntersect(rect, item.bounds))
        .map((item) => item.idx);
    clearSelectionState();
    state.selectedNodeIds = uniqueIds(nodeIds);
    state.selectedTextIds = uniqueIds(textIds);
    state.selectedConnectionIndexes = uniqueIds(connectionIndexes);
    state.selectedNode = state.selectedNodeIds[0] ?? null;
    state.selectedTextId = state.selectedTextIds[0] ?? null;
    state.selectedConnectionIndex = state.selectedConnectionIndexes[0] ?? null;
}

function getConnectionWorldBounds(cn) {
    const g = getConnectionGeometry(state, cn);
    if (!g) return null;
    return {
        x1: Math.min(g.x1, g.x2, g.c1x, g.c2x),
        y1: Math.min(g.y1, g.y2, g.c1y, g.c2y),
        x2: Math.max(g.x1, g.x2, g.c1x, g.c2x),
        y2: Math.max(g.y1, g.y2, g.c1y, g.c2y)
    };
}

function getSelectionGroupBounds() {
    const parts = [];
    for (const id of getSelectedNodeIds()) {
        const n = state.nodes.find((item) => item.id === id);
        if (n) parts.push(getNodeWorldRect(n));
    }
    for (const id of getSelectedTextIds()) {
        const t = state.texts.find((item) => item.id === id);
        if (t) parts.push(getTextWorldRect(t));
    }
    for (const idx of getSelectedConnectionIndexes()) {
        const cn = state.connections[idx];
        const bounds = cn ? getConnectionWorldBounds(cn) : null;
        if (bounds) parts.push(bounds);
    }
    if (!parts.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of parts) {
        minX = Math.min(minX, b.x1);
        minY = Math.min(minY, b.y1);
        maxX = Math.max(maxX, b.x2);
        maxY = Math.max(maxY, b.y2);
    }
    const pad = 16;
    return { x1: minX - pad, y1: minY - pad, x2: maxX + pad, y2: maxY + pad };
}

function hasGroupSelection() {
    return getSelectedNodeIds().length + getSelectedTextIds().length + getSelectedConnectionIndexes().length > 1;
}

function drawSelectionGroupBounds(ctx, bounds, cameraX, cameraY) {
    const x = bounds.x1 - cameraX;
    const y = bounds.y1 - cameraY;
    const w = bounds.x2 - bounds.x1;
    const h = bounds.y2 - bounds.y1;
    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'rgba(125, 211, 252, 0.22)';
    ctx.fillStyle = 'rgba(125, 211, 252, 0.08)';
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 1.8;
    ctx.setLineDash([8, 5]);
    if (typeof ctx.roundRect === 'function') {
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 16);
        ctx.fill();
        ctx.stroke();
    } else {
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
    }
    ctx.restore();
}

function updateDisconnectActionBtn() {
    const b = el("disconnectActionBtn");
    if (!b) return;
    b.textContent = state.isDisconnecting ? "Cancelar desconexao" : "Desconectar nos";
    b.disabled = state.isViewMode || (!state.isDisconnecting && getSelectedNodeIds().length === 0 && getSelectedConnectionIndexes().length === 0);
}

function updateMenuForSelection() {
    ensureActiveColor();
    const shapeBtn = el("shapeMenuBtn");
    const shapeMenu = el("shapeMenu");
    const connEl = el("connectionTypeSelect");
    const selectedConn = getSelectedConnection();
    const paletteEl = el("colorPalette");
    if (paletteEl) paletteEl.classList.toggle("is-disabled", !!state.isViewMode);
    if (connEl) {
        connEl.disabled = state.isViewMode;
        if (selectedConn) connEl.value = selectedConn.type || "arrow";
    }
    if (shapeBtn) {
        const currentShape = normalizeNodeShape(state.defaultNodeShape || DEFAULT_NODE_SHAPE);
        shapeBtn.disabled = state.isViewMode;
        shapeBtn.innerHTML = '<i class="fas fa-shapes" aria-hidden="true"></i><span>' + getShapeLabel(currentShape) + '</span>';
        shapeBtn.setAttribute("aria-expanded", shapeMenu && !shapeMenu.hidden ? "true" : "false");
    }
    if (shapeMenu) {
        const currentShape = normalizeNodeShape(state.defaultNodeShape || DEFAULT_NODE_SHAPE);
        shapeMenu.querySelectorAll("[data-flux-shape]").forEach((btn) => {
            const nextShape = normalizeNodeShape(btn.getAttribute("data-flux-shape"), DEFAULT_NODE_SHAPE);
            const isActive = nextShape === currentShape;
            btn.classList.toggle("is-active", isActive);
            btn.setAttribute("aria-pressed", isActive ? "true" : "false");
        });
    }
    syncColorPaletteUI();
}

function setSelectedNodeShape(v) {
    if (state.isViewMode) return;
    const nextShape = normalizeNodeShape(v, state.defaultNodeShape || DEFAULT_NODE_SHAPE);
    applyShapeToSelectedNodes(nextShape);
    saveToLocalStorage();
    updateUI();
    showStatus(
        getSelectedNodeIds().length ? "Forma aplicada: " + getShapeLabel(nextShape) + "." : "Forma padrao definida: " + getShapeLabel(nextShape) + ".",
        "success"
    );
    closeShapeMenu();
}

function closeShapeMenu() {
    const menu = el("shapeMenu");
    const btn = el("shapeMenuBtn");
    if (menu) menu.hidden = true;
    if (btn) btn.setAttribute("aria-expanded", "false");
    if (menu && menu._fluxOutsideClose) {
        document.removeEventListener("pointerdown", menu._fluxOutsideClose, true);
        menu._fluxOutsideClose = null;
    }
}

function toggleShapeMenu() {
    if (state.isViewMode) return;
    const menu = el("shapeMenu");
    const btn = el("shapeMenuBtn");
    if (!menu) return;
    const willOpen = menu.hidden;
    closeShapeMenu();
    if (!willOpen) return;
    menu.hidden = false;
    if (btn) btn.setAttribute("aria-expanded", "true");
    const onOutsideClick = (e) => {
        if (menu.contains(e.target) || btn?.contains(e.target)) return;
        closeShapeMenu();
    };
    menu._fluxOutsideClose = onOutsideClick;
    requestAnimationFrame(() => {
        document.addEventListener("pointerdown", onOutsideClick, true);
    });
}

function setSelectedNodeColor(v) {
    if (state.isViewMode) return;
    const nextColor = normalizeHexColor(v, state.activeColor || DEFAULT_ACTIVE_COLOR);
    state.activeColor = nextColor;
    const selectedConn = getSelectedConnection();
    if (selectedConn) {
        selectedConn.color = "#22c55e";
        saveToLocalStorage();
        updateUI();
        showStatus("Conexões permanecem em verde no padrão low-code.", "info");
        closeColorModal();
        return;
    }
    const t = getSelectedText();
    if (t) {
        t.color = nextColor;
        saveToLocalStorage();
        updateUI();
        showStatus("Cor do texto atualizada.", "success");
        closeColorModal();
        return;
    }
    const n = getSelectedNode();
    if (!n) {
        syncColorPaletteUI();
        closeColorModal();
        return;
    }
    n.color = nextColor;
    saveToLocalStorage();
    updateUI();
    showStatus("Cor do nó atualizada.", "success");
    closeColorModal();
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
    const selectedConnectionIndexes = getSelectedConnectionIndexes();
    const selectedTextIds = getSelectedTextIds();
    const selectedNodeIds = getSelectedNodeIds();
    if (selectedConnectionIndexes.length) {
        const indexes = [...selectedConnectionIndexes].sort((a, b) => b - a);
        for (const idx of indexes) {
            if (state.connections[idx]) state.connections.splice(idx, 1);
        }
    }
    if (selectedTextIds.length) {
        const keep = new Set(selectedTextIds);
        state.texts = state.texts.filter((t) => !keep.has(t.id));
        hideInlineTextEditor(false);
    }
    if (selectedNodeIds.length) {
        const keep = new Set(selectedNodeIds);
        state.nodes = state.nodes.filter((n) => !keep.has(n.id));
        state.connections = state.connections.filter((c) => !keep.has(c.from) && !keep.has(c.to));
        hideInlineEditor(false);
    }
    if (!selectedConnectionIndexes.length && !selectedTextIds.length && !selectedNodeIds.length) return;
    clearSelectionState();
    state.isConnecting = false;
    state.connectingFrom = null;
    state.isDisconnecting = false;
    state.disconnectFrom = null;
    saveToLocalStorage();
    updateUI();
    showStatus(selectedNodeIds.length ? "N?(s) exclu?do(s)." : selectedTextIds.length ? "Texto(s) exclu?do(s)." : "Conex?o(?es) exclu?da(s).", "success");
}

function startConnection() {
    if (state.isViewMode) return;
    hideInlineEditor(true);
    state.selectedConnectionIndex = null;
    state.isDisconnecting = false;
    state.disconnectFrom = null;
    state.isConnecting = true;
    state.connectingFrom = null;
    state.connectingFromSide = null;
    ensureActiveColor();
    updateUI();
    showStatus("Arraste de um ponto do nó até outro nó.", "info");
}

function cancelConnection(silent = false) {
    state.isConnecting = false;
    state.connectingFrom = null;
    state.connectingFromSide = null;
    state.connectionPointerX = 0;
    state.connectionPointerY = 0;
    state.hoveredPort = null;
    updateUI();
    if (!silent) showStatus("Conexão cancelada.", "info");
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
    state.connectingFromSide = null;
    state.isDisconnecting = true;
    state.disconnectFrom = state.selectedNode;
    state.disconnectFromSide = null;
    updateUI();
    showStatus("Selecione o nó de destino para desconectar.", "info");
}

function cancelDisconnect() {
    state.isDisconnecting = false;
    state.disconnectFrom = null;
    state.disconnectFromSide = null;
    updateUI();
    showStatus("Desconexão cancelada.", "info");
}

function finishConnection(to, toSide = null) {
    if (!state.isConnecting || state.connectingFrom === null) return;
    if (state.connectingFrom === to) return showStatus("Não é possível conectar um nó a ele mesmo.", "error");
    const connectionType = state.defaultConnectionType || "line";
    const fromNode = state.nodes.find(n => n.id === state.connectingFrom);
    const toNode = state.nodes.find(n => n.id === to);
    if (!fromNode || !toNode) return cancelConnection();
    const resolvedFromSide = state.connectingFromSide;
    const resolvedToSide = toSide;
    if (!resolvedFromSide || !resolvedToSide) return showStatus("Escolha os pontos de saída e entrada nos nós.", "info");
    if (state.connections.some(c => c.from === state.connectingFrom && c.to === to)) {
        return showStatus("Essa conexão já existe.", "info");
    }
    ensureActiveColor();
    state.connections.push({
        from: state.connectingFrom,
        to,
        type: connectionType,
        color: "#22c55e",
        fromSide: resolvedFromSide,
        toSide: resolvedToSide
    });
    saveToLocalStorage();
    updateUI();
    showStatus("Conexão criada.", "success");
    cancelConnection(true);
}

function finishDisconnect(to) {
    if (!state.isDisconnecting || state.disconnectFrom === null) return;
    if (state.disconnectFrom === to) return showStatus("Selecione um nó diferente para desconectar.", "error");
    const before = state.connections.length;
    state.connections = state.connections.filter(c => !((c.from === state.disconnectFrom && c.to === to) || (c.from === to && c.to === state.disconnectFrom)));
    const removed = before - state.connections.length;
    state.isDisconnecting = false;
    state.disconnectFrom = null;
    state.disconnectFromSide = null;
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
    const zoom = normalizeCanvasZoom(state.zoom || 1);
    return { x: sx / zoom + state.cameraX, y: sy / zoom + state.cameraY };
}

function setCanvasZoom(nextZoom, anchorClientX = null, anchorClientY = null) {
    const canvas = el("canvas");
    const currentZoom = normalizeCanvasZoom(state.zoom || 1);
    const zoom = normalizeCanvasZoom(nextZoom);
    if (!canvas || zoom === currentZoom) return;

    if (Number.isFinite(anchorClientX) && Number.isFinite(anchorClientY)) {
        const rect = canvas.getBoundingClientRect();
        const anchorX = anchorClientX - rect.left;
        const anchorY = anchorClientY - rect.top;
        state.cameraX += (anchorX / currentZoom) - (anchorX / zoom);
        state.cameraY += (anchorY / currentZoom) - (anchorY / zoom);
    }

    state.zoom = zoom;
    applyCanvasSize();
    saveToLocalStorage();
    positionInlineEditor();
    positionInlineTextEditor();
    drawCanvas();
    showStatus(`Zoom ajustado para ${Math.round(zoom * 100)}%.`, "info");
}

function onCanvasWheel(e) {
    const canvasScroll = el("canvasScroll");
    if (!canvasScroll || !canvasScroll.contains(e.target)) return;
    const tag = String(e.target?.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    e.preventDefault();
    const delta = Number(e.deltaY) || 0;
    if (delta === 0) return;
    const factor = delta > 0 ? 1 - CANVAS_ZOOM_STEP : 1 + CANVAS_ZOOM_STEP;
    setCanvasZoom((state.zoom || 1) * factor, e.clientX, e.clientY);
}

function getResizeHandleAt(n, x, y) {
    for (const h of getNodeHandles(n)) {
        if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.key;
    }
    return null;
}

function getPortAtPosition(n, x, y, threshold = 16) {
    for (const port of getNodePorts(n)) {
        const dx = x - port.px;
        const dy = y - port.py;
        if (Math.hypot(dx, dy) <= threshold) return port;
    }
    return null;
}

function getMagnetPortAtPosition(x, y, ignoreNodeId = null, threshold = PORT_HOVER_RADIUS) {
    return getNearestNodePort(state.nodes, x, y, { threshold, ignoreNodeId });
}

function drawCanvas(time = performance.now()) {
    const c = el("canvas"), ctx = c.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const zoom = normalizeCanvasZoom(state.zoom || 1);
    const worldWidth = state.viewportWidth / zoom;
    const worldHeight = state.viewportHeight / zoom;
    const groupSelectionActive = hasGroupSelection();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, worldWidth, worldHeight);
    bg.addColorStop(0, "#020816");
    bg.addColorStop(0.55, "#050d1f");
    bg.addColorStop(1, "#081528");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, worldWidth, worldHeight);
    const glowA = ctx.createRadialGradient(worldWidth * 0.14, worldHeight * 0.16, 0, worldWidth * 0.14, worldHeight * 0.16, Math.max(worldWidth, worldHeight) * 0.56);
    glowA.addColorStop(0, "rgba(56, 189, 248, .14)");
    glowA.addColorStop(0.4, "rgba(56, 189, 248, .04)");
    glowA.addColorStop(1, "rgba(56, 189, 248, 0)");
    ctx.fillStyle = glowA;
    ctx.fillRect(0, 0, worldWidth, worldHeight);
    const glowB = ctx.createRadialGradient(worldWidth * 0.88, worldHeight * 0.2, 0, worldWidth * 0.88, worldHeight * 0.2, Math.max(worldWidth, worldHeight) * 0.5);
    glowB.addColorStop(0, "rgba(34, 197, 94, .08)");
    glowB.addColorStop(0.45, "rgba(34, 197, 94, .03)");
    glowB.addColorStop(1, "rgba(34, 197, 94, 0)");
    ctx.fillStyle = glowB;
    ctx.fillRect(0, 0, worldWidth, worldHeight);
    ctx.save();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
    ctx.lineWidth = 1;
    const grid = 52, startX = -((state.cameraX % grid) + grid) % grid, startY = -((state.cameraY % grid) + grid) % grid;
    for (let x = startX; x < worldWidth; x += grid) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, worldHeight);
        ctx.stroke();
    }
    for (let y = startY; y < worldHeight; y += grid) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(worldWidth, y + 0.5);
        ctx.stroke();
    }
    ctx.strokeStyle = "rgba(125, 211, 252, 0.06)";
    ctx.lineWidth = 1.5;
    for (let x = startX; x < worldWidth; x += grid * 5) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, worldHeight);
        ctx.stroke();
    }
    for (let y = startY; y < worldHeight; y += grid * 5) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(worldWidth, y + 0.5);
        ctx.stroke();
    }
    ctx.restore();
    state.nodes.forEach(n => updateNodeMetrics(ctx, n));
    state.texts.forEach(t => updateTextMetrics(ctx, t));
    state.connections.forEach((cn) => {
        const g = getConnectionGeometry(state, cn);
        if (!g) return;
        const fx = g.x1 - state.cameraX, fy = g.y1 - state.cameraY, tx = g.x2 - state.cameraX, ty = g.y2 - state.cameraY, c1x = g.c1x - state.cameraX, c1y = g.c1y - state.cameraY, c2x = g.c2x - state.cameraX, c2y = g.c2y - state.cameraY;
        const type = cn.type || "line";
        const base = "rgba(34, 197, 94, 0.98)";
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(34, 197, 94, 0.16)";
        ctx.lineWidth = 8;
        ctx.shadowBlur = 14;
        ctx.shadowColor = "rgba(34, 197, 94, 0.22)";
        ctx.setLineDash([3, 10]);
        ctx.lineDashOffset = -((time / 18) % 1000);
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        if (type === "curve") ctx.bezierCurveTo(c1x, c1y, c2x, c2y, tx, ty); else ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.strokeStyle = base;
        ctx.lineWidth = 2.8;
        ctx.shadowBlur = 18;
        ctx.shadowColor = "rgba(34, 197, 94, 0.5)";
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        if (type === "curve") ctx.bezierCurveTo(c1x, c1y, c2x, c2y, tx, ty); else ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.lineDashOffset = 0;
        ctx.setLineDash([]);
        ctx.fillStyle = base;
        const endA = type === "curve" ? Math.atan2(ty - c2y, tx - c2x) : Math.atan2(ty - fy, tx - fx), startA = type === "curve" ? Math.atan2(c1y - fy, c1x - fx) : endA + Math.PI;
        if (type === "arrow" || type === "both" || type === "curve") drawArrowHead(ctx, tx, ty, endA, 12);
        if (type === "both") drawArrowHead(ctx, fx, fy, startA, 12);
        ctx.restore();
    });
    state.nodes.forEach(n => {
        const nw = getNodeWidth(n), nh = getNodeHeight(n), sx = n.x - state.cameraX, sy = n.y - state.cameraY;
        if (sx + nw < 0 || sy + nh < 0 || sx > worldWidth || sy > worldHeight) return;
        const sel = isNodeSelected(n), from = n.id === state.connectingFrom, accent = getNodeAccent(n);
        const glow = sel ? "rgba(125, 211, 252, 0.34)" : from ? "rgba(34, 197, 94, 0.34)" : `${accent}55`;
        const body = ctx.createLinearGradient(sx, sy, sx + nw, sy + nh);
        body.addColorStop(0, "rgba(255,255,255,0.11)");
        body.addColorStop(0.2, "rgba(255,255,255,0.06)");
        body.addColorStop(1, "rgba(4, 10, 24, 0.9)");
        ctx.save();
        ctx.shadowBlur = sel ? 30 : from ? 24 : 18;
        ctx.shadowColor = glow;
        ctx.fillStyle = body;
        ctx.strokeStyle = sel ? "#93c5fd" : from ? "#86efac" : accent;
        ctx.lineWidth = sel ? 2.6 : 2;
        drawNodeShape(ctx, n.shape || "rect", sx, sy, nw, nh);
        ctx.save();
        ctx.clip();
        const sheen = ctx.createLinearGradient(sx, sy, sx + nw, sy + nh);
        sheen.addColorStop(0, "rgba(255,255,255,0.18)");
        sheen.addColorStop(0.35, "rgba(255,255,255,0.05)");
        sheen.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = sheen;
        ctx.fillRect(sx, sy, nw, nh);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = 0.92;
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(255,255,255,0.1)";
        drawNodeShape(ctx, n.shape || "rect", sx + 1.1, sy + 1.1, nw - 2.2, nh - 2.2);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = accent;
        const accentBandH = Math.max(8, Math.min(14, Math.round(nh * 0.1)));
        if (n.shape === "ellipse") {
            ctx.beginPath();
            ctx.arc(sx + nw * 0.33, sy + nh * 0.32, Math.max(10, Math.min(nw, nh) * 0.12), 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.beginPath();
            if (typeof ctx.roundRect === "function") {
                ctx.roundRect(sx + 10, sy + 10, Math.max(18, nw * 0.22), accentBandH, accentBandH / 2);
            } else {
                ctx.rect(sx + 10, sy + 10, Math.max(18, nw * 0.22), accentBandH);
            }
            ctx.fill();
        }
        ctx.restore();
        ctx.fillStyle = "#f8fbff";
        ctx.font = "700 16px Segoe UI";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowBlur = 0;
        drawLinesCentered(ctx, n._lines, sx + nw / 2, sy + nh / 2, NODE_LINE_HEIGHT);
        if (sel && !state.isViewMode && !groupSelectionActive) {
            const hs = NODE_HANDLE_SIZE;
            ctx.fillStyle = "#e0f2fe";
            ctx.strokeStyle = "#7dd3fc";
            ctx.lineWidth = 1.5;
            for (const h of getNodeHandles(n)) {
                const hx = h.x - state.cameraX, hy = h.y - state.cameraY;
                ctx.fillRect(hx, hy, hs, hs);
                ctx.strokeRect(hx, hy, hs, hs);
            }
        }
        const ports = getNodePorts(n);
        ports.forEach((port) => {
            const px = port.px - state.cameraX;
            const py = port.py - state.cameraY;
            const isSource = state.isConnecting && state.connectingFrom === n.id && state.connectingFromSide === port.key;
            const isHover = state.hoveredPort && state.hoveredPort.nodeId === n.id && state.hoveredPort.side === port.key;
            ctx.save();
            ctx.beginPath();
            ctx.arc(px, py, isSource ? 7 : isHover ? 6 : 5, 0, Math.PI * 2);
            ctx.fillStyle = isSource ? "#22c55e" : isHover ? "#93c5fd" : "rgba(226, 232, 240, 0.82)";
            ctx.shadowBlur = isSource ? 18 : isHover ? 14 : 8;
            ctx.shadowColor = isSource ? "rgba(34, 197, 94, 0.55)" : isHover ? "rgba(125, 211, 252, 0.45)" : "rgba(148, 163, 184, 0.22)";
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = "rgba(2, 6, 23, 0.78)";
            ctx.stroke();
            ctx.restore();
            if (isHover && !isSource) {
                drawStartNodeBadge(ctx, port, state.cameraX, state.cameraY);
            }
        });
    });
    if (state.isConnecting && state.connectingFrom !== null && Number.isFinite(state.connectionPointerX) && Number.isFinite(state.connectionPointerY)) {
        const source = state.nodes.find(n => n.id === state.connectingFrom);
        if (source) {
            const tip = state.connectingFromSide
                ? getNodeConnectionPoint(source, state.connectingFromSide)
                : getConnectorPoint(source, state.connectionPointerX, state.connectionPointerY);
            const sx = tip.x - state.cameraX;
            const sy = tip.y - state.cameraY;
            const tx = state.connectionPointerX - state.cameraX;
            const ty = state.connectionPointerY - state.cameraY;
            ctx.save();
            ctx.lineWidth = 3;
            ctx.setLineDash([3, 10]);
            ctx.lineDashOffset = -((time / 18) % 1000);
            ctx.strokeStyle = "rgba(34, 197, 94, 0.95)";
            ctx.shadowBlur = 20;
            ctx.shadowColor = "rgba(34, 197, 94, 0.4)";
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(tx, ty);
            ctx.stroke();
            ctx.lineDashOffset = 0;
            ctx.restore();
        }
    }
    state.texts.forEach(t => {
        const sx = t.x - state.cameraX, sy = t.y - state.cameraY, tw = Number(t.w) || 0, th = Number(t.h) || 0;
        if (sx + tw < 0 || sy + th < 0 || sx > worldWidth || sy > worldHeight) return;
        ctx.font = getTextFont(t);
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = t.color || "#1a1f28";
        ctx.fillText(t.text || "Texto", sx, sy);
        if (isTextSelected(t) && !state.isViewMode) {
            ctx.save();
            ctx.strokeStyle = "#214f83";
            ctx.setLineDash([5, 4]);
            ctx.strokeRect(sx - 4, sy - 4, tw + 8, th + 8);
            ctx.restore();
        }
    });
    if (groupSelectionActive) {
        const bounds = getSelectionGroupBounds();
        if (bounds) drawSelectionGroupBounds(ctx, bounds, state.cameraX, state.cameraY);
    }
    if (state.selectionBox && !state.isViewMode) {
        const box = normalizeSelectionRect(state.selectionBox);
        if (box) {
            const x = box.x1 - state.cameraX;
            const y = box.y1 - state.cameraY;
            const w = box.x2 - box.x1;
            const h = box.y2 - box.y1;
            ctx.save();
            ctx.fillStyle = "rgba(125, 211, 252, 0.12)";
            ctx.strokeStyle = "rgba(125, 211, 252, 0.95)";
            ctx.lineWidth = 1.4;
            ctx.setLineDash([6, 4]);
            ctx.fillRect(x, y, w, h);
            ctx.strokeRect(x, y, w, h);
            ctx.restore();
        }
    }
}

function renderReadOnlyView() {
    const box = el("renderView"), ctx = el("canvas").getContext("2d");
    box.innerHTML = ""; const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", `0 0 ${state.viewportWidth} ${state.viewportHeight}`); svg.setAttribute("width", "100%"); svg.setAttribute("height", "100%");
    const defs = document.createElementNS(ns, "defs"), marker = document.createElementNS(ns, "marker"), markerStart = document.createElementNS(ns, "marker"), path = document.createElementNS(ns, "path"), pathStart = document.createElementNS(ns, "path");
    const style = document.createElementNS(ns, "style");
    style.textContent = `
        @keyframes fluxDashMove { to { stroke-dashoffset: -64; } }
        .flux-conn-flow { animation: fluxDashMove 1.15s linear infinite; }
    `;
    marker.setAttribute("id", "arrow"); marker.setAttribute("markerWidth", "12"); marker.setAttribute("markerHeight", "9"); marker.setAttribute("refX", "12"); marker.setAttribute("refY", "4.5"); marker.setAttribute("orient", "auto"); marker.setAttribute("markerUnits", "strokeWidth"); path.setAttribute("d", "M0,0 L12,4.5 L0,9 z"); path.setAttribute("fill", "context-stroke"); marker.appendChild(path); markerStart.setAttribute("id", "arrowStart"); markerStart.setAttribute("markerWidth", "12"); markerStart.setAttribute("markerHeight", "9"); markerStart.setAttribute("refX", "0"); markerStart.setAttribute("refY", "4.5"); markerStart.setAttribute("orient", "auto"); markerStart.setAttribute("markerUnits", "strokeWidth"); pathStart.setAttribute("d", "M12,0 L0,4.5 L12,9 z"); pathStart.setAttribute("fill", "context-stroke"); markerStart.appendChild(pathStart); defs.appendChild(marker); defs.appendChild(markerStart); svg.appendChild(defs);
    svg.appendChild(style);
    state.nodes.forEach(n => updateNodeMetrics(ctx, n));
    state.texts.forEach(t => updateTextMetrics(ctx, t));
    state.nodes.forEach(n => {
        const nw = getNodeWidth(n), nh = getNodeHeight(n), sx = n.x - state.cameraX, sy = n.y - state.cameraY;
        if (sx + nw < 0 || sy + nh < 0 || sx > state.viewportWidth || sy > state.viewportHeight) return;
        const g = document.createElementNS(ns, "g"), t = document.createElementNS(ns, "text"), lines = (n._lines && n._lines.length) ? n._lines : ["Nó sem texto"], shape = (n.shape || "rect"), accent = getNodeAccent(n);
        let shp;
        if (shape === "ellipse") {
            shp = document.createElementNS(ns, "ellipse");
            shp.setAttribute("cx", String(sx + nw / 2));
            shp.setAttribute("cy", String(sy + nh / 2));
            shp.setAttribute("rx", String(nw / 2));
            shp.setAttribute("ry", String(nh / 2));
        } else if (shape === "diamond") {
            shp = document.createElementNS(ns, "polygon");
            shp.setAttribute("points", `${sx + nw / 2},${sy} ${sx + nw},${sy + nh / 2} ${sx + nw / 2},${sy + nh} ${sx},${sy + nh / 2}`);
        } else if (shape === "hexagon") {
            const d = Math.min(nw * 0.22, 44);
            shp = document.createElementNS(ns, "polygon");
            shp.setAttribute("points", `${sx + d},${sy} ${sx + nw - d},${sy} ${sx + nw},${sy + nh / 2} ${sx + nw - d},${sy + nh} ${sx + d},${sy + nh} ${sx},${sy + nh / 2}`);
        } else {
            shp = document.createElementNS(ns, "rect");
            shp.setAttribute("x", String(sx));
            shp.setAttribute("y", String(sy));
            shp.setAttribute("width", String(nw));
            shp.setAttribute("height", String(nh));
            shp.setAttribute("rx", "14");
        }
        shp.setAttribute("fill", "rgba(4, 10, 24, 0.9)");
        shp.setAttribute("stroke", accent);
        shp.setAttribute("stroke-width", "2.2");
        shp.setAttribute("opacity", "0.96");
        const accentMark = document.createElementNS(ns, "rect");
        accentMark.setAttribute("x", String(sx + 10));
        accentMark.setAttribute("y", String(sy + 10));
        accentMark.setAttribute("width", String(Math.max(18, nw * 0.22)));
        accentMark.setAttribute("height", String(Math.max(8, Math.min(14, Math.round(nh * 0.1)))));
        accentMark.setAttribute("rx", "999");
        accentMark.setAttribute("fill", accent);
        accentMark.setAttribute("opacity", "0.95");
        t.setAttribute("x", String(sx + nw / 2));
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("fill", "#f8fbff");
        t.setAttribute("font-size", "16");
        t.setAttribute("font-weight", "700");
        t.setAttribute("font-family", "Segoe UI, sans-serif");
        const startY = sy + (nh - (lines.length * NODE_LINE_HEIGHT)) / 2 + 14;
        for (let idx = 0; idx < lines.length; idx++) {
            const sp = document.createElementNS(ns, "tspan");
            sp.setAttribute("x", String(sx + nw / 2));
            sp.setAttribute("y", String(startY + idx * NODE_LINE_HEIGHT));
            sp.textContent = lines[idx] || " ";
            t.appendChild(sp);
        }
        g.appendChild(shp);
        if (shape === "rect") g.appendChild(accentMark);
        g.appendChild(t);
        svg.appendChild(g);
    });
    state.connections.forEach(cn => {
        const g = getConnectionGeometry(state, cn);
        if (!g) return;
        const type = cn.type || "arrow", base = "#22c55e";
        let edge; if (type === "curve") { edge = document.createElementNS(ns, "path"); edge.setAttribute("d", `M ${g.x1 - state.cameraX} ${g.y1 - state.cameraY} C ${g.c1x - state.cameraX} ${g.c1y - state.cameraY}, ${g.c2x - state.cameraX} ${g.c2y - state.cameraY}, ${g.x2 - state.cameraX} ${g.y2 - state.cameraY}`); } else { edge = document.createElementNS(ns, "line"); edge.setAttribute("x1", String(g.x1 - state.cameraX)); edge.setAttribute("y1", String(g.y1 - state.cameraY)); edge.setAttribute("x2", String(g.x2 - state.cameraX)); edge.setAttribute("y2", String(g.y2 - state.cameraY)); }
        edge.setAttribute("fill", "none");
        edge.setAttribute("stroke", base);
        edge.setAttribute("stroke-width", "2.5");
        edge.setAttribute("stroke-linecap", "round");
        edge.setAttribute("stroke-linejoin", "round");
        edge.setAttribute("stroke-dasharray", "3 10");
        edge.setAttribute("class", "flux-conn-flow");
        if (type === "arrow" || type === "both" || type === "curve") edge.setAttribute("marker-end", "url(#arrow)"); if (type === "both") edge.setAttribute("marker-start", "url(#arrowStart)");
        svg.appendChild(edge);
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
    const zoom = normalizeCanvasZoom(state.zoom || 1);
    const viewW = state.viewportWidth / zoom;
    const viewH = state.viewportHeight / zoom;
    const nw = getNodeWidth(n), nh = getNodeHeight(n), sx = n.x - state.cameraX, sy = n.y - state.cameraY;
    if (sx + nw < 0 || sy + nh < 0 || sx > viewW || sy > viewH) { i.style.display = "none"; return; }
    i.style.left = `${sx * zoom}px`;
    i.style.top = `${sy * zoom}px`;
    i.style.width = `${nw * zoom}px`;
    i.style.height = `${nh * zoom}px`;
    i.style.fontSize = `${16 * zoom}px`;
    i.style.lineHeight = "1.25";
    i.style.display = "block";
}

function positionInlineTextEditor() {
    if (state.inlineEditTextId === null) return;
    const t = state.texts.find(x => x.id === state.inlineEditTextId), i = el("freeTextEdit");
    if (!t || state.isViewMode) { i.style.display = "none"; return; }
    const zoom = normalizeCanvasZoom(state.zoom || 1);
    const viewW = state.viewportWidth / zoom;
    const viewH = state.viewportHeight / zoom;
    const sx = t.x - state.cameraX, sy = t.y - state.cameraY;
    const tw = Number(t.w) || 0;
    const th = Number(t.h) || 0;
    if (sx + tw < 0 || sy + th < 0 || sx > viewW || sy > viewH) { i.style.display = "none"; return; }
    i.style.left = `${sx * zoom}px`;
    i.style.top = `${sy * zoom}px`;
    i.style.width = `${Math.max(80, tw + 24) * zoom}px`;
    i.style.height = `${Math.max(30, th + 8) * zoom}px`;
    i.style.font = `700 ${Math.max(16, Number(t.fontSize) || 24) * zoom}px Segoe UI`;
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

function syncTopActions() {
    const back = el("back-hub");
    const viewBtn = el("viewModeBtn");
    if (viewBtn) {
        viewBtn.innerHTML = state.isViewMode
            ? '<i class="fas fa-pen-to-square" aria-hidden="true"></i>'
            : '<i class="fas fa-eye" aria-hidden="true"></i>';
    }
}

function openColorModal() {
    closeShapeMenu();
    const modal = el("colorModal");
    if (!modal) return;
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    syncColorPaletteUI();
}

function closeColorModal() {
    const modal = el("colorModal");
    if (!modal) return;
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
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
    closeColorModal();
    syncTopActions();
    updateUI();
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

function downloadDataUrl(dataUrl, fileName) {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = fileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function drawExportScene(ctx, cameraX, cameraY, worldWidth, worldHeight) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const bg = ctx.createLinearGradient(0, 0, worldWidth, worldHeight);
    bg.addColorStop(0, "#020816");
    bg.addColorStop(0.55, "#050d1f");
    bg.addColorStop(1, "#081528");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, worldWidth, worldHeight);

    ctx.save();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
    ctx.lineWidth = 1;
    const grid = 52;
    const startX = -((cameraX % grid) + grid) % grid;
    const startY = -((cameraY % grid) + grid) % grid;
    for (let x = startX; x < worldWidth; x += grid) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, worldHeight);
        ctx.stroke();
    }
    for (let y = startY; y < worldHeight; y += grid) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(worldWidth, y + 0.5);
        ctx.stroke();
    }
    ctx.restore();

    state.nodes.forEach(n => updateNodeMetrics(ctx, n));
    state.texts.forEach(t => updateTextMetrics(ctx, t));

    state.connections.forEach((cn) => {
        const g = getConnectionGeometry(state, cn);
        if (!g) return;
        const fx = g.x1 - cameraX, fy = g.y1 - cameraY, tx = g.x2 - cameraX, ty = g.y2 - cameraY;
        const c1x = g.c1x - cameraX, c1y = g.c1y - cameraY, c2x = g.c2x - cameraX, c2y = g.c2y - cameraY;
        const type = cn.type || "line";
        const base = "rgba(34, 197, 94, 0.98)";
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = base;
        ctx.lineWidth = 2.8;
        ctx.shadowBlur = 12;
        ctx.shadowColor = "rgba(34, 197, 94, 0.35)";
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        if (type === "curve") ctx.bezierCurveTo(c1x, c1y, c2x, c2y, tx, ty);
        else ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.fillStyle = base;
        const endA = type === "curve" ? Math.atan2(ty - c2y, tx - c2x) : Math.atan2(ty - fy, tx - fx);
        const startA = type === "curve" ? Math.atan2(c1y - fy, c1x - fx) : endA + Math.PI;
        if (type === "arrow" || type === "both" || type === "curve") drawArrowHead(ctx, tx, ty, endA, 12);
        if (type === "both") drawArrowHead(ctx, fx, fy, startA, 12);
        ctx.restore();
    });

    state.nodes.forEach(n => {
        const nw = getNodeWidth(n), nh = getNodeHeight(n), sx = n.x - cameraX, sy = n.y - cameraY;
        if (sx + nw < 0 || sy + nh < 0 || sx > worldWidth || sy > worldHeight) return;
        const accent = getNodeAccent(n);
        const body = ctx.createLinearGradient(sx, sy, sx + nw, sy + nh);
        body.addColorStop(0, "rgba(255,255,255,0.11)");
        body.addColorStop(0.2, "rgba(255,255,255,0.06)");
        body.addColorStop(1, "rgba(4, 10, 24, 0.9)");
        ctx.save();
        ctx.shadowBlur = 14;
        ctx.shadowColor = `${accent}55`;
        ctx.fillStyle = body;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        drawNodeShape(ctx, n.shape || "rect", sx, sy, nw, nh);
        ctx.fillStyle = "#f8fbff";
        ctx.font = "700 16px Segoe UI";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowBlur = 0;
        drawLinesCentered(ctx, n._lines, sx + nw / 2, sy + nh / 2, NODE_LINE_HEIGHT);
        ctx.restore();
    });

    state.texts.forEach(t => {
        const sx = t.x - cameraX, sy = t.y - cameraY, tw = Number(t.w) || 0, th = Number(t.h) || 0;
        if (sx + tw < 0 || sy + th < 0 || sx > worldWidth || sy > worldHeight) return;
        ctx.font = getTextFont(t);
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = t.color || "#1a1f28";
        ctx.fillText(t.text || "Texto", sx, sy);
    });
}

function buildFullDiagramExportCanvas() {
    const bounds = getGraphContentBounds(state.nodes, state.texts, getNodeWidth, getNodeHeight);
    let worldW;
    let worldH;
    let cameraX;
    let cameraY;

    if (!bounds) {
        worldW = Math.max(320, state.viewportWidth || 1200);
        worldH = Math.max(260, state.viewportHeight || 700);
        cameraX = state.cameraX;
        cameraY = state.cameraY;
    } else {
        cameraX = bounds.minX - EXPORT_PADDING;
        cameraY = bounds.minY - EXPORT_PADDING;
        worldW = Math.ceil((bounds.maxX - bounds.minX) + EXPORT_PADDING * 2);
        worldH = Math.ceil((bounds.maxY - bounds.minY) + EXPORT_PADDING * 2);
    }

    worldW = Math.max(1, worldW);
    worldH = Math.max(1, worldH);
    const scale = Math.min(1, MAX_EXPORT_CANVAS_EDGE / Math.max(worldW, worldH));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(worldW * scale));
    canvas.height = Math.max(1, Math.floor(worldH * scale));
    const ctx = canvas.getContext("2d");
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    drawExportScene(ctx, cameraX, cameraY, worldW, worldH);
    return canvas;
}

function splitCanvasLocally(sourceCanvas) {
    const rects = getExportPageRects(sourceCanvas.width, sourceCanvas.height);
    const base = sanitizeFilename(state.projectName);
    return rects.map((rect) => {
        const page = document.createElement("canvas");
        page.width = rect.width;
        page.height = rect.height;
        const ctx = page.getContext("2d");
        ctx.drawImage(
            sourceCanvas,
            rect.x, rect.y, rect.width, rect.height,
            0, 0, rect.width, rect.height
        );
        return {
            page: rect.page,
            fileName: buildExportFileName(base, rect.page, rects.length),
            imageBase64: page.toDataURL("image/png")
        };
    });
}

async function requestServerPngSplit(fullDataUrl) {
    const res = await fetch("/api/fluxograma-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            imageBase64: fullDataUrl,
            fileName: sanitizeFilename(state.projectName)
        })
    });
    const text = await res.text();
    let data = {};
    if (text) {
        try { data = JSON.parse(text); } catch { data = {}; }
    }
    if (!res.ok) throw new Error(data.error || res.statusText || "Falha no export");
    if (!Array.isArray(data.pages) || !data.pages.length) throw new Error("Resposta de export invalida");
    return data.pages;
}

async function exportToPNG() {
    try {
        showStatus("Gerando PNG da tela inteira…", "info");
        const full = buildFullDiagramExportCanvas();
        const fullDataUrl = full.toDataURL("image/png");
        let pages;
        if (shouldSplitIntoTwoPages(full.width, full.height)) {
            try {
                pages = await requestServerPngSplit(fullDataUrl);
            } catch (err) {
                console.warn("Export Node falhou; usando split local.", err);
                pages = splitCanvasLocally(full);
            }
        } else {
            pages = [{
                page: 1,
                fileName: buildExportFileName(sanitizeFilename(state.projectName), 1, 1),
                imageBase64: fullDataUrl
            }];
        }
        for (let i = 0; i < pages.length; i++) {
            const p = pages[i];
            downloadDataUrl(p.imageBase64, p.fileName || buildExportFileName(sanitizeFilename(state.projectName), p.page || i + 1, pages.length));
            if (i < pages.length - 1) await new Promise(r => setTimeout(r, 180));
        }
        showStatus(
            pages.length > 1
                ? `PNG exportado em ${pages.length} páginas.`
                : "PNG da tela inteira exportado.",
            "success"
        );
    } catch (e) {
        console.error(e);
        showStatus(e?.message || "Falha ao exportar PNG.", "error");
    }
}

function setupCanvasInteractions() {
    const c = el("canvas"), i = el("nodeEditText"), tInput = el("freeTextEdit");
    let activePointerId = null, startX = 0, startY = 0, downNodeId = null, downTextId = null, downConnectionIndex = null, wasSelectedOnDown = false, wasTextSelectedOnDown = false, isPanning = false, panStartClientX = 0, panStartClientY = 0, panStartCameraX = 0, panStartCameraY = 0, isResizing = false, resizeNodeId = null, resizeHandle = null, resizeStart = { x: 0, y: 0, w: 0, h: 0, nx: 0, ny: 0 }, pointerMap = new Map(), isPinching = false, pinchNodeId = null, pinchStartDist = 0, pinchStart = { w: 0, h: 0, x: 0, y: 0 }, isSelectingBox = false, isDraggingSelectionGroup = false, selectionGroupSnapshot = null;
    i.addEventListener("input", onNodeTextInput); i.addEventListener("blur", () => hideInlineEditor(true)); i.addEventListener("pointerdown", e => e.stopPropagation());
    tInput.addEventListener("input", onInlineTextInput); tInput.addEventListener("blur", () => hideInlineTextEditor(true)); tInput.addEventListener("pointerdown", e => e.stopPropagation());
    c.addEventListener("contextmenu", e => e.preventDefault());
    c.addEventListener("pointerdown", e => {
        if (state.isViewMode) return;
        if (e.button === 2) {
            activePointerId = e.pointerId;
            panStartClientX = e.clientX;
            panStartClientY = e.clientY;
            panStartCameraX = state.cameraX;
            panStartCameraY = state.cameraY;
            c.setPointerCapture(e.pointerId);
            isPanning = true;
            setCanvasCursor(c, "grabbing");
            return;
        }
        pointerMap.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const point = getCanvasPoint(e), n = getNodeAtPosition(point.x, point.y), t = n ? null : getTextAtPosition(point.x, point.y);
        const portMatch = getMagnetPortAtPosition(point.x, point.y);
        startX = point.x; startY = point.y; downNodeId = n ? n.id : null; downTextId = t ? t.id : null; wasSelectedOnDown = !!n && state.selectedNode === n.id; wasTextSelectedOnDown = !!t && state.selectedTextId === t.id;
        if (state.isConnecting) {
            if (state.connectingFrom === null) {
                if (portMatch) {
                    state.connectingFrom = portMatch.nodeId;
                    state.connectingFromSide = portMatch.side;
                    state.connectionPointerX = point.x;
                    state.connectionPointerY = point.y;
                    state.hoveredPort = { nodeId: portMatch.nodeId, side: portMatch.side };
                } else {
                    showStatus("Escolha um ponto de sa?da para come?ar.", "info");
                    return;
                }
            }
            activePointerId = e.pointerId;
            c.setPointerCapture(e.pointerId);
            state.connectionPointerX = point.x;
            state.connectionPointerY = point.y;
            setCanvasCursor(c, "grabbing");
            drawCanvas();
            return;
        }
        if (portMatch) {
            hideInlineEditor(true);
            hideInlineTextEditor(true);
            setNodeSelection([portMatch.nodeId]);
            state.isConnecting = true;
            state.connectingFrom = portMatch.nodeId;
            state.connectingFromSide = portMatch.side;
            state.connectionPointerX = point.x;
            state.connectionPointerY = point.y;
            state.hoveredPort = { nodeId: portMatch.nodeId, side: portMatch.side };
            ensureActiveColor();
            activePointerId = e.pointerId;
            c.setPointerCapture(e.pointerId);
            setCanvasCursor(c, "grabbing");
            updateUI();
            return;
        }
        if (state.isDisconnecting) {
            if (n) finishDisconnect(n.id); else showStatus("Toque em um n? para desconectar.", "info");
            return;
        }
        if (pointerMap.size === 2 && state.selectedNode !== null) {
            const sn = state.nodes.find(v => v.id === state.selectedNode);
            if (sn) {
                const pts = [...pointerMap.values()];
                const p1 = { x: pts[0].x - c.getBoundingClientRect().left + state.cameraX, y: pts[0].y - c.getBoundingClientRect().top + state.cameraY };
                const p2 = { x: pts[1].x - c.getBoundingClientRect().left + state.cameraX, y: pts[1].y - c.getBoundingClientRect().top + state.cameraY };
                const w = getNodeWidth(sn), h = getNodeHeight(sn);
                const in1 = p1.x >= sn.x && p1.x <= sn.x + w && p1.y >= sn.y && p1.y <= sn.y + h;
                const in2 = p2.x >= sn.x && p2.x <= sn.x + w && p2.y >= sn.y && p2.y <= sn.y + h;
                if (in1 && in2) { isPinching = true; pinchNodeId = sn.id; pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1; pinchStart = { w: w, h: h, x: sn.x, y: sn.y }; sn.manualSize = true; setCanvasCursor(c, "grabbing"); return; }
            }
        }
        const groupBounds = getSelectionGroupBounds();
        const canGroupMove = getSelectedNodeIds().length + getSelectedTextIds().length > 0;
        if (!n && !t && groupBounds && canGroupMove && point.x >= groupBounds.x1 && point.x <= groupBounds.x2 && point.y >= groupBounds.y1 && point.y <= groupBounds.y2) {
            isDraggingSelectionGroup = true;
            selectionGroupSnapshot = {
                nodes: getSelectedNodeIds().map((id) => {
                    const item = state.nodes.find((node) => node.id === id);
                    return item ? { id: item.id, x: item.x, y: item.y } : null;
                }).filter(Boolean),
                texts: getSelectedTextIds().map((id) => {
                    const item = state.texts.find((text) => text.id === id);
                    return item ? { id: item.id, x: item.x, y: item.y } : null;
                }).filter(Boolean)
            };
            activePointerId = e.pointerId;
            panStartClientX = point.x;
            panStartClientY = point.y;
            c.setPointerCapture(e.pointerId);
            setCanvasCursor(c, "grabbing");
            hideInlineEditor(true);
            hideInlineTextEditor(true);
            return;
        }
        if (!n && !t) {
            downConnectionIndex = getConnectionAtPosition(point.x, point.y);
            activePointerId = e.pointerId;
            panStartClientX = e.clientX;
            panStartClientY = e.clientY;
            panStartCameraX = state.cameraX;
            panStartCameraY = state.cameraY;
            c.setPointerCapture(e.pointerId);
            if (downConnectionIndex !== null) {
                setCanvasCursor(c, "grab");
                return;
            }
            clearSelectionState();
            hideInlineEditor(true);
            hideInlineTextEditor(true);
            updateUI();
            isSelectingBox = true;
            state.selectionBox = { x1: point.x, y1: point.y, x2: point.x, y2: point.y };
            setCanvasCursor(c, "crosshair");
            return;
        }
        if (t) {
            if (state.inlineEditTextId !== t.id) hideInlineTextEditor(true);
            hideInlineEditor(true);
            if (hasGroupSelection() && isTextSelected(t) && canGroupMove) {
                isDraggingSelectionGroup = true;
                selectionGroupSnapshot = {
                    nodes: getSelectedNodeIds().map((id) => {
                        const item = state.nodes.find((node) => node.id === id);
                        return item ? { id: item.id, x: item.x, y: item.y } : null;
                    }).filter(Boolean),
                    texts: getSelectedTextIds().map((id) => {
                        const item = state.texts.find((text) => text.id === id);
                        return item ? { id: item.id, x: item.x, y: item.y } : null;
                    }).filter(Boolean)
                };
                activePointerId = e.pointerId;
                panStartClientX = point.x;
                panStartClientY = point.y;
                c.setPointerCapture(e.pointerId);
                setCanvasCursor(c, "grabbing");
                return;
            }
            setTextSelection([t.id]);
            state.draggingTextId = t.id;
            state.dragOffsetX = point.x - t.x;
            state.dragOffsetY = point.y - t.y;
            state.hasDragged = false;
            activePointerId = e.pointerId;
            c.setPointerCapture(e.pointerId);
            setCanvasCursor(c, "grabbing");
            drawCanvas();
            return;
        }
        if (state.inlineEditNodeId !== n.id) hideInlineEditor(true);
        hideInlineTextEditor(true);
        if (hasGroupSelection() && isNodeSelected(n) && canGroupMove) {
            isDraggingSelectionGroup = true;
            selectionGroupSnapshot = {
                nodes: getSelectedNodeIds().map((id) => {
                    const item = state.nodes.find((node) => node.id === id);
                    return item ? { id: item.id, x: item.x, y: item.y } : null;
                }).filter(Boolean),
                texts: getSelectedTextIds().map((id) => {
                    const item = state.texts.find((text) => text.id === id);
                    return item ? { id: item.id, x: item.x, y: item.y } : null;
                }).filter(Boolean)
            };
            activePointerId = e.pointerId;
            panStartClientX = point.x;
            panStartClientY = point.y;
            c.setPointerCapture(e.pointerId);
            setCanvasCursor(c, "grabbing");
            return;
        }
        if (state.selectedNode !== n.id) setNodeSelection([n.id]);
        state.selectedConnectionIndex = null;
        state.selectedConnectionIndexes = [];
        if (state.selectedNode === n.id) {
            const handle = getResizeHandleAt(n, point.x, point.y);
            if (handle) { isResizing = true; resizeNodeId = n.id; resizeHandle = handle; resizeStart = { x: point.x, y: point.y, w: getNodeWidth(n), h: getNodeHeight(n), nx: n.x, ny: n.y }; n.manualSize = true; activePointerId = e.pointerId; c.setPointerCapture(e.pointerId); setCanvasCursor(c, "nwse-resize"); return; }
        }
        state.draggingNodeId = n.id; state.dragOffsetX = point.x - n.x; state.dragOffsetY = point.y - n.y; state.hasDragged = false; activePointerId = e.pointerId; c.setPointerCapture(e.pointerId); setCanvasCursor(c, "grabbing");
    });
    c.addEventListener("pointermove", e => {
        const r = c.getBoundingClientRect();
        if (pointerMap.has(e.pointerId)) pointerMap.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (state.isViewMode) return;
        const hoverPoint = getCanvasPoint(e);
        const hoverPortMatch = state.isConnecting
            ? getMagnetPortAtPosition(hoverPoint.x, hoverPoint.y, state.connectingFrom, PORT_MAGNET_RADIUS)
            : getMagnetPortAtPosition(hoverPoint.x, hoverPoint.y, null, PORT_HOVER_RADIUS);
        state.hoveredPort = hoverPortMatch ? { nodeId: hoverPortMatch.nodeId, side: hoverPortMatch.side } : null;
        if (isDraggingSelectionGroup && activePointerId === e.pointerId && selectionGroupSnapshot) {
            const dx = hoverPoint.x - panStartClientX;
            const dy = hoverPoint.y - panStartClientY;
            for (const snap of selectionGroupSnapshot.nodes) {
                const item = state.nodes.find((node) => node.id === snap.id);
                if (!item) continue;
                item.x = snap.x + dx;
                item.y = snap.y + dy;
            }
            for (const snap of selectionGroupSnapshot.texts) {
                const item = state.texts.find((text) => text.id === snap.id);
                if (!item) continue;
                item.x = snap.x + dx;
                item.y = snap.y + dy;
            }
            positionInlineEditor();
            positionInlineTextEditor();
            state.hasDragged = true;
            setCanvasCursor(c, "grabbing");
            drawCanvas();
            return;
        }
        if (isSelectingBox && activePointerId === e.pointerId && state.selectionBox) {
            state.selectionBox.x2 = hoverPoint.x;
            state.selectionBox.y2 = hoverPoint.y;
            setCanvasCursor(c, "crosshair");
            drawCanvas();
            return;
        }
        if (!isPanning && !isResizing && state.draggingNodeId === null && state.draggingTextId === null) {
            setCanvasCursor(c, hoverPortMatch ? "copy" : "grab");
        }
        if (state.isConnecting && state.connectingFrom !== null && activePointerId === e.pointerId) {
            state.connectionPointerX = hoverPoint.x;
            state.connectionPointerY = hoverPoint.y;
            setCanvasCursor(c, hoverPortMatch ? "copy" : "grabbing");
            drawCanvas();
            return;
        }
        if (isPinching && pinchNodeId !== null && pointerMap.size >= 2) {
            const pts = [...pointerMap.values()]; const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1; const scale = dist / pinchStartDist;
            const n = state.nodes.find(v => v.id === pinchNodeId); if (!n) return;
            const nw = Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH_MANUAL, pinchStart.w * scale));
            const nh = Math.max(NODE_MIN_HEIGHT, Math.min(NODE_MAX_HEIGHT_MANUAL, pinchStart.h * scale));
            const cx = pinchStart.x + pinchStart.w / 2, cy = pinchStart.y + pinchStart.h / 2;
            n.w = nw; n.h = nh; n.x = cx - nw / 2; n.y = cy - nh / 2; updateNodeMetrics(c.getContext("2d"), n); positionInlineEditor(); drawCanvas(); return;
        }
        if (activePointerId !== e.pointerId) return;
        if (!isPanning && downConnectionIndex !== null) { const moved = Math.hypot(e.clientX - panStartClientX, e.clientY - panStartClientY) > 6; if (moved) { isPanning = true; setCanvasCursor(c, "grabbing"); } }
        if (isPanning) { const dx = e.clientX - panStartClientX, dy = e.clientY - panStartClientY; state.cameraX = panStartCameraX - dx; state.cameraY = panStartCameraY - dy; positionInlineEditor(); positionInlineTextEditor(); drawCanvas(); return; }
        if (isResizing && resizeNodeId !== null) {
            const n = state.nodes.find(v => v.id === resizeNodeId); if (!n) return;
            const p = { x: e.clientX - r.left + state.cameraX, y: e.clientY - r.top + state.cameraY }, dx = p.x - resizeStart.x, dy = p.y - resizeStart.y;
            let w = resizeStart.w, h = resizeStart.h, x = resizeStart.nx, y = resizeStart.ny;
            if (resizeHandle === "se") { w = resizeStart.w + dx; h = resizeStart.h + dy; }
            if (resizeHandle === "sw") { w = resizeStart.w - dx; h = resizeStart.h + dy; x = resizeStart.nx + dx; }
            if (resizeHandle === "ne") { w = resizeStart.w + dx; h = resizeStart.h - dy; y = resizeStart.ny + dy; }
            if (resizeHandle === "nw") { w = resizeStart.w - dx; h = resizeStart.h - dy; x = resizeStart.nx + dx; y = resizeStart.ny + dy; }
            n.w = Math.max(NODE_MIN_WIDTH, Math.min(NODE_MAX_WIDTH_MANUAL, w)); n.h = Math.max(NODE_MIN_HEIGHT, Math.min(NODE_MAX_HEIGHT_MANUAL, h)); n.x = x; n.y = y; updateNodeMetrics(c.getContext("2d"), n); positionInlineEditor(); drawCanvas(); return;
        }
        if (state.draggingTextId !== null) {
            const t = state.texts.find(x => x.id === state.draggingTextId); if (!t) return;
            const point2 = getCanvasPoint(e), nx = point2.x - state.dragOffsetX, ny = point2.y - state.dragOffsetY;
            if (Math.abs(t.x - nx) > 1 || Math.abs(t.y - ny) > 1) state.hasDragged = true; t.x = nx; t.y = ny; positionInlineTextEditor(); drawCanvas(); return;
        }
        if (state.draggingNodeId === null) return;
        const n = state.nodes.find(x => x.id === state.draggingNodeId); if (!n) return;
        const point2 = getCanvasPoint(e), nx = point2.x - state.dragOffsetX, ny = point2.y - state.dragOffsetY;
        if (Math.abs(n.x - nx) > 1 || Math.abs(n.y - ny) > 1) state.hasDragged = true; n.x = nx; n.y = ny; positionInlineEditor(); drawCanvas();
    });
    const endPointer = (e) => {
        pointerMap.delete(e.pointerId); if (isPinching && pointerMap.size < 2) { isPinching = false; pinchNodeId = null; saveToLocalStorage(); drawCanvas(); return; }
        if (activePointerId !== e.pointerId) return;
        if (isDraggingSelectionGroup) {
            const point = getCanvasPoint(e);
            const moved = Math.hypot(point.x - startX, point.y - startY) > 4;
            if (moved && selectionGroupSnapshot) {
                const dx = point.x - startX;
                const dy = point.y - startY;
                for (const snap of selectionGroupSnapshot.nodes) {
                    const item = state.nodes.find((node) => node.id === snap.id);
                    if (!item) continue;
                    item.x = snap.x + dx;
                    item.y = snap.y + dy;
                }
                for (const snap of selectionGroupSnapshot.texts) {
                    const item = state.texts.find((text) => text.id === snap.id);
                    if (!item) continue;
                    item.x = snap.x + dx;
                    item.y = snap.y + dy;
                }
                saveToLocalStorage();
            }
            isDraggingSelectionGroup = false;
            selectionGroupSnapshot = null;
            activePointerId = null;
            downNodeId = null;
            downTextId = null;
            downConnectionIndex = null;
            wasSelectedOnDown = false;
            wasTextSelectedOnDown = false;
            updateUI();
            setCanvasCursor(c, "grab");
            return;
        }
        if (isSelectingBox) {
            const rect = state.selectionBox ? normalizeSelectionRect(state.selectionBox) : null;
            const moved = rect ? Math.hypot(rect.x2 - rect.x1, rect.y2 - rect.y1) > 6 : false;
            state.selectionBox = null;
            isSelectingBox = false;
            activePointerId = null;
            downNodeId = null;
            downTextId = null;
            downConnectionIndex = null;
            wasSelectedOnDown = false;
            wasTextSelectedOnDown = false;
            if (moved && rect) selectItemsInRect(rect); else clearSelectionState();
            updateUI();
            setCanvasCursor(c, "grab");
            return;
        }
        if (state.isConnecting && state.connectingFrom !== null) {
            const point = getCanvasPoint(e);
            const targetPort = getMagnetPortAtPosition(point.x, point.y, state.connectingFrom, PORT_MAGNET_RADIUS);
            if (targetPort) {
                finishConnection(targetPort.nodeId, targetPort.side);
            }
            else cancelConnection();
            activePointerId = null;
            downNodeId = null;
            downTextId = null;
            downConnectionIndex = null;
            wasSelectedOnDown = false;
            wasTextSelectedOnDown = false;
            setCanvasCursor(c, "grab");
            return;
        }
        if (isPanning) { isPanning = false; activePointerId = null; downNodeId = null; downTextId = null; downConnectionIndex = null; wasSelectedOnDown = false; wasTextSelectedOnDown = false; setCanvasCursor(c, "grab"); return; }
        if (isResizing) { isResizing = false; resizeNodeId = null; resizeHandle = null; activePointerId = null; saveToLocalStorage(); drawCanvas(); setCanvasCursor(c, "grab"); return; }
        const point = getCanvasPoint(e), moved = Math.hypot(point.x - startX, point.y - startY) > 6; if ((state.draggingNodeId !== null || state.draggingTextId !== null) && state.hasDragged) saveToLocalStorage();
        if (!moved && downConnectionIndex !== null && !state.isViewMode && !state.isConnecting) {
            clearSelectionState();
            setConnectionSelection([downConnectionIndex]);
            updateUI();
        } else if (!moved && downTextId !== null && !state.isViewMode && !state.isConnecting) {
            if (wasTextSelectedOnDown) { startInlineTextEdit(downTextId); } else { clearSelectionState(); setTextSelection([downTextId]); updateUI(); }
        } else if (!moved && downNodeId !== null && !state.isViewMode && !state.isConnecting) {
            if (wasSelectedOnDown) { startInlineEdit(downNodeId); } else { clearSelectionState(); setNodeSelection([downNodeId]); updateUI(); }
        }
        state.draggingNodeId = null; state.draggingTextId = null; state.hasDragged = false; activePointerId = null; downNodeId = null; downTextId = null; downConnectionIndex = null; wasSelectedOnDown = false; wasTextSelectedOnDown = false; setCanvasCursor(c, "grab");
    };
    c.addEventListener("pointerup", endPointer); c.addEventListener("pointercancel", endPointer);
    c.addEventListener("lostpointercapture", () => { state.selectionBox = null; isSelectingBox = false; isDraggingSelectionGroup = false; selectionGroupSnapshot = null; state.draggingNodeId = null; state.draggingTextId = null; state.hasDragged = false; activePointerId = null; downNodeId = null; downTextId = null; downConnectionIndex = null; wasSelectedOnDown = false; wasTextSelectedOnDown = false; isPanning = false; isResizing = false; isPinching = false; resizeNodeId = null; resizeHandle = null; pinchNodeId = null; pointerMap.clear(); setCanvasCursor(c, "grab"); });
}

// Global Exports for HTML
window.addNode = addNode;
window.addTextLabel = addTextLabel;
window.toggleConnectionFromMenu = toggleConnectionFromMenu;
window.centerView = centerView;
window.deleteNode = deleteNode;
window.exportToPNG = () => { void exportToPNG(); };
window.renameProject = renameProject;
window.toggleViewMode = toggleViewMode;
window.toggleDisconnectFromMenu = toggleDisconnectFromMenu;
window.openColorModal = openColorModal;
window.closeColorModal = closeColorModal;
window.toggleShapeMenu = toggleShapeMenu;
window.setNodeShape = setSelectedNodeShape;
window.closeShapeMenu = closeShapeMenu;
window.resetActiveColor = resetActiveColor;
window.closeRenameModal = closeRenameModal;
window.saveProjectName = saveProjectName;

function onWindowResize() {
    resizeCanvas(true);
    updateUI();
}

function startCanvasAnimationLoop(root) {
    if (!root) return;
    if (root._fluxAnimFrame) {
        cancelAnimationFrame(root._fluxAnimFrame);
    }
    const tick = (time) => {
        if (!fluxRoot()) return;
        drawCanvas(time);
        root._fluxAnimFrame = requestAnimationFrame(tick);
    };
    root._fluxAnimFrame = requestAnimationFrame(tick);
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
    syncTopActions();
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
    const colorModal = el("colorModal");
    if (colorModal) {
        if (root._fluxColorClick) colorModal.removeEventListener("click", root._fluxColorClick);
        const onColorBackdrop = (e) => {
            if (e.target === colorModal) closeColorModal();
        };
        colorModal.addEventListener("click", onColorBackdrop);
        root._fluxColorClick = onColorBackdrop;
    }
    const keyHandler = (e) => {
        if (state.isViewMode) return;
        const active = document.activeElement;
        const tag = active?.tagName || "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (e.key !== "Delete" && e.key !== "Backspace") return;
        e.preventDefault();
        deleteNode();
    };
    if (root._fluxKeyDown) document.removeEventListener("keydown", root._fluxKeyDown);
    document.addEventListener("keydown", keyHandler);
    root._fluxKeyDown = keyHandler;
    const canvasScroll = el("canvasScroll");
    if (canvasScroll) {
        if (root._fluxWheel) canvasScroll.removeEventListener("wheel", root._fluxWheel);
        const wheelHandler = (e) => onCanvasWheel(e);
        canvasScroll.addEventListener("wheel", wheelHandler, { passive: false });
        root._fluxWheel = wheelHandler;
    }
    root._fluxOnResize = onWindowResize;
    window.addEventListener("resize", root._fluxOnResize);
    startCanvasAnimationLoop(root);
    updateUI();
    showStatus("Pronto para criar seu fluxograma.", "success");
}

export function afterExternalHydrate() {
    hideInlineEditor(false);
    hideInlineTextEditor(false);
    setProjectTitle();
    syncTopActions();
    if (el("canvasScroll")) resizeCanvas(false);
    updateUI();
    saveToLocalStorage();
}

