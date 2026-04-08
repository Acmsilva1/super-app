/**
 * Notas Module
 * Futuristic Draggable Notes with Matrix Aura
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

    contentEl.innerHTML = `
        <div class="neonkeep-root">
            <canvas id="matrix-bg" class="matrix-canvas"></canvas>
            <div id="neon-canvas" class="neonkeep-canvas"></div>
            
            <div class="neonkeep-controls">
                <button id="add-note-btn" class="neon-btn">
                    <i class="fas fa-plus-square"></i> NOVA NOTA
                </button>
            </div>
            <div id="notes-error-msg" class="api-error-overlay" style="display:none">
                <div class="error-box">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h3>ERRO DE CONEXÃO</h3>
                    <p id="error-details">Falha ao carregar dados do servidor.</p>
                    <button class="neon-btn mini" onclick="location.reload()">RECARREGAR</button>
                </div>
            </div>
        </div>
    `;

    const canvas = contentEl.querySelector('#neon-canvas');
    const matrixCanvas = contentEl.querySelector('#matrix-bg');
    const addBtn = contentEl.querySelector('#add-note-btn');
    const errorOverlay = contentEl.querySelector('#notes-error-msg');
    const errorDetails = contentEl.querySelector('#error-details');
    
    let notes = [];
    let zIndexCounter = 100;

    // --- MATRIX BACKGROUND ENGINE ---
    function initMatrix() {
        const ctx = matrixCanvas.getContext('2d');
        let width = matrixCanvas.width = contentEl.offsetWidth;
        let height = matrixCanvas.height = contentEl.offsetHeight;
        
        const fontSize = 14;
        const columns = Math.floor(width / fontSize);
        const drops = new Array(columns).fill(1).map(() => Math.random() * height / fontSize);
        
        function draw() {
            // Subtle fade effect
            ctx.fillStyle = 'rgba(5, 11, 20, 0.15)';
            ctx.fillRect(0, 0, width, height);
            
            ctx.fillStyle = 'rgba(0, 255, 187, 0.08)'; // Very subtle emerald
            ctx.font = fontSize + 'px monospace';
            
            for (let i = 0; i < drops.length; i++) {
                // Random 0 or 1
                const text = Math.random() > 0.5 ? "1" : "0";
                ctx.fillText(text, i * fontSize, drops[i] * fontSize);
                
                if (drops[i] * fontSize > height && Math.random() > 0.975) {
                    drops[i] = 0;
                }
                drops[i] += 0.5; // Slow movement
            }
        }
        
        let animationId;
        function animate() {
            draw();
            animationId = requestAnimationFrame(animate);
        }
        
        animate();
        
        window.addEventListener('resize', () => {
            width = matrixCanvas.width = contentEl.offsetWidth;
            height = matrixCanvas.height = contentEl.offsetHeight;
        });

        contentEl._cleanupMatrix = () => cancelAnimationFrame(animationId);
    }

    // Load Notes from API
    async function loadNotes() {
        try {
            const res = await fetch('/api/notes');
            const data = await res.json();
            
            if (!res.ok) {
                showError(data.details || data.error || 'Erro desconhecido no servidor.');
                return;
            }
            
            notes = data;
            renderNotes();
        } catch (err) {
            console.error('Error loading notes:', err);
            showError('Não foi possível conectar à API. Verifique se o servidor está rodando.');
        }
    }

    function showError(msg) {
        errorDetails.textContent = msg;
        errorOverlay.style.display = 'flex';
        if (msg.includes('relation "public.neon_notes" does not exist')) {
            errorDetails.innerHTML = `A tabela <b>neon_notes</b> não foi encontrada.<br>Por favor, execute o script SQL em:<br><code style="color:#00ffbb">sql/20260408_add_neon_notes_table.sql</code>`;
        }
    }

    function renderNotes() {
        canvas.innerHTML = '';
        notes.forEach(note => createNoteElement(note));
    }

    function createNoteElement(note) {
        const noteEl = document.createElement('div');
        noteEl.className = 'neon-note';
        noteEl.id = `note-${note.id}`;
        noteEl.style.left = `${note.x_pos}px`;
        noteEl.style.top = `${note.y_pos}px`;
        noteEl.style.setProperty('--note-color', note.color || '#00ffbb');
        noteEl.style.zIndex = zIndexCounter++;

        noteEl.innerHTML = `
            <div class="note-header">
                <input type="text" class="note-title-input" value="${note.title || ''}" placeholder="TÍTULO">
                <div class="note-actions">
                    <button class="action-btn delete" title="Apagar"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
            <div class="note-content-area">
                <textarea class="note-text-input" placeholder="Digite aqui...">${note.content || ''}</textarea>
            </div>
            <div class="note-footer">
                <span class="save-status">SALVO</span>
            </div>
        `;

        setupDraggable(noteEl, note);
        setupAutoSave(noteEl, note);
        
        noteEl.querySelector('.delete').onclick = (e) => {
            e.stopPropagation();
            deleteNote(note.id, noteEl);
        };

        canvas.appendChild(noteEl);
        return noteEl;
    }

    function setupDraggable(el, noteData) {
        let offsetX, offsetY, isDragging = false;

        el.onmousedown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.closest('.action-btn')) return;
            
            isDragging = true;
            el.classList.add('dragging');
            el.style.zIndex = zIndexCounter++;
            
            offsetX = e.clientX - el.offsetLeft;
            offsetY = e.clientY - el.offsetTop;
            
            const onMouseMove = (e) => {
                if (!isDragging) return;
                const x = e.clientX - offsetX;
                const y = e.clientY - offsetY;
                el.style.left = `${x}px`;
                el.style.top = `${y}px`;
            };
            
            const onMouseUp = () => {
                if (isDragging) {
                    isDragging = false;
                    el.classList.remove('dragging');
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    
                    saveNote(noteData.id, { 
                        x_pos: parseInt(el.style.left), 
                        y_pos: parseInt(el.style.top) 
                    }, el);
                }
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };
    }

    function setupAutoSave(el, noteData) {
        const titleInput = el.querySelector('.note-title-input');
        const textInput = el.querySelector('.note-text-input');
        const statusEl = el.querySelector('.save-status');
        
        let timeout = null;

        const handleInput = () => {
            statusEl.textContent = 'SALVANDO...';
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                saveNote(noteData.id, {
                    title: titleInput.value,
                    content: textInput.value
                }, el);
            }, 1000);
        };

        titleInput.oninput = handleInput;
        textInput.oninput = handleInput;
    }

    async function saveNote(id, data, el) {
        try {
            const res = await fetch('/api/notes', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, ...data })
            });
            
            if (res.ok) {
                const statusEl = el.querySelector('.save-status');
                if (statusEl) statusEl.textContent = 'SALVO';
            }
        } catch (err) {
            console.error('Error saving note:', err);
        }
    }

    async function deleteNote(id, el) {
        if (!confirm('DESEJA APAGAR ESTA NOTA?')) return;
        
        try {
            const res = await fetch(`/api/notes?id=${id}`, { method: 'DELETE' });
            if (res.ok) {
                el.style.transform = 'scale(0.8) translateY(20px)';
                el.style.opacity = '0';
                setTimeout(() => el.remove(), 300);
            }
        } catch (err) {
            console.error('Error deleting note:', err);
        }
    }

    addBtn.onclick = async () => {
        try {
            const res = await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: 'NOVA NOTA',
                    content: '',
                    x_pos: Math.random() * (window.innerWidth - 300) + 50,
                    y_pos: Math.random() * (window.innerHeight - 300) + 100
                })
            });
            
            if (res.ok) {
                const newNote = await res.json();
                createNoteElement(newNote);
            }
        } catch (err) {
            console.error('Error adding note:', err);
        }
    };

    // Cleanup logic for the shell
    contentEl._cleanup = () => {
        if (contentEl._cleanupMatrix) contentEl._cleanupMatrix();
    };

    // Initial sequence
    initMatrix();
    loadNotes();
}
