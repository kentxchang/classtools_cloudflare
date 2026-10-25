        // =====================================================================
        // 【主畫面配置 — 互動模式派送與學生作答收集】 modules/main/interaction.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        // =====================================================================

        // --- Firebase Functions ---

        /**
         * (Teacher) Sets the current interaction mode and clears old student response data.
         * @param {string} mode - 'true_false', 'multiple_choice', 'text_input', 'drawing', 'url_dispatch', 'recording', or 'waiting'.
         * @param {object} [options={}] - Optional settings for the mode, e.g., custom questions.
         */
        async function setInteractionMode(mode, options = {}) {
            console.log(`[Teacher] Setting mode to: ${mode}`);
            currentInteractionMode = mode;

            // 記錄互動歷程
            const modeNames = {
                'waiting': '等待中',
                'true_false': '是非題',
                'multiple_choice': '選擇題',
                'text_input': '文字輸入',
                'word_cloud': '文字雲',
                'sticky_note': '便利貼牆',
                'focus_game': '專注力遊戲',
                'drawing': '繪圖板',
                'url_dispatch': '網頁派送',
                'recording': '錄音答題',
                'reading_comprehension': '閱讀測驗',
                'quick_answer': '搶答',
                'quick_poll': '快速投票',
                'sequencing': '排序題',
                'matching': '配對題',
                'calc': '計算題',
                'hotspot': '圖片點選題'
            };
            
            if (mode !== 'waiting') {
                const toolName = modeNames[mode] || mode;
                let details = {};
                
                // 收集各模式的題目細節
                if (mode === 'multiple_choice' && options.customQuestions) {
                    details.questions = options.customQuestions;
                } else if (mode === 'sequencing' && options.question && options.correctOrder) {
                    details.question = options.question;
                    details.correctOrder = options.correctOrder;
                } else if (mode === 'matching' && options.question && options.pairs) {
                    details.question = options.question;
                    details.pairs = options.pairs;
                } else if (mode === 'reading_comprehension' && options.readingData) {
                    details.text = options.readingData.text;
                    details.questions = options.readingData.questions;
                } else if (mode === 'focus_game' && options.numberCount) {
                    details.numberCount = options.numberCount;
                } else if (mode === 'url_dispatch') {
                    details.dispatchSettings = dispatchSettings;
                } else if (mode === 'hotspot') {
                    details.questionImage = teacherUploadedBackgroundImageDataURL || null; // 16 圖片點選題：歷程中畫熱點圖用
                }
                
                logClassroomHistory('interaction', toolName, details, mode);
            }
            // Use classroomCode in the Firestore path
            const controlRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'settings', 'control');
            const showStatisticsBtn = document.getElementById('show-statistics-btn');
            const downloadMediaBtn = document.getElementById('download-media-btn');
            const aiTextSummaryBtn = document.getElementById('ai-text-summary-btn');
            const showUnsubmittedStudentsBtn = document.getElementById('show-unsubmitted-students-btn'); // NEW
            const viewQuestionsBtn = document.getElementById('view-questions-btn'); // NEW
            const viewReadingQuestionsBtn = document.getElementById('view-reading-questions-btn'); // NEW
            const downloadResponsesBtn = document.getElementById('download-responses-btn'); // NEW

            // MODIFIED: Show statistics button for true_false, multiple_choice, and reading_comprehension
            showStatisticsBtn.classList.toggle('hidden', mode !== 'true_false' && mode !== 'multiple_choice' && mode !== 'reading_comprehension');

            // NEW: Show view questions button only for multiple_choice with custom questions
            const hasCustomQuestions = mode === 'multiple_choice' && options.customQuestions && options.customQuestions.length > 0;
            viewQuestionsBtn.classList.toggle('hidden', !hasCustomQuestions);

            // NEW: Show view reading questions button only for reading_comprehension
            viewReadingQuestionsBtn.classList.toggle('hidden', mode !== 'reading_comprehension');

            // NEW: Show peer review button only for text_input and drawing modes
            const startPeerReviewBtn = document.getElementById('start-peer-review-btn');
            startPeerReviewBtn.classList.toggle('hidden', mode !== 'text_input' && mode !== 'drawing');

            // NEW: Reset peer review button state when starting new interaction
            if (mode !== 'waiting') {
                peerReviewActive = false;
                startPeerReviewBtn.innerHTML = '<i class="fas fa-heart mr-2"></i> 開始互評 ❤️';
                document.getElementById('peer-review-stats-container').classList.add('hidden');

                // Reset peer review status in Firebase for new interaction
                const peerReviewRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'settings', 'peerReview');
                setDoc(peerReviewRef, { active: false }).catch(error => {
                    console.error('Error resetting peer review status:', error);
                });

                // Clear student voting history for new interaction
                studentVotedWorks.clear();

                // Clear saved canvas state for new interaction
                savedCanvasState = null;

                // Don't clear starred works here - keep them across peer review sessions
                // Only reset the filter to show all works
                showOnlyStarred = false;
            }
            downloadMediaBtn.classList.toggle('hidden', mode !== 'drawing' && mode !== 'recording' && mode !== 'calc' && mode !== 'hotspot' && mode !== 'url_dispatch');
            aiTextSummaryBtn.classList.toggle('hidden', mode !== 'text_input');
            // NEW: Show unsubmitted students button for specific modes
            showUnsubmittedStudentsBtn.classList.toggle('hidden', mode === 'waiting' || mode === 'url_dispatch');
            // NEW: Show download responses button for text_input, multiple_choice with custom questions, and reading_comprehension
            const showDownloadBtn = mode === 'text_input' || (mode === 'multiple_choice' && hasCustomQuestions) || mode === 'reading_comprehension';
            downloadResponsesBtn.classList.toggle('hidden', !showDownloadBtn);


            // NEW: Hide pause button for URL/HTML dispatch modes
            const togglePauseBtn = document.getElementById('toggle-pause-btn');
            togglePauseBtn.classList.toggle('hidden', mode === 'url_dispatch');

            // WORD CLOUD: For word_cloud mode, hide all buttons except unsubmitted students button
            if (mode === 'word_cloud') {
                showStatisticsBtn.classList.add('hidden');
                viewQuestionsBtn.classList.add('hidden');
                viewReadingQuestionsBtn.classList.add('hidden');
                startPeerReviewBtn.classList.add('hidden');
                downloadMediaBtn.classList.add('hidden');
                aiTextSummaryBtn.classList.add('hidden');
                downloadResponsesBtn.classList.add('hidden');
                togglePauseBtn.classList.add('hidden');
                // Keep showUnsubmittedStudentsBtn visible
                showUnsubmittedStudentsBtn.classList.remove('hidden');
            }

            // STICKY NOTE: For sticky_note mode, hide all buttons except unsubmitted students button
            if (mode === 'sticky_note') {
                showStatisticsBtn.classList.add('hidden');
                viewQuestionsBtn.classList.add('hidden');
                viewReadingQuestionsBtn.classList.add('hidden');
                startPeerReviewBtn.classList.add('hidden');
                downloadMediaBtn.classList.add('hidden');
                aiTextSummaryBtn.classList.add('hidden');
                downloadResponsesBtn.classList.add('hidden');
                togglePauseBtn.classList.add('hidden');
                showUnsubmittedStudentsBtn.classList.remove('hidden');
            }


            try {
                // Clear previous student responses unless it's a waiting state.
                if (mode !== 'waiting') {
                    // 伺服器端一次清空，不需先下載全部作答（含圖片）再逐筆刪除
                    const studentsColRef = collection(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'studentResponses');
                    await deleteTree(studentsColRef);
                    // 05 繪圖題：一併清空上一輪的畫筆重播資料
                    await deleteTree(collection(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'drawingReplays'));
                    // 15 計算題：一併清空上一輪的逐頁筆跡
                    await deleteTree(collection(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'calcAnswers'));
                    console.log("[Teacher] Cleared all previous student responses.");
                    lastSelectedStudentCard = null; // Clear highlight on monitor view
                }

                // Prepare data payload for Firestore.
                currentRound = String(Date.now()); // V6.2: 每輪互動唯一編號
                const payload = {
                    active_mode: mode,
                    round: currentRound,
                    teacherId: userId, // Store teacher ID
                    isPaused: isResponsePaused // Use current local pause state
                };

                // MODIFIED: Add combined dispatch settings if in that mode.
                if (mode === 'url_dispatch') {
                    payload.dispatchSettings = dispatchSettings; // Send the entire dispatchSettings object
                } else {
                    payload.dispatchSettings = null; // Clear dispatch settings if not in URL_DISPATCH mode
                }

                // NEW: Add custom multiple choice questions if in that mode.
                // If mode is multiple_choice and options.customQuestions is explicitly null, it means no custom questions.
                if (mode === 'multiple_choice' && options.hasOwnProperty('customQuestions')) {
                    payload.multiple_choice_questions = options.customQuestions;
                } else {
                    payload.multiple_choice_questions = null; // Clear if not multiple_choice mode or if customQuestions not provided
                }
                currentMultipleChoiceQuestions = payload.multiple_choice_questions; // Update global for teacher monitor

                // NEW: Add sequencing settings if in that mode
                if (mode === 'sequencing' && options.question && options.correctOrder) {
                    payload.sequencingSettings = {
                        question: options.question,
                        correctOrder: options.correctOrder
                    };
                } else {
                    payload.sequencingSettings = null;
                }

                // NEW: Add matching settings if in that mode
                if (mode === 'matching' && options.question && options.pairs) {
                    payload.matchingSettings = {
                        question: options.question,
                        pairs: options.pairs
                    };
                } else {
                    payload.matchingSettings = null;
                }

                // NEW: Add reading comprehension data if in that mode
                if (mode === 'reading_comprehension' && options.readingData) {
                    payload.readingComprehensionData = options.readingData;
                } else {
                    payload.readingComprehensionData = null;
                }

                // NEW: Add focus game settings if in that mode
                if (mode === 'focus_game' && options.numberCount) {
                    payload.focusGameSettings = {
                        numberCount: options.numberCount
                    };
                } else {
                    payload.focusGameSettings = null;
                }

                // V6.2: 防止 payload 超過 Firestore 單一文件 1MB 上限（如 HTML 派送內容過大時全班收不到）
                try {
                    if (JSON.stringify(payload).length > 900000) {
                        showMessage('派送內容過大（接近資料庫單筆上限），請縮減內容後再試。', 'error');
                        return;
                    }
                } catch (e) { /* ignore */ }
                if (mode === 'drawing' || mode === 'calc' || mode === 'hotspot') await sendDrawingBackground(); // 05 繪圖題 / 15 計算題 / 16 圖片點選題：背景圖（題目）另存，先於派送設定寫入
                await setDoc(controlRef, payload, { merge: true });

                // Handle student responses listener based on mode
                if (studentResponsesUnsubscribe) {
                    studentResponsesUnsubscribe();
                    studentResponsesUnsubscribe = null;
                }
                stopDispatchScreenshotListener(); // 06 派送網址/HTML：停止上一輪的學生截圖監聽

                if (mode === 'url_dispatch') { // Now handles both URL and HTML
                    // For URL/HTML dispatch, the monitor view shows online students, handled by presence listener.
                    // Clear existing responses display if any.
                    document.getElementById('student-responses-container').innerHTML = '<p class="text-gray-500 text-center col-span-full">正在等待學生作答...</p>';
                    listenToDispatchScreenshots(); // 學生在派送的 HTML 畫面按「截圖送出」的圖片
                } else if (mode === 'waiting') {
                    // When going to 'waiting' mode, ensure the student responses container is cleared
                    // and shows the "waiting" message.
                    document.getElementById('student-responses-container').innerHTML = '<p class="text-gray-500 text-center col-span-full">正在等待學生作答...</p>';
                } else { // For other interaction modes (true_false, multiple_choice, text_input, drawing, recording, quick_answer)
                    listenToStudentSubmissions(mode); // Ensure this listener is active
                }

            } catch (error) {
                console.error("設定互動模式或清除學生資料失敗:", error);
                showMessage("操作失敗，請檢查網路連線或聯繫管理員。", "error");
            }
        }

        /**
         * (Student) Listens for changes in the teacher's interaction mode and switches the student interface accordingly.
         */
        function listenToInteractionMode() {
            // Use classroomCode in the Firestore path
            const controlRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'settings', 'control');
            // Ensure only one interaction mode listener is active for the student
            if (interactionModeUnsubscribe) interactionModeUnsubscribe();
            listenToDrawingBackground(); // 05 繪圖題：背景圖另外監聽

            interactionModeUnsubscribe = onSnapshot(controlRef, async (docSnap) => {
                const studentPauseOverlay = document.getElementById('student-pause-overlay');
                const interactionMultipleChoice = document.getElementById('interaction-multiple-choice'); // Get the MC container

                if (!docSnap.exists()) {
                    // Teacher has ended the class session (control document deleted)
                    console.log("[Student] Teacher has ended the class session.");
                    classroomCode = null; // Clear student's classroom code
                    studentName = null; // Clear student's name
                    document.getElementById('user-id-display').textContent = userId; // Reset user ID display
                    showMessage('老師已結束課程，請重新選擇角色。', 'info');
                    showView('entry'); // Go back to the initial entry screen
                    // Unsubscribe from student responses and presence if they were active
                    if (studentResponsesUnsubscribe) {
                        studentResponsesUnsubscribe();
                        studentResponsesUnsubscribe = null;
                    }
                    // IMPORTANT: Unsubscribe student's presence listener as well when class ends
                    if (classroomPresenceUnsubscribe) {
                        classroomPresenceUnsubscribe();
                        classroomPresenceUnsubscribe = null;
                    }
                    studentPauseOverlay.classList.add('hidden'); // Hide overlay if class ends
                    currentInteractionMode = null; // Reset global mode for student
                    isResponsePaused = false; // Reset global pause state for student
                    return; // Exit the function as the session is over
                }

                const data = docSnap.data();
                currentRound = data.round || null; // V6.2: 記錄目前互動輪次
                const newMode = data.active_mode || 'waiting';
                // CTP：白板/簡報模式 → 開啟同步子系統（學生），其餘模式關閉之
                if (currentRole !== 'teacher' && (newMode === 'whiteboard' || newMode === 'presentation')) {
                    currentInteractionMode = newMode;
                    // CTP 子系統腳本可能還沒載入完成 (window.__CTP 尚未存在)，
                    // 若此時放棄，老師之後翻頁不會再寫 control 文件，
                    // 這位學生就會永遠停在等待畫面 (「有些學生沒有同步」)。
                    // 因此改為等候子系統就緒後再掛載。
                    mountCTPStudentWhenReady(newMode);
                    return;
                } else if (window.__CTP && window.__CTP.cur) {
                    window.__CTP.close();
                }
                const newIsResponsePaused = data.isPaused || false;
                const newMultipleChoiceQuestions = data.multiple_choice_questions || null;

                // Determine if the interaction mode itself has changed
                const modeChanged = (currentInteractionMode !== newMode);
                // Determine if the pause state has changed within the same mode
                const pauseStateChanged = (currentInteractionMode === newMode && isResponsePaused !== newIsResponsePaused);
                // Determine if we are resuming from a pause (mode is same, was paused, now not paused)
                const isResumingFromPause = (currentInteractionMode === newMode) && isResponsePaused && !newIsResponsePaused;


                // Update global states *before* acting on them
                currentInteractionMode = newMode;
                isResponsePaused = newIsResponsePaused;
                currentMultipleChoiceQuestions = newMultipleChoiceQuestions; // Update custom MC questions


                console.log(`[Student] Detected mode: ${currentInteractionMode}, Paused: ${isResponsePaused}, Mode Changed: ${modeChanged}, pauseStateChanged: ${pauseStateChanged}`);

                if (currentInteractionMode === 'waiting') {
                    showView('studentWaiting');
                    studentPauseOverlay.classList.add('hidden'); // Hide overlay in waiting view
                } else {
                    showView('studentInteraction');

                    // Call showInteractionUI if mode changed OR if this is the first time entering this mode
                    // We determine "first time" by checking if any interaction UI is currently visible
                    const anyUIVisible = Object.values(interactionUIs).some(ui => !ui.classList.contains('hidden'));

                    if (modeChanged || !anyUIVisible) {
                        showInteractionUI(currentInteractionMode, false); // Not resuming from pause if mode changed
                    }
                    // If mode hasn't changed and a UI is already visible, we don't need to call showInteractionUI
                    // This preserves the DOM state (including content) during pause/resume


                    console.log('[Student] Setting pause overlay, isResponsePaused:', isResponsePaused);
                    if (isResponsePaused) {
                        studentPauseOverlay.classList.remove('hidden');
                        toggleStudentInteractionElements(true); // Disable elements if paused
                    } else {
                        studentPauseOverlay.classList.add('hidden');
                        toggleStudentInteractionElements(false); // Enable elements if not paused
                    }

                    // Specific UI updates that need to happen on every snapshot change
                    if (currentInteractionMode === 'drawing') {
                        requestAnimationFrame(() => {
                            // BUG FIX: Only call setupCanvas (which resizes and clears the drawing canvas)
                            // when the mode truly changes to 'drawing'.
                            // On other updates (like pause/resume or background image change),
                            // we only need to reload images and redraw the combined canvas,
                            // preserving the student's existing drawing.
                            if (modeChanged) {
                                setupCanvas();
                            }
                            loadBackgroundImage(); // Reload background in case teacher changed it
                            loadStudentImage();    // Reload student-uploaded image
                            drawCombinedCanvas();  // Redraw all layers
                        });
                    } else if (currentInteractionMode === 'url_dispatch') { // This mode now handles both URL and HTML
                        const currentDispatchSettings = data.dispatchSettings; // Get the combined settings
                        if (currentDispatchSettings) {
                            if (currentDispatchSettings.type === 'url' && currentDispatchSettings.url) {
                                displayDispatchedUrl(currentDispatchSettings);
                            } else if (currentDispatchSettings.type === 'html' && currentDispatchSettings.htmlContent) {
                                displayDispatchedHtml(currentDispatchSettings.htmlContent);
                            }
                        }
                    } else if (currentInteractionMode === 'multiple_choice') { // NEW: Handle custom multiple choice questions
                        await renderMultipleChoiceQuestions(currentMultipleChoiceQuestions);
                        // Apply/remove enlarged-buttons class based on whether custom questions exist
                        if (!currentMultipleChoiceQuestions || currentMultipleChoiceQuestions.length === 0) {
                            interactionMultipleChoice.classList.add('enlarged-buttons');
                        } else {
                            interactionMultipleChoice.classList.remove('enlarged-buttons');
                        }
                    } else if (currentInteractionMode === 'sequencing') {
                        const sequencingSettings = data.sequencingSettings;
                        if (sequencingSettings && modeChanged) {
                            setupSequencingUI(sequencingSettings);
                        }
                    } else if (currentInteractionMode === 'matching') {
                        const matchingSettings = data.matchingSettings;
                        if (matchingSettings && modeChanged) {
                            setupMatchingUI(matchingSettings);
                        }
                    } else if (currentInteractionMode === 'reading_comprehension') {
                        const readingData = data.readingComprehensionData;
                        // Always display if we have data and (mode changed OR resuming from pause OR pause state changed)
                        if (readingData && (modeChanged || isResumingFromPause || pauseStateChanged)) {
                            console.log('[Student] Displaying reading comprehension, modeChanged:', modeChanged, 'isResumingFromPause:', isResumingFromPause, 'pauseStateChanged:', pauseStateChanged);
                            displayReadingComprehensionForStudent(readingData);
                            // Only reset submit button if mode changed (not when resuming from pause)
                            if (modeChanged) {
                                document.getElementById('submit-reading-btn').disabled = false;
                            }
                        }
                    } else if (currentInteractionMode === 'focus_game') {
                        const focusGameSettings = data.focusGameSettings;
                        if (focusGameSettings && modeChanged) {
                            initializeFocusGame(focusGameSettings.numberCount);
                        } else if (modeChanged) {
                            // Use default if no settings provided
                            initializeFocusGame(36);
                        }
                    } else if (currentInteractionMode === 'quick_poll') {
                        if (modeChanged) {
                            listenToQuickPollConfig();
                        }
                    } else if (currentInteractionMode === 'calc') { // 15 計算題
                        if (modeChanged) initCalc();
                        updateCalcPaused(isResponsePaused);
                    } else if (currentInteractionMode === 'hotspot') { // 16 圖片點選題
                        if (modeChanged) initHotspotStudent();
                    }
                }
            }, (error) => {
                console.error("[Student] Error listening to interaction mode:", error);
                // This error might indicate a network issue or permission denied, not necessarily class end.
                // So, keep the student in waiting view or current view, and just show an error.
                showMessage("無法接收老師指令，請檢查網路連線。", "error");
            });
        }

        /**
         * (Student) 等 CTP 子系統 (同步白板/簡報) 載入完成後再掛載學生端畫面。
         * 子系統腳本需從 CDN 載入 Firebase 模組，可能比 control 快照晚就緒。
         */
        function mountCTPStudentWhenReady(mode, attempt = 0) {
            if (window.__CTP) {
                window.__CTP.mountStudent(mode);
                return;
            }
            if (attempt >= 100) {
                console.warn('[Student] CTP 子系統載入逾時，無法掛載同步模式:', mode);
                showMessage('同步模組載入逾時，請重新整理頁面。', 'error');
                return;
            }
            setTimeout(() => {
                // 等待期間老師可能已切換離開同步模式，屆時放棄掛載
                if (currentInteractionMode === mode) mountCTPStudentWhenReady(mode, attempt + 1);
            }, 200);
        }


        /**
         * (Student) Submits the answer to Firestore.
         * @param {string | object} answer - The student's answer.
         * @returns {Promise<boolean>} 是否送出成功（15 計算題用來決定是否顯示「已送出」）
         */
        async function submitAnswer(answer) {
            // NEW: Prevent submission if paused
            if (isResponsePaused) {
                showMessage('老師已暫停回覆，無法送出答案。', 'error');
                return false;
            }

            if (!studentName || !userId || !classroomCode) {
                console.error("Student name, User ID, or Classroom Code not set. Cannot submit answer.");
                showMessage("學生姓名、用戶ID或教室代碼未設定，無法送出答案。", "error");
                return false;
            }
            // Use classroomCode in the Firestore path
            // V6.2: 文件 id 改用 userId（原為 studentName）— 同名學生不再互相覆蓋答案
            const studentRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'studentResponses', userId);
            try {
                await setDoc(studentRef, {
                    name: studentName,
                    answer: answer,
                    round: currentRound || null, // V6.2: 標記本輪互動編號
                    timestamp: serverTimestamp() // V6.2: 改用伺服器時間，搶答排名不受裝置時鐘影響
                }, { merge: true });
                console.log(`[Student] ${studentName} submitted answer:`, answer);
                showMessage('回答已送出！', 'success');
                return true;
            } catch (error) {
                console.error("送出答案失敗:", error);
                const errMsg = String((error && error.message) || '');
                if (errMsg.indexOf('longer than') !== -1 || errMsg.indexOf('maximum allowed size') !== -1 || errMsg.indexOf('1048487') !== -1) {
                    showMessage("送出失敗：作品內容過大（超過資料庫單筆上限），請簡化內容後重試。", "error");
                } else {
                    showMessage("送出答案失敗，請檢查網路連線。", "error");
                }
                return false;
            }
        }

        /**
         * 將各種形式的 timestamp (Firestore Timestamp / Date / 字串) 轉為毫秒數以便排序比較。
         */
        function getResponseTimeMs(t) {
            if (!t) return 0;
            if (typeof t.toMillis === 'function') return t.toMillis();
            if (typeof t.seconds === 'number') return t.seconds * 1000;
            const d = new Date(t);
            return isNaN(d.getTime()) ? 0 : d.getTime();
        }

        /**
         * (Teacher) Listens for all student submissions and dynamically displays them.
         * @param {string} mode - The current interaction mode, used to determine the answer type.
         */
        function listenToStudentSubmissions(mode) {
            if (studentResponsesUnsubscribe) studentResponsesUnsubscribe();
            if (responsesRenderTimer) { clearTimeout(responsesRenderTimer); responsesRenderTimer = null; } // V6.2
            pendingResponsesSnapshot = null;

            // Load starred works for this interaction
            loadStarredWorks();
            responsesShowOnlyStarred = false; // Reset filter
            updateResponsesFilterButton();

            // Use classroomCode in the Firestore path
            const studentsColRef = collection(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'studentResponses');
            const container = document.getElementById('student-responses-container');
            const wordCloudDisplay = document.getElementById('word-cloud-display');
            const stickyNoteWall = document.getElementById('sticky-note-wall');
            const focusGameResults = document.getElementById('focus-game-results');

            // Show/hide appropriate display based on mode
            if (mode === 'word_cloud') {
                container.classList.add('hidden');
                wordCloudDisplay.classList.remove('hidden');
                stickyNoteWall.classList.add('hidden');
                focusGameResults.classList.add('hidden');
                // Clear word cloud SVG when starting fresh
                updateWordCloud([]);
            } else if (mode === 'sticky_note') {
                container.classList.add('hidden');
                wordCloudDisplay.classList.add('hidden');
                stickyNoteWall.classList.remove('hidden');
                focusGameResults.classList.add('hidden');
                // Clear sticky notes when starting fresh
                clearStickyNotes();
                // Trigger canvas initialization via custom event
                setTimeout(() => {
                    const event = new CustomEvent('initStickyCanvas');
                    window.dispatchEvent(event);
                }, 100);
            } else if (mode === 'focus_game') {
                container.classList.add('hidden');
                wordCloudDisplay.classList.add('hidden');
                stickyNoteWall.classList.add('hidden');
                focusGameResults.classList.remove('hidden');
                // Clear focus game results when starting fresh
                clearFocusGameResults();
            } else {
                container.classList.remove('hidden');
                wordCloudDisplay.classList.add('hidden');
                stickyNoteWall.classList.add('hidden');
                focusGameResults.classList.add('hidden');
            }
            // 16 圖片點選題：以熱點圖取代作答卡片
            document.getElementById('hotspot-display').classList.toggle('hidden', mode !== 'hotspot');
            if (mode === 'hotspot') {
                container.classList.add('hidden');
                initHotspotDisplay();
            }

            const renderStudentResponsesSnapshot = (querySnapshot) => {
                container.innerHTML = '';
                lastSelectedStudentCard = null;

                // REMOVED: document.getElementById('responded-student-count').textContent = querySnapshot.size; 

                if (querySnapshot.empty) {
                    if (mode !== 'url_dispatch') {
                        container.innerHTML = '<p class="text-gray-500 text-center col-span-full">正在等待學生作答...</p>';
                    }
                    allStudentResponses = [];
                    clearStudentsByAnswerList();
                    return;
                }

                let responses = [];
                querySnapshot.forEach((doc) => {
                    const student = doc.data();
                    // V6.2: 只顯示目前輪次的作答，上一輪殘留答案不再混入
                    if (currentRound && student.round && student.round !== currentRound) return;
                    drawingReplayIds.set(student, doc.id); // 05 繪圖題：重播資料以學生 userId（文件 id）存放
                    responses.push(student);
                });

                // 【記錄學生的作答歷程】
                // 重要：此時畫面已被清空 (container.innerHTML = '')，若這裡拋出例外
                // (例如 localStorage 空間不足)，後面的卡片重建就不會執行，
                // 教師端畫面會呈現空白 (學生回應「消失」)。因此必須獨立保護。
                try {
                    updateClassroomHistoryResponses(responses);
                } catch (e) {
                    console.warn('記錄作答歷程失敗（不影響畫面顯示）:', e);
                }

                // Apply sorting
                if (responsesSortMethod === 'name') {
                    responses.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-TW'));
                } else {
                    // Sort by timestamp (most recent first) - default
                    // 注意：Firestore 的 timestamp 是 Timestamp 物件，直接相減會得到 NaN，
                    // 需先轉成毫秒數再比較，否則人數多時排序會失效。
                    responses.sort((a, b) => getResponseTimeMs(b.timestamp) - getResponseTimeMs(a.timestamp));
                }

                // Apply starred filter
                if (responsesShowOnlyStarred) {
                    responses = responses.filter(student => {
                        const workId = `${student.name}-${student.timestamp || responses.indexOf(student)}`;
                        return starredWorks.has(workId);
                    });
                }

                // Show control bar when there are responses
                const controlBar = document.getElementById('responses-control-bar');
                if (responses.length > 0 && mode !== 'word_cloud' && mode !== 'sticky_note' && mode !== 'focus_game' && mode !== 'hotspot') {
                    controlBar.classList.remove('hidden');
                    // Adjust container to only have bottom rounded corners
                    container.classList.remove('rounded-2xl');
                    container.classList.add('rounded-b-2xl');
                } else {
                    controlBar.classList.add('hidden');
                    // Restore full rounded corners
                    container.classList.remove('rounded-b-2xl');
                    container.classList.add('rounded-2xl');
                }

                responses.forEach((student, index) => {
                    // 單一學生資料異常時只略過該筆，不可中斷整批卡片渲染
                    try {
                    const card = document.createElement('div');
                    card.className = 'student-response-item';

                    const answerContentHTML = buildResponseAnswerHTML(student, mode, index);

                    // Create work ID for starring
                    const workId = `${student.name}-${student.timestamp || index}`;
                    const isStarred = starredWorks.has(workId);

                    card.innerHTML = `
                        <button class="responses-star-toggle-btn absolute top-1 right-1 w-6 h-6 rounded-full ${isStarred ? 'bg-yellow-400 text-white' : 'bg-white/80 text-slate-400'} hover:bg-yellow-400 hover:text-white transition-all shadow-sm z-10" data-work-id="${workId}" data-tooltip="${isStarred ? '取消星號' : '加入星號'}">
                            <i class="fas fa-star text-xs"></i>
                        </button>
                        <div class="name-box">${student.name}</div>
                        <div class="answer-box">
                            ${answerContentHTML}
                        </div>
                    `;
                    container.appendChild(card);

                    // Add star button event listener
                    const starBtn = card.querySelector('.responses-star-toggle-btn');
                    if (starBtn) {
                        starBtn.addEventListener('click', (e) => {
                            e.stopPropagation();
                            toggleStarWork(starBtn.dataset.workId);
                        });
                    }

                    if (mode === 'drawing') {
                        const imgElement = card.querySelector('.answer-box img');
                        if (imgElement) {
                            imgElement.addEventListener('click', (e) => {
                                const fullImageUrl = e.target.dataset.fullImage;
                                showMagnifiedDrawing(fullImageUrl, drawingReplayIds.get(student));
                            });
                        }
                    }
                    } catch (e) {
                        console.warn('渲染單筆學生回應失敗，已略過:', student && student.name, e);
                    }
                });

                allStudentResponses = responses;

                // Special handling for word cloud mode
                if (mode === 'word_cloud') {
                    clearTimeout(wordCloudUpdateTimer);
                    wordCloudUpdateTimer = setTimeout(() => {
                        updateWordCloud(responses);
                    }, 300);
                }

                // Special handling for sticky note mode
                if (mode === 'sticky_note') {
                    updateStickyNotes(responses);
                }

                // Special handling for focus game mode
                if (mode === 'focus_game') {
                    updateFocusGameResults(responses);
                }

                // 16 圖片點選題：更新熱點圖
                if (mode === 'hotspot') {
                    updateHotspotDisplay(responses);
                }

                // Special handling for quick answer mode
                if (mode === 'quick_answer') {
                    console.log('Teacher: Processing quick answer responses:', responses);
                    // V6.2: 以伺服器時間「最早」者為勝（原本 responses 預設最新在前，會判給最後點的人）；
                    // serverTimestamp 尚未寫回者略過，同時間以姓名決勝負，判定結果各端一致。
                    const quickAnswerWinners = responses.filter(student =>
                        student.answer && typeof student.answer === 'string' && student.answer.includes('搶答成功') && getResponseTimeMs(student.timestamp)
                    ).sort((a, b) => (getResponseTimeMs(a.timestamp) - getResponseTimeMs(b.timestamp)) || String(a.name || '').localeCompare(String(b.name || '')));
                    console.log('Teacher: Quick answer winners found:', quickAnswerWinners);

                    if (quickAnswerWinners.length > 0) {
                        const winner = quickAnswerWinners[0]; // First one to answer
                        console.log('Teacher: Showing winner:', winner.name);
                        showQuickAnswerWinner(winner.name);
                    }
                }

                if (!statisticsModal.classList.contains('hidden')) {
                    drawChart(allStudentResponses, currentInteractionMode);
                }
                // 若未作答學生名單 modal 已開啟，即時更新列表
                if (!unsubmittedStudentsModal.classList.contains('hidden')) {
                    showUnsubmittedStudentsModal();
                }
            };
            // V6.2: debounce 250ms — 大量學生同時提交時合併重繪，避免老師端卡頓/凍結
            studentResponsesUnsubscribe = onSnapshot(studentsColRef, (querySnapshot) => {
                pendingResponsesSnapshot = querySnapshot;
                if (responsesRenderTimer) return;
                responsesRenderTimer = setTimeout(() => {
                    responsesRenderTimer = null;
                    if (pendingResponsesSnapshot) renderStudentResponsesSnapshot(pendingResponsesSnapshot);
                }, 250);
            }, (error) => {
                console.error("[Teacher] Error listening to student submissions:", error);
                showMessage("無法監聽學生作答，請檢查連線。", "error");
            });
        }

        /**
         * (Teacher) Listens for student online presence and updates the active student count list.
         * This listener should be persistent as long as the teacher is in the classroom.
         */
        function listenToClassroomPresence() {
            // Only set up the listener if it's not already active
            if (classroomPresenceUnsubscribe) {
                console.log("Presence listener already active. Skipping re-subscription.");
                return;
            }

            if (!classroomCode) {
                console.warn("Classroom code not set, cannot listen to presence.");
                return;
            }

            const presenceColRef = collection(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'presence');
            const activeStudentCountSpan = document.getElementById('active-student-count');
            const modalStudentNamesDiv = document.getElementById('modal-student-names');

            classroomPresenceUnsubscribe = onSnapshot(presenceColRef, (querySnapshot) => {
                activeStudentNames = []; // Clear and re-populate
                // Cloudflare 版：學生斷線時伺服器會自動刪除其在線文件，清單中即為目前在線者
                querySnapshot.forEach(doc => activeStudentNames.push(doc.data().name));

                activeStudentCountSpan.textContent = activeStudentNames.length;

                // Update the student list modal.
                modalStudentNamesDiv.innerHTML = '';
                if (lastSelectedModalStudent) { // Clear highlight in modal when list rebuilds
                    lastSelectedModalStudent.classList.remove('modal-selected-student-border');
                    lastSelectedModalStudent = null;
                }

                if (activeStudentNames.length === 0) {
                    modalStudentNamesDiv.innerHTML = '<p class="text-gray-500 text-sm col-span-full">沒有學生在線</p>';
                } else {
                    activeStudentNames.sort().forEach(name => {
                        const p = document.createElement('p');
                        p.textContent = name;
                        modalStudentNamesDiv.appendChild(p);
                    });
                }

                // Dynamically update the monitor view if in URL/HTML dispatch mode
                if (currentInteractionMode === 'url_dispatch') {
                    renderDispatchMonitor(); // 06 派送網址/HTML：在線學生卡片（有截圖時顯示截圖）
                }
            }, (error) => {
                console.error("[Teacher] Error listening to classroom presence:", error);
                // If there's an error, maybe the listener broke, so clear it.
                classroomPresenceUnsubscribe = null;
                showMessage("無法監聽學生在線狀態，請檢查連線。", "error");
            });
        }

        /**
         * (Teacher) Manually refreshes the online student count and responded student count.
         */
        async function manualRefreshCounts() {
            if (!classroomCode) {
                console.warn("Classroom code not set, cannot manually refresh counts.");
                return;
            }
            // Use classroomCode in the Firestore path
            const presenceColRef = collection(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'presence');
            try {
                const presenceSnapshot = await getDocs(presenceColRef);
                activeStudentNames = []; // Clear and re-populate
                presenceSnapshot.forEach(doc => activeStudentNames.push(doc.data().name));
                document.getElementById('active-student-count').textContent = activeStudentNames.length;
            } catch (error) {
                console.error("Manual refresh: Failed to get online student count:", error);
            }

            // Use classroomCode in the Firestore path
            const responsesColRef = collection(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'studentResponses');
            try {
                const responsesSnapshot = await getDocs(responsesColRef);
                // REMOVED: document.getElementById('responded-student-count').textContent = responsesSnapshot.size;

                const responsesData = [];
                responsesSnapshot.forEach(doc => { const d = doc.data(); if (currentRound && d.round && d.round !== currentRound) return; responsesData.push(d); }); // V6.2: 過濾非本輪
                allStudentResponses = responsesData;

                if (!statisticsModal.classList.contains('hidden')) {
                    drawChart(allStudentResponses, currentInteractionMode);
                }
                // 若未作答學生名單 modal 已開啟，即時更新列表
                if (!unsubmittedStudentsModal.classList.contains('hidden')) {
                    showUnsubmittedStudentsModal();
                }
                showMessage('統計數據已更新！', 'info');
            } catch (error) {
                console.error("Manual refresh: Failed to get responded student count:", error);
            }
        }
