        // =====================================================================
        // 【題庫管理】 modules/bank-hub/bank-hub.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        //
        // 教師面板右側的滑動圖層，集中管理四種可 AI 出題的題庫（選擇題／排序題／配對題／閱讀測驗）：
        // 編輯題目、AI 生成、複製範例 Prompt、儲存題庫、本課堂題庫（載入／刪除／匯出 Excel）、
        // 跨課堂本地題庫（匯入／刪除）。題庫資料與各題型設定視窗共用（透過 core.js 的 BANK_REGISTRY），
        // 在這裡存的題庫，題型設定視窗也看得到，反之亦然。
        // =====================================================================

        const BANK_HUB_TYPES = {
            mc: {
                label: '選擇題',
                hint: '格式：題目,正確答案(1-4或A-D),選項1,選項2,選項3,選項4（每行一題）',
                placeholder: '台灣的首都在哪裡?,1,台北,台中,台南,高雄\n2+2=?,B,3,4,5,6',
                promptId: 'ai-mc-example-prompt',   // 範例 Prompt 沿用選擇題設定視窗的內容
                count: { label: '出題數量 (1-10)', min: 1, max: 10, value: 5 },
                topicPlaceholder: '例如：國中七年級 光合作用',
                buildPrompt: (topic, count) => buildMcAiPrompt(topic, count),
                appendAi: true,                      // 與設定視窗相同：AI 題目接在既有題目之後
                canExport: true,
                toEditor: b => ({ main: b.content }),
                fromEditor: (name, e) => ({ name, content: e.main }),
                validate: e => parseCustomQuestions(e.main) ? null : '題目格式錯誤，請檢查每行是否為 6 個欄位、正確答案為 1-4 或 A-D。'
            },
            seq: {
                label: '排序題',
                hint: '每行一個項目，依正確順序由先到後輸入（整份項目為一題）',
                placeholder: '打開檔案\n編輯內容\n儲存檔案\n關閉檔案',
                promptId: 'ai-seq-example-prompt',
                count: { label: '項目數量 (3-10)', min: 3, max: 10, value: 5 },
                topicPlaceholder: '例如：光合作用的步驟',
                buildPrompt: (topic, count) => buildSeqAiPrompt(topic, count),
                appendAi: false,
                canExport: false,
                toEditor: b => ({ main: b.items }),
                fromEditor: (name, e) => ({ name, question: '排序題', items: e.main }),
                validate: e => e.main.split('\n').map(s => s.trim()).filter(Boolean).length >= 2 ? null : '至少需要兩個排序項目。'
            },
            match: {
                label: '配對題',
                hint: '格式：左側項目,右側項目（每行一組，逗號或 Tab 分隔）',
                placeholder: '台北,台灣首都\n東京,日本首都\n首爾,韓國首都',
                promptId: 'ai-match-example-prompt',
                count: { label: '配對數量 (3-10)', min: 3, max: 10, value: 5 },
                topicPlaceholder: '例如：國家與首都',
                buildPrompt: (topic, count) => buildMatchAiPrompt(topic, count),
                appendAi: false,
                canExport: true,
                toEditor: b => ({ main: b.pairs }),
                fromEditor: (name, e) => ({ name, question: '配對題', pairs: e.main }),
                // 與配對題「開始互動」相同的判斷：每行以逗號或 Tab 分成至少兩欄，至少兩組
                validate: e => e.main.split('\n').filter(l => l.split(/[,\t]/).map(p => p.trim()).filter(Boolean).length >= 2).length >= 2 ? null : '至少需要兩組配對項目（每行：左側,右側）。'
            },
            reading: {
                label: '閱讀測驗',
                hint: '格式：題目,正確答案(1-4或A-D),選項1,選項2,選項3,選項4,[層次(1-4)選填]（每行一題）',
                placeholder: '主角的名字是什麼?,2,小明,小華,小美,小強,1',
                promptId: 'ai-reading-example-prompt',
                count: null,                         // 閱讀測驗固定依 PIRLS 四層次出 10 題
                topicPlaceholder: '例如：國小五年級 珊瑚礁生態（若已輸入文本，則依文本出題）',
                appendAi: false,
                canExport: false,
                toEditor: b => ({ text: b.text, main: b.questions }),
                fromEditor: (name, e) => ({ name, text: e.text, questions: e.main, timestamp: new Date().toISOString() }),
                validate: e => !e.text ? '請輸入閱讀文本。' : (parseReadingQuestions(e.main) ? null : '題目格式錯誤，請檢查每行的欄位。')
            }
        };
        let bankHubCurrentType = 'mc';

        const bankHubEl = (type, part) => document.getElementById(`bank-hub-${type}-${part}`);

        function bankHubReadEditor(type) {
            const text = bankHubEl(type, 'text');
            return { main: bankHubEl(type, 'main').value.trim(), text: text ? text.value.trim() : '' };
        }

        /** 建立四個題型的分頁與內容（只建一次，切換分頁時保留各自編輯中的內容） */
        function bankHubBuild() {
            const tabs = document.getElementById('bank-hub-tabs');
            const body = document.getElementById('bank-hub-body');
            tabs.innerHTML = Object.entries(BANK_HUB_TYPES).map(([type, t]) =>
                `<button type="button" class="bank-hub-tab" data-bank-hub-tab="${type}">${t.label}</button>`).join('');
            body.innerHTML = Object.entries(BANK_HUB_TYPES).map(([type, t]) => `
                <div class="bank-hub-pane hidden" data-bank-hub-pane="${type}">
                    <div class="bank-hub-section">
                        <h4>✍️ 題目內容</h4>
                        ${type === 'reading' ? `<label class="block text-sm font-bold text-slate-600 mb-1">閱讀文本</label>
                        <textarea id="bank-hub-reading-text" rows="5" placeholder="請輸入閱讀文本內容..."></textarea>
                        <label class="block text-sm font-bold text-slate-600 mt-2 mb-1">題目</label>` : ''}
                        <p class="text-xs text-slate-500 mb-1">${t.hint}</p>
                        <textarea id="bank-hub-${type}-main" rows="7" placeholder="例如：\n${t.placeholder}"></textarea>
                    </div>
                    <div class="bank-hub-section bg-purple-50">
                        <h4>🤖 AI 生成（使用「AI 設定」的 API Key）</h4>
                        <textarea id="bank-hub-${type}-topic" rows="2" placeholder="${t.topicPlaceholder}"></textarea>
                        ${t.count ? `<label class="block text-sm text-slate-600 mt-2 mb-1">${t.count.label}</label>
                        <input type="number" id="bank-hub-${type}-count" min="${t.count.min}" max="${t.count.max}" value="${t.count.value}">`
                        : '<p class="text-xs text-slate-500 mt-2">依 PIRLS 四層次出 10 題：直接提取 3、直接推論 3、詮釋整合 2、比較評估 2。</p>'}
                        <button type="button" id="bank-hub-${type}-ai-btn" class="btn btn-purple !w-full mt-2 h-10 flex items-center justify-center">
                            <i class="fas fa-magic mr-2"></i><span>AI 開始出題</span>
                        </button>
                        <details class="bg-white rounded-md border p-2 mt-3">
                            <summary class="cursor-pointer text-sm font-bold text-purple-700">📋 沒有 API Key？複製範例 Prompt 到其他 AI</summary>
                            <p class="text-xs text-gray-500 mt-2">複製後貼到 ChatGPT、Gemini、Claude 等 AI，修改【】內的文字，再把 AI 產生的內容貼回上方「題目內容」。</p>
                            <textarea id="bank-hub-${type}-prompt" readonly rows="8" class="mt-2 bg-gray-50 text-xs"></textarea>
                            <button type="button" data-bank-hub-action="copy-prompt" class="btn bg-purple-600 hover:bg-purple-700 text-white text-sm h-8 px-3 py-1 w-full mt-2"><i class="fas fa-copy mr-1"></i>複製 Prompt</button>
                        </details>
                    </div>
                    <div class="bank-hub-section">
                        <h4>💾 儲存為題庫</h4>
                        <div class="flex gap-2">
                            <input type="text" id="bank-hub-${type}-name" placeholder="輸入題庫名稱">
                            <button type="button" data-bank-hub-action="save" class="px-4 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-lg whitespace-nowrap">儲存</button>
                        </div>
                    </div>
                    <div class="bank-hub-section">
                        <h4>📂 本課堂題庫</h4>
                        <div id="bank-hub-${type}-list" class="space-y-2 max-h-48 overflow-y-auto"></div>
                    </div>
                    <div class="bank-hub-section">
                        <h4>🗂️ 本地題庫（跨課堂共用）</h4>
                        <p class="text-xs text-slate-500 mb-2">同一台電腦上儲存過的題庫，可匯入目前課堂使用。</p>
                        <div id="bank-hub-${type}-global" class="space-y-2 max-h-48 overflow-y-auto"></div>
                    </div>
                </div>`).join('');
        }

        function bankHubRow(name, buttons) {
            return `<div class="flex items-center justify-between gap-2 p-2 bg-slate-50 rounded-lg border">
                <span class="text-sm font-medium text-slate-700 truncate">${escapeHtml(name)}</span>
                <span class="flex gap-1 flex-shrink-0">${buttons}</span></div>`;
        }

        function bankHubBtn(action, index, label, color) {
            return `<button type="button" data-bank-hub-action="${action}" data-index="${index}" class="px-2 py-1 ${color} text-white text-xs rounded">${label}</button>`;
        }

        /** 重新整理目前分頁的本課堂題庫與本地題庫清單 */
        function bankHubRenderLists(type) {
            const cfg = BANK_REGISTRY[type];
            cfg.load();
            const banks = cfg.getArr();
            const empty = '<div class="text-slate-400 text-sm italic text-center">目前沒有題庫</div>';
            bankHubEl(type, 'list').innerHTML = banks.length ? banks.map((b, i) => bankHubRow(b.name,
                bankHubBtn('load', i, '載入', 'bg-blue-500 hover:bg-blue-600') +
                (BANK_HUB_TYPES[type].canExport ? bankHubBtn('export', i, '匯出 Excel', 'bg-emerald-500 hover:bg-emerald-600') : '') +
                bankHubBtn('delete', i, '刪除', 'bg-red-500 hover:bg-red-600'))).join('') : empty;
            const globals = readGlobalBanks(cfg.globalKey);
            bankHubEl(type, 'global').innerHTML = globals.length ? globals.map((b, i) => bankHubRow(b.name,
                bankHubBtn('import-global', i, '匯入此課堂', 'bg-indigo-600 hover:bg-indigo-700') +
                bankHubBtn('delete-global', i, '刪除', 'bg-red-500 hover:bg-red-600'))).join('') : empty;
        }

        function bankHubSwitch(type) {
            bankHubCurrentType = type;
            document.querySelectorAll('[data-bank-hub-tab]').forEach(b => b.classList.toggle('active', b.dataset.bankHubTab === type));
            document.querySelectorAll('[data-bank-hub-pane]').forEach(p => p.classList.toggle('hidden', p.dataset.bankHubPane !== type));
            bankHubEl(type, 'prompt').value = document.getElementById(BANK_HUB_TYPES[type].promptId).value; // 範例 Prompt 與設定視窗同一份
            bankHubRenderLists(type);
        }

        /** 儲存目前編輯區為本課堂題庫（同名時詢問是否覆蓋），並同步到本地題庫與題型設定視窗 */
        async function bankHubSave(type) {
            const t = BANK_HUB_TYPES[type];
            const cfg = BANK_REGISTRY[type];
            const nameInput = bankHubEl(type, 'name');
            const name = nameInput.value.trim();
            const editor = bankHubReadEditor(type);
            if (!name) return showMessage('請輸入題庫名稱', 'error');
            if (!editor.main) return showMessage('題目內容不能為空', 'error');
            const error = t.validate(editor);
            if (error) return showMessage(error, 'error');

            cfg.load();
            const banks = cfg.getArr();
            const bank = t.fromEditor(name, editor);
            const existingIndex = banks.findIndex(b => b.name === name);
            if (existingIndex !== -1) {
                if (!(await customConfirm(`題庫「${name}」已存在，是否要覆蓋？`))) return;
                banks[existingIndex] = bank;
            } else {
                banks.push(bank);
            }
            cfg.save();
            cfg.refresh();
            bankHubRenderLists(type);
            nameInput.value = '';
            showMessage(`題庫「${name}」儲存成功`, 'success');
        }

        /** 使用「AI 設定」的 API Key 生成題目並填入編輯區（Prompt 與題型設定視窗共用） */
        async function bankHubGenerate(type) {
            const t = BANK_HUB_TYPES[type];
            const topic = bankHubEl(type, 'topic').value.trim();
            if (!topic) return showMessage('請輸入出題主題或要求！', 'error');
            let prompt;
            const textArea = bankHubEl(type, 'text');
            if (t.count) {
                const count = parseInt(bankHubEl(type, 'count').value);
                if (!count || count < t.count.min || count > t.count.max) {
                    return showMessage(`數量必須介於 ${t.count.min} 到 ${t.count.max} 之間！`, 'error');
                }
                prompt = t.buildPrompt(topic, count);
            } else {
                prompt = buildReadingAiPrompt(topic, textArea.value.trim());
            }

            const btn = bankHubEl(type, 'ai-btn');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i><span>AI 思考中...</span>';
            try {
                const payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7 } };
                const generatedText = cleanAiGeneratedText(await callAi(payload, aiSettings.geminiApiKey));
                if (!generatedText) throw new Error('AI 未返回有效內容。');
                const main = bankHubEl(type, 'main');
                if (type === 'reading' && !textArea.value.trim()) {
                    // 沒有文本時，AI 先輸出文本，再以「---題目---」分隔題目（與閱讀測驗設定視窗相同）
                    const parts = generatedText.split('---題目---');
                    if (parts.length === 2) {
                        textArea.value = parts[0].trim();
                        main.value = parts[1].trim();
                    } else {
                        main.value = generatedText.trim();
                    }
                } else if (t.appendAi && main.value.trim()) {
                    main.value = `${main.value.trim()}\n${generatedText.trim()}`;
                } else {
                    main.value = generatedText.trim();
                }
                showMessage('AI 題目已生成並填入「題目內容」，確認後可儲存為題庫。', 'success');
            } catch (error) {
                console.error('題庫管理 AI 生成失敗:', error);
                showAPIErrorModal(error, null);
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-magic mr-2"></i><span>AI 開始出題</span>';
            }
        }

        async function bankHubHandleAction(action, index) {
            const type = bankHubCurrentType;
            const t = BANK_HUB_TYPES[type];
            const cfg = BANK_REGISTRY[type];
            if (action === 'copy-prompt') return copyExamplePrompt(bankHubEl(type, 'prompt'));
            if (action === 'save') return bankHubSave(type);

            if (action === 'load' || action === 'delete' || action === 'export') {
                cfg.load();
                const bank = cfg.getArr()[index];
                if (!bank) return;
                if (action === 'load') {
                    const e = t.toEditor(bank);
                    bankHubEl(type, 'main').value = e.main || '';
                    if (type === 'reading') bankHubEl(type, 'text').value = e.text || '';
                    bankHubEl(type, 'name').value = bank.name; // 方便修改後以同名覆蓋儲存
                    showMessage(`題庫「${bank.name}」已載入到題目內容`, 'success');
                } else if (action === 'export') {
                    openGqExportModal(type, index);
                } else if (await customConfirm(`確定要刪除題庫「${bank.name}」嗎？`)) {
                    cfg.getArr().splice(index, 1);
                    cfg.save();
                    cfg.refresh();
                    bankHubRenderLists(type);
                    showMessage(`題庫「${bank.name}」已刪除`, 'success');
                }
                return;
            }

            const globals = readGlobalBanks(cfg.globalKey);
            const bank = globals[index];
            if (!bank) return;
            if (action === 'import-global') {
                cfg.load();
                const banks = cfg.getArr();
                const i = banks.findIndex(b => b.name === bank.name);
                if (i !== -1) banks[i] = { ...bank }; else banks.push({ ...bank });
                cfg.save();
                cfg.refresh();
                bankHubRenderLists(type);
                showMessage(`已匯入本地題庫「${bank.name}」到本課堂`, 'success');
            } else if (action === 'delete-global') {
                if (!(await customConfirm(`確定要從「本地題庫」永久刪除「${bank.name}」嗎？（已匯入課堂的題庫不受影響）`))) return;
                writeGlobalBanks(cfg.globalKey, globals.filter(b => b.name !== bank.name));
                populateGlobalBankSelect(type);
                bankHubRenderLists(type);
                showMessage(`已從本地題庫刪除「${bank.name}」`, 'success');
            }
        }

        /**
         * 題庫管理：事件監聽設定（由 modules/main/events.js 的 setupEventListeners() 呼叫）。
         */
        function setupBankHubEventListeners() {
            bankHubBuild();
            const drawer = document.getElementById('bank-hub-drawer');
            document.getElementById('bank-hub-drawer-tab').addEventListener('click', () => {
                drawer.classList.toggle('open');
                if (drawer.classList.contains('open')) bankHubSwitch(bankHubCurrentType); // 展開時重新讀取題庫（題型視窗可能已有變動）
            });
            document.getElementById('bank-hub-tabs').addEventListener('click', (e) => {
                const tab = e.target.closest('[data-bank-hub-tab]');
                if (tab) bankHubSwitch(tab.dataset.bankHubTab);
            });
            document.getElementById('bank-hub-body').addEventListener('click', (e) => {
                const aiBtn = e.target.closest('[id$="-ai-btn"]');
                if (aiBtn) return bankHubGenerate(bankHubCurrentType);
                const btn = e.target.closest('[data-bank-hub-action]');
                if (btn) bankHubHandleAction(btn.dataset.bankHubAction, parseInt(btn.dataset.index));
            });
        }
