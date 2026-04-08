/**
 * Notas Module
 * Futuristic Draggable Notes
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
            <div id="neon-canvas" class="neonkeep-canvas"></div>
            
            <div class="neonkeep-controls">
                <button id="add-note-btn" class="neon-btn">
                    <i class="fas fa-plus-square"></i> NOVA NOTA
                </button>
            </div>
        </div>
    `;

    const canvas = contentEl.querySelector('#neon-canvas');
    const addBtn = contentEl.querySelector('#add-note-btn');
    
    let notes = [];
    let zIndexCounter = 100;

    // Load Notes from API
    async function loadNotes() {
        try {
            const res = await fetch('/api/notes');
            if (res.ok) {
                notes = await res.json();
                renderNotes();
            }
        } catch (err) {
            console.error('Error loading notes:', err);
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
            
            document.onmousemove = (e) => {
                if (!isDragging) return;
                const x = e.clientX - offsetX;
                const y = e.clientY - offsetY;
                el.style.left = `${x}px`;
                el.style.top = `${y}px`;
            };
            
            document.onmouseup = () => {
                if (isDragging) {
                    isDragging = false;
                    el.classList.remove('dragging');
                    document.onmousemove = null;
                    document.onmouseup = null;
                    
                    // Save position
                    saveNote(noteData.id, { 
                        x_pos: parseInt(el.style.left), 
                        y_pos: parseInt(el.style.top) 
                    }, el);
                }
            };
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

    // Canvas panning (optional enhancement)
    let isPanning = false;
    let startX, startY, scrollLeft, scrollTop;

    canvas.onmousedown = (e) => {
        if (e.target !== canvas) return;
        isPanning = true;
        startX = e.pageX - canvas.offsetLeft;
        startY = e.pageY - canvas.offsetTop;
        scrollLeft = canvas.scrollLeft;
        scrollTop = canvas.scrollTop;
    };

    window.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        const x = e.pageX - canvas.offsetLeft;
        const y = e.pageY - canvas.offsetTop;
        const walkX = (x - startX);
        const walkY = (y - startY);
        // This is a simple version, ideally we'd move the canvas content
    });

    window.addEventListener('mouseup', () => {
        isPanning = false;
    });

    // Initial load
    loadNotes();
}
