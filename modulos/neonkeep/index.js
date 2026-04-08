/**
 * Notas Module
 * Futuristic Draggable Notes with Infinite Panning & Color Selection
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
            <div id="neon-plane" class="neonkeep-plane">
                <canvas id="matrix-bg" class="matrix-canvas"></canvas>
                <div id="neon-canvas" class="neonkeep-canvas"></div>
            </div>
            
            <div class="neonkeep-controls">
                <button id="add-note-btn" class="neon-btn">
                    <i class="fas fa-plus-square"></i> NOVA NOTA
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
        </div>
    `;

    const plane = contentEl.querySelector('#neon-plane');
    const canvas = contentEl.querySelector('#neon-canvas');
    const matrixCanvas = contentEl.querySelector('#matrix-bg');
    const addBtn = contentEl.querySelector('#add-note-btn');
    const errorOverlay = contentEl.querySelector('#notes-error-msg');
    const errorDetails = contentEl.querySelector('#error-details');
    const closeErrorBtn = contentEl.querySelector('#close-error-btn');
    
    let notes = [];
    let zIndexCounter = 100;
    
    // Pan state
    let panX = -2500 + (contentEl.offsetWidth / 2 || window.innerWidth / 2);
    let panY = -2500 + (contentEl.offsetHeight / 2 || window.innerHeight / 2);
    
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

        plane.onmousedown = (e) => {
            if (e.target !== plane && e.target !== canvas && e.target !== matrixCanvas) return;
            isPanning = true;
            startX = e.clientX - panX;
            startY = e.clientY - panY;
            
            const onMouseMove = (e) => {
                if (!isPanning) return;
                panX = e.clientX - startX;
                panY = e.clientY - startY;
                updatePlaneTransform();
            };
            
            const onMouseUp = () => {
                isPanning = false;
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };
    }

    // --- MATRIX BACKGROUND ENGINE ---
    function initMatrix() {
        const ctx = matrixCanvas.getContext('2d');
        let width = matrixCanvas.width = 5000;
        let height = matrixCanvas.height = 5000;
        const fontSize = 16;
        const columns = Math.floor(width / fontSize);
        const drops = new Array(columns).fill(1).map(() => Math.random() * height / fontSize);
        
        function draw() {
            ctx.fillStyle = 'rgba(5, 11, 20, 0.2)';
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = 'rgba(0, 255, 187, 0.08)'; 
            ctx.font = fontSize + 'px monospace';
            for (let i = 0; i < drops.length; i++) {
                const text = Math.random() > 0.5 ? "1" : "0";
                ctx.fillText(text, i * fontSize, drops[i] * fontSize);
                if (drops[i] * fontSize > height && Math.random() > 0.985) drops[i] = 0;
                drops[i] += 0.3;
            }
        }
        let animationId;
        function animate() { draw(); animationId = requestAnimationFrame(animate); }
        animate();
        contentEl._cleanupMatrix = () => cancelAnimationFrame(animationId);
    }

    // Load Notes
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
        
        // Color Change Logic
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
        header.onmousedown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.classList.contains('color-dot')) return;
            isDragging = true; el.classList.add('dragging'); el.style.zIndex = zIndexCounter++;
            offsetX = e.clientX - el.offsetLeft; offsetY = e.clientY - el.offsetTop;
            const onMouseMove = (e) => {
                if (!isDragging) return;
                el.style.left = `${e.clientX - offsetX}px`; el.style.top = `${e.clientY - offsetY}px`;
            };
            const onMouseUp = () => {
                if (isDragging) {
                    isDragging = false; el.classList.remove('dragging');
                    document.removeEventListener('mousemove', onMouseMove); document.removeEventListener('mouseup', onMouseUp);
                    saveNote(noteData.id, { x_pos: parseInt(el.style.left), y_pos: parseInt(el.style.top) }, el);
                }
            };
            document.addEventListener('mousemove', onMouseMove); document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
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
            const res = await fetch('/api/notes', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, ...data })
            });
            if (res.ok) { const s = el.querySelector('.save-status'); if (s) s.textContent = 'SALVO'; }
        } catch (err) { console.error('Save error:', err); }
    }

    async function deleteNote(id, el) {
        if (!confirm('DESEJA APAGAR ESTA NOTA?')) return;
        try {
            const res = await fetch(`/api/notes?id=${id}`, { method: 'DELETE' });
            if (res.ok) { el.style.transform = 'scale(0.8) translateY(20px)'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }
        } catch (err) { console.error('Delete error:', err); }
    }

    addBtn.onclick = async () => {
        try {
            const res = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'NOVA NOTA', content: '',
                    x_pos: 2500 + (Math.random() * 400 - 200),
                    y_pos: 2500 + (Math.random() * 400 - 200)
                })
            });
            const data = await res.json();
            if (res.ok) createNoteElement(data);
        } catch (err) { console.error('Add error:', err); }
    };

    contentEl._cleanup = () => { if (contentEl._cleanupMatrix) contentEl._cleanupMatrix(); };
    initPanning(); initMatrix(); loadNotes();
}
