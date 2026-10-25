        // =====================================================================
        // 【01 是非題】 modules/01-true-false/true-false.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        // =====================================================================

        /**
         * 01 是非題：事件監聽設定（原本位於 setupEventListeners() 內的段落，
         * 由 modules/main/events.js 的 setupEventListeners() 依原順序呼叫）。
         */
        function setupTrueFalseEventListeners() {

            // Student answer buttons for default multiple choice.
            document.querySelectorAll('#interaction-true-false .answer-btn, #default-mc-options .answer-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    // NEW: Check pause state before submitting
                    if (isResponsePaused) {
                        showMessage('老師已暫停回覆，無法送出答案。', 'error');
                        return;
                    }
                    const answer = e.currentTarget.dataset.answer;
                    const button = e.currentTarget; // await 之後 e.currentTarget 會變成 null，需先保存
                    await submitAnswer(answer);
                    button.closest('div').querySelectorAll('.answer-btn').forEach(b => {
                        b.disabled = true;
                        b.classList.add('btn-gray');
                    });
                    button.disabled = false;
                    button.classList.remove('btn-gray');
                });
            });
        }
