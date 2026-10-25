        // =====================================================================
        // 【主畫面配置 — 共用核心（全域狀態、畫面切換、對話框、共用工具）】 modules/main/core.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        // =====================================================================
        // Cloudflare 資料層（取代 Firebase，介面相容）
        import { getFirestore, doc, setDoc, onSnapshot, collection, deleteDoc, getDoc, getDocs, updateDoc, writeBatch, serverTimestamp, deleteTree, setPresence, getUserId } from "./cfdb.js";

        // --- 除錯訊息開關 ---
        // 設為 true 顯示所有 console.log/info/debug 除錯訊息；正式環境設為 false 可保持 console 乾淨。
        // 加上 ?debug=1 於網址也可臨時開啟。錯誤(error)與警告(warn)永遠保留。
        const DEBUG = new URLSearchParams(window.location.search).get('debug') === '1';
        if (!DEBUG) {
            console.log = console.info = console.debug = function () {};
        }

        // --- Global Variables ---
        // Max dimension (px) for user uploaded images to prevent excessively large files.
        const MAX_IMAGE_DIMENSION = 1024;
        // JPEG compression quality (0.0 to 1.0).
        const JPEG_QUALITY = 0.8;

        // Cloudflare 資料庫（與網站同網域，免設定）
        const db = getFirestore();

        // 資料路徑前綴：artifacts/{baseAppId}/public/data/classrooms/...
        const baseAppId = 'default-classroom-app';
        let userId = null;
        let studentName = null;
        let currentRole = null; // 'teacher' or 'student'
        let classroomCode = null; // NEW: Stores the teacher-defined or student-entered classroom code.
        let currentInteractionMode = null; // To track the active mode for statistics.
        let allStudentResponses = []; // Global variable to store all student responses for charting and lottery.
        let currentSortMethod = 'votes'; // Track current sorting method for peer review: 'votes', 'name', or 'time'
        let starredWorks = new Set(); // Track starred works by workId
        let showOnlyStarred = false; // Track if showing only starred works in peer review
        let responsesSortMethod = 'time'; // Track sorting method for regular responses: 'name' or 'time'
        let responsesShowOnlyStarred = false; // Track if showing only starred works in regular responses
        let activeStudentNames = []; // NEW: Global variable to store names of all currently active students.
        let lastSelectedStudentCard = null; // To track the previously selected card for the lottery feature.
        let isResponsePaused = false; // NEW: Global state for response pause.
        let currentRound = null; // V6.2: 互動輪次編號，隔離不同輪次的作答（避免清除舊答案與學生提交賽跑）
        let responsesRenderTimer = null; // V6.2: 老師端作答重繪 debounce 計時器
        let pendingResponsesSnapshot = null; // V6.2: debounce 期間暫存的最新 snapshot
        let lastSelectedModalStudent = null; // NEW: To track the previously selected student in the modal for lottery.

        let interactionModeUnsubscribe = null;
        let studentResponsesUnsubscribe = null;
        let classroomPresenceUnsubscribe = null; // Unsubscribe function for classroom presence listener.

        // NEW: Peer Review System Variables
        let peerReviewActive = false; // Whether peer review is currently active
        let peerReviewUnsubscribe = null; // Unsubscribe function for peer review votes listener
        let studentVotedWorks = new Set(); // Track which works this student has voted for
        let allPeerReviewVotes = {}; // Global object to store all votes data
        const MAX_VOTES_PER_STUDENT = 3; // Maximum votes per student per interaction


        // --- DOM Elements Caching ---
        const views = {
            entry: document.getElementById('entry-view'),
            teacherClassroomCode: document.getElementById('teacher-classroom-code-view'), // NEW VIEW
            teacherMenu: document.getElementById('teacher-menu-view'),
            teacherMonitor: document.getElementById('teacher-monitor-view'),
            studentName: document.getElementById('student-name-view'),
            studentWaiting: document.getElementById('student-waiting-view'),
            studentInteraction: document.getElementById('student-interaction-view'),
            studentPeerReview: document.getElementById('student-peer-review-view'), // NEW VIEW
        };

        const interactionUIs = {
            true_false: document.getElementById('interaction-true-false'),
            multiple_choice: document.getElementById('interaction-multiple-choice'),
            text_input: document.getElementById('interaction-text-input'),
            word_cloud: document.getElementById('interaction-word-cloud'), // Word cloud UI
            sticky_note: document.getElementById('interaction-sticky-note'), // Sticky note wall UI
            focus_game: document.getElementById('interaction-focus-game'), // Focus game UI
            drawing: document.getElementById('interaction-drawing'),
            url_dispatch: document.getElementById('interaction-url-dispatch'), // Now handles both URL and HTML
            recording: document.getElementById('interaction-recording'), // New UI
            reading_comprehension: document.getElementById('interaction-reading-comprehension'), // Reading comprehension UI
            quick_answer: document.getElementById('interaction-quick-answer'), // Quick answer UI
            quick_poll: document.getElementById('interaction-quick-poll'), // Quick poll UI
            sequencing: document.getElementById('interaction-sequencing'), // Sequencing UI
            matching: document.getElementById('interaction-matching'), // Matching UI
            calc: document.getElementById('interaction-calc'), // 15 計算題 UI
            hotspot: document.getElementById('interaction-hotspot'), // 16 圖片點選題 UI
        };

        // --- Core Logic Functions ---
        /**
         * Displays the specified view section.
         * @param {string} viewName - The name of the view to display (key in `views` object).
         */
        function showView(viewName) {
            const body = document.querySelector('body');
            body.classList.remove('initial-view-background');

            Object.values(views).forEach(view => view.classList.add('hidden'));
            if (views[viewName]) {
                views[viewName].classList.remove('hidden');
                if (viewName === 'entry') {
                    body.classList.add('initial-view-background');
                }
            }
            // 浮動貼上按鈕：僅在教師面板可見時顯示
            const floatingPasteBtn = document.getElementById('floating-paste-btn');
            if (floatingPasteBtn) {
                if (viewName === 'teacherMenu') {
                    floatingPasteBtn.classList.remove('hidden');
                } else {
                    floatingPasteBtn.classList.add('hidden');
                }
            }
            // 浮動 QR 按鈕：教師面板（選單與監看）皆可顯示學生加入網址
            const floatingQrBtn = document.getElementById('floating-qr-btn');
            if (floatingQrBtn) {
                if (viewName === 'teacherMenu' || viewName === 'teacherMonitor') {
                    floatingQrBtn.classList.remove('hidden');
                } else {
                    floatingQrBtn.classList.add('hidden');
                }
            }
        }

        /**
         * Displays the UI for a specific interaction mode within the student interface.
         * @param {string} mode - The interaction mode (e.g., 'true_false', 'drawing', 'recording', 'url_dispatch').
         * @param {boolean} [isResumingFromPause=false] - True if this is part of resuming from a paused state.
         */
        function showInteractionUI(mode, isResumingFromPause = false) {
            Object.values(interactionUIs).forEach(ui => ui.classList.add('hidden'));
            // Clear URL dispatch content if switching to another mode
            if (mode !== 'url_dispatch' && interactionUIs.url_dispatch) {
                interactionUIs.url_dispatch.innerHTML = ''; // Clear content for URL/HTML dispatch
                interactionUIs.url_dispatch.style.cssText = ''; // Reset container styles
            }

            // Disable pull-to-refresh prevention when leaving reading comprehension mode
            if (mode !== 'reading_comprehension') {
                disablePullToRefreshPrevention();
            }

            if (interactionUIs[mode]) {
                interactionUIs[mode].classList.remove('hidden');
                resetStudentUIState(mode, isResumingFromPause); // Pass the flag

                // Special handling for quick answer mode
                if (mode === 'quick_answer') {
                    startQuickAnswer();
                    listenToQuickAnswerUpdates();
                }
            }
        }

        /**
         * Resets the student UI state, e.g., clears input fields or enables buttons.
         * @param {string} mode - The current interaction mode.
         * @param {boolean} [isResumingFromPause=false] - True if this reset is part of resuming from a paused state.
         */
        function resetStudentUIState(mode, isResumingFromPause = false) {
            const grayClass = 'bg-gray-400';
            const hoverClassMap = {
                '1': 'hover:bg-blue-600', '2': 'hover:bg-yellow-600',
                '3': 'hover:bg-green-600', '4': 'hover:bg-red-600'
            };

            // Ensure all interaction UIs are enabled by default before applying pause state
            document.querySelectorAll('#student-interaction-view button, #student-interaction-view textarea, #student-interaction-view input[type="file"], #student-interaction-view select, #student-interaction-view input[type="radio"]').forEach(el => {
                if (el.closest('#interaction-calc')) return; // 15 計算題自行管理按鈕狀態
                el.disabled = false;
                // Re-add original classes if they were removed by pause state
                if (el.classList.contains('btn-gray')) {
                    el.classList.remove('btn-gray');
                    el.classList.add('btn-primary'); // Assuming primary is default for many
                }
            });
            // Re-enable canvas interaction
            canvas.style.pointerEvents = 'auto';

            switch (mode) {
                case 'true_false':
                    interactionUIs[mode].querySelectorAll('.answer-btn').forEach(btn => {
                        btn.disabled = false;
                        btn.classList.remove(grayClass);
                        if (btn.dataset.answer === 'O') btn.classList.replace('bg-gray-400', 'bg-green-500');
                        if (btn.dataset.answer === 'X') btn.classList.replace('bg-gray-400', 'bg-red-500');
                    });
                    break;
                case 'multiple_choice':
                    // Reset default MC options
                    const defaultMcOptions = document.getElementById('default-mc-options');
                    defaultMcOptions.querySelectorAll('.answer-btn').forEach(btn => {
                        btn.disabled = false;
                        btn.classList.remove(grayClass);
                        if (btn.dataset.answer === '1') btn.classList.replace('bg-gray-400', 'bg-blue-500');
                        if (btn.dataset.answer === '2') btn.classList.replace('bg-gray-400', 'bg-yellow-500');
                        if (btn.dataset.answer === '3') btn.classList.replace('bg-gray-400', 'bg-green-500');
                        if (btn.dataset.answer === '4') btn.classList.replace('bg-gray-400', 'bg-red-500');
                        btn.classList.add(hoverClassMap[btn.dataset.answer]);
                    });
                    // Reset custom MC options (but preserve submission state)
                    document.getElementById('custom-mc-questions-container').innerHTML = '';
                    // NEW: 只有在不是從暫停狀態恢復時才重置按鈕，避免覆蓋已提交狀態
                    if (!isResumingFromPause) {
                        const submitBtn = document.getElementById('submit-custom-mc-btn');
                        submitBtn.disabled = false;
                        submitBtn.classList.replace('btn-gray', 'btn-primary');
                        submitBtn.textContent = '送出全部答案 ✉️';
                    }
                    break;
                case 'text_input':
                    document.getElementById('text-input-area').value = '';
                    const submitTextBtn = document.getElementById('submit-text-btn');
                    submitTextBtn.disabled = false;
                    submitTextBtn.classList.remove('btn-gray');
                    submitTextBtn.classList.add('btn-primary');
                    break;
                case 'word_cloud':
                    document.getElementById('word-cloud-input').value = '';
                    document.getElementById('word-cloud-char-count').textContent = '0';
                    const submitWordCloudBtn = document.getElementById('submit-word-cloud-btn');
                    submitWordCloudBtn.disabled = false;
                    submitWordCloudBtn.classList.remove('opacity-50', 'cursor-not-allowed', 'btn-gray');
                    break;
                case 'sticky_note':
                    // Reset text input
                    document.getElementById('sticky-note-text').value = '';
                    document.getElementById('sticky-text-char-count').textContent = '0';
                    // Reset image input
                    stickyNoteImageData = null;
                    document.getElementById('sticky-image-preview').classList.add('hidden');
                    document.getElementById('sticky-image-input').value = '';
                    // Reset to text tab
                    document.getElementById('sticky-text-tab').classList.add('bg-amber-500', 'text-white');
                    document.getElementById('sticky-text-tab').classList.remove('bg-slate-200', 'text-slate-600');
                    document.getElementById('sticky-image-tab').classList.remove('bg-amber-500', 'text-white');
                    document.getElementById('sticky-image-tab').classList.add('bg-slate-200', 'text-slate-600');
                    document.getElementById('sticky-text-section').classList.remove('hidden');
                    document.getElementById('sticky-image-section').classList.add('hidden');
                    // Enable submit button
                    const submitStickyNoteBtn = document.getElementById('submit-sticky-note-btn');
                    submitStickyNoteBtn.disabled = false;
                    submitStickyNoteBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                    break;
                case 'drawing':
                    // Only clear the drawing canvas if it's NOT resuming from a pause.
                    // If isResumingFromPause is true, it means we are re-enabling controls
                    // within the *same* drawing session after a pause, so preserve the drawing.
                    if (!isResumingFromPause) {
                        clearDrawingCanvas(); // Clears only the student's drawing layer.
                        studentUploadedImageDataURL = null; // Clear student uploaded image too
                        studentImageCtx.clearRect(0, 0, studentImageCanvas.width, studentImageCanvas.height);
                    }

                    const submitDrawingBtn = document.getElementById('submit-drawing-btn');
                    submitDrawingBtn.disabled = false;
                    submitDrawingBtn.classList.replace('btn-gray', 'btn-primary');

                    // Reset drawing tools to default values.
                    const colorSelect = document.getElementById('color-select');
                    const sizeSelect = document.getElementById('size-select');
                    const penToolBtn = document.getElementById('pen-tool-btn');
                    const eraserBtn = document.getElementById('eraser-btn');

                    colorSelect.value = 'black';
                    sizeSelect.value = '2';
                    drawingCtx.strokeStyle = 'black';
                    drawingCtx.lineWidth = 2;
                    drawingCtx.globalCompositeOperation = 'source-over';

                    penToolBtn.classList.add('border-blue-500');
                    eraserBtn.classList.remove('border-blue-500');

                    updateColorSwatch(colorSelect.value);
                    break;
                case 'url_dispatch': // This mode now handles both URL and HTML
                    // Content is dynamically generated, no specific reset needed here beyond clearing in showInteractionUI
                    break;
                case 'recording':
                    // Reset recording state
                    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                        mediaRecorder.stop();
                    }
                    if (audioStream) {
                        audioStream.getTracks().forEach(track => track.stop());
                    }
                    audioChunks = [];
                    audioBlob = null;
                    audioDataURL = null;
                    document.getElementById('audio-preview').classList.add('hidden');
                    document.getElementById('audio-preview').src = '';
                    document.getElementById('start-recording-btn').disabled = false;
                    document.getElementById('stop-recording-btn').disabled = true;
                    document.getElementById('play-recording-btn').disabled = true;
                    document.getElementById('reset-recording-btn').disabled = true;
                    document.getElementById('submit-recording-btn').disabled = true;
                    recordingStatusText.textContent = '準備錄音...';
                    recordingStatusIcon.classList.remove('fa-spin', 'text-red-500');
                    recordingStatusIcon.classList.add('text-gray-400');
                    break;
                case 'quick_answer':
                    // Reset quick answer state
                    document.getElementById('quick-answer-status-text').textContent = '等待搶答開始...';
                    document.getElementById('quick-answer-result').classList.add('hidden');
                    document.getElementById('quick-answer-locked').classList.add('hidden');
                    document.getElementById('quick-answer-button-container').innerHTML = '';
                    document.getElementById('quick-answer-button-container').classList.add('pointer-events-none');
                    break;
                case 'sequencing':
                    // Reset sequencing state
                    document.getElementById('sequencing-items-container').innerHTML = '';
                    const submitSequencingBtn = document.getElementById('submit-sequencing-btn');
                    submitSequencingBtn.disabled = false;
                    submitSequencingBtn.classList.remove('btn-gray');
                    submitSequencingBtn.classList.add('btn-primary');
                    break;
                case 'matching':
                    // Reset matching state
                    document.getElementById('matching-column-a').innerHTML = '';
                    document.getElementById('matching-column-b').innerHTML = '';
                    document.getElementById('matching-svg-canvas').innerHTML = '';
                    const submitMatchingBtn = document.getElementById('submit-matching-btn');
                    submitMatchingBtn.disabled = false;
                    submitMatchingBtn.classList.remove('btn-gray');
                    submitMatchingBtn.classList.add('btn-primary');
                    currentMatchingSelection.leftItem = null;
                    currentMatchingSelection.rightItem = null;
                    break;
                case 'focus_game':
                    // Focus game initialization is handled in listenToInteractionMode
                    // to ensure we use the correct numberCount from Firebase
                    break;
                case 'reading_comprehension':
                    // Only clear content if not resuming from pause
                    if (!isResumingFromPause) {
                        document.getElementById('reading-text-display').textContent = '';
                        document.getElementById('reading-questions-container').innerHTML = '';
                        // Clear local answers when switching to a new reading comprehension session
                        currentReadingAnswers = [];
                    }
                    const submitReadingBtn = document.getElementById('submit-reading-btn');
                    // Don't reset button state if resuming from pause (preserve submitted state)
                    if (!isResumingFromPause) {
                        submitReadingBtn.disabled = false;
                        submitReadingBtn.classList.remove('btn-gray');
                        submitReadingBtn.classList.add('btn-primary');
                    }
                    // Disable pull-to-refresh on iOS/iPadOS
                    enablePullToRefreshPrevention();
                    break;
                case 'quick_poll':
                    // Reset quick poll state
                    document.getElementById('quick-poll-options-container').innerHTML = '';
                    document.getElementById('quick-poll-options-container').classList.remove('hidden');
                    document.getElementById('quick-poll-voted-status').classList.add('hidden');
                    document.getElementById('quick-poll-question-display').textContent = '';
                    break;
            }
        }

        /**
         * Toggles the enabled/disabled state of student interaction elements.
         * @param {boolean} disable - True to disable, false to enable.
         */
        function toggleStudentInteractionElements(disable) {
            const studentInteractionView = document.getElementById('student-interaction-view');
            // Select all interactive elements within the student interaction view, excluding the pause overlay itself.
            const interactiveElements = studentInteractionView.querySelectorAll(
                'button, textarea, input[type="file"], select, input[type="radio"]' // Added input[type="radio"]
            );

            interactiveElements.forEach(el => {
                // Only disable if the element is not the pause overlay itself or its children
                if (!el.closest('#student-pause-overlay') && !el.closest('#interaction-calc')) { // 15 計算題：暫停時只停用送出（由 updateCalcPaused 處理）
                    el.disabled = disable;
                    if (disable) {
                        // Add a class for visual feedback if needed, e.g., gray out
                        if (el.tagName === 'BUTTON' && !el.classList.contains('btn-gray')) {
                            el.classList.add('btn-gray');
                            el.classList.remove('btn-primary', 'btn-green', 'btn-orange', 'btn-purple', 'btn-teal', 'bg-indigo-600', 'hover:bg-indigo-700', 'bg-yellow-600', 'hover:bg-yellow-700'); // Remove original colors
                        }
                    } else {
                        // Re-enable and restore original styles
                        if (el.tagName === 'BUTTON' && el.classList.contains('btn-gray')) {
                            el.classList.remove('btn-gray');
                            // Restore based on common button types or specific IDs
                            if (el.id === 'submit-text-btn' || el.id === 'submit-drawing-btn' || el.id === 'submit-recording-btn' || el.id === 'submit-custom-mc-btn' || el.id === 'submit-reading-btn' || el.id === 'submit-sequencing-btn' || el.id === 'submit-matching-btn' || el.id === 'submit-hotspot-btn') {
                                el.classList.add('btn-primary');
                            } else if (el.classList.contains('answer-btn')) {
                                // For answer buttons, re-apply their specific colors
                                if (el.dataset.answer === 'O') el.classList.add('bg-green-500');
                                else if (el.dataset.answer === 'X') el.classList.add('bg-red-500');
                                else if (el.dataset.answer === '1') el.classList.add('bg-blue-500');
                                else if (el.dataset.answer === '2') el.classList.add('bg-yellow-500');
                                else if (el.dataset.answer === '3') el.classList.add('bg-green-500');
                                else if (el.dataset.answer === '4') el.classList.add('bg-red-500');
                            } else if (el.id === 'start-recording-btn') {
                                el.classList.add('btn-green');
                            } else if (el.id === 'stop-recording-btn') {
                                el.classList.add('btn-red');
                            } else if (el.id === 'play-recording-btn') {
                                el.classList.add('btn-primary');
                            } else if (el.id === 'reset-recording-btn') {
                                el.classList.add('btn-orange');
                            } else if (el.id === 'pen-tool-btn') {
                                el.classList.add('border-blue-500'); // Pen button border
                            }
                        }
                    }
                }
            });

            // Handle canvas interaction separately
            canvas.style.pointerEvents = disable ? 'none' : 'auto';

            // Handle recording specific buttons that might be disabled by default
            if (currentInteractionMode === 'recording' && !disable) {
                // Only enable start if not already recording
                if (mediaRecorder && mediaRecorder.state === 'inactive') {
                    document.getElementById('start-recording-btn').disabled = false;
                }
                // Other recording buttons remain disabled until recording starts/stops
            }
        }

        /**
         * Displays a custom message box.
         * @param {string} message - The message to display.
         * @param {'info' | 'success' | 'error'} type - The message type, influencing its color.
         */
        function showMessage(message, type = 'info') {
            const msgBox = document.getElementById('message-box');
            const msgContent = document.getElementById('message-content');
            msgContent.textContent = message;
            msgBox.className = 'fixed top-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg z-50 transition-all duration-300 transform text-white';
            switch (type) {
                case 'success': msgBox.classList.add('bg-green-500'); break;
                case 'error': msgBox.classList.add('bg-red-500'); break;
                case 'info': msgBox.classList.add('bg-blue-500'); break;
                default: msgBox.classList.add('bg-blue-500'); break;
            }
            msgBox.classList.remove('hidden');
            setTimeout(() => {
                msgBox.classList.add('hidden');
            }, 3000); // Auto-hide after 3 seconds.
        }

        /**
         * Custom Confirm Dialog - Replaces browser's confirm()
         * Returns a Promise that resolves to true/false
         */
        function customConfirm(message) {
            return new Promise((resolve) => {
                const modal = document.getElementById('custom-confirm-modal');
                const messageEl = document.getElementById('custom-confirm-message');
                const okBtn = document.getElementById('custom-confirm-ok-btn');
                const cancelBtn = document.getElementById('custom-confirm-cancel-btn');
                const closeBtn = document.getElementById('custom-confirm-close-btn');

                messageEl.textContent = message;
                modal.classList.remove('hidden');

                const cleanup = () => {
                    modal.classList.add('hidden');
                    okBtn.removeEventListener('click', handleOk);
                    cancelBtn.removeEventListener('click', handleCancel);
                    closeBtn.removeEventListener('click', handleCancel);
                };

                const handleOk = () => {
                    cleanup();
                    resolve(true);
                };

                const handleCancel = () => {
                    cleanup();
                    resolve(false);
                };

                okBtn.addEventListener('click', handleOk);
                cancelBtn.addEventListener('click', handleCancel);
                closeBtn.addEventListener('click', handleCancel);
            });
        }

        /**
         * Custom Alert Dialog - Replaces browser's alert()
         * Returns a Promise that resolves when OK is clicked
         */
        function customAlert(message, title = '提示', type = 'info') {
            return new Promise((resolve) => {
                const modal = document.getElementById('custom-alert-modal');
                const titleEl = document.getElementById('custom-alert-title');
                const messageEl = document.getElementById('custom-alert-message');
                const iconContainer = document.getElementById('custom-alert-icon-container');
                const icon = document.getElementById('custom-alert-icon');
                const okBtn = document.getElementById('custom-alert-ok-btn');
                const closeBtn = document.getElementById('custom-alert-close-btn');

                titleEl.textContent = title;
                messageEl.textContent = message;

                // Set icon and color based on type
                iconContainer.className = 'mx-auto mb-4 w-16 h-16 flex items-center justify-center rounded-full';
                icon.className = 'text-4xl';

                switch (type) {
                    case 'success':
                        iconContainer.classList.add('bg-green-100');
                        icon.classList.add('fas', 'fa-check-circle', 'text-green-600');
                        break;
                    case 'error':
                        iconContainer.classList.add('bg-red-100');
                        icon.classList.add('fas', 'fa-times-circle', 'text-red-600');
                        break;
                    case 'warning':
                        iconContainer.classList.add('bg-yellow-100');
                        icon.classList.add('fas', 'fa-exclamation-triangle', 'text-yellow-600');
                        break;
                    default: // info
                        iconContainer.classList.add('bg-blue-100');
                        icon.classList.add('fas', 'fa-info-circle', 'text-blue-600');
                        break;
                }

                modal.classList.remove('hidden');

                const cleanup = () => {
                    modal.classList.add('hidden');
                    okBtn.removeEventListener('click', handleOk);
                    closeBtn.removeEventListener('click', handleOk);
                };

                const handleOk = () => {
                    cleanup();
                    resolve();
                };

                okBtn.addEventListener('click', handleOk);
                closeBtn.addEventListener('click', handleOk);
            });
        }

        function clearAllQuestionBanks() {
            if (!classroomCode) {
                console.warn('無法清除題庫：教室代碼為空');
                return;
            }

            // 僅清除記憶體中的變數 (這些會在重新進入教室時重新載入)
            questionBanks = [];
            sequencingQuestionBanks = [];
            matchingQuestionBanks = [];
            readingQuestionBanks = [];

            console.log(`✓ 已重置記憶體中的題庫陣列，本機儲存 (LocalStorage) 中的題庫已安全保留。`);
        }

        /**
         * 手動一鍵清空本教室所有 LocalStorage 中的題庫與內存題庫
         */
        async function manualClearAllQuestionBanks() {
            if (!classroomCode) {
                showMessage('請先進入教室再使用此功能。', 'error');
                return;
            }
            const confirmed = await customConfirm("確定要刪除本教室已儲存的所有題庫嗎？此操作無法復原。");
            if (confirmed) {
                const currentClassroom = classroomCode;
                // 刪除 LocalStorage 題庫
                localStorage.removeItem(`questionBanks_${currentClassroom}`);
                localStorage.removeItem(`sequencingBanks_${currentClassroom}`);
                localStorage.removeItem(`matchingBanks_${currentClassroom}`);
                localStorage.removeItem(`readingQuestionBanks_${currentClassroom}`);
                
                // 清空記憶體
                questionBanks = [];
                sequencingQuestionBanks = [];
                matchingQuestionBanks = [];
                readingQuestionBanks = [];
                
                // 更新所有題庫列表 UI
                updateQuestionBankList();
                updateSequencingBankList();
                updateMatchingBankList();
                updateReadingBankList();
                
                showMessage('已成功清空本教室的所有題庫！', 'success');
            }
        }

        /**
         * Hides the custom message box.
         */
        function hideMessage() {
            document.getElementById('message-box').classList.add('hidden');
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        /**
         * Prevent pull-to-refresh on iOS/iPadOS devices
         */
        let pullToRefreshHandler = null;
        let touchStartY = 0;

        function enablePullToRefreshPrevention() {
            // Remove existing handlers if any
            if (pullToRefreshHandler) {
                document.removeEventListener('touchstart', pullToRefreshHandler.start);
                document.removeEventListener('touchmove', pullToRefreshHandler.move, { passive: false });
            }

            // Track touch start position
            const handleTouchStart = function (e) {
                touchStartY = e.touches[0].clientY;
            };

            // Prevent pull-to-refresh only when pulling down from non-scrollable area
            const handleTouchMove = function (e) {
                const readingContainer = document.getElementById('interaction-reading-comprehension');
                if (!readingContainer || readingContainer.classList.contains('hidden')) {
                    return;
                }

                const touchY = e.touches[0].clientY;
                const touchDelta = touchY - touchStartY;

                // Get the target element that was touched
                const target = e.target;

                // Find if the target is inside a scrollable container
                let scrollableParent = null;
                let element = target;

                while (element && element !== readingContainer) {
                    const overflowY = window.getComputedStyle(element).overflowY;
                    if (overflowY === 'auto' || overflowY === 'scroll') {
                        scrollableParent = element;
                        break;
                    }
                    element = element.parentElement;
                }

                // If inside a scrollable container
                if (scrollableParent) {
                    const isAtTop = scrollableParent.scrollTop === 0;
                    const isPullingDown = touchDelta > 0;

                    // Only prevent if at the top AND pulling down
                    if (isAtTop && isPullingDown) {
                        e.preventDefault();
                    }
                } else {
                    // Not in a scrollable container, prevent pull-to-refresh
                    if (touchDelta > 0) {
                        e.preventDefault();
                    }
                }
            };

            pullToRefreshHandler = {
                start: handleTouchStart,
                move: handleTouchMove
            };

            // Add event listeners
            document.addEventListener('touchstart', pullToRefreshHandler.start, { passive: true });
            document.addEventListener('touchmove', pullToRefreshHandler.move, { passive: false });
            console.log('[Pull-to-Refresh] Prevention enabled');
        }

        function disablePullToRefreshPrevention() {
            if (pullToRefreshHandler) {
                document.removeEventListener('touchstart', pullToRefreshHandler.start);
                document.removeEventListener('touchmove', pullToRefreshHandler.move, { passive: false });
                pullToRefreshHandler = null;
                console.log('[Pull-to-Refresh] Prevention disabled');
            }
        }

        // ==================== 跨課堂本地題庫（Global Bank Library） ====================
        // 每種題庫除了存在「該課堂代碼」的 localStorage 鍵之外，也會鏡射(merge)到一個
        // 與課堂代碼無關的「本地題庫」鍵。如此同一台電腦在任何課堂代碼下都能匯入先前存過的題庫。
        const BANK_REGISTRY = {
            mc:      { globalKey: 'questionBanks_global',        selectId: 'mc-global-bank-select',      getArr: () => questionBanks,           setArr: a => { questionBanks = a; },           save: saveQuestionBanksToStorage,   refresh: updateQuestionBankList,   load: loadQuestionBanksFromStorage },
            seq:     { globalKey: 'sequencingBanks_global',      selectId: 'seq-global-bank-select',     getArr: () => sequencingQuestionBanks, setArr: a => { sequencingQuestionBanks = a; }, save: saveSequencingBanksToStorage, refresh: updateSequencingBankList, load: loadSequencingBanksFromStorage },
            match:   { globalKey: 'matchingBanks_global',        selectId: 'match-global-bank-select',   getArr: () => matchingQuestionBanks,   setArr: a => { matchingQuestionBanks = a; },   save: saveMatchingBanksToStorage,   refresh: updateMatchingBankList,   load: loadMatchingBanksFromStorage },
            reading: { globalKey: 'readingQuestionBanks_global', selectId: 'reading-global-bank-select', getArr: () => readingQuestionBanks,    setArr: a => { readingQuestionBanks = a; },    save: saveReadingBanksToStorage,    refresh: updateReadingBankList,    load: loadReadingBanksFromStorage },
        };

        function readGlobalBanks(globalKey) {
            try { return JSON.parse(localStorage.getItem(globalKey) || '[]'); } catch (e) { return []; }
        }
        function writeGlobalBanks(globalKey, banks) {
            try { localStorage.setItem(globalKey, JSON.stringify(banks)); } catch (e) { console.error('儲存本地題庫失敗:', e); }
        }
        // Merge a classroom's banks into the cross-classroom library (upsert by name).
        function mirrorBanksToGlobal(globalKey, banks) {
            const g = readGlobalBanks(globalKey);
            (banks || []).forEach(b => {
                const i = g.findIndex(x => x.name === b.name);
                if (i !== -1) g[i] = b; else g.push(b);
            });
            writeGlobalBanks(globalKey, g);
        }
        // Fill the cross-classroom <select> for one bank type.
        function populateGlobalBankSelect(type) {
            const cfg = BANK_REGISTRY[type];
            const sel = document.getElementById(cfg.selectId);
            if (!sel) return;
            const g = readGlobalBanks(cfg.globalKey);
            sel._globalBanks = g;
            const prev = sel.value;
            sel.innerHTML = '<option value="">-- 選擇本地題庫 --</option>' +
                g.map((b, i) => `<option value="${i}">${escapeHtml(b.name)}</option>`).join('');
            if (prev !== '' && parseInt(prev) < g.length) sel.value = prev;
        }
        // Import the selected global bank into the current classroom's bank list.
        function importGlobalBank(type) {
            const cfg = BANK_REGISTRY[type];
            if (!classroomCode) { showMessage('請先進入教室再匯入題庫', 'error'); return; }
            const sel = document.getElementById(cfg.selectId);
            if (!sel || sel.value === '') { showMessage('請先選擇要匯入的本地題庫', 'error'); return; }
            const bank = (sel._globalBanks || [])[parseInt(sel.value)];
            if (!bank) return;
            cfg.load();
            const arr = cfg.getArr();
            const i = arr.findIndex(b => b.name === bank.name);
            if (i !== -1) arr[i] = { ...bank }; else arr.push({ ...bank });
            cfg.save();
            cfg.refresh();
            showMessage(`已匯入本地題庫「${bank.name}」，可於上方清單載入派送`, 'success');
        }
        // Delete the selected bank from the cross-classroom library (classroom banks unaffected).
        async function deleteGlobalBank(type) {
            const cfg = BANK_REGISTRY[type];
            const sel = document.getElementById(cfg.selectId);
            if (!sel || sel.value === '') { showMessage('請先選擇要刪除的本地題庫', 'error'); return; }
            const bank = (sel._globalBanks || [])[parseInt(sel.value)];
            if (!bank) return;
            const confirmed = await customConfirm(`確定要從「本地題庫」永久刪除「${bank.name}」嗎？（已匯入課堂的題庫不受影響）`);
            if (!confirmed) return;
            writeGlobalBanks(cfg.globalKey, readGlobalBanks(cfg.globalKey).filter(b => b.name !== bank.name));
            populateGlobalBankSelect(type);
            showMessage(`已從本地題庫刪除「${bank.name}」`, 'success');
        }
        window.importGlobalBank = importGlobalBank;
        window.deleteGlobalBank = deleteGlobalBank;
