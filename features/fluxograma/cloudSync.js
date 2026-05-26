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
const DEFAULT_PROJECT_NAME = "Novo Fluxograma";

let autoSaveTimer = null;
let savingCloud = false;
let cachedProjects = [];

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

function askProjectName({
    title = "Nome do projeto",
    message = "Digite um nome para começar.",
    initialValue = "",
    confirmLabel = "Salvar",
    placeholder = "Nome do projeto"
} = {}) {
    return new Promise((resolve) => {
        const safeInitialValue = String(initialValue || "")
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;");
        const overlay = document.createElement("div");
        overlay.className = "app-modal-overlay flux-project-name-overlay";
        overlay.innerHTML = `
            <div class="app-modal flux-project-name-modal" role="dialog" aria-modal="true" aria-labelledby="flux-project-name-title">
                <div class="flux-project-name-head">
                    <div class="flux-project-name-icon" aria-hidden="true">
                        <i class="fas fa-pen-to-square"></i>
                    </div>
                    <div class="flux-project-name-head-copy">
                        <span class="flux-project-name-kicker">Fluxograma</span>
                        <h4 id="flux-project-name-title">${title}</h4>
                        <p class="flux-project-name-copy">${message}</p>
                    </div>
                </div>
                <div class="app-form">
                    <label for="flux-project-name-input" style="position:absolute;left:-9999px;">${title}</label>
                    <input
                        id="flux-project-name-input"
                        type="text"
                        maxlength="80"
                        placeholder="${placeholder}"
                        value="${safeInitialValue}"
                        autocomplete="off"
                        spellcheck="false"
                    />
                </div>
                <div class="app-modal-actions">
                    <button type="button" class="app-btn app-btn-secondary" data-action="cancel">Cancelar</button>
                    <button type="button" class="app-btn" data-action="confirm">${confirmLabel}</button>
                </div>
            </div>
        `;

        const close = (value) => {
            overlay.remove();
            resolve(value);
        };

        const input = overlay.querySelector("#flux-project-name-input");
        overlay.querySelector('[data-action="cancel"]').onclick = () => close(null);
        overlay.querySelector('[data-action="confirm"]').onclick = () => close(String(input.value || "").trim());
        overlay.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                e.preventDefault();
                close(null);
            }
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                close(String(input.value || "").trim());
            }
        });
        overlay.onclick = (e) => {
            if (e.target === overlay) close(null);
        };

        document.body.appendChild(overlay);
        requestAnimationFrame(() => {
            input?.focus();
            if (typeof input?.select === "function") input.select();
        });
    });
}

async function performCloudSave() {
    if (savingCloud) return;
    const id = localStorage.getItem(LS_REMOTE_ID);
    const nome = (state.projectName || "").trim() || DEFAULT_PROJECT_NAME;
    const dados = getGraphPayload();
    dados.projectName = nome;
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
        const enteredName = await askProjectName({
            title: "Novo projeto",
            message: "Escolha o nome do projeto antes de abrir o editor.",
            initialValue: DEFAULT_PROJECT_NAME,
            confirmLabel: "Criar"
        });
        if (enteredName === null) return;
        resetGraphState();
        localStorage.removeItem(LS_REMOTE_ID);
        state.projectName = enteredName || DEFAULT_PROJECT_NAME;
        saveToLocalStorage();
        await enterEditor();
        await performCloudSave();
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

    async function renameProject(pid, currentName = "") {
        const nextName = await askProjectName({
            title: "Editar nome",
            message: "Atualize o nome do projeto selecionado.",
            initialValue: currentName || DEFAULT_PROJECT_NAME,
            confirmLabel: "Salvar"
        });
        if (nextName === null) return;
        const nome = nextName || currentName || DEFAULT_PROJECT_NAME;
        const errEl = document.getElementById("flux-hub-error");
        try {
            await fetchJson("/api/fluxograma", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    id: pid,
                    nome,
                })
            });
            if (localStorage.getItem(LS_REMOTE_ID) === pid) {
                state.projectName = nome;
                saveToLocalStorage();
            }
            await renderHub();
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

    function renderHubCards(filterTerm = "") {
        const errEl = document.getElementById("flux-hub-error");
        if (errEl) errEl.textContent = "";
        cardsWrap.querySelectorAll(".flux-project-card:not(.flux-project-card--new)").forEach((n) => n.remove());
        const term = String(filterTerm || "").trim().toLowerCase();
        const projects = term
            ? cachedProjects.filter((p) => String(p.nome || "").toLowerCase().includes(term))
            : cachedProjects;
        if (hubStatus) hubStatus.textContent = cachedProjects.length === 0
            ? "Nenhum projeto - crie o primeiro"
            : `${projects.length}/${cachedProjects.length} projeto(s)`;
        const palette = ["#38bdf8", "#a78bfa", "#22c55e", "#f97316", "#f43f5e", "#60a5fa"];
        projects.forEach((p, idx) => {
            const card = document.createElement("div");
            card.className = "flux-project-card";
            card.setAttribute("role", "button");
            card.setAttribute("tabindex", "0");
            card.style.setProperty("--flux-accent", palette[idx % palette.length]);
            const title = document.createElement("span");
            title.className = "flux-card-title";
            title.textContent = p.nome || "Sem nome";
            const meta = document.createElement("span");
            meta.className = "flux-card-meta";
            meta.textContent = p.updated_at
                ? "Atualizado " + new Date(p.updated_at).toLocaleString("pt-BR")
                : "Sem atualização recente";
            const actions = document.createElement("div");
            actions.className = "flux-card-actions";
            const edit = document.createElement("button");
            edit.type = "button";
            edit.className = "flux-card-action flux-card-action--edit";
            edit.setAttribute("aria-label", "Editar nome");
            edit.title = "Editar nome";
            edit.innerHTML = '<i class="fas fa-pen" aria-hidden="true"></i>';
            edit.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                renameProject(p.id, p.nome || "");
            });
            const del = document.createElement("button");
            del.type = "button";
            del.className = "flux-card-action flux-card-action--delete";
            del.setAttribute("aria-label", "Excluir");
            del.title = "Excluir";
            del.innerHTML = '<i class="fas fa-trash" aria-hidden="true"></i>';
            del.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                deleteProject(p.id);
            });
            actions.append(edit, del);
            card.append(title, meta, actions);
            card.addEventListener("click", () => openExistingProject(p.id));
            card.addEventListener("keydown", (e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                if (e.target !== card) return;
                e.preventDefault();
                openExistingProject(p.id);
            });
            cardsWrap.appendChild(card);
        });
        if (term && projects.length === 0) {
            const empty = document.createElement("div");
            empty.className = "flux-hub-error";
            empty.textContent = "Nenhum projeto encontrado para a busca atual.";
            cardsWrap.appendChild(empty);
        }
    }

    async function renderHub(filterTerm = (document.getElementById("flux-hub-search")?.value || ""), forceRefresh = true) {
        const errEl = document.getElementById("flux-hub-error");
        if (errEl) errEl.textContent = "";
        try {
            if (forceRefresh || cachedProjects.length === 0) {
                const data = await fetchJson("/api/fluxograma");
                cachedProjects = data.projects || [];
            }
            renderHubCards(filterTerm);
        } catch (e) {
            if (hubStatus) hubStatus.textContent = "";
            if (errEl) errEl.textContent = "Não foi possível listar projetos: " + (e.message || String(e));
        }
    }

    btnNew.addEventListener("click", () => openNewProject());

    const searchInput = document.getElementById("flux-hub-search");
    if (searchInput) {
        searchInput.addEventListener("input", () => renderHub(searchInput.value, false));
    }

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

