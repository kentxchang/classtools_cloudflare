        // =====================================================================
        // 【02 選擇/排序/配對 — 遊戲化派送與 Excel 匯出】 modules/02-choice-sequencing-matching/choice-sequencing-matching-game.js
        // 遊戲模板取自「題庫派送參考-quiz-game-platform」的 public/games/（原封不動複製到本專案 public/games/），
        // 派送時以互動模式 'game_quiz' 送出 { family, key, name, content, config }；學生端下載模板、填入題庫後以 iframe 執行，
        // 遊戲結束時由注入的 gqBridge() 回傳成績，存成學生作答 { game, score, correct, total, finished, result }。
        // 本檔與同一段 <script type="module"> 的其他檔案共用作用域。
        // =====================================================================

        // 各題型可用的遊戲（選擇題只提供單人遊戲）
        const GQ_CATALOG = {
            multiple_choice: { family: 'one', games: [
                { key: 'maze', name: '🟡 迷宮吃豆' }, { key: 'snake', name: '🐍 貪吃蛇答題' }, { key: 'runner', name: '🏃 四線跑酷' },
                { key: 'invader', name: '👾 答案入侵者' }, { key: 'ninja', name: '🍉 答案切切樂' }] },
            matching: { family: 'match', games: [
                { key: 'memory', name: '🃏 記憶翻牌' }, { key: 'wires', name: '🔌 電路接線' }, { key: 'bubbles', name: '🫧 泡泡連連看' },
                { key: 'sushi', name: '🍣 壽司轉轉轉' }, { key: 'bins', name: '♻️ 答案雨回收站' }] },
            sequencing: { family: 'sort', games: [
                { key: 'drag', name: '🧱 拖曳排序' }, { key: 'swap', name: '🔀 排排站換位置' }, { key: 'river', name: '🐸 河上踏石' }] }
        };
        const GQ_YESNO = v => (v ? '是' : '否');
        // 各遊戲的參數（沿用參考程式的設定範圍與預設值）
        const GQ_CONFIG_DEFS = {
            maze: [{ key: 'lives', label: '生命數', min: 1, max: 5, def: 3, unit: '條' }, { key: 'goal', label: '答對幾題過關', min: 5, max: 30, def: 10, unit: '題' }, { key: 'ghosts', label: '鬼怪數量', min: 0, max: 4, def: 2, unit: '隻' }],
            snake: [{ key: 'lives', label: '生命數', min: 1, max: 5, def: 3, unit: '條' }, { key: 'goal', label: '答對幾題過關', min: 5, max: 30, def: 10, unit: '題' }, { key: 'speed', label: '蛇移動速度', min: 4, max: 14, def: 7, unit: '格/秒' }],
            runner: [{ key: 'lives', label: '生命數', min: 1, max: 5, def: 3, unit: '條' }, { key: 'goal', label: '答對幾題過關', min: 5, max: 30, def: 10, unit: '題' }, { key: 'speedPct', label: '障礙速度', min: 60, max: 160, step: 10, def: 100, unit: '%' }],
            invader: [{ key: 'lives', label: '生命數', min: 1, max: 5, def: 3, unit: '條' }, { key: 'goal', label: '答對幾題過關', min: 5, max: 30, def: 10, unit: '題' }, { key: 'speedPct', label: '下降速度', min: 50, max: 200, step: 10, def: 100, unit: '%' }],
            ninja: [{ key: 'lives', label: '生命數', min: 1, max: 5, def: 3, unit: '條' }, { key: 'goal', label: '答對幾題過關', min: 5, max: 30, def: 10, unit: '題' }, { key: 'speedPct', label: '飛拋速度', min: 50, max: 170, step: 10, def: 100, unit: '%' }],
            memory: [{ key: 'pairs', label: '每輪配對組數', min: 4, max: 10, def: 6, unit: '組' }, { key: 'rounds', label: '回合數', min: 1, max: 5, def: 2, unit: '回合' }, { key: 'peekSec', label: '開場偷看時間', min: 0, max: 5, def: 2, unit: '秒' }],
            wires: [{ key: 'pairs', label: '每回合接線組數', min: 3, max: 7, def: 5, unit: '組' }, { key: 'rounds', label: '回合數', min: 1, max: 8, def: 3, unit: '回合' }],
            bubbles: [{ key: 'pairs', label: '每波組數', min: 3, max: 8, def: 5, unit: '組' }, { key: 'rounds', label: '波數', min: 1, max: 6, def: 3, unit: '波' }],
            sushi: [{ key: 'customers', label: '同時客席數', min: 2, max: 4, def: 3, unit: '位' }, { key: 'patienceSec', label: '客人的耐心', min: 10, max: 40, def: 22, unit: '秒' }, { key: 'goal', label: '達標服務客人數', min: 6, max: 30, def: 12, unit: '位' }],
            bins: [{ key: 'bins', label: '分類桶數量', min: 3, max: 6, def: 4, unit: '個' }, { key: 'goal', label: '目標回收數', min: 8, max: 40, def: 16, unit: '張' }],
            drag: [{ key: 'lockSec', label: '放錯後鎖定秒數', min: 0, max: 15, def: 0, unit: '秒' }],
            swap: [{ key: 'hint', label: '即時提示正確位置', min: 0, max: 1, def: 1, unit: '', fmt: v => (v ? '開啟' : '關閉') }],
            river: [{ key: 'lives', label: '生命數', min: 1, max: 8, def: 3, unit: '條' }]
        };
        const GQ_PICKER_IDS = { multiple_choice: 'gq-picker-mc', sequencing: 'gq-picker-seq', matching: 'gq-picker-match' };
        const gqSelected = { multiple_choice: '', sequencing: '', matching: '' }; // '' = 原題型派送

        const gqFmt = (d, v) => (d.fmt ? d.fmt(v) : v + d.unit);

        /** (教師) 在設定視窗內繪製「派送方式」：原題型 + 各遊戲卡片，選了遊戲再顯示參數滑桿 */
        function gqRenderPicker(source) {
            const box = document.getElementById(GQ_PICKER_IDS[source]);
            if (!box) return;
            const sel = gqSelected[source];
            const card = (key, label) => `<button type="button" data-gq-key="${key}" class="px-3 py-2 rounded-xl border-2 text-sm font-bold transition ${sel === key ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-300'}">${label}</button>`;
            const defs = GQ_CONFIG_DEFS[sel] || [];
            box.innerHTML = `
                <h5 class="text-base font-bold text-gray-800 mb-2">🎮 派送方式</h5>
                <div class="flex flex-wrap gap-2">${card('', '📝 原題型派送')}${GQ_CATALOG[source].games.map(g => card(g.key, g.name)).join('')}</div>
                ${defs.length ? `<div class="mt-3 space-y-2">${defs.map(d => `
                    <div class="flex items-center gap-3">
                        <span class="text-xs font-bold text-gray-700 w-32 shrink-0 text-left">${d.label}</span>
                        <input type="range" data-gq-cfg="${d.key}" min="${d.min}" max="${d.max}" step="${d.step || 1}" value="${d.def}" class="w-full accent-indigo-600">
                        <span class="text-xs font-black text-indigo-600 w-14 text-right">${gqFmt(d, d.def)}</span>
                    </div>`).join('')}</div>` : ''}
                ${source === 'sequencing' && sel ? '<p class="text-xs text-gray-500 mt-2">排序遊戲會把整份排序項目當作一題。</p>' : ''}`;
            box.querySelectorAll('[data-gq-key]').forEach(b => b.addEventListener('click', () => { gqSelected[source] = b.dataset.gqKey; gqRenderPicker(source); }));
            box.querySelectorAll('[data-gq-cfg]').forEach(r => r.addEventListener('input', () => {
                r.nextElementSibling.textContent = gqFmt(defs.find(d => d.key === r.dataset.gqCfg), Number(r.value));
            }));
        }

        /**
         * (教師) 若設定視窗選了遊戲，就以 game_quiz 模式派送並回傳 true；選「原題型派送」則回傳 false 由原流程處理。
         * @param {string} source - 'multiple_choice' | 'sequencing' | 'matching'
         * @param {string} content - 遊戲模板可讀的題庫文字（選擇題：題目,答案,選項×4；配對：左,右；排序：一行一題、Tab 分隔）
         */
        async function gqDispatchIfSelected(source, content) {
            const key = gqSelected[source];
            if (!key) return false;
            const config = {};
            document.querySelectorAll(`#${GQ_PICKER_IDS[source]} [data-gq-cfg]`).forEach(r => { config[r.dataset.gqCfg] = Number(r.value); });
            const game = GQ_CATALOG[source].games.find(g => g.key === key);
            showView('teacherMonitor');
            await setInteractionMode('game_quiz', { gameQuiz: { source, family: GQ_CATALOG[source].family, key, name: game.name, content, config } });
            return true;
        }

        // ---------------- 學生端 ----------------
        let gqMountedRound = null;
        let gqBest = null; // 本輪已送出的最佳成績

        /** 在遊戲 iframe 內執行：關閉題庫面板快捷鍵，並把分數／答對數／是否結束回傳給上層 */
        function gqBridge() {
            window.addEventListener('keydown', e => { if ((e.key === 'r' || e.key === 'R') && !e.target.matches('textarea, input')) e.stopImmediatePropagation(); }, true);
            let last = '';
            setInterval(() => {
                const S = window.Solo, M = window.Match, R = window.Run, E = S || M || R || {};
                const score = typeof window.score === 'number' ? window.score : (E.score || 0);
                const correct = S ? S.solved : M ? M.matched : R ? R.solved : 0;
                const total = S ? S.goal : M ? M.goal : (window.Bank ? window.Bank.total : 0);
                const finished = !!E.over || !!document.getElementById('game-over')?.classList.contains('show');
                const result = finished ? (document.getElementById('winner-text')?.textContent || '').trim() : '';
                const k = [score, correct, total, finished].join('|');
                if (k === last) return;
                last = k;
                parent.postMessage({ type: 'gq-progress', score, correct, total, finished, result }, '*');
            }, 500);
        }

        /** (學生) 載入遊戲模板並填入題庫與設定後顯示 */
        async function gqMountStudent(s) {
            const box = interactionUIs.game_quiz;
            if (!s || (gqMountedRound === currentRound && box.querySelector('iframe'))) return;
            gqCloseStudent();
            const round = gqMountedRound = currentRound;
            gqBest = null;
            let html;
            try {
                html = await (await fetch(`/games/${s.family}_${s.key}.html`)).text();
            } catch (e) {
                showMessage('遊戲載入失敗，請檢查網路連線。', 'error');
                return;
            }
            if (gqMountedRound !== round) return; // 載入期間老師已換題
            const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const json = o => JSON.stringify(o).replace(/</g, '\\u003c');
            // 與參考程式 src/index.ts 相同的注入方式：公開遊戲引擎物件、填入題庫與設定、隱藏題庫面板與下載鍵
            for (const n of ['Game', 'Solo', 'Quiz', 'Match', 'Run', 'Q', 'Bank']) html = html.replace(new RegExp(`\\bconst ${n}\\s*=\\s*\\{`, 'g'), `const ${n} = window.${n} = {`);
            html = html.replace(/(<textarea id="generator-input"[^>]*>)[\s\S]*?(<\/textarea>)/, (m, a, b) => a + esc(s.content) + b)
                .replace(/(<script type="application\/json" id="game-config">)[\s\S]*?(<\/script>)/, (m, a, b) => a + json(s.config || {}) + b)
                // iPad 等觸控裝置：禁止長按選取文字與跳出選單／放大鏡，避免遊戲操作時誤選
                .replace('</head>', '<style>#download-game, #secret-trigger, #generator-screen { display: none !important; } * { -webkit-user-select: none !important; user-select: none !important; -webkit-touch-callout: none !important; }</style></head>')
                .replace('</body>', `<script>(${gqBridge.toString()})();<\/script></body>`);
            const iframe = document.createElement('iframe');
            iframe.className = 'gq-frame';
            iframe.srcdoc = html;
            box.innerHTML = `<div class="gq-badge">${esc(s.name)}</div>`;
            box.appendChild(iframe);
        }

        function gqCloseStudent() {
            const box = interactionUIs.game_quiz;
            if (box && box.innerHTML) box.innerHTML = '';
            gqMountedRound = null;
        }

        /** (學生) 暫停時凍結有提供 Game.paused 的遊戲（選擇題單人遊戲），避免暫停期間被扣命 */
        function gqSetPaused(paused) {
            const w = interactionUIs.game_quiz.querySelector('iframe')?.contentWindow;
            if (w && w.Game && 'paused' in w.Game) w.Game.paused = paused;
        }

        // 遊戲結束 → 寫入學生作答（再玩一次時只在分數更高時覆蓋）
        window.addEventListener('message', e => {
            const d = e.data;
            const iframe = interactionUIs.game_quiz?.querySelector('iframe');
            if (!d || d.type !== 'gq-progress' || !d.finished || !iframe || e.source !== iframe.contentWindow) return;
            if (gqBest && gqBest.score >= d.score) return;
            const name = interactionUIs.game_quiz.querySelector('.gq-badge')?.textContent || '';
            gqBest = { game: name, score: d.score, correct: d.correct, total: d.total, finished: true, result: d.result };
            submitAnswer(gqBest);
        });

        /** 作答卡片／歷程用的成績文字 */
        function gqAnswerText(a) {
            return `${a.game}｜得分 ${a.score}｜答對 ${a.correct}/${a.total}${a.result ? '｜' + a.result : ''}`;
        }

        // ---------------- 匯出 Excel（.xlsx） ----------------
        let gqExportBank = null; // { type: 'mc' | 'match', name, content }

        function gqLoadXlsx() {
            if (window.XLSX) return Promise.resolve();
            return new Promise((resolve, reject) => {
                const sc = document.createElement('script');
                sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
                sc.onload = resolve;
                sc.onerror = reject;
                document.head.appendChild(sc);
            });
        }

        function openGqExportModal(type, index) {
            const bank = type === 'mc' ? questionBanks[index] : matchingQuestionBanks[index];
            if (!bank) return;
            gqExportBank = { type, name: bank.name, content: type === 'mc' ? bank.content : bank.pairs };
            document.getElementById('gq-export-title').textContent = `匯出「${bank.name}」為 Excel`;
            document.getElementById('gq-export-mc-options').classList.toggle('hidden', type !== 'mc');
            document.getElementById('gq-export-match-options').classList.toggle('hidden', type !== 'match');
            document.getElementById('gq-export-modal').classList.remove('hidden');
        }
        window.openGqExportModal = openGqExportModal;

        async function doGqExport(format) {
            if (!gqExportBank) return;
            const { name, content } = gqExportBank;
            let rows = [];
            if (format === 'match-forward' || format === 'match-reverse') {
                const pairs = String(content || '').split('\n').map(l => l.split(/[,\t]/).map(p => p.trim()).filter(p => p)).filter(p => p.length >= 2);
                if (!pairs.length) { showMessage('此題庫沒有可匯出的配對題目', 'error'); return; }
                rows = format === 'match-forward'
                    ? [['題目 / 左欄項目', '答案 / 右欄配對'], ...pairs.map(p => [p[0], p[1]])]
                    : [['答案 / 右欄配對', '題目 / 左欄項目'], ...pairs.map(p => [p[1], p[0]])];
            } else {
                const qs = parseCustomQuestions(String(content || ''));
                if (!qs) { showMessage('此題庫格式錯誤或沒有題目，無法匯出', 'error'); return; }
                const ans = q => Number(q.correctAnswer);
                if (format === 'wayground') {
                    rows = [['Question Text', 'Question Type', 'Option 1', 'Option 2', 'Option 3', 'Option 4', 'Option 5', 'Correct Answer', 'Time in seconds', 'Image Link', 'Answer explanation'],
                        ...qs.map(q => [q.questionText, 'Multiple Choice', ...q.options, '', ans(q), 30, '', ''])];
                } else if (format === 'kahoot') {
                    // Kahoot 範本：前 8 列為官方固定說明與欄位標題
                    rows = [[], ['', 'Quiz template'],
                        ['', 'Add questions, at least two answer alternatives, time limit and choose correct answers (at least one). Have fun creating your awesome quiz!'],
                        ['', 'Remember: questions have a limit of 120 characters and answers can have 75 characters max. Text will turn red in Excel or Google Docs if you exceed this limit. If several answers are correct, separate them with a comma.'],
                        ['', "See an example question below (don't forget to overwrite this with your first question!)"],
                        ['', "And remember,  if you're not using Excel you need to export to .xlsx format before you upload to Kahoot!"],
                        [],
                        ['', 'Question - max 120 characters', 'Answer 1 - max 75 characters', 'Answer 2 - max 75 characters', 'Answer 3 - max 75 characters', 'Answer 4 - max 75 characters', 'Time limit (sec) – 5, 10, 20, 30, 60, 90, 120, or 240 secs', 'Correct answer(s) - choose at least one'],
                        ...qs.map((q, i) => [i + 1, q.questionText, ...q.options, 60, ans(q)])];
                } else if (format === 'wordwall') {
                    rows = qs.map(q => [q.questionText, ...q.options, ans(q)]);
                } else if (format === 'publishers') {
                    rows = qs.map(q => [q.questionText, ans(q), ...q.options]);
                }
            }
            const suffix = { wayground: 'Wayground', kahoot: 'Kahoot', wordwall: 'Wordwall', publishers: '書商格式', 'match-forward': '配對(左欄至右欄)', 'match-reverse': '配對_二欄互換(右欄至左欄)' }[format];
            try {
                await gqLoadXlsx();
            } catch (e) {
                showMessage('Excel 匯出元件載入失敗，請檢查網路連線。', 'error');
                return;
            }
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Sheet1');
            XLSX.writeFile(wb, `${name}_${suffix}.xlsx`);
            document.getElementById('gq-export-modal').classList.add('hidden');
            showMessage(`已匯出「${name}_${suffix}.xlsx」`, 'success');
        }

        function setupGameQuizEventListeners() {
            document.querySelectorAll('[data-gq-export]').forEach(b => b.addEventListener('click', () => doGqExport(b.dataset.gqExport)));
            document.getElementById('gq-export-close-btn').addEventListener('click', () => document.getElementById('gq-export-modal').classList.add('hidden'));
        }
