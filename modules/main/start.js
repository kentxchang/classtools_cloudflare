        // =====================================================================
        // 【主畫面配置 — 程式啟動（initialize、CTP 橋接）】 modules/main/start.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        // =====================================================================

        // --- Initialization Function ---
        async function initialize() {
            loadAISettings();
            loadDispatchSettings(); // Load saved combined dispatch settings

            // Cloudflare 版：以瀏覽器本機保存的 ID 取代 Firebase 匿名登入
            userId = getUserId();
            document.getElementById('user-id-display').textContent = userId;

            // Check if teacher has a persisted classroom code
            const savedTeacherClassroomCode = localStorage.getItem('teacherClassroomCode');
            if (savedTeacherClassroomCode) {
                classroomCode = savedTeacherClassroomCode;
                currentRole = 'teacher';
                
                // 寫入「開啟課程（重連）」事件，如果歷程尚未存在則會建立
                logClassroomHistory('class_start', '重連課程', { isNew: false });

                document.getElementById('end-class-button-text').textContent = `下課 教室代碼: ${classroomCode}`; // Update text
                document.getElementById('end-class-monitor-button-text').textContent = `下課 教室代碼: ${classroomCode}`; // Update text

                // NEW: Fetch initial pause state and dispatch settings for teacher
                const controlRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'settings', 'control');
                const docSnap = await getDoc(controlRef);
                if (docSnap.exists()) {
                    // CRITICAL FIX: Reset active_mode to 'waiting' when teacher re-enters classroom
                    // This prevents students from seeing old interaction modes from previous sessions
                    await setDoc(controlRef, { active_mode: 'waiting' }, { merge: true });
                    console.log("✓ 已重置教室互動模式為等待狀態");

                    isResponsePaused = docSnap.data().isPaused || false;
                    // MODIFIED: Load dispatchSettings from Firestore
                    const fetchedDispatchSettings = docSnap.data().dispatchSettings;
                    if (fetchedDispatchSettings) {
                        dispatchSettings.type = fetchedDispatchSettings.type || 'url';
                        dispatchSettings.url = fetchedDispatchSettings.url || '';
                        dispatchSettings.isYoutube = fetchedDispatchSettings.isYoutube || false;
                        dispatchSettings.htmlContent = fetchedDispatchSettings.htmlContent || null;
                    }
                    // NEW: Load custom multiple choice questions from Firestore
                    currentMultipleChoiceQuestions = docSnap.data().multiple_choice_questions || null;
                    customMultipleChoiceQuestions = currentMultipleChoiceQuestions || []; // Sync for teacher UI
                } else {
                    isResponsePaused = false; // Default to not paused if control doc doesn't exist
                    // dispatchSettings remains at its default or loaded localStorage value
                    currentMultipleChoiceQuestions = null;
                    customMultipleChoiceQuestions = [];
                }
                updateTeacherPauseButtonUI(); // Update button UI based on fetched state

                // Load question banks for this classroom
                loadQuestionBanksFromStorage();
                loadSequencingBanksFromStorage();
                loadMatchingBanksFromStorage();
                loadReadingBanksFromStorage();

                listenToClassroomPresence(); // Ensure presence listener is established here and remains active
                showView('teacherMenu');
            } else {
                showView('entry');
            }

            document.getElementById('app-id-display').textContent = baseAppId; // Display the base app ID
        }

        // Note: Reading question banks are loaded when teacher enters classroom
        // (see loadReadingBanksFromStorage() call in teacher setup)

        // ==================== CTP（同步白板 / 同步簡報）橋接 ====================
        // 將 01classtools 既有的資料庫連線與教室代碼，提供給隔離的 CTP 子系統使用。
        // getter 會即時讀取目前的模組層級變數，確保子系統永遠拿到最新的 db / 教室代碼 / 角色。
        window.__CT = {
            get db() { return db; },
            get baseAppId() { return baseAppId; },
            get classroomCode() { return classroomCode; },
            get role() { return currentRole; },
            get name() { return studentName; },
            // 設定 active_mode（教師啟動/結束同步白板或簡報時呼叫）
            async setActiveMode(mode) {
                if (!db || !classroomCode) return;
                const ref = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'settings', 'control');
                await setDoc(ref, { active_mode: mode }, { merge: true });
            }
        };

        // 兩張新功能圖卡：啟動同步白板 / 同步簡報（子系統由獨立 module 提供 window.__CTP）
        function launchSyncTool(mode) {
            if (!classroomCode) { showMessage('請先進入教室再使用此功能', 'error'); return; }
            if (window.__CTP && window.__CTP.launchTeacher) {
                // 紀錄同步工具使用時間
                const toolName = mode === 'whiteboard' ? '同步白板' : '同步簡報';
                logClassroomHistory('ctp_usage', toolName, { action: '啟動工具' });
                
                window.__CTP.launchTeacher(mode);
            } else {
                showMessage('同步工具模組尚未載入完成，請稍候再試。', 'info');
            }
        }
        document.getElementById('sync-whiteboard-card')?.addEventListener('click', () => launchSyncTool('whiteboard'));
        document.getElementById('sync-presentation-card')?.addEventListener('click', () => launchSyncTool('presentation'));

        // --- Start Application ---
        initialize();
        setupEventListeners(); // Call setupEventListeners only once here.

