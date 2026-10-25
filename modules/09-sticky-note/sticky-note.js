        // =====================================================================
        // 【09 便利貼牆】 modules/09-sticky-note/sticky-note.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        // =====================================================================

        // === Sticky Note Functions ===
        const stickyNoteColors = ['#fef3c7', '#fed7aa', '#fecaca', '#ddd6fe', '#bfdbfe', '#a7f3d0', '#fce7f3', '#e0e7ff'];
        const stickyNotes = new Map(); // Track sticky notes by student name
        let stickyNoteScale = 1.0; // Default scale
        // V1.1 修正：原本宣告在 setupEventListeners() 內，resetStudentUIState() 存取不到而拋出錯誤，
        // 使便利貼的重置（清除圖片、切回文字分頁、恢復送出按鈕）中斷；改為模組層級變數讓兩邊共用。
        let stickyNoteImageData = null;

        function updateZoomDisplay() {
            const zoomLevelEl = document.getElementById('sticky-zoom-level');
            if (zoomLevelEl) {
                zoomLevelEl.textContent = Math.round(stickyNoteScale * 100) + '%';
            }
        }

        function clearStickyNotes() {
            const container = document.getElementById('sticky-notes-container');
            container.innerHTML = '<div class="text-center py-10 text-slate-400 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" id="sticky-note-placeholder"><i class="fas fa-note-sticky text-4xl mb-4"></i><p class="text-lg font-medium">等待學生送出便利貼...</p></div>';
            stickyNotes.clear();
            stickyNoteScale = 1.0;
            updateZoomDisplay();

            // Clear drawing canvas
            const canvas = document.getElementById('sticky-drawing-canvas');
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }

        function updateStickyNotes(responses) {
            const container = document.getElementById('sticky-notes-container');
            const placeholder = document.getElementById('sticky-note-placeholder');

            if (responses.length === 0) {
                clearStickyNotes();
                return;
            }

            // Hide placeholder
            if (placeholder) {
                placeholder.remove();
            }

            // Update or create sticky notes
            responses.forEach((response, index) => {
                const existingNote = stickyNotes.get(response.name);

                if (!existingNote) {
                    // Create new sticky note
                    const note = createStickyNote(response, index);
                    container.appendChild(note);
                    stickyNotes.set(response.name, note);
                } else {
                    // Update existing note content
                    updateStickyNoteContent(existingNote, response);
                }
            });

            // Remove notes for students who deleted their responses
            const responseNames = new Set(responses.map(r => r.name));
            stickyNotes.forEach((note, name) => {
                if (!responseNames.has(name)) {
                    note.remove();
                    stickyNotes.delete(name);
                }
            });
        }

        function createStickyNote(response, index) {
            const note = document.createElement('div');
            note.className = 'sticky-note absolute cursor-move shadow-lg hover:shadow-xl transition-shadow duration-200 flex flex-col';
            note.style.width = '200px';
            note.style.height = '200px';
            note.style.backgroundColor = stickyNoteColors[index % stickyNoteColors.length];
            note.style.padding = '16px';
            note.style.borderRadius = '8px';
            note.style.border = '1px solid rgba(0,0,0,0.1)';
            note.style.transformOrigin = 'top left';
            note.style.transform = `scale(${stickyNoteScale})`;
            note.style.zIndex = '10'; // Below canvas layer

            // Random initial position within visible container
            const container = document.getElementById('sticky-notes-container');
            const containerRect = container.getBoundingClientRect();
            const noteSize = 200 * stickyNoteScale; // Account for current scale
            const maxX = Math.max(containerRect.width - noteSize - 20, 100); // Leave 20px margin
            const maxY = Math.max(containerRect.height - noteSize - 20, 100);
            const x = Math.random() * maxX;
            const y = Math.random() * maxY;
            note.style.left = x + 'px';
            note.style.top = y + 'px';

            // Add student name header
            const header = document.createElement('div');
            header.className = 'font-bold text-sm mb-2 pb-2 border-b border-slate-400 flex items-center gap-2 flex-shrink-0';
            header.innerHTML = `<i class="fas fa-user text-xs"></i>${response.name}`;
            note.appendChild(header);

            // Add content
            const content = document.createElement('div');
            content.className = 'sticky-note-content flex items-center justify-center flex-1 overflow-hidden';
            setStickyNoteContent(content, response);
            note.appendChild(content);

            // Make draggable
            makeDraggable(note);

            return note;
        }

        function updateStickyNoteContent(note, response) {
            const content = note.querySelector('.sticky-note-content');
            setStickyNoteContent(content, response);
        }

        function setStickyNoteContent(contentElement, response) {
            try {
                const data = JSON.parse(response.answer);

                if (data.type === 'text') {
                    const text = escapeHtml(data.content);
                    const charCount = data.content.length;

                    // Calculate font size based on character count
                    let fontSize;
                    if (charCount <= 5) {
                        fontSize = 48; // Very large for 1-5 characters
                    } else if (charCount <= 10) {
                        fontSize = 36; // Large for 6-10 characters
                    } else if (charCount <= 20) {
                        fontSize = 28; // Medium-large for 11-20 characters
                    } else if (charCount <= 30) {
                        fontSize = 22; // Medium for 21-30 characters
                    } else if (charCount <= 50) {
                        fontSize = 18; // Small-medium for 31-50 characters
                    } else {
                        fontSize = 14; // Small for 50+ characters
                    }

                    contentElement.innerHTML = `<div class="text-slate-800 break-words font-bold text-center w-full px-2" style="font-size: ${fontSize}px; line-height: 1.3; word-wrap: break-word; overflow-wrap: break-word;">${text}</div>`;
                } else if (data.type === 'image') {
                    contentElement.innerHTML = `<img src="${data.content}" class="w-full h-auto rounded border border-slate-300 object-contain max-h-32 cursor-pointer hover:opacity-80 transition-opacity" onclick="showMagnifiedDrawing(this.src)" title="點擊放大圖片">`;
                }
            } catch (e) {
                // Fallback for non-JSON answers
                const text = escapeHtml(response.answer);
                const charCount = response.answer.length;
                let fontSize;
                if (charCount <= 5) fontSize = 48;
                else if (charCount <= 10) fontSize = 36;
                else if (charCount <= 20) fontSize = 28;
                else if (charCount <= 30) fontSize = 22;
                else if (charCount <= 50) fontSize = 18;
                else fontSize = 14;
                contentElement.innerHTML = `<div class="text-slate-800 break-words font-bold text-center w-full px-2" style="font-size: ${fontSize}px; line-height: 1.3; word-wrap: break-word; overflow-wrap: break-word;">${text}</div>`;
            }
        }

        function makeDraggable(element) {
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

            element.onmousedown = dragMouseDown;
            element.addEventListener('touchstart', dragTouchStart, { passive: false });

            function dragMouseDown(e) {
                e = e || window.event;
                e.preventDefault();
                pos3 = e.clientX;
                pos4 = e.clientY;
                document.onmouseup = closeDragElement;
                document.onmousemove = elementDrag;
                element.style.zIndex = 999; // Keep below canvas (1000)
            }

            function dragTouchStart(e) {
                e.preventDefault();
                const touch = e.touches[0];
                pos3 = touch.clientX;
                pos4 = touch.clientY;
                document.addEventListener('touchend', closeDragElement);
                document.addEventListener('touchmove', elementTouchDrag, { passive: false });
                element.style.zIndex = 999; // Keep below canvas (1000)
            }

            function elementDrag(e) {
                e = e || window.event;
                e.preventDefault();
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;

                // Calculate new position
                let newTop = element.offsetTop - pos2;
                let newLeft = element.offsetLeft - pos1;

                // Get container bounds
                const container = document.getElementById('sticky-notes-container');
                const containerRect = container.getBoundingClientRect();
                const elementRect = element.getBoundingClientRect();

                // Constrain to container bounds
                newTop = Math.max(0, Math.min(newTop, containerRect.height - elementRect.height));
                newLeft = Math.max(0, Math.min(newLeft, containerRect.width - elementRect.width));

                element.style.top = newTop + 'px';
                element.style.left = newLeft + 'px';
            }

            function elementTouchDrag(e) {
                e.preventDefault();
                const touch = e.touches[0];
                pos1 = pos3 - touch.clientX;
                pos2 = pos4 - touch.clientY;
                pos3 = touch.clientX;
                pos4 = touch.clientY;

                // Calculate new position
                let newTop = element.offsetTop - pos2;
                let newLeft = element.offsetLeft - pos1;

                // Get container bounds
                const container = document.getElementById('sticky-notes-container');
                const containerRect = container.getBoundingClientRect();
                const elementRect = element.getBoundingClientRect();

                // Constrain to container bounds
                newTop = Math.max(0, Math.min(newTop, containerRect.height - elementRect.height));
                newLeft = Math.max(0, Math.min(newLeft, containerRect.width - elementRect.width));

                element.style.top = newTop + 'px';
                element.style.left = newLeft + 'px';
            }

            function closeDragElement() {
                document.onmouseup = null;
                document.onmousemove = null;
                document.removeEventListener('touchend', closeDragElement);
                document.removeEventListener('touchmove', elementTouchDrag);
                element.style.zIndex = 10; // Normal z-index, below canvas
            }
        }

        /**
         * 09 便利貼牆：事件監聽設定（原本位於 setupEventListeners() 內的段落，
         * 由 modules/main/events.js 的 setupEventListeners() 依原順序呼叫）。
         */
        function setupStickyNoteEventListeners() {

            // === Sticky Note Event Listeners ===

            // Tab switching
            document.getElementById('sticky-text-tab').addEventListener('click', () => {
                document.getElementById('sticky-text-tab').classList.add('bg-amber-500', 'text-white');
                document.getElementById('sticky-text-tab').classList.remove('bg-slate-200', 'text-slate-600');
                document.getElementById('sticky-image-tab').classList.remove('bg-amber-500', 'text-white');
                document.getElementById('sticky-image-tab').classList.add('bg-slate-200', 'text-slate-600');
                document.getElementById('sticky-text-section').classList.remove('hidden');
                document.getElementById('sticky-image-section').classList.add('hidden');
            });

            document.getElementById('sticky-image-tab').addEventListener('click', () => {
                document.getElementById('sticky-image-tab').classList.add('bg-amber-500', 'text-white');
                document.getElementById('sticky-image-tab').classList.remove('bg-slate-200', 'text-slate-600');
                document.getElementById('sticky-text-tab').classList.remove('bg-amber-500', 'text-white');
                document.getElementById('sticky-text-tab').classList.add('bg-slate-200', 'text-slate-600');
                document.getElementById('sticky-image-section').classList.remove('hidden');
                document.getElementById('sticky-text-section').classList.add('hidden');
            });

            // Text character count
            document.getElementById('sticky-note-text').addEventListener('input', (e) => {
                const charCount = e.target.value.length;
                document.getElementById('sticky-text-char-count').textContent = charCount;
            });

            // Image compression function
            function compressImage(file, maxWidth = 800, quality = 0.8) {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            let width = img.width;
                            let height = img.height;

                            // Calculate new dimensions
                            if (width > maxWidth) {
                                height = (height * maxWidth) / width;
                                width = maxWidth;
                            }

                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, width, height);

                            // Convert to PNG to preserve transparency
                            const compressedDataUrl = canvas.toDataURL('image/png');
                            resolve(compressedDataUrl);
                        };
                        img.onerror = reject;
                        img.src = e.target.result;
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            }

            // Handle image selection
            document.getElementById('sticky-select-image-btn').addEventListener('click', () => {
                document.getElementById('sticky-image-input').click();
            });

            document.getElementById('sticky-capture-image-btn').addEventListener('click', () => {
                const input = document.getElementById('sticky-image-input');
                input.setAttribute('capture', 'environment');
                input.click();
            });

            document.getElementById('sticky-image-input').addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        const compressed = await compressImage(file);
                        stickyNoteImageData = compressed;
                        document.getElementById('sticky-preview-img').src = compressed;
                        document.getElementById('sticky-image-preview').classList.remove('hidden');
                    } catch (error) {
                        console.error('圖片處理失敗:', error);
                        showMessage('圖片處理失敗，請重試', 'error');
                    }
                }
            });

            // Sticky note submission
            document.getElementById('submit-sticky-note-btn').addEventListener('click', async (e) => {
                if (isResponsePaused) {
                    showMessage('老師已暫停回覆，無法送出答案。', 'error');
                    return;
                }

                const textTab = document.getElementById('sticky-text-tab');
                const isTextMode = textTab.classList.contains('bg-amber-500');

                let answerData = {};

                if (isTextMode) {
                    const text = document.getElementById('sticky-note-text').value.trim();
                    if (!text) {
                        showMessage('請輸入文字內容', 'error');
                        return;
                    }
                    answerData = { type: 'text', content: text };
                } else {
                    if (!stickyNoteImageData) {
                        showMessage('請選擇或拍攝圖片', 'error');
                        return;
                    }
                    answerData = { type: 'image', content: stickyNoteImageData };
                }

                const btn = e.currentTarget;
                await submitAnswer(JSON.stringify(answerData));
                btn.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed');

                // Clear inputs
                document.getElementById('sticky-note-text').value = '';
                document.getElementById('sticky-text-char-count').textContent = '0';
                stickyNoteImageData = null;
                document.getElementById('sticky-image-preview').classList.add('hidden');
                document.getElementById('sticky-image-input').value = '';
            });

            // === Sticky Note Zoom Controls ===
            function applyStickyNoteScale() {
                stickyNotes.forEach(note => {
                    note.style.transform = `scale(${stickyNoteScale})`;
                });
                updateZoomDisplay();
            }

            document.getElementById('sticky-zoom-in').addEventListener('click', () => {
                stickyNoteScale = Math.min(stickyNoteScale + 0.1, 2.0);
                applyStickyNoteScale();
            });

            document.getElementById('sticky-zoom-out').addEventListener('click', () => {
                stickyNoteScale = Math.max(stickyNoteScale - 0.1, 0.3);
                applyStickyNoteScale();
            });

            document.getElementById('sticky-zoom-reset').addEventListener('click', () => {
                stickyNoteScale = 1.0;
                applyStickyNoteScale();
            });

            // === Sticky Note Wall Drawing Canvas ===
            // Sticky Note Wall Drawing Functions - Wrapped in IIFE to avoid global scope pollution
            (function () {
                const stickyCanvas = document.getElementById('sticky-drawing-canvas');
                const stickyCtx = stickyCanvas.getContext('2d');
                let stickyIsDrawing = false;
                let currentTool = 'pen';
                let penColor = '#000000';
                let penWidth = 4;
                let stickyLastX = 0;
                let stickyLastY = 0;
                let currentMode = 'mouse'; // 'mouse' or 'draw'

                // Initialize canvas size
                function initStickyCanvas() {
                    const container = document.getElementById('sticky-notes-container');
                    if (!container) return;

                    const rect = container.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        stickyCanvas.width = rect.width;
                        stickyCanvas.height = rect.height;
                        stickyCtx.lineCap = 'round';
                        stickyCtx.lineJoin = 'round';
                        console.log('Canvas initialized:', rect.width, 'x', rect.height);
                    } else {
                        console.warn('Container has no size, cannot initialize canvas');
                    }
                }

                // Update canvas size on window resize
                window.addEventListener('resize', () => {
                    const container = document.getElementById('sticky-notes-container');
                    if (container && stickyCanvas && stickyCanvas.width > 0 && stickyCanvas.height > 0) {
                        const rect = container.getBoundingClientRect();
                        if (rect.width > 0 && rect.height > 0) {
                            // Save current canvas content
                            const tempCanvas = document.createElement('canvas');
                            const tempCtx = tempCanvas.getContext('2d');
                            tempCanvas.width = stickyCanvas.width;
                            tempCanvas.height = stickyCanvas.height;
                            tempCtx.drawImage(stickyCanvas, 0, 0);

                            // Resize and restore
                            stickyCanvas.width = rect.width;
                            stickyCanvas.height = rect.height;
                            stickyCtx.lineCap = 'round';
                            stickyCtx.lineJoin = 'round';
                            stickyCtx.drawImage(tempCanvas, 0, 0);
                        }
                    }
                });

                // Mode switching
                function setMouseMode() {
                    currentMode = 'mouse';
                    stickyCanvas.style.pointerEvents = 'none';
                    document.getElementById('mouse-mode').classList.add('bg-blue-500', 'text-white');
                    document.getElementById('mouse-mode').classList.remove('bg-slate-200', 'text-slate-700');
                    document.getElementById('draw-mode').classList.remove('bg-blue-500', 'text-white');
                    document.getElementById('draw-mode').classList.add('bg-slate-200', 'text-slate-700');
                    document.getElementById('drawing-tools').classList.add('opacity-50');
                    document.getElementById('drawing-tools').style.pointerEvents = 'none';
                }

                function setDrawMode() {
                    currentMode = 'draw';
                    stickyCanvas.style.pointerEvents = 'auto';
                    document.getElementById('draw-mode').classList.add('bg-blue-500', 'text-white');
                    document.getElementById('draw-mode').classList.remove('bg-slate-200', 'text-slate-700');
                    document.getElementById('mouse-mode').classList.remove('bg-blue-500', 'text-white');
                    document.getElementById('mouse-mode').classList.add('bg-slate-200', 'text-slate-700');
                    document.getElementById('drawing-tools').classList.remove('opacity-50');
                    document.getElementById('drawing-tools').style.pointerEvents = 'auto';
                }

                document.getElementById('mouse-mode').addEventListener('click', setMouseMode);
                document.getElementById('draw-mode').addEventListener('click', setDrawMode);

                // Drawing functions with corrected coordinates
                function stickyStartDrawing(e) {
                    if (currentMode !== 'draw') return;
                    stickyIsDrawing = true;
                    const rect = stickyCanvas.getBoundingClientRect();
                    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                    stickyLastX = clientX - rect.left;
                    stickyLastY = clientY - rect.top;
                }

                function stickyDraw(e) {
                    if (!stickyIsDrawing || currentMode !== 'draw') return;
                    e.preventDefault();
                    const rect = stickyCanvas.getBoundingClientRect();
                    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                    const x = clientX - rect.left;
                    const y = clientY - rect.top;

                    stickyCtx.beginPath();
                    stickyCtx.moveTo(stickyLastX, stickyLastY);
                    stickyCtx.lineTo(x, y);

                    if (currentTool === 'pen') {
                        stickyCtx.strokeStyle = penColor;
                        stickyCtx.lineWidth = penWidth;
                        stickyCtx.globalCompositeOperation = 'source-over';
                    } else if (currentTool === 'eraser') {
                        stickyCtx.globalCompositeOperation = 'destination-out';
                        stickyCtx.lineWidth = 20;
                    }

                    stickyCtx.stroke();
                    stickyLastX = x;
                    stickyLastY = y;
                }

                function stickyStopDrawing() {
                    stickyIsDrawing = false;
                }

                // Canvas event listeners
                stickyCanvas.addEventListener('mousedown', stickyStartDrawing);
                stickyCanvas.addEventListener('mousemove', stickyDraw);
                stickyCanvas.addEventListener('mouseup', stickyStopDrawing);
                stickyCanvas.addEventListener('mouseout', stickyStopDrawing);
                // Touch event listeners
                stickyCanvas.addEventListener('touchstart', stickyStartDrawing, { passive: false });
                stickyCanvas.addEventListener('touchmove', stickyDraw, { passive: false });
                stickyCanvas.addEventListener('touchend', stickyStopDrawing);
                stickyCanvas.addEventListener('touchcancel', stickyStopDrawing);

                // Tool selection
                document.getElementById('pen-tool').addEventListener('click', () => {
                    currentTool = 'pen';
                    setDrawMode(); // Auto switch to draw mode
                    document.getElementById('pen-tool').classList.add('bg-blue-500', 'text-white');
                    document.getElementById('pen-tool').classList.remove('bg-slate-200', 'text-slate-700');
                    document.getElementById('eraser-tool').classList.remove('bg-blue-500', 'text-white');
                    document.getElementById('eraser-tool').classList.add('bg-slate-200', 'text-slate-700');
                });

                document.getElementById('eraser-tool').addEventListener('click', () => {
                    currentTool = 'eraser';
                    setDrawMode(); // Auto switch to draw mode
                    document.getElementById('eraser-tool').classList.add('bg-blue-500', 'text-white');
                    document.getElementById('eraser-tool').classList.remove('bg-slate-200', 'text-slate-700');
                    document.getElementById('pen-tool').classList.remove('bg-blue-500', 'text-white');
                    document.getElementById('pen-tool').classList.add('bg-slate-200', 'text-slate-700');
                });

                // Color selection
                document.querySelectorAll('.pen-color').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        penColor = e.currentTarget.dataset.color;
                        document.querySelectorAll('.pen-color').forEach(b => {
                            b.classList.remove('border-2', 'border-slate-400');
                            b.classList.add('border', 'border-slate-300');
                        });
                        e.currentTarget.classList.add('border-2', 'border-slate-400');
                        e.currentTarget.classList.remove('border', 'border-slate-300');
                        currentTool = 'pen';
                        setDrawMode(); // Auto switch to draw mode
                        // Update pen tool button
                        document.getElementById('pen-tool').classList.add('bg-blue-500', 'text-white');
                        document.getElementById('pen-tool').classList.remove('bg-slate-200', 'text-slate-700');
                        document.getElementById('eraser-tool').classList.remove('bg-blue-500', 'text-white');
                        document.getElementById('eraser-tool').classList.add('bg-slate-200', 'text-slate-700');
                    });
                });

                // Width selection
                document.getElementById('pen-width').addEventListener('change', (e) => {
                    penWidth = parseInt(e.target.value);
                });

                // Clear canvas
                document.getElementById('clear-canvas').addEventListener('click', async () => {
                    const confirmed = await customConfirm('確定要清除所有畫記嗎？');
                    if (confirmed) {
                        const canvas = document.getElementById('sticky-drawing-canvas');
                        const ctx = canvas.getContext('2d');
                        ctx.clearRect(0, 0, canvas.width, canvas.height);
                    }
                });

                // Listen for canvas initialization event
                window.addEventListener('initStickyCanvas', () => {
                    initStickyCanvas();
                    setMouseMode();
                });
            })(); // End of Sticky Note Wall Drawing IIFE
        }
