        // =====================================================================
        // 【主畫面配置 — 事件監聽總表（依原順序呼叫各功能模組的事件設定）】 modules/main/events.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        // =====================================================================


        function setupEventListeners() {
            // 下載課堂歷程按鈕事件綁定
            const handleDownloadHistory = async () => {
                if (!classroomCode) {
                    showMessage('無效的課程代碼，無法下載歷程。', 'error');
                    return;
                }
                await downloadClassroomHistory(classroomCode);
                showMessage('歷程下載成功。', 'success');
            };
            document.getElementById('download-history-menu-btn')?.addEventListener('click', handleDownloadHistory);

            // 清空題庫按鈕事件綁定
            document.getElementById('clear-all-banks-menu-btn')?.addEventListener('click', manualClearAllQuestionBanks);
            setupPasswordEventListeners(); // → modules/password/password.js
            document.getElementById('student-entry-btn').addEventListener('click', () => {
                currentRole = 'student';
                showView('studentName');
            });

            // NEW: Teacher classroom code input.
            document.getElementById('teacher-classroom-code-back-btn').addEventListener('click', () => showView('entry'));
            document.getElementById('teacher-classroom-code-submit-btn').addEventListener('click', async () => {
                const code = document.getElementById('teacher-classroom-code-input').value.trim();
                const newPassword = document.getElementById('teacher-new-classroom-password').value.trim();
                if (!code) {
                    showMessage('請輸入教室代碼！', 'error');
                    return;
                }

                // Check whether this classroom already exists (avoid overwriting another teacher's live room).
                const classroomDocRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', code);
                const existingSnap = await getDoc(classroomDocRef);

                if (existingSnap.exists() && existingSnap.data().active) {
                    // Code is already in use → treat this as "enter existing", with password check if needed.
                    const existing = existingSnap.data();
                    if (existing.hasPassword) {
                        const pw = await promptClassroomPassword('此教室已存在且有密碼，請輸入密碼以進入', `教室代碼：${code}`);
                        if (pw === null) return;
                        if ((await sha256Hex(pw)) !== existing.passwordHash) {
                            showMessage('密碼錯誤，無法進入既有教室。', 'error');
                            return;
                        }
                    }
                    await enterClassroom(code, { isNew: false });
                    return;
                }

                // Brand new classroom → store hashed password (if any) and reset state.
                const passwordHash = newPassword ? await sha256Hex(newPassword) : null;
                await enterClassroom(code, { isNew: true, passwordHash });
            });
            document.getElementById('teacher-classroom-code-input').addEventListener('keydown', (e) => {
                if (e.key === 'Enter') document.getElementById('teacher-classroom-code-submit-btn').click();
            });
            document.getElementById('teacher-new-classroom-password').addEventListener('keydown', (e) => {
                if (e.key === 'Enter') document.getElementById('teacher-classroom-code-submit-btn').click();
            });

            // Refresh the open-classroom list on demand.
            document.getElementById('teacher-open-classrooms-refresh-btn').addEventListener('click', () => loadOpenClassrooms());

            // Student name and classroom code submission.
            document.getElementById('submit-name-btn').addEventListener('click', async () => {
                const studentClassroomCode = document.getElementById('student-classroom-code-input').value.trim();
                const name = document.getElementById('student-name-input').value.trim();

                if (!studentClassroomCode) {
                    showMessage('請務必輸入教室代碼！', 'error');
                    return;
                }
                if (!name) {
                    showMessage('請務必輸入姓名！', 'error');
                    return;
                }

                classroomCode = studentClassroomCode; // Set global classroom code for student

                // Check if the classroom exists and is active
                const controlRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'settings', 'control');
                try {
                    const docSnap = await getDoc(controlRef);
                    if (docSnap.exists() && docSnap.data().teacherId) { // Check if control document exists and has a teacher ID
                        // V6.2: 檢查姓名是否與其他在線同學重複，重複時自動加尾碼（例：王小明-2），
                        // 避免同名學生的答案互相覆蓋。
                        let finalName = name;
                        try {
                            const presenceColRef = collection(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'presence');
                            const presenceSnap = await getDocs(presenceColRef);
                            const takenNames = new Set();
                            presenceSnap.forEach(pDoc => {
                                if (pDoc.id !== userId && pDoc.data().name) takenNames.add(pDoc.data().name);
                            });
                            if (takenNames.has(finalName)) {
                                let i = 2;
                                while (takenNames.has(name + '-' + i)) i++;
                                finalName = name + '-' + i;
                                showMessage('已有同學使用「' + name + '」，你的名稱已自動改為「' + finalName + '」。', 'info');
                            }
                        } catch (e) {
                            console.warn('姓名重複檢查失敗（略過）:', e);
                        }
                        studentName = finalName;
                        document.getElementById('user-id-display').textContent = `${userId} (${studentName})`;
                        document.getElementById('student-welcome-msg').textContent = `你好，${studentName}！`;

                        listenToInteractionMode();
                        listenToPeerReviewStatus(); // NEW: Listen for peer review status
                        showView('studentWaiting');
                        // Set student presence using the specific classroomCode
                        const presenceRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'presence', userId);
                        // Cloudflare 版：在線狀態綁定連線，學生離線（關閉分頁/斷網）時伺服器自動移除，
                        // 不再每 30 秒寫入心跳，大幅減少資料庫寫入。
                        await setPresence(presenceRef, { name: studentName, timestamp: serverTimestamp() });
                    } else {
                        showMessage('教室代碼不存在或老師尚未開啟教室！', 'error');
                    }
                } catch (error) {
                    console.error("檢查教室代碼失敗:", error);
                    showMessage("進入教室失敗，請檢查網路連線或教室代碼。", "error");
                }
            });
            setupChoiceSequencingMatchingEventListeners(); // → modules/02-choice-sequencing-matching/choice-sequencing-matching.js

            // REMOVED: Old multiple-choice-settings-btn listener (now handled by open-multiple-choice-settings-btn from B menu)

            // Other teacher mode selection buttons (unchanged, directly set mode)
            document.querySelectorAll('#teacher-menu-view button[data-mode]').forEach(button => {
                button.addEventListener('click', async () => {
                    const mode = button.dataset.mode;
                    // MODIFIED: Check dispatch settings for url_dispatch
                    if (mode === 'url_dispatch') {
                        if (dispatchSettings.type === 'url' && !dispatchSettings.url) {
                            showMessage('請先設定要派送的網址！', 'error');
                            showUrlDispatchSettingsModal();
                            return;
                        } else if (dispatchSettings.type === 'html' && !dispatchSettings.htmlContent) {
                            showMessage('請先上傳要派送的 HTML 檔案！', 'error');
                            showUrlDispatchSettingsModal();
                            return;
                        }
                    }
                    // 16 圖片點選題：需要題目圖片（使用繪圖題的背景圖片設定）
                    if (mode === 'hotspot' && !teacherUploadedBackgroundImageDataURL) {
                        showMessage('請先在下方「背景圖片設定」上傳題目圖片，再開始圖片點選題！', 'error');
                        return;
                    }
                    showView('teacherMonitor');
                    await setInteractionMode(mode); // Set mode and handle student responses listener
                });
            });

            // End interaction button.
            document.getElementById('end-interaction-btn').addEventListener('click', async () => {
                // NEW: Clear peer review data when ending interaction (not just stopping)
                try {
                    // Clear peer review settings
                    const peerReviewRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'settings', 'peerReview');
                    await setDoc(peerReviewRef, { active: false });

                    // Clear all votes - THIS IS THE KEY DIFFERENCE FROM STOPPING
                    const votesRef = collection(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'peerReviewVotes');
                    await deleteTree(votesRef); // 伺服器端一次清空

                    peerReviewActive = false;
                    document.getElementById('peer-review-stats-container').classList.add('hidden');

                    // Reset peer review button text
                    const startPeerReviewBtn = document.getElementById('start-peer-review-btn');
                    startPeerReviewBtn.innerHTML = '<i class="fas fa-heart mr-2"></i> 開始互評 ❤️';

                    // Clear student voted works
                    allPeerReviewVotes = {};
                    studentVotedWorks.clear();

                    // Clear saved canvas state
                    savedCanvasState = null;

                    if (peerReviewUnsubscribe) {
                        peerReviewUnsubscribe();
                        peerReviewUnsubscribe = null;
                    }
                } catch (error) {
                    console.error('Error clearing peer review data:', error);
                }

                await setInteractionMode('waiting');
                lastSelectedStudentCard = null;

                // Disable pull-to-refresh prevention when ending interaction
                disablePullToRefreshPrevention();

                // Clear sequencing and matching input fields
                document.getElementById('sequencing-items-textarea').value = '';
                document.getElementById('matching-pairs-textarea').value = '';

                showView('teacherMenu');
                manualRefreshCounts(); // This will refresh the count display, but the listener is already active.
                // Clear URL/HTML settings and teacher background image when ending interaction
                clearDispatchSettings(); // Use the combined clear function
                teacherUploadedBackgroundImageDataURL = null;
                document.getElementById('teacher-image-status').textContent = '目前沒有背景圖片。可選擇檔案或直接貼上(Ctrl+V)。';
                document.getElementById('teacher-image-preview').src = '';
                document.getElementById('teacher-image-preview-container').classList.add('hidden');
                isResponsePaused = false; // NEW: Reset pause state
                updateTeacherPauseButtonUI(); // NEW: Update pause button UI
                customMultipleChoiceQuestions = []; // NEW: Clear custom MC questions on end interaction
            });
            setupTrueFalseEventListeners(); // → modules/01-true-false/true-false.js
            setupTextInputEventListeners(); // → modules/03-text-input/text-input.js
            setupWordCloudEventListeners(); // → modules/04-word-cloud/word-cloud.js
            setupStickyNoteEventListeners(); // → modules/09-sticky-note/sticky-note.js
            setupDrawingEventListeners(); // → modules/05-drawing/drawing.js

            // Floating QR button: 學生加入網址 / QR Code
            document.getElementById('floating-qr-btn').addEventListener('click', showCrossDeviceUrlModal);
            // 建置說明 Modal
            const deployGuideModal = document.getElementById('deploy-guide-modal');
            document.getElementById('deploy-guide-btn').addEventListener('click', () => deployGuideModal.classList.remove('hidden'));
            document.getElementById('deploy-guide-modal-close-btn').addEventListener('click', () => deployGuideModal.classList.add('hidden'));
            deployGuideModal.addEventListener('click', (e) => {
                if (e.target === deployGuideModal) deployGuideModal.classList.add('hidden');
            });

            document.getElementById('cross-device-url-modal-close-btn').addEventListener('click', hideCrossDeviceUrlModal);
            document.getElementById('cross-device-url-modal').addEventListener('click', (e) => {
                if (e.target === document.getElementById('cross-device-url-modal')) hideCrossDeviceUrlModal();
            });
            document.getElementById('cross-device-download-qrcode-btn').addEventListener('click', downloadCrossDeviceQRCode);
            // V6.2: 切換 短網址／原始網址（切換後自動複製）
            document.getElementById('cross-device-short-url-btn').addEventListener('click', async () => {
                if (!crossDeviceShortUrl) return;
                applyCrossDeviceUrlDisplay('short');
                try { await navigator.clipboard.writeText(crossDeviceDisplayUrl); } catch (e) {}
            });
            document.getElementById('cross-device-long-url-btn').addEventListener('click', async () => {
                applyCrossDeviceUrlDisplay('long');
                try { await navigator.clipboard.writeText(crossDeviceDisplayUrl); } catch (e) {}
            });
            document.getElementById('cross-device-copy-btn').addEventListener('click', async () => {
                const urlInput = document.getElementById('cross-device-url-input');
                const msg = document.getElementById('cross-device-msg');
                if (!urlInput.value) return;
                try {
                    await navigator.clipboard.writeText(urlInput.value);
                } catch (e) {
                    urlInput.select();
                    document.execCommand('copy');
                }
                if (msg) {
                    msg.textContent = '網址已複製到剪貼簿！';
                    msg.className = 'text-center text-sm text-green-600 mt-3';
                }
            });

            // Modal close buttons.
            document.getElementById('student-status-area').addEventListener('click', showStudentListModal);
            studentListModalCloseBtn.addEventListener('click', hideStudentListModal);
            document.getElementById('show-statistics-btn').addEventListener('click', showStatisticsModal);

            // NEW: Download Responses Button
            document.getElementById('download-responses-btn').addEventListener('click', downloadStudentResponses);

            // NEW: Start Peer Review Button
            document.getElementById('start-peer-review-btn').addEventListener('click', startPeerReview);

            // NEW: Exit Peer Review Button (Student)
            document.getElementById('exit-peer-review-btn').addEventListener('click', exitPeerReview);

            // NEW: Sorting buttons for peer review stats
            document.getElementById('sort-by-votes').addEventListener('click', () => {
                currentSortMethod = 'votes';
                updateSortButtonStyles();
                updateTeacherVoteStats(allPeerReviewVotes, currentSortMethod);
            });
            document.getElementById('sort-by-name').addEventListener('click', () => {
                currentSortMethod = 'name';
                updateSortButtonStyles();
                updateTeacherVoteStats(allPeerReviewVotes, currentSortMethod);
            });
            document.getElementById('sort-by-time').addEventListener('click', () => {
                currentSortMethod = 'time';
                updateSortButtonStyles();
                updateTeacherVoteStats(allPeerReviewVotes, currentSortMethod);
            });

            // NEW: Starred filter toggle button
            document.getElementById('toggle-starred-filter').addEventListener('click', toggleStarredFilter);

            // NEW: Regular responses sorting and filtering buttons
            document.getElementById('responses-sort-by-name').addEventListener('click', () => {
                responsesSortMethod = 'name';
                updateResponsesSortButtonStyles();
                refreshStudentResponsesDisplay();
            });
            document.getElementById('responses-sort-by-time').addEventListener('click', () => {
                responsesSortMethod = 'time';
                updateResponsesSortButtonStyles();
                refreshStudentResponsesDisplay();
            });
            document.getElementById('responses-toggle-starred-filter').addEventListener('click', toggleResponsesStarredFilter);

            chartModalCloseBtn.addEventListener('click', hideStatisticsModal);
            magnifiedImageModalCloseBtn.addEventListener('click', hideMagnifiedDrawing);
            magnifiedImageModal.addEventListener('click', (e) => { if (e.target === magnifiedImageModal) hideMagnifiedDrawing(); });
            document.getElementById('close-message-btn').addEventListener('click', hideMessage);

            // NEW: Unsubmitted Students Modal Listeners
            document.getElementById('show-unsubmitted-students-btn').addEventListener('click', showUnsubmittedStudentsModal);
            unsubmittedStudentsModalCloseBtn.addEventListener('click', hideUnsubmittedStudentsModal);
            unsubmittedStudentsModal.addEventListener('click', (e) => { if (e.target === unsubmittedStudentsModal) hideUnsubmittedStudentsModal(); });


            // Teacher utility buttons.
            document.getElementById('refresh-student-count-btn').addEventListener('click', manualRefreshCounts);
            // Original lottery button in monitor view (now replaced by modal one)
            document.getElementById('draw-lottery-btn').addEventListener('click', () => {
                if (allStudentResponses.length === 0) return showMessage('目前沒有學生提交答案可供抽籤。', 'info');
                if (lastSelectedStudentCard) lastSelectedStudentCard.classList.remove('selected-student-border');
                const randomIndex = Math.floor(Math.random() * allStudentResponses.length);
                const selectedStudentName = allStudentResponses[randomIndex].name;
                const studentCards = document.querySelectorAll('#student-responses-container .student-response-item');
                const foundCard = Array.from(studentCards).find(card => card.querySelector('.name-box').textContent === selectedStudentName);
                if (foundCard) {
                    foundCard.classList.add('selected-student-border');
                    lastSelectedStudentCard = foundCard;
                    showMessage(`恭喜！抽中學生：${selectedStudentName}`, 'success');
                }
            });
            // NEW: Lottery button inside the student list modal
            document.getElementById('modal-draw-lottery-btn').addEventListener('click', () => {
                if (activeStudentNames.length === 0) {
                    return showMessage('目前沒有學生在線可供抽籤。', 'info');
                }

                // Remove highlight from previously selected student in the modal
                if (lastSelectedModalStudent) {
                    lastSelectedModalStudent.classList.remove('modal-selected-student-border');
                }

                // Randomly select a student from all active online students
                const randomIndex = Math.floor(Math.random() * activeStudentNames.length);
                const selectedStudentName = activeStudentNames[randomIndex];

                // Find the corresponding <p> element in the modal
                const studentNameElements = document.querySelectorAll('#modal-student-names p');
                const foundElement = Array.from(studentNameElements).find(p => p.textContent === selectedStudentName);

                if (foundElement) {
                    foundElement.classList.add('modal-selected-student-border');
                    lastSelectedModalStudent = foundElement; // Store the currently selected element
                    showMessage(`恭喜！抽中學生：${selectedStudentName}`, 'success');
                } else {
                    // This case should ideally not happen if activeStudentNames is correctly populated
                    // and the modal list is correctly rendered.
                    showMessage(`抽中學生：${selectedStudentName} (未在列表中找到)`, 'info');
                }
            });


            document.getElementById('download-media-btn').addEventListener('click', async (e) => { // Changed ID
                const btn = e.currentTarget;
                if (btn.disabled) return;

                let mediaResponses = [];
                let filenamePrefix = '';
                let fileExtension = '';

                if (currentInteractionMode === 'drawing') {
                    mediaResponses = allStudentResponses.filter(r => r.answer && r.answer.startsWith('data:image'));
                    filenamePrefix = '學生繪圖答案';
                    fileExtension = 'jpg';
                } else if (currentInteractionMode === 'recording') {
                    mediaResponses = allStudentResponses.filter(r => r.answer && r.answer.startsWith('data:audio'));
                    filenamePrefix = '學生錄音答案';
                    // Determine file extension based on the actual mimeType used for recording
                    const firstAudioResponse = mediaResponses.find(r => r.answer);
                    if (firstAudioResponse) {
                        const mime = firstAudioResponse.answer.split(',')[0].match(/:(.*?);/)?.[1];
                        if (mime) {
                            if (mime.includes('webm')) fileExtension = 'webm';
                            else if (mime.includes('mp4')) fileExtension = 'mp4';
                            else if (mime.includes('ogg')) fileExtension = 'ogg';
                            else if (mime.includes('wav')) fileExtension = 'wav';
                            else fileExtension = 'bin'; // Fallback for unknown
                        } else {
                            fileExtension = 'bin'; // Fallback if mime type not found in data URL
                        }
                    } else {
                        fileExtension = 'webm'; // Default if no audio responses
                    }
                } else if (currentInteractionMode === 'calc') {
                    return downloadCalcAnswers(btn); // 15 計算題：每位學生一張合併長圖
                } else if (currentInteractionMode === 'hotspot') {
                    return downloadHotspotImage(btn); // 16 圖片點選題：全班點選位置圖
                } else if (currentInteractionMode === 'url_dispatch') {
                    return downloadDispatchScreenshots(btn); // 06 派送 HTML：全班截圖
                } else {
                    return showMessage('目前模式不支援下載媒體。', 'info');
                }

                if (mediaResponses.length === 0) return showMessage(`目前沒有${filenamePrefix}可供下載。`, 'info');

                btn.disabled = true;
                showMessage(`正在打包${filenamePrefix}...`, 'info');
                const zip = new JSZip();
                const dataURLToBlob = (dataurl) => {
                    const [header, body] = dataurl.split(',');
                    const mime = header.match(/:(.*?);/)[1];
                    const bstr = atob(body);
                    let n = bstr.length;
                    const u8arr = new Uint8Array(n);
                    while (n--) u8arr[n] = bstr.charCodeAt(n);
                    return new Blob([u8arr], { type: mime });
                };

                mediaResponses.forEach(r => {
                    // Ensure unique filenames for students with same name but different recordings if needed
                    // For now, just use student name.
                    zip.file(`${r.name}.${fileExtension}`, dataURLToBlob(r.answer));
                });

                try {
                    const content = await zip.generateAsync({ type: "blob" });
                    saveAs(content, `${filenamePrefix}_${new Date().toLocaleDateString('zh-TW')}.zip`);
                    showMessage(`已成功打包 ${mediaResponses.length} 個檔案並開始下載。`, 'success');
                } catch (error) {
                    console.error("打包媒體失敗:", error);
                    showMessage("打包媒體失敗，請檢查瀏覽器支援或檔案大小。", "error");
                } finally {
                    btn.disabled = false;
                }
            });
            setupAISettingsEventListeners(); // → modules/ai-settings/ai-settings.js
            setupUrlDispatchEventListeners(); // → modules/06-url-dispatch/url-dispatch.js
            setupFocusGameEventListeners(); // → modules/10-focus-game/focus-game.js
            setupQuickPollEventListeners(); // → modules/12-quick-poll/quick-poll.js
            setupRecordingEventListeners(); // → modules/07-recording/recording.js

            // NEW: Toggle Pause Button Event Listener
            togglePauseBtn.addEventListener('click', toggleResponsePause);


            // End Class Session Buttons.
            document.getElementById('end-class-session-menu-btn').addEventListener('click', endClassSession);
            document.getElementById('end-class-session-monitor-btn').addEventListener('click', endClassSession);

            // Leave Classroom Button (without deleting data)
            document.getElementById('leave-classroom-btn').addEventListener('click', leaveClassroom);
            setupReadingComprehensionEventListeners(); // → modules/08-reading-comprehension/reading-comprehension.js
            setupCalcEventListeners(); // → modules/15-calc/calc.js
            setupHotspotEventListeners(); // → modules/16-hotspot/hotspot.js
        }
