        // =====================================================================
        // 【主畫面配置 — 教室管理（歷程、進出教室、下課、暫停、分享網址）】 modules/main/classroom.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        // =====================================================================

        // ==================== V6.3: 課堂歷程 IndexedDB 儲存 ====================
        // 原本課堂歷程存 localStorage（約 5MB 上限），學生人數多、含繪圖作品
        // (base64 圖片) 時會爆量，導致繪圖被降級成佔位文字而無法完整保留。
        // V6.3 改用 IndexedDB（配額可達數百 MB），100+ 人的繪圖回應可完整保存。
        // 設計：同步「記憶體快取」+ 非同步寫入（debounce 800ms），
        //       既有程式維持同步呼叫介面，不影響教師端即時畫面。
        //       首次載入時自動將 localStorage 舊紀錄遷移過來並釋放空間。
        const ClassHistoryStore = {
            DB_NAME: 'classtools_history',
            STORE: 'kv',
            _dbPromise: null,
            _cache: {},
            _loaded: {},
            _saveTimers: {},

            _open() {
                if (this._dbPromise) return this._dbPromise;
                this._dbPromise = new Promise((resolve) => {
                    try {
                        const req = indexedDB.open(this.DB_NAME, 1);
                        req.onupgradeneeded = () => {
                            if (!req.result.objectStoreNames.contains(this.STORE)) {
                                req.result.createObjectStore(this.STORE);
                            }
                        };
                        req.onsuccess = () => resolve(req.result);
                        req.onerror = () => {
                            console.warn('[歷程] IndexedDB 開啟失敗，將僅使用記憶體快取:', req.error);
                            resolve(null);
                        };
                    } catch (e) {
                        console.warn('[歷程] 此環境不支援 IndexedDB，將僅使用記憶體快取:', e);
                        resolve(null);
                    }
                });
                return this._dbPromise;
            },

            async _idbGet(key) {
                const db = await this._open();
                if (!db) return undefined;
                return new Promise((resolve) => {
                    try {
                        const rq = db.transaction(this.STORE, 'readonly').objectStore(this.STORE).get(key);
                        rq.onsuccess = () => resolve(rq.result);
                        rq.onerror = () => resolve(undefined);
                    } catch (e) { resolve(undefined); }
                });
            },

            async _idbSet(key, value) {
                const db = await this._open();
                if (!db) return false;
                return new Promise((resolve) => {
                    try {
                        const tx = db.transaction(this.STORE, 'readwrite');
                        tx.objectStore(this.STORE).put(value, key);
                        tx.oncomplete = () => resolve(true);
                        tx.onerror = () => { console.warn('[歷程] IndexedDB 寫入失敗:', tx.error); resolve(false); };
                    } catch (e) { resolve(false); }
                });
            },

            async _idbDelete(key) {
                const db = await this._open();
                if (!db) return;
                return new Promise((resolve) => {
                    try {
                        const tx = db.transaction(this.STORE, 'readwrite');
                        tx.objectStore(this.STORE).delete(key);
                        tx.oncomplete = () => resolve();
                        tx.onerror = () => resolve();
                    } catch (e) { resolve(); }
                });
            },

            /** 載入指定教室的歷程到記憶體快取（含 localStorage 舊紀錄自動遷移） */
            async load(key) {
                if (this._loaded[key]) return this._cache[key];
                let history = await this._idbGet(key);
                if (!Array.isArray(history)) {
                    // 從 localStorage 遷移舊版紀錄（遷移後移除以釋放 5MB 配額）
                    try {
                        const legacy = localStorage.getItem(key);
                        if (legacy) {
                            const parsed = JSON.parse(legacy);
                            if (Array.isArray(parsed)) {
                                history = parsed;
                                await this._idbSet(key, history);
                                localStorage.removeItem(key);
                                console.log('[歷程] 已將舊 localStorage 紀錄遷移至 IndexedDB:', key);
                            }
                        }
                    } catch (e) { console.warn('[歷程] 舊紀錄遷移失敗（略過）:', e); }
                }
                if (!Array.isArray(history)) history = [];
                // 載入期間若已有新事件寫入快取，接在既有紀錄之後，不遺失
                const pending = Array.isArray(this._cache[key]) ? this._cache[key] : [];
                const merged = pending.length ? history.concat(pending) : history;
                this._cache[key] = merged;
                this._loaded[key] = true;
                if (pending.length) this._persist(key);
                return merged;
            },

            /** 同步取得快取（未載入時回傳空陣列並於背景載入） */
            get(key) {
                if (!this._cache[key]) {
                    this._cache[key] = [];
                    if (!this._loaded[key]) this.load(key).catch(() => {});
                }
                return this._cache[key];
            },

            /** 同步更新快取並排程非同步寫入 IndexedDB */
            set(key, history) {
                this._cache[key] = history;
                this._persist(key);
            },

            _persist(key) {
                clearTimeout(this._saveTimers[key]);
                this._saveTimers[key] = setTimeout(() => {
                    delete this._saveTimers[key];
                    this._idbSet(key, this._cache[key] || []).catch(() => {});
                }, 800);
            },

            /** 立即落盤（下載報告、頁面隱藏、下課前呼叫） */
            async flush(key) {
                clearTimeout(this._saveTimers[key]);
                delete this._saveTimers[key];
                if (this._cache[key]) await this._idbSet(key, this._cache[key]);
            },

            /** 刪除歷程（下課／開新課程） */
            remove(key) {
                delete this._cache[key];
                delete this._loaded[key];
                clearTimeout(this._saveTimers[key]);
                delete this._saveTimers[key];
                this._idbDelete(key).catch(() => {});
                try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
            }
        };

        // 頁面隱藏／關閉時盡快將未寫入的歷程落盤
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                Object.keys(ClassHistoryStore._cache).forEach(k => { ClassHistoryStore.flush(k).catch(() => {}); });
            }
        });

        // --- End Recording Functions ---

        /**
         * 向本機儲存的課程歷程紀錄中新增一筆事件
         * @param {string} type - 事件類型 ('class_start', 'ctp_usage', 'interaction')
         * @param {string} toolName - 工具名稱
         * @param {Object} details - 詳細資訊
         */
        function logClassroomHistory(type, toolName, details = {}, mode = null) {
            if (!classroomCode) return;
            const historyKey = `classHistory_${classroomCode}`;
            const history = ClassHistoryStore.get(historyKey); // V6.3: 改用 IndexedDB（記憶體快取）
            
            const event = {
                type: type,
                timestamp: new Date().toLocaleString('zh-TW'),
                toolName: toolName,
                mode: mode,
                details: details
            };
            history.push(event);
            ClassHistoryStore.set(historyKey, history); // V6.3: 非同步寫入 IndexedDB
            console.log(`[歷程紀錄] 記錄事件: ${toolName} (${type})`);
        }

        /**
         * 更新當前進行中互動的學生答題紀錄
         * @param {Array} studentResponses - 來自 Firestore 的所有學生作答資料陣列
         */
        function updateClassroomHistoryResponses(studentResponses) {
            if (!classroomCode || !currentInteractionMode) return;
            const historyKey = `classHistory_${classroomCode}`;
            const history = ClassHistoryStore.get(historyKey); // V6.3: 改用 IndexedDB（記憶體快取）
            
            let lastInteraction = null;
            for (let i = history.length - 1; i >= 0; i--) {
                if (history[i].type === 'interaction') {
                    lastInteraction = history[i];
                    break;
                }
            }
            
            if (lastInteraction && lastInteraction.mode === currentInteractionMode) {
                if (!lastInteraction.responses) {
                    lastInteraction.responses = {};
                }
                
                studentResponses.forEach(student => {
                    if (student.name && student.answer !== undefined && student.answer !== null) {
                        let isCorrect = null;
                        let formattedAnswer = student.answer;
                        
                        if (currentInteractionMode === 'multiple_choice' && Array.isArray(student.answer) && currentMultipleChoiceQuestions) {
                            const results = [];
                            student.answer.forEach(qAns => {
                                const question = currentMultipleChoiceQuestions[qAns.qIndex];
                                if (question) {
                                    const correct = (String(qAns.ans) === String(question.correctAnswer));
                                    results.push({
                                        questionIndex: qAns.qIndex,
                                        answer: qAns.ans,
                                        isCorrect: correct,
                                        correctAnswer: question.correctAnswer
                                    });
                                }
                            });
                            isCorrect = results.every(r => r.isCorrect);
                            formattedAnswer = results;
                        } 
                        else if (currentInteractionMode === 'sequencing') {
                            try {
                                const studentOrder = JSON.parse(student.answer);
                                const correctOrder = sequencingData.correctOrder;
                                const results = studentOrder.map((item, idx) => {
                                    return {
                                        item: item,
                                        isCorrect: correctOrder[idx] === item,
                                        correctItem: correctOrder[idx]
                                    };
                                });
                                isCorrect = results.every(r => r.isCorrect);
                                formattedAnswer = results;
                            } catch (e) {}
                        } 
                        else if (currentInteractionMode === 'matching') {
                            try {
                                const studentMatches = JSON.parse(student.answer);
                                const correctPairs = matchingData.pairs;
                                const results = studentMatches.map(match => {
                                    const correctPair = correctPairs.find(p => p.left === match.left);
                                    return {
                                        left: match.left,
                                        right: match.right,
                                        isCorrect: !!(correctPair && correctPair.right === match.right),
                                        correctRight: correctPair ? correctPair.right : null
                                    };
                                });
                                isCorrect = results.every(r => r.isCorrect);
                                formattedAnswer = results;
                            } catch (e) {}
                        } 
                        else if (currentInteractionMode === 'reading_comprehension' && readingComprehensionData && readingComprehensionData.questions) {
                            try {
                                const studentAnswers = JSON.parse(student.answer);
                                const questions = readingComprehensionData.questions;
                                const results = studentAnswers.map((ans, idx) => {
                                    const question = questions[idx];
                                    if (question) {
                                        return {
                                            questionIndex: idx,
                                            answer: ans,
                                            isCorrect: ans === question.correctAnswer,
                                            correctAnswer: question.correctAnswer
                                        };
                                    }
                                    return null;
                                }).filter(r => r !== null);
                                isCorrect = results.every(r => r.isCorrect);
                                formattedAnswer = results;
                            } catch (e) {}
                        }
                        // 16 圖片點選題：保留點選座標（歷程中畫熱點圖與判斷對錯），作答欄顯示位置文字
                        let point = null;
                        if (currentInteractionMode === 'hotspot') {
                            point = parseHotspotAnswer(student.answer);
                            if (point) formattedAnswer = `點選位置：左起 ${(point.x * 100).toFixed(1)}%、上起 ${(point.y * 100).toFixed(1)}%`;
                        }

                        let tsStr = new Date().toLocaleString('zh-TW');
                        if (student.timestamp) {
                            if (typeof student.timestamp.toDate === 'function') {
                                tsStr = student.timestamp.toDate().toLocaleString('zh-TW');
                            } else if (student.timestamp.seconds) {
                                tsStr = new Date(student.timestamp.seconds * 1000).toLocaleString('zh-TW');
                            } else {
                                const d = new Date(student.timestamp);
                                if (!isNaN(d.getTime())) {
                                    tsStr = d.toLocaleString('zh-TW');
                                }
                            }
                        }
                        
                        lastInteraction.responses[student.name] = {
                            answer: formattedAnswer,
                            isCorrect: isCorrect,
                            timestamp: tsStr,
                            ...(point ? { point } : {})
                        };
                    }
                });
                
                saveClassroomHistorySafely(historyKey, history);
            }
        }

        /**
         * 將互動紀錄中的繪圖 base64 圖片替換為文字佔位符，回傳是否有移除任何圖片。
         */
        function stripDrawingDataFromInteraction(interaction) {
            let stripped = false;
            if (interaction && interaction.responses) {
                Object.keys(interaction.responses).forEach(name => {
                    const r = interaction.responses[name];
                    if (r && typeof r.answer === 'string' && r.answer.startsWith('data:image')) {
                        r.answer = '【繪圖作品：因瀏覽器儲存空間限制，未保存於歷程】';
                        stripped = true;
                    }
                });
            }
            return stripped;
        }

        /**
         * V6.3: 課程歷程改存 IndexedDB（配額數百 MB），不再需要 localStorage 的
         * 5MB 降級流程（移除繪圖改佔位文字），100+ 人的繪圖作品可完整保留。
         * stripDrawingDataFromInteraction 保留備用（不再於正常流程呼叫）。
         */
        function saveClassroomHistorySafely(historyKey, history) {
            ClassHistoryStore.set(historyKey, history);
            return true;
        }

        /**
         * 產生歷程紀錄 HTML 內容
         */
        function generateHistoryHtml(code, history, historyImages = new Map()) { // historyImages：事件 → 預先繪製的結果圖（16 圖片點選題熱點圖）
            const totalInteractions = history.filter(h => h.type === 'interaction').length;
            const uniqueStudents = new Set();
            history.forEach(h => {
                if (h.responses) {
                    Object.keys(h.responses).forEach(name => uniqueStudents.add(name));
                }
            });
            const studentCount = uniqueStudents.size;
            const startTime = history.length > 0 ? history[0].timestamp : '未知';
            
            let timelineHtml = '';
            
            history.forEach((event, idx) => {
                if (event.type === 'class_start') {
                    timelineHtml += `
                    <div class="timeline-item">
                        <div class="timeline-badge bg-blue-500">
                            <i class="fas fa-play"></i>
                        </div>
                        <div class="timeline-panel">
                            <div class="timeline-heading">
                                <h4 class="text-lg font-bold text-blue-600">課程開始</h4>
                                <p><small class="text-gray-500"><i class="far fa-clock"></i> ${event.timestamp}</small></p>
                            </div>
                            <div class="timeline-body mt-2">
                                <p class="text-gray-700">教師開啟了教室代碼：<strong>${code}</strong></p>
                            </div>
                        </div>
                    </div>`;
                } 
                else if (event.type === 'ctp_usage') {
                    const icon = event.toolName === '同步白板' ? 'fa-chalkboard' : 'fa-file-powerpoint';
                    const color = event.toolName === '同步白板' ? 'bg-teal-500' : 'bg-orange-500';
                    const textColor = event.toolName === '同步白板' ? 'text-teal-600' : 'text-orange-600';
                    timelineHtml += `
                    <div class="timeline-item">
                        <div class="timeline-badge ${color}">
                            <i class="fas ${icon}"></i>
                        </div>
                        <div class="timeline-panel">
                            <div class="timeline-heading">
                                <h4 class="text-lg font-bold ${textColor}">${event.toolName}</h4>
                                <p><small class="text-gray-500"><i class="far fa-clock"></i> ${event.timestamp}</small></p>
                            </div>
                            <div class="timeline-body mt-2">
                                <p class="text-gray-700">教師啟動了<strong>${event.toolName}</strong>工具。</p>
                            </div>
                        </div>
                    </div>`;
                }
                else if (event.type === 'interaction') {
                    const mode = event.mode;
                    const toolName = event.toolName;
                    const startTime = event.timestamp;
                    const responses = event.responses || {};
                    const responseCount = Object.keys(responses).length;
                    
                    let icon = 'fa-comments';
                    let color = 'bg-purple-500';
                    let textColor = 'text-purple-600';
                    
                    switch(mode) {
                        case 'true_false': icon = 'fa-check-double'; color = 'bg-green-500'; textColor = 'text-green-600'; break;
                        case 'multiple_choice': icon = 'fa-list-ol'; color = 'bg-blue-500'; textColor = 'text-blue-600'; break;
                        case 'text_input': icon = 'fa-keyboard'; color = 'bg-indigo-500'; textColor = 'text-indigo-600'; break;
                        case 'word_cloud': icon = 'fa-cloud'; color = 'bg-cyan-500'; textColor = 'text-cyan-600'; break;
                        case 'sticky_note': icon = 'fa-sticky-note'; color = 'bg-yellow-500'; textColor = 'text-yellow-600'; break;
                        case 'focus_game': icon = 'fa-gamepad'; color = 'bg-pink-500'; textColor = 'text-pink-600'; break;
                        case 'drawing': icon = 'fa-paint-brush'; color = 'bg-rose-500'; textColor = 'text-rose-600'; break;
                        case 'url_dispatch': icon = 'fa-paper-plane'; color = 'bg-sky-500'; textColor = 'text-sky-600'; break;
                        case 'recording': icon = 'fa-microphone'; color = 'bg-red-500'; textColor = 'text-red-600'; break;
                        case 'reading_comprehension': icon = 'fa-book-open'; color = 'bg-emerald-500'; textColor = 'text-emerald-600'; break;
                        case 'quick_answer': icon = 'fa-bolt'; color = 'bg-amber-500'; textColor = 'text-amber-600'; break;
                        case 'quick_poll': icon = 'fa-poll'; color = 'bg-violet-500'; textColor = 'text-violet-600'; break;
                        case 'sequencing': icon = 'fa-sort-amount-down'; color = 'bg-lime-500'; textColor = 'text-lime-600'; break;
                        case 'matching': icon = 'fa-link'; color = 'bg-fuchsia-500'; textColor = 'text-fuchsia-600'; break;
                        case 'calc': icon = 'fa-calculator'; color = 'bg-sky-500'; textColor = 'text-sky-600'; break;
                        case 'hotspot': icon = 'fa-crosshairs'; color = 'bg-red-500'; textColor = 'text-red-600'; break;
                    }
                    
                    let questionHtml = '';
                    const details = event.details || {};
                    
                    if (mode === 'multiple_choice' && details.questions) {
                        questionHtml = `<div class="question-box bg-slate-50 p-4 rounded-lg border border-slate-200 mt-2 mb-4">
                            <span class="font-bold text-slate-800">📖 自訂選擇題題目內容：</span>
                            <ul class="list-decimal pl-5 mt-2 text-slate-700 space-y-3">`;
                        details.questions.forEach((q, qidx) => {
                            questionHtml += `<li>
                                <div class="font-bold">${q.questionText}</div>
                                <div class="grid grid-cols-2 gap-2 mt-1 text-sm text-gray-600">
                                    <div>1. ${q.options[0] || ''}</div>
                                    <div>2. ${q.options[1] || ''}</div>
                                    <div>3. ${q.options[2] || ''}</div>
                                    <div>4. ${q.options[3] || ''}</div>
                                </div>
                                <div class="text-green-600 font-bold text-sm mt-1">正解：${q.correctAnswer}</div>
                            </li>`;
                        });
                        questionHtml += `</ul></div>`;
                    } 
                    else if (mode === 'sequencing' && details.question) {
                        questionHtml = `<div class="question-box bg-slate-50 p-4 rounded-lg border border-slate-200 mt-2 mb-4">
                            <div class="font-bold text-slate-800">📖 排序題題目：<span class="text-blue-600">${details.question}</span></div>
                            <div class="text-green-600 font-bold text-sm mt-2">正確順序：${(details.correctOrder || []).join(' → ')}</div>
                        </div>`;
                    } 
                    else if (mode === 'matching' && details.question) {
                        questionHtml = `<div class="question-box bg-slate-50 p-4 rounded-lg border border-slate-200 mt-2 mb-4">
                            <div class="font-bold text-slate-800">📖 配對題題目：<span class="text-blue-600">${details.question}</span></div>
                            <div class="mt-2 text-sm text-gray-700">
                                <span class="font-bold">正確配對組合：</span>
                                <div class="flex flex-wrap gap-3 mt-1">`;
                        (details.pairs || []).forEach(p => {
                            questionHtml += `<span class="bg-gray-200 px-3 py-1 rounded text-xs">${p.left} 🔗 ${p.right}</span>`;
                        });
                        questionHtml += `</div></div></div>`;
                    } 
                    else if (mode === 'reading_comprehension' && details.questions) {
                        questionHtml = `<div class="question-box bg-slate-50 p-4 rounded-lg border border-slate-200 mt-2 mb-4">
                            <div class="font-bold text-slate-800">📖 閱讀測驗文本：</div>
                            <p class="text-slate-600 whitespace-pre-wrap border-l-4 border-emerald-500 pl-3 py-1 bg-white rounded my-2 text-sm">${details.text || ''}</p>
                            <span class="font-bold text-slate-800 mt-2 block">測驗題目：</span>
                            <ol class="list-decimal pl-5 mt-1 text-slate-700 space-y-3">`;
                        details.questions.forEach((q, qidx) => {
                            questionHtml += `<li>
                                <div class="font-bold">${q.question}</div>
                                <div class="grid grid-cols-2 gap-2 mt-1 text-sm text-gray-600">
                                    <div>1. ${q.options[0] || ''}</div>
                                    <div>2. ${q.options[1] || ''}</div>
                                    <div>3. ${q.options[2] || ''}</div>
                                    <div>4. ${q.options[3] || ''}</div>
                                </div>
                                <div class="text-green-600 font-bold text-sm mt-1">正解：${q.correctAnswer}</div>
                            </li>`;
                        });
                        questionHtml += `</ol></div>`;
                    }
                    else if (mode === 'hotspot' && historyImages.get(event)) { // 16 圖片點選題：熱點圖結果
                        questionHtml = `<div class="question-box bg-slate-50 p-4 rounded-lg border border-slate-200 mt-2 mb-4">
                            <div class="font-bold text-slate-800 mb-2">🎯 全班點選位置（熱點圖，越多人點選的地方越紅）</div>
                            <img src="${historyImages.get(event)}" class="max-w-full rounded-lg border cursor-zoom-in" onclick="viewImage(this.src)">
                            ${details.region ? '<p class="text-xs text-emerald-700 mt-2">綠色虛線圈選處為老師設定的正確區域；綠點為答對、紅點為答錯。</p>' : ''}
                        </div>`;
                    }

                    let correctCount = 0;
                    let gradableCount = 0;
                    let responsesTableRows = '';
                    
                    Object.keys(responses).forEach(name => {
                        const r = responses[name];
                        let isCorrectText = '-';
                        let rowClass = '';
                        // 16 圖片點選題：依老師圈選的正確區域判斷對錯（沒有圈選時視為已提交）
                        const isCorrect = mode === 'hotspot'
                            ? (details.region && r.point ? inHotspotRegion(r.point, details.region) : null)
                            : r.isCorrect;

                        if (isCorrect !== null && isCorrect !== undefined) {
                            gradableCount++;
                            if (isCorrect) {
                                correctCount++;
                                isCorrectText = '<span class="px-2 py-1 bg-green-100 text-green-800 rounded font-bold text-xs"><i class="fas fa-check"></i> 正確</span>';
                            } else {
                                isCorrectText = '<span class="px-2 py-1 bg-red-100 text-red-800 rounded font-bold text-xs"><i class="fas fa-times"></i> 錯誤</span>';
                                rowClass = 'bg-red-50/30';
                            }
                        } else {
                            // 對於非自動評分的題型 (如文字、繪圖、錄音)，顯示已提交
                            isCorrectText = '<span class="px-2 py-1 bg-blue-100 text-blue-800 rounded font-bold text-xs"><i class="fas fa-paper-plane"></i> 已提交</span>';
                        }
                        
                        let displayAnswer = '';
                        let parsedData = null;
                        let isParsed = false;

                        if (typeof r.answer === 'string') {
                            try {
                                const parsed = JSON.parse(r.answer);
                                if (parsed && typeof parsed === 'object') {
                                    parsedData = parsed;
                                    isParsed = true;
                                }
                            } catch (e) {
                                // 非 JSON 字串，保持 isParsed = false
                            }
                        } else if (r.answer && typeof r.answer === 'object' && !Array.isArray(r.answer)) {
                            parsedData = r.answer;
                            isParsed = true;
                        }

                        if (isParsed && parsedData) {
                            if (parsedData.type === 'text') {
                                displayAnswer = `<span class="whitespace-pre-wrap">${parsedData.content || ''}</span>`;
                            } else if (parsedData.type === 'image') {
                                if (String(parsedData.content).startsWith('data:image')) {
                                    displayAnswer = `<img src="${parsedData.content}" class="h-20 max-w-xs object-contain border rounded cursor-zoom-in hover:opacity-85 transition" onclick="viewImage('${parsedData.content}')">`;
                                } else {
                                    displayAnswer = `<span class="text-gray-500">圖片格式錯誤</span>`;
                                }
                            } else {
                                displayAnswer = `<span class="whitespace-pre-wrap">${JSON.stringify(parsedData)}</span>`;
                            }
                        } else if (typeof r.answer === 'string') {
                            if (r.answer.startsWith('data:image')) {
                                displayAnswer = `<img src="${r.answer}" class="h-20 max-w-xs object-contain border rounded cursor-zoom-in hover:opacity-85 transition" onclick="viewImage('${r.answer}')">`;
                            } else if (r.answer.startsWith('data:audio')) {
                                displayAnswer = `<audio controls src="${r.answer}" class="max-w-xs w-full"></audio>`;
                            } else {
                                displayAnswer = `<span class="whitespace-pre-wrap">${r.answer}</span>`;
                            }
                        } else if (Array.isArray(r.answer)) {
                            displayAnswer = '<div class="space-y-1 text-xs">';
                            r.answer.forEach(item => {
                                if (mode === 'multiple_choice') {
                                    displayAnswer += `<div>Q${item.questionIndex + 1}: <span class="font-bold text-blue-600">${item.answer}</span> ${item.isCorrect ? '✅' : '❌ (正解: ' + item.correctAnswer + ')'}</div>`;
                                } else if (mode === 'sequencing') {
                                    displayAnswer += `<div>${item.item} ${item.isCorrect ? '✅' : '❌ (正確為: ' + item.correctItem + ')'}</div>`;
                                } else if (mode === 'matching') {
                                    displayAnswer += `<div>${item.left} 🔗 ${item.right} ${item.isCorrect ? '✅' : '❌ (正確為: ' + item.correctRight + ')'}</div>`;
                                } else if (mode === 'reading_comprehension') {
                                    displayAnswer += `<div>Q${item.questionIndex + 1}: <span class="font-bold text-blue-600">${item.answer || '未答'}</span> ${item.isCorrect ? '✅' : '❌ (正解: ' + item.correctAnswer + ')'}</div>`;
                                }
                            });
                            displayAnswer += '</div>';
                        } else {
                            displayAnswer = `<span class="whitespace-pre-wrap">${JSON.stringify(r.answer)}</span>`;
                        }
                        
                        responsesTableRows += `
                        <tr class="${rowClass} border-b border-slate-100 hover:bg-slate-50 transition">
                            <td class="px-6 py-4 font-bold text-slate-800">${name}</td>
                            <td class="px-6 py-4 text-slate-700">${displayAnswer}</td>
                            <td class="px-6 py-4 text-center">${isCorrectText}</td>
                            <td class="px-6 py-4 text-gray-500 text-sm">${r.timestamp}</td>
                        </tr>`;
                    });
                    
                    let statsHtml = '';
                    if (gradableCount > 0) {
                        const correctRate = Math.round((correctCount / gradableCount) * 100);
                        statsHtml = `
                        <div class="flex items-center gap-4 my-3 bg-slate-50 p-3 rounded-lg border border-slate-200/50">
                            <div class="text-sm font-semibold text-slate-700">答題正解率：</div>
                            <div class="flex-grow bg-slate-200 rounded-full h-4 overflow-hidden max-w-md">
                                <div class="bg-green-500 h-full rounded-full transition-all" style="width: ${correctRate}%"></div>
                            </div>
                            <div class="font-bold text-green-600">${correctRate}% <span class="text-gray-500 text-xs font-normal">(${correctCount}/${gradableCount} 人答對)</span></div>
                        </div>`;
                    }
                    
                    timelineHtml += `
                    <div class="timeline-item">
                        <div class="timeline-badge ${color}">
                            <i class="fas ${icon}"></i>
                        </div>
                        <div class="timeline-panel">
                            <div class="timeline-heading flex justify-between items-start flex-wrap gap-2">
                                <div>
                                    <h4 class="text-lg font-bold ${textColor}">${toolName} <span class="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded ml-2 font-normal">互動工具</span></h4>
                                    <p><small class="text-gray-500"><i class="far fa-clock"></i> ${startTime}</small></p>
                                </div>
                                <span class="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold border border-indigo-100">作答人數: ${responseCount} 人</span>
                            </div>
                            <div class="timeline-body mt-3">
                                ${questionHtml}
                                ${statsHtml}
                                ${responseCount > 0 ? `
                                <div class="overflow-x-auto border border-slate-200 rounded-xl mt-4">
                                    <table class="min-w-full divide-y divide-slate-200 text-left">
                                        <thead class="bg-slate-100/80 font-bold text-slate-700 text-sm">
                                            <tr>
                                                <th class="px-6 py-3">學生姓名</th>
                                                <th class="px-6 py-3">作答內容</th>
                                                <th class="px-6 py-3 text-center">結果</th>
                                                <th class="px-6 py-3">作答時間</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-slate-100 text-slate-600">
                                            ${responsesTableRows}
                                        </tbody>
                                    </table>
                                </div>` : '<p class="text-gray-400 italic text-center py-4 bg-gray-50 rounded-lg border border-dashed mt-2">本次互動無人作答</p>'}
                            </div>
                        </div>
                    </div>`;
                }
            });
            
            return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>剛好學 - 課堂互動歷程紀錄 (教室代碼: ${code})</title>
    <script src="https://cdn.tailwindcss.com"><\/script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        body {
            font-family: 'Noto Sans TC', sans-serif;
            background-color: #f8fafc;
        }
        .timeline {
            position: relative;
            padding: 20px 0;
            list-style: none;
        }
        .timeline:before {
            content: " ";
            position: absolute;
            top: 0;
            bottom: 0;
            left: 28px;
            width: 3px;
            background-color: #e2e8f0;
        }
        .timeline-item {
            position: relative;
            margin-bottom: 24px;
        }
        .timeline-badge {
            position: absolute;
            top: 15px;
            left: 10px;
            width: 38px;
            height: 38px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            z-index: 10;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
        }
        .timeline-panel {
            position: relative;
            width: calc(100% - 70px);
            left: 70px;
            background: white;
            border: 1px solid #f1f5f9;
            border-radius: 1.25rem;
            padding: 1.5rem;
            box-shadow: 0 10px 15px -3px rgba(0,0,0,0.02), 0 4px 6px -2px rgba(0,0,0,0.01);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .timeline-panel:hover {
            transform: translateY(-2px);
            box-shadow: 0 20px 25px -5px rgba(0,0,0,0.05);
        }
    </style>
</head>
<body class="py-10">
    <div class="max-w-6xl mx-auto px-4">
        <div class="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-3xl p-8 md:p-12 text-white shadow-xl mb-10 flex flex-col md:flex-row md:justify-between md:items-center gap-6">
            <div>
                <span class="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-bold tracking-wider mb-2 inline-block backdrop-blur-sm">互動歷程紀錄</span>
                <h1 class="text-3xl md:text-4xl font-black mb-2">剛好學：課堂互動so easy</h1>
                <p class="text-blue-100 text-sm md:text-base">本堂課的上課歷程紀錄，包含教師使用的互動工具、學生回答及題目內容。</p>
            </div>
            <div class="bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/20 flex flex-col gap-1 min-w-[200px]">
                <div class="text-xs text-blue-200">教室代碼</div>
                <div class="text-2xl font-black tracking-wider text-yellow-300">${code}</div>
                <div class="text-xs text-blue-200 mt-2">匯出時間：${new Date().toLocaleString('zh-TW')}</div>
            </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            <div class="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl">
                    <i class="fas fa-play"></i>
                </div>
                <div>
                    <div class="text-xs text-gray-500 font-medium">課程開啟時間</div>
                    <div class="text-lg font-bold text-slate-800">${startTime}</div>
                </div>
            </div>
            
            <div class="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center text-xl">
                    <i class="fas fa-comments"></i>
                </div>
                <div>
                    <div class="text-xs text-gray-500 font-medium">發起互動次數</div>
                    <div class="text-2xl font-black text-slate-800">${totalInteractions} 次</div>
                </div>
            </div>

            <div class="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl">
                    <i class="fas fa-users"></i>
                </div>
                <div>
                    <div class="text-xs text-gray-500 font-medium">參與學生人數</div>
                    <div class="text-2xl font-black text-slate-800">${studentCount} 人</div>
                </div>
            </div>
        </div>

        <div class="flex items-center gap-3 mb-6">
            <div class="h-8 w-1.5 bg-blue-600 rounded-full"></div>
            <h2 class="text-xl font-black text-slate-800">課堂歷程時間軸</h2>
        </div>

        <div class="timeline">
            ${timelineHtml}
        </div>
    </div>

    <div id="image-modal" class="fixed inset-0 bg-black/90 hidden z-50 flex items-center justify-center p-4 backdrop-blur-sm transition-opacity" onclick="closeImage()">
        <button class="absolute top-6 right-6 text-white text-3xl hover:text-gray-300 transition" onclick="closeImage()">
            <i class="fas fa-times"></i>
        </button>
        <img id="modal-img" class="max-w-full max-h-[90vh] object-contain rounded shadow-2xl scale-95 transition-transform duration-300" onclick="event.stopPropagation()">
    </div>

    <script>
        function viewImage(src) {
            const modal = document.getElementById('image-modal');
            const img = document.getElementById('modal-img');
            img.src = src;
            modal.classList.remove('hidden');
            setTimeout(() => {
                img.classList.remove('scale-95');
                img.classList.add('scale-100');
            }, 10);
        }
        function closeImage() {
            const modal = document.getElementById('image-modal');
            const img = document.getElementById('modal-img');
            img.classList.remove('scale-100');
            img.classList.add('scale-95');
            setTimeout(() => {
                modal.classList.add('hidden');
                img.src = '';
            }, 200);
        }
    <\/script>
</body>
</html>`;
        }

        /**
         * 下載歷程紀錄 HTML 檔案
         */
        async function downloadClassroomHistory(code) {
            const historyKey = `classHistory_${code}`;
            // V6.3: 從 IndexedDB 載入完整歷程（含尚未落盤的最新快取），並先強制落盤
            await ClassHistoryStore.flush(historyKey);
            let history = (await ClassHistoryStore.load(historyKey)).slice();
            // 如果沒有歷程資料，自動補上一筆開啟課程事件，確保能生成報告
            if (history.length === 0) {
                history = [{
                    type: 'class_start',
                    timestamp: new Date().toLocaleString('zh-TW'),
                    toolName: '開啟課程',
                    details: { isNew: true }
                }];
            }
            const historyImages = await buildHotspotHistoryImages(history); // 16 圖片點選題：繪製熱點圖結果
            const htmlContent = generateHistoryHtml(code, history, historyImages);
            
            const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `課堂歷程紀錄_${code}_${new Date().toISOString().slice(0, 10)}.html`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            console.log(`[歷程紀錄] 已成功生成並下載教室代碼 ${code} 的上課歷程檔案`);
        }

        /**
         * (Teacher) Ends the entire class session, clears all student data and presence for the current classroom code.
         */
        async function endClassSession() {
            if (!classroomCode) return;

            // 1. 先確認是否真的要結束課程 (避免誤觸)
            const confirmEnd = await customConfirm("您確定要結束本堂課程（下課）並清空所有資料嗎？");
            if (!confirmEnd) {
                console.log("[下課動作] 使用者已取消下課");
                return;
            }

            // 2. 詢問是否要下載歷程 HTML 檔案
            const confirmDownload = await customConfirm("在結束課程前，您是否要下載本堂課的歷程紀錄 HTML 檔案？");
            if (confirmDownload) {
                try {
                    await downloadClassroomHistory(classroomCode);
                } catch (err) {
                    console.error("下載歷程失敗", err);
                    showMessage('下載歷程檔案失敗，但將繼續結束課程。', 'error');
                }
            }

            const targetCode = classroomCode; // 暫存 code 確保後續清除資料的正確性

            // 下課清空本地歷程紀錄暫存
            const historyKey = `classHistory_${targetCode}`;
            ClassHistoryStore.remove(historyKey); // V6.3: 同時清除 IndexedDB 與舊 localStorage
            console.log(`[歷程紀錄] 已清空本機儲存的上課歷程內容`);

            markClassEnded(); // Mark that class has been properly ended
            clearAllQuestionBanks(); // Clear question banks from memory
            showMessage('正在結束課程並清空資料...', 'info');

            if (interactionModeUnsubscribe) interactionModeUnsubscribe();
            stopDrawingBackgroundListener(); // 05 繪圖題：背景圖監聽
            stopDispatchScreenshotListener(); // 06 派送網址/HTML：學生截圖監聽
            if (studentResponsesUnsubscribe) studentResponsesUnsubscribe();
            if (classroomPresenceUnsubscribe) { // Only unsubscribe presence here
                classroomPresenceUnsubscribe();
                classroomPresenceUnsubscribe = null;
            }
            interactionModeUnsubscribe = studentResponsesUnsubscribe = null; // Reset others

            try {
                // 一次刪除教室文件與其底下所有資料（作答、在線、設定、白板/簡報…），由伺服器端處理，不需逐筆讀取
                await deleteTree(doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', targetCode));

                console.log(`[Teacher] Cleared all data for classroom: ${targetCode}`);

                // Remove classroom code from recent classrooms list
                removeRecentClassroom(targetCode);

                classroomCode = null; // Clear the classroom code after ending session
                localStorage.removeItem('teacherClassroomCode'); // Clear from local storage

                studentName = null;
                currentRole = null;
                currentInteractionMode = null;
                allStudentResponses = [];
                activeStudentNames = []; // NEW: Clear active student names
                lastSelectedStudentCard = null;
                lastSelectedModalStudent = null; // NEW: Clear modal lottery highlight
                isResponsePaused = false; // NEW: Reset pause state
                currentMultipleChoiceQuestions = null; // NEW: Clear custom MC questions

                document.getElementById('student-responses-container').innerHTML = '<p class="text-gray-500 text-center col-span-full">正在等待學生作答...</p>';
                document.getElementById('active-student-count').textContent = '0';
                // REMOVED: document.getElementById('responded-student-count').textContent = '0';
                document.getElementById('teacher-image-status').textContent = '目前沒有背景圖片。可選擇檔案或直接貼上(Ctrl+V)。';
                document.getElementById('teacher-image-preview').src = '';
                document.getElementById('teacher-image-preview-container').classList.add('hidden');

                // Clear URL/HTML dispatch settings and teacher background image when ending interaction
                clearDispatchSettings(); // Use the combined clear function
                teacherUploadedBackgroundImageDataURL = null;
                document.getElementById('teacher-image-status').textContent = '目前沒有背景圖片。可選擇檔案或直接貼上(Ctrl+V)。';
                document.getElementById('teacher-image-preview').src = '';
                document.getElementById('teacher-image-preview-container').classList.add('hidden');
                isResponsePaused = false; // NEW: Reset pause state
                updateTeacherPauseButtonUI(); // NEW: Update pause button UI

                // 換發新的使用者 ID（相當於原本的登出再匿名登入）
                userId = getUserId(true);
                document.getElementById('user-id-display').textContent = userId;

                showView('entry'); // Show the entry view
                showMessage('課程已結束，資料已清空。', 'success');

            } catch (error) {
                console.error("結束課程並清空資料失敗:", error);
                showMessage("結束課程失敗，請檢查網路連線或聯繫管理員。", "error");
            }
        }

        /**
         * (Teacher) Attach to a classroom and show the teacher panel.
         * @param {string} code - Classroom code.
         * @param {Object} opts
         * @param {boolean} opts.isNew    - true = brand new classroom (reset control state).
         * @param {string}  opts.passwordHash - SHA-256 hash to store (only when isNew).
         */
        async function enterClassroom(code, { isNew = false, passwordHash = null } = {}) {
            // V6.2: 教室可能正由另一位老師（不同裝置）使用中，避免默默接管、兩班學生混在一起
            if (!isNew) {
                try {
                    const ctrlSnap = await getDoc(doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', code, 'settings', 'control'));
                    const existingTeacher = ctrlSnap.exists() ? ctrlSnap.data().teacherId : null;
                    if (existingTeacher && existingTeacher !== userId) {
                        const ok = await customConfirm('教室「' + code + '」可能有另一位老師正在使用中（或你曾在其他裝置開啟）。確定要接管這間教室嗎？');
                        if (!ok) return;
                    }
                } catch (e) { console.warn('檢查教室使用狀態失敗（略過）:', e); }
            }
            classroomCode = code;
            currentRole = 'teacher';
            
            // 如果是全新開啟的課程，我們就初始化全新的歷史紀錄
            if (isNew) {
                ClassHistoryStore.remove(`classHistory_${code}`); // V6.3
            } else {
                // V6.3: 先把既有歷程從 IndexedDB 載入快取，後續事件才會接在舊紀錄之後
                try { await ClassHistoryStore.load(`classHistory_${code}`); } catch (e) { /* ignore */ }
            }
            // 寫入「開啟課程」事件
            logClassroomHistory('class_start', '開啟課程', { isNew: isNew });
            document.getElementById('end-class-button-text').textContent = `下課 教室代碼: ${classroomCode}`;
            document.getElementById('end-class-monitor-button-text').textContent = `下課 教室代碼: ${classroomCode}`;
            localStorage.setItem('teacherClassroomCode', classroomCode);
            saveRecentClassroom(classroomCode);

            if (isNew) {
                // Write the classroom-level document (password + metadata, drives the open-classroom list)
                const classroomDocRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', code);
                await setDoc(classroomDocRef, {
                    hasPassword: !!passwordHash,
                    passwordHash: passwordHash || null,
                    teacherId: userId,
                    createdAt: Date.now(),
                    active: true
                });

                // Reset control state so students don't see a stale mode from a previous session.
                const controlRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', code, 'settings', 'control');
                await setDoc(controlRef, {
                    active_mode: 'waiting',
                    teacherId: userId,
                    isPaused: false,
                    multiple_choice_questions: null,
                    sequencingSettings: null,
                    matchingSettings: null,
                    readingComprehensionData: null,
                    focusGameSettings: null,
                    dispatchSettings: null
                });
                currentMultipleChoiceQuestions = null;
            }
            // When re-entering an existing classroom we keep its current control state intact.

            isResponsePaused = false;
            updateTeacherPauseButtonUI();

            loadQuestionBanksFromStorage();
            loadSequencingBanksFromStorage();
            loadMatchingBanksFromStorage();
            loadReadingBanksFromStorage();

            listenToClassroomPresence();
            showView('teacherMenu');
            document.getElementById('teacher-classroom-code-input').value = '';
            const pwInput = document.getElementById('teacher-new-classroom-password');
            if (pwInput) pwInput.value = '';
        }

        /**
         * (Teacher) Read all currently-open classrooms from Firestore and render the list
         * with per-row 進入 / 下課 buttons. Password-protected rooms show a lock icon.
         */
        async function loadOpenClassrooms() {
            const listEl = document.getElementById('teacher-open-classrooms-list');
            if (!listEl) return;
            if (!db) {
                listEl.innerHTML = '<p class="text-amber-500 text-sm text-center py-4">尚未連線至資料庫，無法讀取教室清單。</p>';
                return;
            }
            listEl.innerHTML = '<p class="text-slate-400 text-sm text-center py-4">載入中…</p>';
            try {
                const classroomsCol = collection(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms');
                const snapshot = await getDocs(classroomsCol);

                const rooms = [];
                snapshot.forEach(d => {
                    const data = d.data() || {};
                    if (data.active) rooms.push({ code: d.id, hasPassword: !!data.hasPassword });
                });
                rooms.sort((a, b) => a.code.localeCompare(b.code));

                if (rooms.length === 0) {
                    listEl.innerHTML = '<p class="text-slate-400 text-sm text-center py-4">目前沒有已開啟的教室，請於下方建立新教室。</p>';
                    return;
                }

                listEl.innerHTML = '';
                rooms.forEach(room => {
                    const row = document.createElement('div');
                    row.className = 'flex items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl';
                    const lock = room.hasPassword
                        ? '<i class="fas fa-lock text-amber-500 ml-2" title="已設定密碼"></i>'
                        : '<i class="fas fa-lock-open text-slate-300 ml-2" title="未設定密碼"></i>';
                    row.innerHTML = `
                        <span class="font-bold text-slate-700 truncate">${escapeHtml(room.code)}${lock}</span>
                        <span class="flex-shrink-0 flex gap-2">
                            <button type="button" class="enter-classroom-btn px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg font-bold hover:bg-blue-600 transition">
                                <i class="fas fa-arrow-right-to-bracket mr-1"></i>進入
                            </button>
                            <button type="button" class="end-classroom-btn px-3 py-1.5 bg-red-500 text-white text-sm rounded-lg font-bold hover:bg-red-600 transition">
                                <i class="fas fa-door-closed mr-1"></i>下課
                            </button>
                        </span>`;
                    row.querySelector('.enter-classroom-btn').addEventListener('click', () => handleEnterClassroomFromList(room));
                    row.querySelector('.end-classroom-btn').addEventListener('click', () => handleEndClassroomFromList(room));
                    listEl.appendChild(row);
                });
            } catch (error) {
                console.error('讀取教室清單失敗:', error);
                listEl.innerHTML = '<p class="text-red-500 text-sm text-center py-4">讀取教室清單失敗，請檢查網路連線。</p>';
            }
        }

        /** Handle "進入" from the open-classroom list (asks for password when required). */
        async function handleEnterClassroomFromList(room) {
            if (room.hasPassword) {
                const pw = await promptClassroomPassword('進入教室需要密碼', `教室代碼：${room.code}`);
                if (pw === null) return; // cancelled
                if (!(await verifyClassroomPassword(room.code, pw))) {
                    showMessage('密碼錯誤，無法進入。', 'error');
                    return;
                }
            }
            await enterClassroom(room.code, { isNew: false });
        }

        /** Handle "下課" from the open-classroom list: delete the classroom's data (password required when set). */
        async function handleEndClassroomFromList(room) {
            if (room.hasPassword) {
                const pw = await promptClassroomPassword('下課需要密碼', `將刪除教室「${room.code}」的所有資料`);
                if (pw === null) return;
                if (!(await verifyClassroomPassword(room.code, pw))) {
                    showMessage('密碼錯誤，無法下課。', 'error');
                    return;
                }
            } else {
                const confirmed = await customConfirm(`確定要結束教室「${room.code}」並清空其所有資料嗎？`);
                if (!confirmed) return;
            }
            await deleteClassroomData(room.code);
            showMessage(`教室「${room.code}」已下課，資料已清空。`, 'success');
            loadOpenClassrooms();
        }

        /**
         * Delete all data for a classroom code WITHOUT touching the current teacher's local session.
         * Used by the open-classroom list's 下課 button.
         */
        async function deleteClassroomData(code) {
            try {
                // 一次刪除教室文件與其底下所有資料（含同步白板/簡報），由伺服器端處理
                await deleteTree(doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', code));

                removeRecentClassroom(code);
                console.log(`[Teacher] Deleted classroom from list: ${code}`);
            } catch (error) {
                console.error(`刪除教室 ${code} 失敗:`, error);
                showMessage('下課失敗，請檢查網路連線。', 'error');
                throw error;
            }
        }

        /**
         * (Teacher) Leave classroom without deleting data - just clear local state and return to entry view
         */
        async function leaveClassroom() {
            const confirmed = await customConfirm('確定要暫離教室嗎？教室資料會保留，您稍後可以重新進入。');
            if (!confirmed) {
                return;
            }

            showMessage('正在離開教室...', 'info');

            // Unsubscribe from all listeners
            if (interactionModeUnsubscribe) interactionModeUnsubscribe();
            stopDrawingBackgroundListener(); // 05 繪圖題：背景圖監聽
            stopDispatchScreenshotListener(); // 06 派送網址/HTML：學生截圖監聽
            if (studentResponsesUnsubscribe) studentResponsesUnsubscribe();
            if (classroomPresenceUnsubscribe) {
                classroomPresenceUnsubscribe();
                classroomPresenceUnsubscribe = null;
            }
            interactionModeUnsubscribe = studentResponsesUnsubscribe = null;

            // Clear local state (but don't delete Firestore data)
            classroomCode = null;
            localStorage.removeItem('teacherClassroomCode'); // Clear from local storage

            studentName = null;
            currentRole = null;
            currentInteractionMode = null;
            allStudentResponses = [];
            activeStudentNames = [];
            lastSelectedStudentCard = null;
            lastSelectedModalStudent = null;
            isResponsePaused = false;
            currentMultipleChoiceQuestions = null;

            // Clear question bank arrays from memory
            questionBanks = [];
            sequencingQuestionBanks = [];
            matchingQuestionBanks = [];
            readingQuestionBanks = [];

            // Clear UI
            document.getElementById('student-responses-container').innerHTML = '<p class="text-gray-500 text-center col-span-full">正在等待學生作答...</p>';
            document.getElementById('active-student-count').textContent = '0';
            document.getElementById('teacher-image-status').textContent = '目前沒有背景圖片。可選擇檔案或直接貼上(Ctrl+V)。';
            document.getElementById('teacher-image-preview').src = '';
            document.getElementById('teacher-image-preview-container').classList.add('hidden');

            clearDispatchSettings();
            teacherUploadedBackgroundImageDataURL = null;
            updateTeacherPauseButtonUI();

            // Return to entry view
            showView('entry');
            showMessage('已離開教室，資料已保留。', 'success');

            console.log('[Teacher] Left classroom without deleting data');
        }

        // NEW: Pause/Resume Response Logic
        const togglePauseBtn = document.getElementById('toggle-pause-btn');
        const togglePauseBtnText = document.getElementById('toggle-pause-btn-text');

        /**
         * Toggles the pause state for student responses in Firestore.
         */
        async function toggleResponsePause() {
            if (!classroomCode) {
                showMessage('請先開啟一個教室！', 'error');
                return;
            }
            const controlRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'settings', 'control');
            try {
                isResponsePaused = !isResponsePaused; // Toggle local state
                await setDoc(controlRef, { isPaused: isResponsePaused }, { merge: true });
                showMessage(`學生回覆已${isResponsePaused ? '暫停' : '恢復'}！`, 'info');
                updateTeacherPauseButtonUI();
            } catch (error) {
                console.error("切換暫停回覆狀態失敗:", error);
                showMessage("切換狀態失敗，請檢查網路連線。", "error");
                isResponsePaused = !isResponsePaused; // Revert local state on error
            }
        }

        /**
         * Updates the teacher's pause button UI based on the `isResponsePaused` state.
         */
        function updateTeacherPauseButtonUI() {
            // V1.1 修正：移除 HTML 預設的深藍灰底色，避免與灰/紅底色同時存在時，顏色取決於 Tailwind 產生樣式的順序
            togglePauseBtn.classList.remove('bg-slate-700', 'hover:bg-slate-800');
            if (isResponsePaused) {
                togglePauseBtn.classList.remove('bg-gray-500', 'hover:bg-gray-600');
                togglePauseBtn.classList.add('bg-red-500', 'hover:bg-red-600');
                togglePauseBtnText.textContent = '恢復回覆';
                togglePauseBtn.querySelector('i').classList.replace('fa-pause', 'fa-play');
            } else {
                togglePauseBtn.classList.remove('bg-red-500', 'hover:bg-red-600');
                togglePauseBtn.classList.add('bg-gray-500', 'hover:bg-gray-600');
                togglePauseBtnText.textContent = '暫停回覆';
                togglePauseBtn.querySelector('i').classList.replace('fa-play', 'fa-pause');
            }
        }

        /**
         * Generate short URL using a free URL shortener service
         */
        async function generateShortUrl(longUrl) {
            try {
                // Try TinyURL first (free, no API key needed)
                const shortUrl = await generateShortUrlTinyURL(longUrl);
                if (shortUrl !== longUrl) {
                    return shortUrl;
                }

                // Fallback to is.gd
                const response = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(longUrl)}`);
                const data = await response.json();

                if (data.shorturl) {
                    console.log('短網址生成成功:', data.shorturl);
                    return data.shorturl;
                } else if (data.errormessage) {
                    console.warn('is.gd 錯誤:', data.errormessage);
                }
            } catch (error) {
                console.warn('短網址服務失敗:', error);
            }

            // If all fails, return original URL
            return longUrl;
        }

        /**
         * Generate short URL using TinyURL
         */
        async function generateShortUrlTinyURL(longUrl) {
            try {
                const response = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(longUrl)}`);
                const shortUrl = await response.text();

                if (shortUrl && shortUrl.startsWith('http')) {
                    console.log('TinyURL 短網址生成成功:', shortUrl);
                    return shortUrl;
                }
            } catch (error) {
                console.error('TinyURL 失敗:', error);
            }

            // Return original URL if TinyURL fails
            console.warn('TinyURL 失敗，嘗試其他短網址服務');
            return longUrl;
        }

        // --- Floating QR button: 學生加入網址 / QR Code ---
        let crossDeviceDisplayUrl = ''; // URL currently shown in the floating QR modal
        let crossDeviceLongUrl = '';    // V6.2: 原始（完整）加入網址
        let crossDeviceShortUrl = '';   // V6.2: 短網址（生成失敗時為空）
        let crossDeviceUrlMode = 'short'; // V6.2: 目前顯示模式 'short' | 'long'

        /** V6.2: 依短網址是否可用，更新「短網址」按鈕啟用狀態 */
        function updateCrossDeviceUrlToggleUI() {
            const sBtn = document.getElementById('cross-device-short-url-btn');
            if (sBtn) {
                sBtn.disabled = !crossDeviceShortUrl;
                sBtn.title = crossDeviceShortUrl ? '' : '短網址生成失敗，暫無法使用';
            }
        }

        /** V6.2: 切換顯示 原始網址／短網址，同步更新輸入框與 QR Code */
        function applyCrossDeviceUrlDisplay(mode) {
            const useShort = (mode === 'short' && crossDeviceShortUrl);
            const url = useShort ? crossDeviceShortUrl : crossDeviceLongUrl;
            if (!url) return;
            crossDeviceUrlMode = useShort ? 'short' : 'long';
            crossDeviceDisplayUrl = url;

            const urlInput = document.getElementById('cross-device-url-input');
            const qrContainer = document.getElementById('cross-device-qrcode');
            if (urlInput) urlInput.value = url;

            if (qrContainer) {
                qrContainer.innerHTML = '';
                try {
                    new QRCode(qrContainer, {
                        text: url,
                        width: 256,
                        height: 256,
                        colorDark: "#000000",
                        colorLight: "#ffffff",
                        correctLevel: useShort ? QRCode.CorrectLevel.H : QRCode.CorrectLevel.L
                    });
                } catch (e) {
                    console.error('QR Code 生成失敗（網址過長）:', e);
                    qrContainer.innerHTML = '<p class="text-sm text-red-500 px-4">此網址過長，無法生成 QR Code，請切換回短網址，或直接複製網址給學生。</p>';
                }
            }

            // 切換按鈕樣式
            const sBtn = document.getElementById('cross-device-short-url-btn');
            const lBtn = document.getElementById('cross-device-long-url-btn');
            const onCls = 'px-3 py-1.5 text-sm rounded-md bg-blue-500 text-white font-semibold transition';
            const offCls = 'px-3 py-1.5 text-sm rounded-md bg-gray-200 text-gray-600 hover:bg-gray-300 font-semibold transition';
            if (sBtn) sBtn.className = (crossDeviceUrlMode === 'short') ? onCls : offCls + (sBtn.disabled ? ' opacity-50 cursor-not-allowed' : '');
            if (lBtn) lBtn.className = (crossDeviceUrlMode === 'long') ? onCls : offCls;
        }

        /**
         * Opens the floating modal and shows the student join URL + QR Code.
         */
        async function showCrossDeviceUrlModal() {
            const modal = document.getElementById('cross-device-url-modal');
            const urlInput = document.getElementById('cross-device-url-input');
            const qrContainer = document.getElementById('cross-device-qrcode');
            const msg = document.getElementById('cross-device-msg');

            modal.classList.remove('hidden');
            qrContainer.innerHTML = '';
            urlInput.value = '';
            crossDeviceDisplayUrl = '';
            msg.textContent = '正在生成網址，請稍候...';
            msg.className = 'text-center text-sm text-gray-500 mt-3';

            try {
                // Cloudflare 版：資料庫與網站同網域，網址不需夾帶任何設定
                const newUrl = `${window.location.origin}${window.location.pathname}`;

                // V6.2: 同時保留原始網址與短網址，供教師切換顯示
                crossDeviceLongUrl = newUrl;
                crossDeviceShortUrl = '';
                try {
                    const shortUrl = await generateShortUrl(newUrl);
                    if (shortUrl && shortUrl !== newUrl) crossDeviceShortUrl = shortUrl;
                } catch (e) {
                    console.warn('短網址生成失敗，僅提供原始網址:', e);
                }
                updateCrossDeviceUrlToggleUI();
                // 預設顯示短網址（生成失敗則自動顯示原始網址）
                applyCrossDeviceUrlDisplay(crossDeviceShortUrl ? 'short' : 'long');

                // Auto-copy to clipboard
                try {
                    await navigator.clipboard.writeText(crossDeviceDisplayUrl);
                } catch (e) { /* clipboard may be blocked; user can copy manually */ }

                msg.textContent = crossDeviceShortUrl
                    ? '網址已複製，可用上方按鈕切換 短網址／原始網址（QR Code 會同步更新）。'
                    : '短網址生成失敗，已改用原始網址（已複製）。';
                msg.className = 'text-center text-sm text-green-600 mt-3';
            } catch (error) {
                console.error('生成異機網址失敗:', error);
                msg.textContent = '生成網址失敗，請稍後再試。';
                msg.className = 'text-center text-sm text-red-500 mt-3';
            }
        }

        function hideCrossDeviceUrlModal() {
            document.getElementById('cross-device-url-modal').classList.add('hidden');
        }

        function downloadCrossDeviceQRCode() {
            const qrContainer = document.getElementById('cross-device-qrcode');
            const canvas = qrContainer.querySelector('canvas');
            const msg = document.getElementById('cross-device-msg');
            if (!canvas) {
                if (msg) {
                    msg.textContent = '請先生成 QR Code。';
                    msg.className = 'text-center text-sm text-red-500 mt-3';
                }
                return;
            }
            try {
                canvas.toBlob((blob) => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'student-join-qrcode.png';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                });
            } catch (error) {
                console.error('下載 QR Code 失敗:', error);
            }
        }

        /**
         * Save classroom code to recent classrooms in localStorage
         * @param {string} code - Classroom code to save
         */
        function saveRecentClassroom(code) {
            if (!code) return;

            try {
                const recentClassroomsStr = localStorage.getItem('recentClassrooms');
                let recentClassrooms = [];

                if (recentClassroomsStr) {
                    recentClassrooms = JSON.parse(recentClassroomsStr);
                }

                // Remove if already exists (to move to front)
                recentClassrooms = recentClassrooms.filter(c => c !== code);

                // Add to front
                recentClassrooms.unshift(code);

                // Keep only last 5
                recentClassrooms = recentClassrooms.slice(0, 5);

                localStorage.setItem('recentClassrooms', JSON.stringify(recentClassrooms));
            } catch (error) {
                console.error('保存最近教室代碼失敗:', error);
            }
        }

        /**
         * Remove classroom code from recent classrooms in localStorage
         * @param {string} code - Classroom code to remove
         */
        function removeRecentClassroom(code) {
            if (!code) return;

            try {
                const recentClassroomsStr = localStorage.getItem('recentClassrooms');
                if (!recentClassroomsStr) {
                    return;
                }

                let recentClassrooms = JSON.parse(recentClassroomsStr);

                // Remove the code from the list
                recentClassrooms = recentClassrooms.filter(c => c !== code);

                // Save back to localStorage
                if (recentClassrooms.length > 0) {
                    localStorage.setItem('recentClassrooms', JSON.stringify(recentClassrooms));
                } else {
                    // If list is empty, remove the key entirely
                    localStorage.removeItem('recentClassrooms');
                }

                console.log(`已從最近教室列表中刪除: ${code}`);
            } catch (error) {
                console.error('刪除最近教室代碼失敗:', error);
            }
        }

        // Add beforeunload handler to warn user about closing window
        let hasEndedClass = false;

        // Track when user clicks the end class button
        function markClassEnded() {
            hasEndedClass = true;
        }

        // Set up window close warning
        window.onbeforeunload = function () {
            if (!hasEndedClass) {
                return '請先按下紅色下課鍵，再關閉視窗，本提示請先按取消';
            }
        };
