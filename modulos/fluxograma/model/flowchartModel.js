/* Model for Fluxograma */

export const NODE_MIN_WIDTH = 220;
export const NODE_MIN_HEIGHT = 110;
export const NODE_MAX_WIDTH_AUTO = 320;
export const NODE_MAX_WIDTH_MANUAL = 760;
export const NODE_MAX_HEIGHT_MANUAL = 760;
export const NODE_PADDING_X = 14;
export const NODE_PADDING_Y = 16;
export const NODE_LINE_HEIGHT = 20;
export const NODE_HANDLE_SIZE = 10;
export const RULER_SIZE = 18;
export const RULER_STEP = 100;

export const state = {
    nodes: [],
    texts: [],
    connections: [],
    selectedNode: null,
    selectedTextId: null,
    selectedConnectionIndex: null,
    nextId: 1,
    isConnecting: false,
    connectingFrom: null,
    isDisconnecting: false,
    disconnectFrom: null,
    isViewMode: false,
    projectName: "Novo Fluxograma",
    draggingNodeId: null,
    dragOffsetX: 0,
    dragOffsetY: 0,
    hasDragged: false,
    ignoreNextClick: false,
    canvasWidth: 1200,
    canvasHeight: 700,
    viewportWidth: 1200,
    viewportHeight: 700,
    cameraX: 0,
    cameraY: 0,
    inlineEditNodeId: null,
    inlineEditTextId: null,
    draggingTextId: null
};

const STORAGE_KEY = "superapp_fluxograma_v1";
const LEGACY_STORAGE_KEY = "flowchart_data";

let graphPersistListener = null;

/** Chamado após gravar no localStorage (ex.: auto-save na nuvem com debounce). */
export function setGraphPersistListener(fn) {
    graphPersistListener = typeof fn === "function" ? fn : null;
}

function clearInteractionState() {
    state.selectedNode = null;
    state.selectedTextId = null;
    state.selectedConnectionIndex = null;
    state.isConnecting = false;
    state.connectingFrom = null;
    state.isDisconnecting = false;
    state.disconnectFrom = null;
    state.inlineEditNodeId = null;
    state.inlineEditTextId = null;
    state.draggingNodeId = null;
    state.draggingTextId = null;
    state.hasDragged = false;
}

/** Snapshot do grafo (localStorage / coluna dados no Supabase). */
export function getGraphPayload() {
    return {
        nodes: state.nodes.map(n => ({
            id: n.id,
            x: n.x,
            y: n.y,
            text: n.text || "",
            w: n.w || NODE_MIN_WIDTH,
            h: n.h || NODE_MIN_HEIGHT,
            manualSize: !!n.manualSize,
            shape: n.shape || "rect",
            color: n.color || "#ffffff"
        })),
        texts: state.texts.map(t => ({
            id: t.id,
            x: t.x,
            y: t.y,
            text: t.text || "",
            color: t.color || "#1a1f28",
            fontSize: Number(t.fontSize) || 24
        })),
        connections: state.connections.map(c => ({
            from: c.from,
            to: c.to,
            type: c.type || "arrow",
            color: c.color || "#000000"
        })),
        nextId: state.nextId,
        projectName: state.projectName,
        cameraX: state.cameraX,
        cameraY: state.cameraY
    };
}

/** Aplica um objeto persistido ao estado (substitui o grafo atual). */
export function applyPersistedData(d) {
    if (!d || typeof d !== "object") return;
    clearInteractionState();
    state.nodes = Array.isArray(d.nodes) ? d.nodes.map(n => ({
        id: n.id,
        x: Number(n.x) || 0,
        y: Number(n.y) || 0,
        text: typeof n.text === "string" ? n.text : "",
        w: Number(n.w) || NODE_MIN_WIDTH,
        h: Number(n.h) || NODE_MIN_HEIGHT,
        manualSize: !!n.manualSize,
        shape: typeof n.shape === "string" ? n.shape : "rect",
        color: typeof n.color === "string" ? n.color : "#ffffff"
    })) : [];
    state.texts = Array.isArray(d.texts) ? d.texts.map(t => ({
        id: t.id,
        x: Number(t.x) || 0,
        y: Number(t.y) || 0,
        text: typeof t.text === "string" ? t.text : "",
        color: typeof t.color === "string" ? t.color : "#1a1f28",
        fontSize: Number(t.fontSize) || 24
    })) : [];
    state.connections = Array.isArray(d.connections) ? d.connections.map(c => ({
        from: c.from,
        to: c.to,
        type: typeof c.type === "string" ? c.type : "arrow",
        color: typeof c.color === "string" ? c.color : "#000000"
    })) : [];
    state.nextId = Number.isInteger(d.nextId) ? d.nextId : 1;
    state.projectName = typeof d.projectName === "string" && d.projectName.trim()
        ? d.projectName.trim()
        : "Novo Fluxograma";
    state.cameraX = Number(d.cameraX) || 0;
    state.cameraY = Number(d.cameraY) || 0;
}

/** Novo rascunho vazio. */
export function resetGraphState() {
    clearInteractionState();
    state.nodes = [];
    state.texts = [];
    state.connections = [];
    state.nextId = 1;
    state.projectName = "Novo Fluxograma";
    state.cameraX = 0;
    state.cameraY = 0;
}

export function saveToLocalStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getGraphPayload()));
    if (graphPersistListener) {
        try {
            graphPersistListener();
        } catch (e) {
            console.error(e);
        }
    }
}

export function loadFromLocalStorage() {
    let s = localStorage.getItem(STORAGE_KEY);
    let fromLegacy = false;
    if (!s) {
        s = localStorage.getItem(LEGACY_STORAGE_KEY);
        fromLegacy = !!s;
    }
    if (!s) return;
    try {
        const d = JSON.parse(s);
        applyPersistedData(d);
        if (fromLegacy) saveToLocalStorage();
    } catch (e) {
        console.error(e);
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
}
