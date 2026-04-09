/**
 * Notas Module
 * Futuristic Draggable Notes with Viewport-Fixed Infinite Matrix Aura
 */

export async function renderNotasContent(contentEl) {
    // Inject Styles
    if (!document.getElementById('neonkeep-styles')) {
        const link = document.createElement('link');
        link.id = 'neonkeep-styles';
        link.rel = 'stylesheet';
        link.href = './modulos/neonkeep/styles.css';
        document.head.appendChild(link);
    }

    const NEON_COLORS = [
        { name: 'Emerald', value: '#00ffbb' },
        { name: 'Gold', value: '#f3ec19' },
        { name: 'Crimson', value: '#ff003c' },
        { name: 'Blue', value: '#0070ff' },
        { name: 'Purple', value: '#bf00ff' }
    ];

    contentEl.innerHTML = `
        <div class="neonkeep-root">
            <canvas id="matrix-bg" class="matrix-canvas"></canvas>
            
            <!-- Camada invisível para capturar o pan (mãozinha) -->
            <div id="pan-layer" class="neonkeep-pan-layer"></div>

            <div id="neon-plane" class="neonkeep-plane">
                <div id="neon-canvas" class="neonkeep-canvas"></div>
            </div>
            
            <div class="neonkeep-controls">
                <button id="add-note-btn" class="neon-btn">
                    <i class="fas fa-plus-square"></i> NOVA NOTA
                </button>
                <button id="gps-center-btn" class="neon-btn icon-only" title="LOCALIZAR NOTAS">
                    <i class="fas fa-location-crosshairs"></i>
                </button>
            </div>
            
            <div id="notes-error-msg" class="api-error-overlay" style="display:none">
                <div class="error-box">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>SISTEMA DE NOTAS</h3>
                    <p id="error-details">Falha ao carregar dados do servidor.</p>
                    <button class="neon-btn mini" id="close-error-btn">ENTENDI</button>
                </div>
            </div>

            <!-- Custom Confirm Modal -->
            <div id="neonkeep-confirm-modal" class="neonkeep-confirm-overlay">
                <div class="confirm-box">
                    <i class="fas fa-microchip"></i>
                    <h3 id="confirm-title">AUTORIZAÇÃO</h3>
                    <p id="confirm-msg"></p>
                    <div class="confirm-actions">
                        <button id="confirm-cancel-btn" class="neon-btn secondary">CANCELAR</button>
                        <button id="confirm-ok-btn" class="neon-btn danger">CONFIRMAR</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const panLayer = contentEl.querySelector('#pan-layer');
    const plane = contentEl.querySelector('#neon-plane');
    const canvas = contentEl.querySelector('#neon-canvas');
    const matrixCanvas = contentEl.querySelector('#matrix-bg');
    const addBtn = contentEl.querySelector('#add-note-btn');
    const errorOverlay = contentEl.querySelector('#notes-error-msg');
    const errorDetails = contentEl.querySelector('#error-details');
    const closeErrorBtn = contentEl.querySelector('#close-error-btn');
    const gpsBtn = contentEl.querySelector('#gps-center-btn');
    
    // Confirm Modal Elements
    const confirmOverlay = contentEl.querySelector('#neonkeep-confirm-modal');
    const confirmMsg = contentEl.querySelector('#confirm-msg');
    const confirmOkBtn = contentEl.querySelector('#confirm-ok-btn');
    const confirmCancelBtn = contentEl.querySelector('#confirm-cancel-btn');

    async function showConfirm(title, message) {
        contentEl.querySelector('#confirm-title').textContent = title || 'AUTORIZAÇÃO';
        confirmMsg.textContent = message;
        confirmOverlay.style.display = 'flex';
        
        return new Promise((resolve) => {
            confirmOkBtn.onclick = () => {
                confirmOverlay.style.display = 'none';
                resolve(true);
            };
            confirmCancelBtn.onclick = () => {
                confirmOverlay.style.display = 'none';
                resolve(false);
            };
        });
    }
    
    let notes = [];
    let zIndexCounter = 100;
    
    // Pan state - Iniciamos com um offset grande para permitir movimento em todas as direções
    let panX = 0;
    let panY = 0;
    
    function updatePlaneTransform() {
        plane.style.transform = `translate(${panX}px, ${panY}px)`;
    }

    updatePlaneTransform();

    closeErrorBtn.onclick = () => {
        errorOverlay.style.display = 'none';
    };

    // --- INFINITE PANNING ENGINE ---
    function initPanning() {
        let isPanning = false;
        let startX, startY;

        const startMove = (cx, cy) => {
            isPanning = true;
            startX = cx - panX;
            startY = cy - panY;
        };

        const onMove = (cx, cy) => {
            if (!isPanning) return;
            panX = cx - startX;
            panY = cy - startY;
            updatePlaneTransform();
        };

        const endMove = () => {
            isPanning = false;
        };

        // Mouse Events
        panLayer.onmousedown = (e) => {
            startMove(e.clientX, e.clientY);
            const moveHandler = (ev) => onMove(ev.clientX, ev.clientY);
            const upHandler = () => {
                endMove();
                document.removeEventListener('mousemove', moveHandler);
                document.removeEventListener('mouseup', upHandler);
            };
            document.addEventListener('mousemove', moveHandler);
            document.addEventListener('mouseup', upHandler);
        };

        // Touch Events
        panLayer.ontouchstart = (e) => {
            const touch = e.touches[0];
            startMove(touch.clientX, touch.clientY);
            const moveHandler = (ev) => {
                const t = ev.touches[0];
                onMove(t.clientX, t.clientY);
                if (ev.cancelable) ev.preventDefault(); // Impede scroll durante o pan
            };
            const endHandler = () => {
                endMove();
                document.removeEventListener('touchmove', moveHandler);
                document.removeEventListener('touchend', endHandler);
            };
            document.addEventListener('touchmove', moveHandler, { passive: false });
            document.addEventListener('touchend', endHandler);
        };
    }

    // --- VIEWPORT-FIXED MATRIX ENGINE ---
    function initMatrix() {
        const ctx = matrixCanvas.getContext('2d');
        
        let width = matrixCanvas.width = contentEl.offsetWidth || window.innerWidth;
        let height = matrixCanvas.height = contentEl.offsetHeight || window.innerHeight;
        
        const fontSize = 16;
        let columns = Math.floor(width / fontSize);
        let drops = new Array(columns).fill(1).map(() => Math.random() * height / fontSize);
        
        function draw() {
            // Fundo escuro sutil
            ctx.fillStyle = 'rgba(5, 11, 20, 0.15)';
            ctx.fillRect(0, 0, width, height);
            
            ctx.fillStyle = 'rgba(0, 255, 187, 0.08)'; 
            ctx.font = fontSize + 'px monospace';
            
            for (let i = 0; i < drops.length; i++) {
                const text = Math.random() > 0.5 ? "1" : "0";
                
                // Desenha os dígitos. Estão fixos na tela, mas como o fundo é preto,
                // para o usuário parece o "tecido" da realidade digital que é onipresente.
                ctx.fillText(text, i * fontSize, drops[i] * fontSize);
                
                if (drops[i] * fontSize > height && Math.random() > 0.985) {
                    drops[i] = 0;
                }
                drops[i] += 0.5;
            }
        }
        
        let animationId;
        function animate() {
            draw();
            animationId = requestAnimationFrame(animate);
        }
        
        animate();

        window.addEventListener('resize', () => {
            width = matrixCanvas.width = contentEl.offsetWidth || window.innerWidth;
            height = matrixCanvas.height = contentEl.offsetHeight || window.innerHeight;
            columns = Math.floor(width / fontSize);
            drops = new Array(columns).fill(1).map(() => Math.random() * height / fontSize);
        });

        contentEl._cleanupMatrix = () => cancelAnimationFrame(animationId);
    }

    // CRUD Logic ...
    async function loadNotes() {
        try {
            const res = await fetch('/api/notes');
            const data = await res.json();
            if (!res.ok) { showError(data.details || data.error); return; }
            notes = data;
            renderNotes();
        } catch (err) { showError('Erro de conexão ao carregar notas.'); }
    }

    function showError(msg) { errorDetails.textContent = msg; errorOverlay.style.display = 'flex'; }

    function renderNotes() { canvas.innerHTML = ''; notes.forEach(note => createNoteElement(note)); }

    function createNoteElement(note) {
        const noteEl = document.createElement('div');
        noteEl.className = 'neon-note';
        noteEl.id = `note-${note.id}`;
        noteEl.style.left = `${note.x_pos}px`;
        noteEl.style.top = `${note.y_pos}px`;
        noteEl.style.setProperty('--note-color', note.color || '#00ffbb');
        noteEl.style.zIndex = zIndexCounter++;

        const colorOptions = NEON_COLORS.map(c => 
            `<div class="color-dot" style="background: ${c.value}; --dot-color: ${c.value}" data-color="${c.value}"></div>`
        ).join('');

        noteEl.innerHTML = `
            <div class="note-header" title="Arraste">
                <input type="text" class="note-title-input" value="${note.title || ''}" placeholder="TÍTULO">
                <div class="note-actions">
                    <div class="color-dots">${colorOptions}</div>
                    <button class="action-btn delete" title="Apagar"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
            <div class="note-content-area">
                <textarea class="note-text-input" placeholder="Digite aqui...">${note.content || ''}</textarea>
            </div>
            <div class="note-footer"><span class="save-status">SALVO</span></div>
        `;

        setupDraggableNote(noteEl, note);
        setupAutoSave(noteEl, note);
        
        noteEl.querySelectorAll('.color-dot').forEach(dot => {
            dot.onclick = (e) => {
                e.stopPropagation();
                const newColor = dot.getAttribute('data-color');
                noteEl.style.setProperty('--note-color', newColor);
                saveNote(note.id, { color: newColor }, noteEl);
            };
        });

        noteEl.querySelector('.delete').onclick = (e) => { e.stopPropagation(); deleteNote(note.id, noteEl); };

        canvas.appendChild(noteEl);
        return noteEl;
    }

    function setupDraggableNote(el, noteData) {
        const header = el.querySelector('.note-header');
        let offsetX, offsetY, isDragging = false;

        const startDragging = (cx, cy) => {
            isDragging = true; 
            el.classList.add('dragging'); 
            el.style.zIndex = zIndexCounter++;
            offsetX = cx - el.offsetLeft; 
            offsetY = cy - el.offsetTop;
        };

        const onDragging = (cx, cy) => {
            if (!isDragging) return;
            el.style.left = `${cx - offsetX}px`; 
            el.style.top = `${cy - offsetY}px`;
        };

        const stopDragging = () => {
            if (isDragging) {
                isDragging = false; 
                el.classList.remove('dragging');
                saveNote(noteData.id, { x_pos: parseInt(el.style.left), y_pos: parseInt(el.style.top) }, el);
            }
        };

        // Mouse Events
        header.onmousedown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.classList.contains('color-dot')) return;
            startDragging(e.clientX, e.clientY);
            const moveHandler = (ev) => onDragging(ev.clientX, ev.clientY);
            const upHandler = () => {
                stopDragging();
                document.removeEventListener('mousemove', moveHandler);
                document.removeEventListener('mouseup', upHandler);
            };
            document.addEventListener('mousemove', moveHandler);
            document.addEventListener('mouseup', upHandler);
            e.preventDefault(); e.stopPropagation();
        };

        // Touch Events
        header.ontouchstart = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.classList.contains('color-dot')) return;
            const touch = e.touches[0];
            startDragging(touch.clientX, touch.clientY);
            const moveHandler = (ev) => {
                const t = ev.touches[0];
                onDragging(t.clientX, t.clientY);
                if (ev.cancelable) ev.preventDefault();
            };
            const endHandler = () => {
                stopDragging();
                document.removeEventListener('touchmove', moveHandler);
                document.removeEventListener('touchend', endHandler);
            };
            document.addEventListener('touchmove', moveHandler, { passive: false });
            document.addEventListener('touchend', endHandler);
            e.stopPropagation();
        };
    }

    function setupAutoSave(el, noteData) {
        const titleInput = el.querySelector('.note-title-input');
        const textInput = el.querySelector('.note-text-input');
        const statusEl = el.querySelector('.save-status');
        let timeout = null;
        const handleInput = () => {
            statusEl.textContent = 'SALVANDO...'; clearTimeout(timeout);
            timeout = setTimeout(() => {
                saveNote(noteData.id, { title: titleInput.value, content: textInput.value }, el);
            }, 1000);
        };
        titleInput.oninput = handleInput; textInput.oninput = handleInput;
    }

    async function saveNote(id, data, el) {
        try {
            await fetch('/api/notes', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, ...data })
            });
            const s = el.querySelector('.save-status'); if (s) s.textContent = 'SALVO';
        } catch (err) { console.error('Save error:', err); }
    }

    async function deleteNote(id, el) {
        const confirmed = await showConfirm('COMPROMETIMENTO', 'Deseja apagar esta unidade de dados permanentemente?');
        if (!confirmed) return;
        try {
            const res = await fetch(`/api/notes?id=${id}`, { method: 'DELETE' });
            if (res.ok) { el.remove(); }
        } catch (err) { console.error('Delete error:', err); }
    }

    addBtn.onclick = async () => {
        try {
            const res = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'NOVA NOTA', content: '',
                    x_pos: -panX + (contentEl.offsetWidth / 2) - 140, // Centraliza no viewport atual
                    y_pos: -panY + (contentEl.offsetHeight / 2) - 100
                })
            });
            const data = await res.json();
            if (res.ok) createNoteElement(data);
        } catch (err) { console.error('Add error:', err); }
    };

    async function centerNotesAnimation() {
        if (notes.length === 0) {
            panX = 0; panY = 0;
            updatePlaneTransform();
            return;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const noteWidth = 280;
        const noteHeight = 150;

        notes.forEach(note => {
            minX = Math.min(minX, note.x_pos);
            minY = Math.min(minY, note.y_pos);
            maxX = Math.max(maxX, note.x_pos + noteWidth);
            maxY = Math.max(maxY, note.y_pos + noteHeight);
        });

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        const vW = contentEl.offsetWidth || window.innerWidth;
        const vH = contentEl.offsetHeight || window.innerHeight;

        panX = (vW / 2) - centerX;
        panY = (vH / 2) - centerY;

        plane.classList.add('smooth-pan');
        updatePlaneTransform();
        setTimeout(() => plane.classList.remove('smooth-pan'), 600);
    }

    gpsBtn.onclick = centerNotesAnimation;

    initPanning(); initMatrix(); loadNotes();
}
