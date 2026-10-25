        // =====================================================================
        // 【08 閱讀測驗】 modules/08-reading-comprehension/reading-comprehension.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        // =====================================================================

        // NEW: Reading Comprehension Data (Teacher side)
        let readingComprehensionData = {
            text: '',
            questions: [] // Array of {question, correctAnswer, options, level}
        };

        // NEW: Store student's current answers (not yet submitted) for reading comprehension
        let currentReadingAnswers = [];

        // NEW: Reading Comprehension Question Banks
        let readingQuestionBanks = [];

        /**
         * Draw reading comprehension statistics chart with PIRLS level analysis
         */
        function drawReadingComprehensionChart(responses, questions) {
            // PIRLS level metadata (used for the per-question tag + legend)
            const levelColors = {
                1: '#3b82f6', // Blue - 直接提取
                2: '#8b5cf6', // Purple - 直接推論
                3: '#f59e0b', // Amber - 詮釋整合
                4: '#ef4444'  // Red - 比較評估
            };
            const levelTexts = { 1: '直接提取', 2: '直接推論', 3: '詮釋整合', 4: '比較評估' };

            // Calculate statistics for each question
            const questionStats = questions.map((q, qIndex) => {
                let correctCount = 0;
                let answeredCount = 0;
                const wrongNames = [];

                responses.forEach(studentResponse => {
                    try {
                        const studentAnswers = JSON.parse(studentResponse.answer);
                        if (Array.isArray(studentAnswers) && studentAnswers[qIndex] !== undefined) {
                            answeredCount++;
                            if (studentAnswers[qIndex] === q.correctAnswer) {
                                correctCount++;
                            } else {
                                wrongNames.push(studentResponse.name || '匿名');
                            }
                        }
                    } catch (e) {
                        // Invalid answer format
                    }
                });

                const tag = q.level && levelTexts[q.level]
                    ? { text: `L${q.level} ${levelTexts[q.level]}`, color: levelColors[q.level] }
                    : null;

                return {
                    label: `Q${qIndex + 1}`,
                    tag: tag,
                    level: q.level,
                    correctCount: correctCount,
                    answeredCount: answeredCount,
                    correctRate: answeredCount > 0 ? (correctCount / answeredCount) * 100 : 0,
                    wrongNames: wrongNames
                };
            });

            const displayStats = questionStats.filter(s => s.answeredCount > 0);
            if (displayStats.length === 0) {
                const container = document.getElementById('modern-stats-container');
                const chartSvgEl = document.getElementById('chart-svg');
                if (chartSvgEl) chartSvgEl.classList.add('hidden');
                if (container) {
                    container.classList.remove('hidden');
                    container.innerHTML = `<p class="text-gray-500 text-center py-8">目前沒有學生作答閱讀測驗。</p>`;
                }
                return;
            }

            // Build a PIRLS-level legend from the levels actually present.
            const presentLevels = [1, 2, 3, 4].filter(lv => displayStats.some(s => s.level === lv));
            const legend = presentLevels.map(lv => ({ color: levelColors[lv], text: `L${lv} ${levelTexts[lv]}` }));

            renderModernStatsChart(displayStats, legend);
        }

        // === Reading Comprehension Functions ===

        /**
         * Show reading comprehension settings modal
         */
        function showReadingComprehensionModal() {
            // Update reading bank list for current classroom
            updateReadingBankList();

            document.getElementById('reading-comprehension-settings-modal').classList.remove('hidden');
            // Populate with existing data if any
            document.getElementById('reading-text-textarea').value = readingComprehensionData.text || '';
            if (readingComprehensionData.questions && readingComprehensionData.questions.length > 0) {
                document.getElementById('reading-questions-textarea').value = readingComprehensionData.questions.map(q => {
                    return `${q.question},${q.correctAnswer},${q.options.join(',')},${q.level}`;
                }).join('\n');
            } else {
                document.getElementById('reading-questions-textarea').value = '';
            }
        }

        /**
         * Hide reading comprehension settings modal
         */
        function hideReadingComprehensionModal() {
            document.getElementById('reading-comprehension-settings-modal').classList.add('hidden');
        }

        /**
         * Parse reading comprehension questions
         * Supports both comma and tab delimiters
         */
        function parseReadingQuestions(text) {
            const lines = text.trim().split('\n').filter(line => line.trim().length > 0);
            const questions = [];

            for (const line of lines) {
                // Try to detect delimiter: if line contains tab, use tab; otherwise use comma
                const delimiter = line.includes('\t') ? '\t' : ',';
                const parts = line.split(delimiter).map(p => p.trim());

                if (parts.length < 6) {
                    return null; // Invalid format - need at least question, answer, and 4 options
                }

                const question = parts[0];
                let correctAnswer = parts[1];
                const options = [parts[2], parts[3], parts[4], parts[5]];
                // Level is optional, default to 1 if not provided
                const level = parts[6] ? parseInt(parts[6]) : 1;

                // Convert A-D to 1-4
                if (correctAnswer.match(/^[A-Da-d]$/)) {
                    correctAnswer = correctAnswer.toUpperCase().charCodeAt(0) - 64; // A=1, B=2, C=3, D=4
                } else {
                    correctAnswer = parseInt(correctAnswer);
                }

                if (!question || isNaN(correctAnswer) || correctAnswer < 1 || correctAnswer > 4 ||
                    options.length !== 4 || isNaN(level) || level < 1 || level > 4) {
                    return null; // Invalid format
                }

                questions.push({ question, correctAnswer, options, level });
            }

            return questions.length > 0 ? questions : null;
        }

        /**
         * Start reading comprehension interaction
         */
        async function startReadingComprehension() {
            const readingText = document.getElementById('reading-text-textarea').value.trim();
            const questionsText = document.getElementById('reading-questions-textarea').value.trim();

            if (!readingText || !questionsText) {
                showMessage('請輸入閱讀文本和題目！', 'error');
                return;
            }

            const questions = parseReadingQuestions(questionsText);
            if (!questions) {
                document.getElementById('reading-questions-status').classList.remove('hidden');
                return;
            }

            readingComprehensionData = { text: readingText, questions: questions };
            document.getElementById('reading-questions-status').classList.add('hidden');
            hideReadingComprehensionModal();

            // Set mode and dispatch to Firebase
            const mode = 'reading_comprehension';
            await setInteractionMode(mode, { readingData: readingComprehensionData });
            showView('teacherMonitor');
        }

        /**
         * Display reading comprehension for student
         */
        async function displayReadingComprehensionForStudent(readingData) {
            console.log('[displayReadingComprehensionForStudent] Called with data:', readingData);
            const textDisplay = document.getElementById('reading-text-display');
            const questionsContainer = document.getElementById('reading-questions-container');

            if (!textDisplay || !questionsContainer) {
                console.error('[displayReadingComprehensionForStudent] Elements not found!');
                return;
            }

            // Store reading data for student to use when submitting
            if (currentRole === 'student') {
                readingComprehensionData = readingData;
            }

            // Process text for highlighting - wrap in spans
            textDisplay.innerHTML = '';
            const text = readingData.text;
            // Split text by sentences (keep whitespace structure)
            const lines = text.split('\n');
            lines.forEach((line, lineIndex) => {
                if (line.trim()) {
                    const lineSpan = document.createElement('span');
                    lineSpan.textContent = line;
                    lineSpan.dataset.lineIndex = lineIndex;
                    textDisplay.appendChild(lineSpan);
                }
                if (lineIndex < lines.length - 1) {
                    textDisplay.appendChild(document.createTextNode('\n'));
                }
            });

            questionsContainer.innerHTML = '';
            console.log('[displayReadingComprehensionForStudent] Set text:', readingData.text);

            // Initialize highlighter after text is displayed
            initializeHighlighter();

            // Determine which answers to restore
            let answersToRestore = [];
            let readingAlreadySubmitted = false;

            // Priority 1: Use current local answers (not yet submitted)
            if (currentReadingAnswers.length > 0) {
                answersToRestore = currentReadingAnswers;
                console.log('[displayReadingComprehensionForStudent] Restoring local answers:', answersToRestore);
            }
            // Priority 2: Check if student has already submitted answers to Firebase
            else if (currentRole === 'student' && studentName && classroomCode) {
                try {
                    const studentRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'studentResponses', studentName);
                    const docSnap = await getDoc(studentRef);
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        // Check if answer is a JSON string or array
                        if (typeof data.answer === 'string') {
                            try {
                                answersToRestore = JSON.parse(data.answer);
                            } catch (e) {
                                answersToRestore = [];
                            }
                        } else if (Array.isArray(data.answer)) {
                            answersToRestore = data.answer;
                        }
                        if (Array.isArray(answersToRestore) && answersToRestore.length > 0) {
                            readingAlreadySubmitted = true;
                        }
                        console.log('[displayReadingComprehensionForStudent] Restoring submitted answers:', answersToRestore);
                    }
                } catch (error) {
                    console.error('Error fetching previous answers:', error);
                }
            }

            // Initialize currentReadingAnswers if empty
            if (currentReadingAnswers.length === 0) {
                currentReadingAnswers = new Array(readingData.questions.length).fill(0);
            }

            readingData.questions.forEach((q, index) => {
                const questionDiv = document.createElement('div');
                questionDiv.className = 'question-card';

                // Get answer for this question (if exists)
                const selectedAnswer = answersToRestore[index] || 0;

                // Difficulty badge
                const levelBadge = q.level ? `<span class="inline-block px-2 py-1 text-xs font-semibold rounded-full ${q.level === '直接理解' ? 'bg-green-100 text-green-800' :
                    q.level === '推論理解' ? 'bg-yellow-100 text-yellow-800' :
                        q.level === '詮釋整合' ? 'bg-orange-100 text-orange-800' :
                            'bg-purple-100 text-purple-800'
                    }">${q.level}</span>` : '';

                questionDiv.innerHTML = `
                    <div class="flex items-start justify-between mb-3">
                        <p class="font-bold text-lg text-gray-800 flex-1">
                            <span class="inline-block w-8 h-8 bg-green-500 text-white rounded-full text-center leading-8 mr-2">${index + 1}</span>
                            ${q.question}
                        </p>
                        ${levelBadge}
                    </div>
                    <div class="space-y-2 ml-10">
                        ${q.options.map((opt, i) => {
                    const isChecked = selectedAnswer === (i + 1) ? 'checked' : '';
                    const optionLabels = ['A', 'B', 'C', 'D'];
                    return `
                            <label class="flex items-center p-3 hover:bg-green-50 rounded-lg cursor-pointer transition-all duration-200 border-2 ${isChecked ? 'border-green-400 bg-green-50' : 'border-transparent'}">
                                <input type="radio" name="reading_q${index}" value="${i + 1}" class="mr-3 w-4 h-4 text-green-600" ${isChecked} data-question-index="${index}">
                                <span class="font-medium text-gray-700"><span class="font-bold text-green-600">${optionLabels[i]}.</span> ${opt}</span>
                            </label>
                        `}).join('')}
                    </div>
                `;
                questionsContainer.appendChild(questionDiv);
            });

            // Add event listeners to track answer changes
            const radioInputs = questionsContainer.querySelectorAll('input[type="radio"]');
            radioInputs.forEach(radio => {
                radio.addEventListener('change', (e) => {
                    const questionIndex = parseInt(e.target.dataset.questionIndex);
                    const selectedValue = parseInt(e.target.value);
                    currentReadingAnswers[questionIndex] = selectedValue;
                    console.log('[Reading] Answer updated:', questionIndex, '=', selectedValue);

                    // Update visual styles for selected option
                    const allLabels = questionsContainer.querySelectorAll(`input[name="reading_q${questionIndex}"]`).forEach(input => {
                        const label = input.closest('label');
                        if (input.checked) {
                            label.classList.add('border-green-400', 'bg-green-50');
                            label.classList.remove('border-transparent');
                        } else {
                            label.classList.remove('border-green-400', 'bg-green-50');
                            label.classList.add('border-transparent');
                        }
                    });
                });
            });

            // NEW: 若學生已送出，改為顯示逐題題目與答對／答錯情形
            if (readingAlreadySubmitted) {
                showReadingComprehensionResult(readingData.questions, answersToRestore);
                const submitBtn = document.getElementById('submit-reading-btn');
                if (submitBtn) submitBtn.disabled = true;
            }
        }

        /**
         * Initialize highlighter functionality for reading text - Drawing mode
         */
        let currentHighlighterColor = null;
        let isEraserMode = false;
        let highlightLines = []; // Store all highlight lines {color, points: [{x, y, lineY}]}
        let highlightCanvas = null;
        let highlightCtx = null;
        let isHighlighting = false;
        let currentHighlightPath = [];
        let textLines = []; // Store text line positions

        function initializeHighlighter() {
            console.log('[Highlighter] Initializing drawing mode...');
            const textDisplay = document.getElementById('reading-text-display');
            highlightCanvas = document.getElementById('reading-highlight-canvas');

            if (!textDisplay || !highlightCanvas) {
                console.error('[Highlighter] Text display or canvas not found');
                return;
            }

            highlightCtx = highlightCanvas.getContext('2d');

            // Reset state
            currentHighlighterColor = null;
            isEraserMode = false;
            highlightLines = [];
            textLines = [];

            // Setup canvas size
            resizeCanvas();

            // Setup highlighter buttons
            const highlighterBtns = document.querySelectorAll('.highlighter-btn');
            const eraserBtn = document.getElementById('reading-eraser-btn');
            const mouseBtn = document.getElementById('reading-mouse-btn');

            console.log('[Highlighter] Found buttons:', highlighterBtns.length, 'highlighters, eraser:', !!eraserBtn, 'mouse:', !!mouseBtn);

            // Remove previous active states
            highlighterBtns.forEach(btn => btn.classList.remove('active'));
            if (eraserBtn) eraserBtn.classList.remove('active');
            if (mouseBtn) mouseBtn.classList.remove('active');

            // Remove old event listeners by cloning buttons
            highlighterBtns.forEach((btn, index) => {
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
            });

            if (eraserBtn) {
                const newEraserBtn = eraserBtn.cloneNode(true);
                eraserBtn.parentNode.replaceChild(newEraserBtn, eraserBtn);
            }

            if (mouseBtn) {
                const newMouseBtn = mouseBtn.cloneNode(true);
                mouseBtn.parentNode.replaceChild(newMouseBtn, mouseBtn);
            }

            // Re-query buttons after cloning
            const newHighlighterBtns = document.querySelectorAll('.highlighter-btn');
            const newEraserBtn = document.getElementById('reading-eraser-btn');
            const newMouseBtn = document.getElementById('reading-mouse-btn');

            // Highlighter button click handlers
            newHighlighterBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const color = btn.dataset.color;
                    console.log('[Highlighter] Color button clicked:', color);

                    currentHighlighterColor = color;
                    isEraserMode = false;

                    // Update button states
                    newHighlighterBtns.forEach(b => b.classList.remove('active'));
                    if (newEraserBtn) newEraserBtn.classList.remove('active');
                    if (newMouseBtn) newMouseBtn.classList.remove('active');
                    btn.classList.add('active');

                    console.log('[Highlighter] Color activated:', color);

                    // Apply highlight to selected text if any
                    applyHighlightToSelection(color);
                });
            });

            // Eraser button click handler
            if (newEraserBtn) {
                newEraserBtn.addEventListener('click', () => {
                    console.log('[Highlighter] Eraser button clicked');
                    isEraserMode = true;
                    currentHighlighterColor = null;

                    // Update button states
                    newHighlighterBtns.forEach(b => b.classList.remove('active'));
                    if (newMouseBtn) newMouseBtn.classList.remove('active');
                    newEraserBtn.classList.add('active');

                    console.log('[Highlighter] Eraser mode activated');
                    textDisplay.classList.add('eraser-mode');
                });
            }

            // Mouse button click handler
            if (newMouseBtn) {
                newMouseBtn.addEventListener('click', () => {
                    console.log('[Highlighter] Mouse button clicked');
                    isEraserMode = false;
                    currentHighlighterColor = null;

                    // Update button states
                    newHighlighterBtns.forEach(b => b.classList.remove('active'));
                    if (newEraserBtn) newEraserBtn.classList.remove('active');
                    newMouseBtn.classList.add('active');

                    console.log('[Highlighter] Mouse mode activated');
                    textDisplay.classList.remove('eraser-mode');
                });
            }

            // Detect text lines
            detectTextLines();

            // Setup text selection and highlight events
            setupTextHighlightEvents();

            console.log('[Highlighter] Initialization complete with text selection mode');
        }

        /**
         * Resize canvas to match text display size
         */
        function resizeCanvas() {
            const textDisplay = document.getElementById('reading-text-display');
            if (!highlightCanvas || !textDisplay) return;

            const rect = textDisplay.getBoundingClientRect();
            highlightCanvas.width = rect.width;
            highlightCanvas.height = rect.height;
            highlightCanvas.style.width = rect.width + 'px';
            highlightCanvas.style.height = rect.height + 'px';

            console.log('[Highlighter] Canvas resized to:', highlightCanvas.width, 'x', highlightCanvas.height);

            // Redraw all highlights after resize
            drawHighlights();
        }

        /**
         * Detect text line positions
         */
        function detectTextLines() {
            const textDisplay = document.getElementById('reading-text-display');
            if (!textDisplay) return;

            textLines = [];
            const range = document.createRange();
            const textContent = textDisplay.textContent;

            if (!textContent) return;

            // Get all text nodes
            const walker = document.createTreeWalker(
                textDisplay,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );

            const textNodes = [];
            while (walker.nextNode()) {
                if (walker.currentNode.textContent.trim()) {
                    textNodes.push(walker.currentNode);
                }
            }

            // Get line rectangles
            const lineMap = new Map();
            textNodes.forEach(node => {
                range.selectNodeContents(node);
                const rects = range.getClientRects();
                Array.from(rects).forEach(rect => {
                    const y = Math.round(rect.top);
                    if (!lineMap.has(y)) {
                        lineMap.set(y, {
                            top: rect.top,
                            bottom: rect.bottom,
                            left: Math.min(rect.left, lineMap.get(y)?.left || Infinity),
                            right: Math.max(rect.right, lineMap.get(y)?.right || 0),
                            height: rect.height
                        });
                    } else {
                        const line = lineMap.get(y);
                        line.left = Math.min(line.left, rect.left);
                        line.right = Math.max(line.right, rect.right);
                    }
                });
            });

            const textDisplayRect = textDisplay.getBoundingClientRect();
            lineMap.forEach((line, y) => {
                textLines.push({
                    y: line.top + line.height / 2 - textDisplayRect.top,
                    top: line.top - textDisplayRect.top,
                    bottom: line.bottom - textDisplayRect.top,
                    left: line.left - textDisplayRect.left,
                    right: line.right - textDisplayRect.left,
                    height: line.height
                });
            });

            textLines.sort((a, b) => a.y - b.y);
            console.log('[Highlighter] Detected', textLines.length, 'text lines');
        }

        /**
         * Apply highlight to selected text
         */
        function applyHighlightToSelection(color) {
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed) {
                console.log('[Highlighter] No text selected');
                return;
            }

            const range = selection.getRangeAt(0);
            const textDisplay = document.getElementById('reading-text-display');

            // Check if selection is within the text display
            if (!textDisplay.contains(range.commonAncestorContainer)) {
                console.log('[Highlighter] Selection is not in text display');
                return;
            }

            try {
                // Create a span to wrap the selected text
                const span = document.createElement('span');
                span.className = `highlight ${color}`;
                span.setAttribute('data-highlight-color', color);

                // Wrap the selected content
                range.surroundContents(span);

                console.log('[Highlighter] Applied', color, 'highlight to selected text');

                // Clear the selection
                selection.removeAllRanges();
            } catch (error) {
                // If surroundContents fails (e.g., partial element selection),
                // use a more robust method
                console.log('[Highlighter] Using alternative highlight method');

                const fragment = range.extractContents();
                const span = document.createElement('span');
                span.className = `highlight ${color}`;
                span.setAttribute('data-highlight-color', color);
                span.appendChild(fragment);
                range.insertNode(span);

                // Clear the selection
                selection.removeAllRanges();
            }
        }

        /**
         * Setup text selection and highlight events
         */
        function setupTextHighlightEvents() {
            const textDisplay = document.getElementById('reading-text-display');
            if (!textDisplay) return;

            // Listen for mouseup to apply highlight when text is selected
            textDisplay.addEventListener('mouseup', () => {
                if (currentHighlighterColor && !isEraserMode) {
                    setTimeout(() => {
                        applyHighlightToSelection(currentHighlighterColor);
                    }, 10);
                }
            });

            // Listen for click on highlights in eraser mode
            textDisplay.addEventListener('click', (e) => {
                if (isEraserMode && e.target.classList.contains('highlight')) {
                    console.log('[Highlighter] Removing highlight');
                    const highlight = e.target;
                    const parent = highlight.parentNode;

                    // Replace the highlight span with its text content
                    while (highlight.firstChild) {
                        parent.insertBefore(highlight.firstChild, highlight);
                    }
                    parent.removeChild(highlight);

                    // Normalize the parent to merge adjacent text nodes
                    parent.normalize();
                }
            });

            console.log('[Highlighter] Text selection events setup complete');
        }

        /**
         * Setup drawing events for mouse and touch
         */
        function setupDrawingEvents() {
            if (!highlightCanvas) return;

            // Mouse events
            highlightCanvas.addEventListener('mousedown', handleDrawStart);
            highlightCanvas.addEventListener('mousemove', handleDrawMove);
            highlightCanvas.addEventListener('mouseup', handleDrawEnd);
            highlightCanvas.addEventListener('mouseleave', handleDrawEnd);

            // Touch events
            highlightCanvas.addEventListener('touchstart', handleDrawStart);
            highlightCanvas.addEventListener('touchmove', handleDrawMove);
            highlightCanvas.addEventListener('touchend', handleDrawEnd);
            highlightCanvas.addEventListener('touchcancel', handleDrawEnd);
        }

        /**
         * Get coordinates from mouse or touch event
         */
        function getEventCoords(e) {
            const rect = highlightCanvas.getBoundingClientRect();
            let clientX, clientY;

            if (e.touches && e.touches.length > 0) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        }

        /**
         * Find nearest text line for a given y coordinate
         */
        function findNearestLine(y) {
            if (textLines.length === 0) return null;

            let nearest = textLines[0];
            let minDist = Math.abs(y - textLines[0].y);

            for (let i = 1; i < textLines.length; i++) {
                const dist = Math.abs(y - textLines[i].y);
                if (dist < minDist) {
                    minDist = dist;
                    nearest = textLines[i];
                }
            }

            return nearest;
        }

        /**
         * Start drawing
         */
        function handleDrawStart(e) {
            e.preventDefault();

            if (isEraserMode) {
                handleEraseClick(e);
                return;
            }

            if (!currentHighlighterColor) return;

            isHighlighting = true;
            currentHighlightPath = [];

            const coords = getEventCoords(e);
            currentHighlightPath.push(coords);

            console.log('[Highlighter] Drawing started at:', coords);
        }

        /**
         * Drawing move
         */
        function handleDrawMove(e) {
            if (!isHighlighting || !currentHighlighterColor) return;

            e.preventDefault();

            const coords = getEventCoords(e);
            currentHighlightPath.push(coords);

            // Draw preview
            drawPreview();
        }

        /**
         * End drawing
         */
        function handleDrawEnd(e) {
            if (!isHighlighting) return;

            e.preventDefault();
            isHighlighting = false;

            if (currentHighlightPath.length < 2) {
                currentHighlightPath = [];
                return;
            }

            // Process path to align to text lines
            const alignedPath = alignPathToLines(currentHighlightPath);

            if (alignedPath.length > 0) {
                highlightLines.push({
                    color: currentHighlighterColor,
                    points: alignedPath,
                    id: Date.now() + Math.random()
                });
            }

            currentHighlightPath = [];
            drawHighlights();

            console.log('[Highlighter] Drawing complete, total lines:', highlightLines.length);
        }

        /**
         * Draw preview while drawing
         */
        function drawPreview() {
            if (!highlightCtx || currentHighlightPath.length < 2) return;

            drawHighlights(); // Redraw existing highlights

            // Draw current path preview
            const colorMap = {
                yellow: 'rgba(254, 240, 138, 0.6)',
                green: 'rgba(134, 239, 172, 0.6)',
                pink: 'rgba(253, 164, 175, 0.6)',
                blue: 'rgba(147, 197, 253, 0.6)'
            };

            highlightCtx.strokeStyle = colorMap[currentHighlighterColor] || 'rgba(254, 240, 138, 0.6)';
            highlightCtx.lineWidth = 20;
            highlightCtx.lineCap = 'round';
            highlightCtx.lineJoin = 'round';

            highlightCtx.beginPath();
            highlightCtx.moveTo(currentHighlightPath[0].x, currentHighlightPath[0].y);
            for (let i = 1; i < currentHighlightPath.length; i++) {
                highlightCtx.lineTo(currentHighlightPath[i].x, currentHighlightPath[i].y);
            }
            highlightCtx.stroke();
        }

        /**
         * Align path to text lines
         */
        function alignPathToLines(path) {
            if (path.length === 0 || textLines.length === 0) return [];

            const aligned = [];
            const lineHeight = 20; // Height of highlight line

            // Group path points by nearest line
            const lineGroups = new Map();

            path.forEach(point => {
                const nearestLine = findNearestLine(point.y);
                if (nearestLine) {
                    const lineKey = nearestLine.y;
                    if (!lineGroups.has(lineKey)) {
                        lineGroups.set(lineKey, {
                            line: nearestLine,
                            points: []
                        });
                    }
                    lineGroups.get(lineKey).points.push(point);
                }
            });

            // Create aligned segments for each line
            lineGroups.forEach((group, lineKey) => {
                if (group.points.length > 0) {
                    const minX = Math.min(...group.points.map(p => p.x));
                    const maxX = Math.max(...group.points.map(p => p.x));
                    const y = group.line.y;

                    aligned.push({
                        x1: minX,
                        x2: maxX,
                        y: y,
                        lineY: group.line.y
                    });
                }
            });

            return aligned;
        }

        /**
         * Draw all highlights on canvas
         */
        function drawHighlights() {
            if (!highlightCtx || !highlightCanvas) return;

            // Clear canvas
            highlightCtx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);

            const colorMap = {
                yellow: 'rgba(254, 240, 138, 0.6)',
                green: 'rgba(134, 239, 172, 0.6)',
                pink: 'rgba(253, 164, 175, 0.6)',
                blue: 'rgba(147, 197, 253, 0.6)'
            };

            const lineHeight = 20;

            // Draw all highlight lines
            highlightLines.forEach(line => {
                highlightCtx.strokeStyle = colorMap[line.color] || 'rgba(254, 240, 138, 0.6)';
                highlightCtx.lineWidth = lineHeight;
                highlightCtx.lineCap = 'round';

                line.points.forEach(segment => {
                    highlightCtx.beginPath();
                    highlightCtx.moveTo(segment.x1, segment.y);
                    highlightCtx.lineTo(segment.x2, segment.y);
                    highlightCtx.stroke();
                });
            });
        }

        /**
         * Handle eraser click
         */
        function handleEraseClick(e) {
            if (!isEraserMode) return;

            const coords = getEventCoords(e);
            console.log('[Highlighter] Erase click at:', coords);

            // Find which highlight line was clicked
            const clickRadius = 15;
            let foundIndex = -1;

            for (let i = highlightLines.length - 1; i >= 0; i--) {
                const line = highlightLines[i];
                for (const segment of line.points) {
                    // Check if click is within the segment bounds
                    if (coords.x >= segment.x1 - clickRadius &&
                        coords.x <= segment.x2 + clickRadius &&
                        Math.abs(coords.y - segment.y) <= clickRadius) {
                        foundIndex = i;
                        break;
                    }
                }
                if (foundIndex >= 0) break;
            }

            if (foundIndex >= 0) {
                highlightLines.splice(foundIndex, 1);
                drawHighlights();
                console.log('[Highlighter] Highlight line removed, remaining:', highlightLines.length);
            }
        }

        /**
         * Submit reading comprehension answer
         */
        /**
         * NEW: 學生送出閱讀測驗後，於學生端顯示逐題題目與答對／答錯情形。
         * @param {Array} questions - 題目（含 correctAnswer，1-based）。
         * @param {Array} answers - 學生作答，1-based 選項（0 = 未答）。
         */
        function showReadingComprehensionResult(questions, answers) {
            const questionsContainer = document.getElementById('reading-questions-container');
            if (!questionsContainer || !questions || questions.length === 0) return;

            const optionLabels = ['A', 'B', 'C', 'D'];
            let correctCount = 0;
            let body = '';

            questions.forEach((q, index) => {
                const studentAns = answers[index] || 0; // 1-based, 0 = 未答
                const correctAns = q.correctAnswer;
                const isCorrect = studentAns === correctAns;
                if (isCorrect) correctCount++;

                const levelBadge = q.level
                    ? `<span class="inline-block px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-700">${q.level}</span>`
                    : '';

                body += `
                    <div class="question-card">
                        <div class="flex items-start justify-between mb-3 gap-2">
                            <p class="font-bold text-lg text-gray-800 flex-1">
                                <span class="inline-block w-8 h-8 ${isCorrect ? 'bg-green-500' : 'bg-red-500'} text-white rounded-full text-center leading-8 mr-2">${index + 1}</span>
                                ${q.question}
                            </p>
                            <div class="flex flex-col items-end gap-1">
                                <span class="flex-shrink-0 px-3 py-1 rounded-full text-sm font-bold ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                                    ${isCorrect ? '<i class="fas fa-check mr-1"></i>答對' : '<i class="fas fa-times mr-1"></i>答錯'}
                                </span>
                                ${levelBadge}
                            </div>
                        </div>
                        <div class="space-y-2 ml-10">
                            ${q.options.map((opt, i) => {
                    const val = i + 1;
                    const isStudent = studentAns === val;
                    const isAnswer = correctAns === val;
                    let cls = 'flex items-center p-3 rounded-lg border-2 ';
                    let tail = '';
                    if (isAnswer) { cls += 'border-green-400 bg-green-50'; tail = '<i class="fas fa-check-circle text-green-600 ml-auto"></i>'; }
                    else if (isStudent) { cls += 'border-red-400 bg-red-50'; tail = '<i class="fas fa-times-circle text-red-500 ml-auto"></i>'; }
                    else { cls += 'border-transparent'; }
                    return `<div class="${cls}"><span class="font-medium text-gray-700"><span class="font-bold text-green-600">${optionLabels[i]}.</span> ${opt}</span>${isStudent ? '<span class="ml-2 text-xs text-gray-500 whitespace-nowrap">(你的答案)</span>' : ''}${tail}</div>`;
                }).join('')}
                        </div>
                    </div>
                `;
            });

            const total = questions.length;
            const summary = `
                <div class="question-card text-center border-2 ${correctCount === total ? 'border-green-300' : 'border-blue-200'}">
                    <p class="text-xl font-bold ${correctCount === total ? 'text-green-600' : 'text-blue-700'}"><i class="fas fa-clipboard-check mr-2"></i>答對 ${correctCount} / ${total} 題</p>
                </div>
            `;

            questionsContainer.innerHTML = summary + body;

            const submitBtn = document.getElementById('submit-reading-btn');
            if (submitBtn) submitBtn.disabled = true;
        }

        async function submitReadingAnswer() {
            const questionsContainer = document.getElementById('reading-questions-container');
            const answers = [];

            // Collect all answers
            for (let i = 0; i < readingComprehensionData.questions.length; i++) {
                const selected = document.querySelector(`input[name="reading_q${i}"]:checked`);
                if (selected) {
                    answers.push(parseInt(selected.value));
                } else {
                    answers.push(0); // No answer
                }
            }

            if (answers.filter(a => a > 0).length === 0) {
                showMessage('請至少回答一題！', 'error');
                return;
            }

            await submitAnswer(JSON.stringify(answers));
            showMessage('答案已提交！', 'success');
            document.getElementById('submit-reading-btn').disabled = true;

            // NEW: 於學生端顯示逐題題目與答對／答錯情形
            showReadingComprehensionResult(readingComprehensionData.questions, answers);

            // Clear local answers after successful submission
            currentReadingAnswers = [];
        }

        /**
         * AI generate PIRLS reading questions
         */
        async function generatePIRLSQuestions() {
            const aiTopicTextarea = document.getElementById('ai-reading-topic-textarea');
            const readingTextTextarea = document.getElementById('reading-text-textarea');
            const questionsTextarea = document.getElementById('reading-questions-textarea');
            const aiBtn = document.getElementById('ai-generate-reading-btn');
            const aiIcon = document.getElementById('ai-reading-btn-icon');
            const aiText = document.getElementById('ai-reading-btn-text');
            const aiSpinner = document.getElementById('ai-reading-loading-spinner');

            const topic = aiTopicTextarea.value.trim();
            const existingText = readingTextTextarea.value.trim();

            if (!topic) {
                showMessage('請輸入出題要求！', 'error');
                return;
            }

            // Show loading
            aiBtn.disabled = true;
            aiText.textContent = '生成中...';
            aiIcon.classList.remove('fa-magic');
            aiIcon.classList.add('fa-spinner', 'fa-spin');
            aiSpinner.classList.remove('hidden');

            try {
                const prompt = existingText
                    ? `根據以下文本，依照 PIRLS 閱讀理解的 4 個層次生成 10 題選擇題：
層次1（直接提取資訊）：3題
層次2（直接推論）：3題
層次3（詮釋整合資訊）：2題
層次4（比較評估內容）：2題

文本：
${existingText}

要求：${topic}

請按照以下格式輸出，每行一題：
題目,正確答案(1-4),選項1,選項2,選項3,選項4,層次(1-4)

範例：
主角的名字是什麼?,2,小明,小華,小美,小強,1`
                    : `請根據以下主題生成一篇適合的閱讀文本，並依照 PIRLS 閱讀理解的 4 個層次生成 10 題選擇題：
層次1（直接提取資訊）：3題
層次2（直接推論）：3題
層次3（詮釋整合資訊）：2題
層次4（比較評估內容）：2題

主題：${topic}

請先輸出文本，然後輸出「---題目---」，再按照以下格式輸出題目，每行一題：
題目,正確答案(1-4),選項1,選項2,選項3,選項4,層次(1-4)`;

                const payload = {
                    contents: [{ role: "user", parts: [{ text: prompt }] }],
                    generationConfig: { temperature: 0.7 }
                };

                const apiKey = aiSettings.geminiApiKey;
                const generatedText = cleanAiGeneratedText(await callAi(payload, apiKey));

                if (generatedText) {
                    if (!existingText) {
                        // Parse text and questions
                        const parts = generatedText.split('---題目---');
                        if (parts.length === 2) {
                            readingTextTextarea.value = parts[0].trim();
                            questionsTextarea.value = parts[1].trim();
                        } else {
                            questionsTextarea.value = generatedText;
                        }
                    } else {
                        questionsTextarea.value = generatedText;
                    }
                    showMessage('AI 閱讀測驗已成功生成！', 'success');
                } else {
                    throw new Error('AI 未返回有效內容。');
                }

            } catch (error) {
                console.error("AI 閱讀測驗生成失敗:", error);
                showMessage('AI 生成失敗，請檢查 API Key 或網路連線。', 'error');
            } finally {
                aiBtn.disabled = false;
                aiText.textContent = 'AI 開始出題';
                aiIcon.classList.add('fa-magic');
                aiIcon.classList.remove('fa-spinner', 'fa-spin');
                aiSpinner.classList.add('hidden');
            }
        }

        /**
         * Show reading comprehension questions modal for teacher
         */
        function showViewReadingQuestionsModal() {
            if (!readingComprehensionData || !readingComprehensionData.questions || readingComprehensionData.questions.length === 0) {
                showMessage('目前沒有閱讀測驗題目可以查看。', 'info');
                return;
            }

            const modal = document.getElementById('view-reading-questions-modal');
            const textDisplay = document.getElementById('view-reading-text-display');
            const questionsDisplay = document.getElementById('view-reading-questions-display');

            // Display text
            textDisplay.textContent = readingComprehensionData.text || '(無文本)';

            // Display questions
            questionsDisplay.innerHTML = '';
            readingComprehensionData.questions.forEach((q, index) => {
                const levelIcon = ['📖', '💭', '🔗', '⚖️'][q.level - 1];
                const levelText = ['直接提取', '直接推論', '詮釋整合', '比較評估'][q.level - 1];

                const questionDiv = document.createElement('div');
                questionDiv.className = 'bg-white p-4 rounded-lg border';
                questionDiv.innerHTML = `
                    <div class="flex items-center gap-2 mb-2">
                        <span class="font-bold text-lg">第 ${index + 1} 題</span>
                        <span class="text-sm bg-blue-100 text-blue-700 px-2 py-1 rounded">${levelIcon} 層次${q.level}: ${levelText}</span>
                    </div>
                    <p class="font-medium text-gray-800 mb-3">${q.question}</p>
                    <div class="space-y-1 ml-4">
                        ${q.options.map((opt, i) => `
                            <div class="flex items-center gap-2">
                                <span class="font-bold ${i + 1 === q.correctAnswer ? 'text-green-600' : 'text-gray-600'}">${i + 1}.</span>
                                <span class="${i + 1 === q.correctAnswer ? 'text-green-600 font-bold' : 'text-gray-700'}">${opt}</span>
                                ${i + 1 === q.correctAnswer ? '<i class="fas fa-check-circle text-green-600 ml-2"></i>' : ''}
                            </div>
                        `).join('')}
                    </div>
                    <div class="mt-2 text-sm text-gray-600">
                        <span class="font-bold">正確答案：</span><span class="text-green-600 font-bold">${q.correctAnswer}</span>
                    </div>
                `;
                questionsDisplay.appendChild(questionDiv);
            });

            modal.classList.remove('hidden');
        }

        /**
         * Hide reading comprehension questions modal
         */
        function hideViewReadingQuestionsModal() {
            document.getElementById('view-reading-questions-modal').classList.add('hidden');
        }

        // === Reading Comprehension Question Bank Functions ===

        /**
         * Get classroom-specific reading bank key
         */
        function getReadingBankKey() {
            return classroomCode ? `readingQuestionBanks_${classroomCode}` : 'readingQuestionBanks_default';
        }

        /**
         * Load reading question banks from localStorage for current classroom
         */
        function loadReadingBanksFromStorage() {
            if (!classroomCode) return;
            const key = getReadingBankKey();
            const stored = localStorage.getItem(key);
            if (stored) {
                try {
                    readingQuestionBanks = JSON.parse(stored);
                } catch (e) {
                    console.error('載入閱讀測驗題庫失敗:', e);
                    readingQuestionBanks = [];
                }
            } else {
                readingQuestionBanks = [];
            }
        }

        /**
         * Save reading question banks to localStorage for current classroom
         */
        function saveReadingBanksToStorage() {
            if (!classroomCode) return;
            const key = getReadingBankKey();
            try {
                localStorage.setItem(key, JSON.stringify(readingQuestionBanks));
                mirrorBanksToGlobal('readingQuestionBanks_global', readingQuestionBanks); // 同步到跨課堂本地題庫
            } catch (e) {
                console.error('儲存閱讀測驗題庫失敗:', e);
            }
        }

        /**
         * Load text and questions from separate files
         */
        async function loadReadingFiles() {
            const textFileInput = document.getElementById('reading-text-file-input');
            const questionsFileInput = document.getElementById('reading-questions-file-input');
            const textTextarea = document.getElementById('reading-text-textarea');
            const questionsTextarea = document.getElementById('reading-questions-textarea');

            const textFile = textFileInput.files[0];
            const questionsFile = questionsFileInput.files[0];

            if (!textFile && !questionsFile) {
                showMessage('請至少選擇一個檔案！', 'error');
                return;
            }

            try {
                if (textFile) {
                    const textContent = await textFile.text();
                    textTextarea.value = textContent.trim();
                }

                if (questionsFile) {
                    const questionsContent = await questionsFile.text();
                    questionsTextarea.value = questionsContent.trim();
                }

                showMessage('檔案載入成功！', 'success');

                // Clear file inputs
                textFileInput.value = '';
                questionsFileInput.value = '';
            } catch (error) {
                console.error('讀取檔案失敗:', error);
                showMessage('讀取檔案失敗！', 'error');
            }
        }

        /**
         * Save reading question bank to localStorage
         */
        async function saveReadingQuestionBank() {
            const nameInput = document.getElementById('reading-question-bank-name-input');
            const bankName = nameInput.value.trim();
            const textContent = document.getElementById('reading-text-textarea').value.trim();
            const questionsContent = document.getElementById('reading-questions-textarea').value.trim();

            if (!bankName) {
                showMessage('請輸入題庫名稱！', 'error');
                return;
            }

            if (!textContent || !questionsContent) {
                showMessage('請先輸入文本和題目！', 'error');
                return;
            }

            // Check if questions are valid
            const questions = parseReadingQuestions(questionsContent);
            if (!questions) {
                showMessage('題目格式錯誤，請檢查！', 'error');
                return;
            }

            // Load from storage first to get current banks for this classroom
            loadReadingBanksFromStorage();

            const bank = {
                name: bankName,
                text: textContent,
                questions: questionsContent,
                timestamp: new Date().toISOString()
            };

            // Check if bank name already exists
            const existingIndex = readingQuestionBanks.findIndex(b => b.name === bankName);
            if (existingIndex >= 0) {
                const confirmed = await customConfirm(`題庫「${bankName}」已存在，是否覆蓋？`);
                if (!confirmed) {
                    return;
                }
                readingQuestionBanks[existingIndex] = bank;
            } else {
                readingQuestionBanks.push(bank);
            }

            saveReadingBanksToStorage();
            updateReadingBankList();
            showMessage(`題庫「${bankName}」已儲存！`, 'success');
            nameInput.value = '';
        }

        /**
         * Download reading text and questions as a ZIP file
         */
        async function downloadReadingZip() {
            const textContent = document.getElementById('reading-text-textarea').value.trim();
            const questionsContent = document.getElementById('reading-questions-textarea').value.trim();

            if (!textContent && !questionsContent) {
                showMessage('請先輸入文本或題目！', 'error');
                return;
            }

            try {
                // Create a new JSZip instance
                const zip = new JSZip();

                // Add text file if content exists
                if (textContent) {
                    zip.file('文本.txt', textContent);
                }

                // Add questions file if content exists
                if (questionsContent) {
                    zip.file('題目.txt', questionsContent);
                }

                // Generate the zip file
                const content = await zip.generateAsync({ type: 'blob' });

                // Create filename with timestamp
                const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
                const filename = `閱讀測驗_${timestamp}.zip`;

                // Download the file using FileSaver.js
                saveAs(content, filename);

                showMessage('檔案下載成功！', 'success');
            } catch (error) {
                console.error('Download error:', error);
                showMessage('下載失敗，請重試！', 'error');
            }
        }

        /**
         * Update reading question bank list display
         */
        function updateReadingBankList() {
            loadReadingBanksFromStorage(); // Load from storage first
            populateGlobalBankSelect('reading'); // 更新跨課堂本地題庫下拉
            const listContainer = document.getElementById('reading-question-bank-list');

            if (readingQuestionBanks.length === 0) {
                listContainer.innerHTML = '<div class="text-gray-500 text-sm italic text-center">目前沒有儲存的題庫</div>';
                return;
            }

            listContainer.innerHTML = readingQuestionBanks.map((bank, index) => `
                <div class="flex items-center justify-between p-2 bg-white border rounded hover:bg-gray-50">
                    <button onclick="loadReadingBankToTextarea(${index})" class="text-left flex-1 text-sm text-blue-600 hover:underline">
                        ${bank.name}
                    </button>
                    <button onclick="deleteReadingBank(${index})" class="text-red-500 hover:text-red-700 ml-2">
                        <i class="fas fa-trash text-xs"></i>
                    </button>
                </div>
            `).join('');
        }

        /**
         * Load reading bank to textarea
         */
        function loadReadingBankToTextarea(index) {
            if (index >= 0 && index < readingQuestionBanks.length) {
                const bank = readingQuestionBanks[index];
                document.getElementById('reading-text-textarea').value = bank.text;
                document.getElementById('reading-questions-textarea').value = bank.questions;
                showMessage(`題庫「${bank.name}」已載入`, 'success');
            }
        }

        /**
         * Delete reading bank
         */
        async function deleteReadingBank(index) {
            loadReadingBanksFromStorage(); // Load from storage first
            if (index >= 0 && index < readingQuestionBanks.length) {
                const bankName = readingQuestionBanks[index].name;
                const confirmed = await customConfirm(`確定要刪除題庫「${bankName}」嗎？`);
                if (confirmed) {
                    readingQuestionBanks.splice(index, 1);
                    saveReadingBanksToStorage();
                    updateReadingBankList();
                    showMessage(`題庫「${bankName}」已刪除`, 'success');
                }
            }
        }

        // Make functions globally accessible
        window.loadReadingBankToTextarea = loadReadingBankToTextarea;
        window.deleteReadingBank = deleteReadingBank;

        /**
         * 08 閱讀測驗：事件監聽設定（原本位於 setupEventListeners() 內的段落，
         * 由 modules/main/events.js 的 setupEventListeners() 依原順序呼叫）。
         */
        function setupReadingComprehensionEventListeners() {

            // Reading Comprehension Listeners
            document.getElementById('reading-comprehension-settings-btn')?.addEventListener('click', showReadingComprehensionModal);
            document.getElementById('reading-comprehension-settings-modal-close-btn')?.addEventListener('click', hideReadingComprehensionModal);
            document.getElementById('cancel-reading-settings-btn')?.addEventListener('click', hideReadingComprehensionModal);
            document.getElementById('start-reading-interaction-btn')?.addEventListener('click', startReadingComprehension);
            document.getElementById('submit-reading-btn')?.addEventListener('click', submitReadingAnswer);
            document.getElementById('ai-generate-reading-btn')?.addEventListener('click', generatePIRLSQuestions);
            document.getElementById('load-reading-files-btn')?.addEventListener('click', loadReadingFiles);
            document.getElementById('save-reading-question-bank-btn')?.addEventListener('click', saveReadingQuestionBank);
            document.getElementById('download-reading-zip-btn')?.addEventListener('click', downloadReadingZip);

            // View Reading Questions Modal Listeners
            document.getElementById('view-reading-questions-btn')?.addEventListener('click', showViewReadingQuestionsModal);
            document.getElementById('view-reading-questions-modal-close-btn')?.addEventListener('click', hideViewReadingQuestionsModal);
            document.getElementById('close-reading-questions-view-btn')?.addEventListener('click', hideViewReadingQuestionsModal);
        }
