import {
    state,
    getGraphPayload,
    applyPersistedData,
    resetGraphState,
    saveToLocalStorage,
    setGraphPersistListener
} from "./model/flowchartModel.js";

const LS_REMOTE_ID = "superapp_fluxograma_remote_id";
const AUTOSAVE_MS = 900;

let autoSaveTimer = null;
let savingCloud = false;

function ce(id) {
    return document.getElementById("flux-" + id);
}

async function fetchJson(url, opts) {
    const res = await fetch(url, opts);
    const text = await res.text();
    let data = {};
    if (text) {
        try {
            data = JSON.parse(text);
        } catch {
            data = {};
        }
    }
    if (!res.ok) throw new Error(data.error || res.statusText || "Erro na requisição");
    return data;
}

function setAutosaveStatus(text, isErr) {
    const el = ce("autosave-status");
    if (!el) return;
    el.textContent = text || "";
    if (isErr) {
        el.style.color = "#b91c1c";
        return;
    }
    if (text && text.includes("Salvo")) el.style.color = "#15803d";
    else el.style.color = "#6b7280";
}

async function performCloudSave() {
    if (savingCloud) return;
    const id = localStorage.getItem(LS_REMOTE_ID);
    const nome = (state.projectName || "").trim() || "Novo Fluxograma";
    const dados = getGraphPayload();
    dados.projectName = nome;
    const hasContent = state.nodes.length > 0 || state.connections.length > 0;
    if (!id && !hasContent) {
        setAutosaveStatus("");
        return;
    }
    savingCloud = true;
    setAutosaveStatus("Salvando na nuvem...");
    try {
        if (id) {
            await fetchJson("/api/fluxograma", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id, nome, dados })
            });
        } else {
            const out = await fetchJson("/api/fluxograma", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nome, dados })
            });
            if (out.id) localStorage.setItem(LS_REMOTE_ID, out.id);
        }
        const t = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        setAutosaveStatus("Salvo na nuvem às " + t);
    } catch (e) {
        setAutosaveStatus("Nuvem: " + (e.message || String(e)), true);
    } finally {
        savingCloud = false;
    }
}

function scheduleCloudSave() {
    const editor = document.getElementById("flux-editor-screen");
    if (!editor || editor.style.display === "none") return;
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        autoSaveTimer = null;
        performCloudSave();
    }, AUTOSAVE_MS);
}

async function flushCloudSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
    const editor = document.getElementById("flux-editor-screen");
    if (editor && editor.style.display !== "none") {
        await performCloudSave();
    }
}

/**
 * Tela inicial (cards) + editor com auto-save na nuvem.
 * @param {{ bootFluxograma: Function, afterExternalHydrate: Function }} mod
 */
export async function initFluxogramaApp(mod) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;

    const hub = document.getElementById("flux-hub-screen");
    const editor = document.getElementById("flux-editor-screen");
    const cardsWrap = document.getElementById("flux-hub-cards-wrap");
    const hubStatus = ce("hub-status");
    const hubErr = document.getElementById("flux-hub-error");
    const btnNew = document.getElementById("flux-hub-new");
    const btnBack = ce("back-hub");

    if (!hub || !editor || !cardsWrap || !btnNew || !mod) return;

    function showHub() {
        hub.style.display = "flex";
        editor.style.display = "none";
    }

    function showEditor() {
        hub.style.display = "none";
        editor.style.display = "flex";
        editor.style.flexDirection = "column";
        editor.style.flex = "1";
        editor.style.minHeight = "0";
    }

    async function enterEditor() {
        showEditor();
        await new Promise((resolve) => {
            requestAnimationFrame(() => {
                const ed = document.getElementById("flux-editor-screen");
                const alreadyBooted = ed && ed.dataset.fluxBooted === "1";
                if (!alreadyBooted) {
                    mod.bootFluxograma({ skipLocalLoad: true });
                    if (ed) ed.dataset.fluxBooted = "1";
                } else {
                    mod.afterExternalHydrate();
                }
                resolve();
            });
        });
    }

    async function openNewProject() {
        resetGraphState();
        localStorage.removeItem(LS_REMOTE_ID);
        saveToLocalStorage();
        await enterEditor();
        setAutosaveStatus("Alterações serão salvas na nuvem automaticamente");
    }

    async function openExistingProject(pid) {
        const errEl = document.getElementById("flux-hub-error");
        if (errEl) errEl.textContent = "";
        try {
            const data = await fetchJson("/api/fluxograma?id=" + encodeURIComponent(pid));
            const p = data.project;
            if (!p) throw new Error("Projeto não encontrado");
            const raw = typeof p.dados === "object" && p.dados !== null ? p.dados : {};
            applyPersistedData(raw);
            if (p.nome && String(p.nome).trim()) state.projectName = String(p.nome).trim();
            localStorage.setItem(LS_REMOTE_ID, pid);
            saveToLocalStorage();
            await enterEditor();
            setAutosaveStatus("");
        } catch (e) {
            if (errEl) errEl.textContent = e.message || String(e);
        }
    }

    async function deleteProject(pid) {
        if (!confirm("Excluir este projeto da nuvem? Esta ação não pode ser desfeita.")) return;
        const errEl = document.getElementById("flux-hub-error");
        try {
            await fetchJson("/api/fluxograma?id=" + encodeURIComponent(pid), { method: "DELETE" });
            if (localStorage.getItem(LS_REMOTE_ID) === pid) localStorage.removeItem(LS_REMOTE_ID);
            await renderHub();
        } catch (e) {
            if (errEl) errEl.textContent = e.message || String(e);
        }
    }

    async function renderHub() {
        const errEl = document.getElementById("flux-hub-error");
        if (errEl) errEl.textContent = "";
        cardsWrap.querySelectorAll(".flux-project-card:not(.flux-project-card--new)").forEach((n) => n.remove());
        if (hubStatus) hubStatus.textContent = "Carregando...";
        try {
            const data = await fetchJson("/api/fluxograma");
            const projects = data.projects || [];
            if (hubStatus) hubStatus.textContent = projects.length === 0 ? "Nenhum projeto - crie o primeiro" : `${projects.length} projeto(s)`;
            for (const p of projects) {
                const card = document.createElement("button");
                card.type = "button";
                card.className = "flux-project-card";
                const title = document.createElement("span");
                title.className = "flux-card-title";
                title.textContent = p.nome || "Sem nome";
                const meta = document.createElement("span");
                meta.className = "flux-card-meta";
                meta.textContent = p.updated_at
                    ? "Atualizado " + new Date(p.updated_at).toLocaleString("pt-BR")
                    : "";
                const del = document.createElement("button");
                del.type = "button";
                del.className = "flux-card-del";
                del.setAttribute("aria-label", "Excluir");
                del.textContent = "";
                del.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    deleteProject(p.id);
                });
                card.append(title, meta, del);
                card.addEventListener("click", () => openExistingProject(p.id));
                cardsWrap.appendChild(card);
            }
        } catch (e) {
            if (hubStatus) hubStatus.textContent = "";
            if (errEl) errEl.textContent = "Não foi possível listar projetos: " + (e.message || String(e));
        }
    }

    btnNew.addEventListener("click", () => openNewProject());

    if (btnBack) {
        btnBack.addEventListener("click", async () => {
            await flushCloudSave();
            showHub();
            await renderHub();
        });
    }

    setGraphPersistListener(() => scheduleCloudSave());

    if (!initFluxogramaApp._visibilityHooked) {
        initFluxogramaApp._visibilityHooked = true;
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") {
                clearTimeout(autoSaveTimer);
                autoSaveTimer = null;
                const ed = document.getElementById("flux-editor-screen");
                if (ed && ed.style.display !== "none") performCloudSave();
            }
        });
    }

    showHub();
    await renderHub();
}

