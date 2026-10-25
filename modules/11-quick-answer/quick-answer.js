        // =====================================================================
        // 【11 搶答】 modules/11-quick-answer/quick-answer.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        // =====================================================================

        // --- Quick Answer Functions ---
        let quickAnswerActive = false;
        let quickAnswerWinner = null;
        let quickAnswerWinnerDisplayed = false;

        function startQuickAnswer() {
            quickAnswerActive = true;
            quickAnswerWinner = null;
            quickAnswerWinnerDisplayed = false;

            // Update status text
            document.getElementById('quick-answer-status-text').textContent = '搶答開始！快點擊按鈕！';

            // Generate random position for the button
            const container = document.getElementById('quick-answer-button-container');
            container.innerHTML = '';
            container.classList.remove('pointer-events-none');

            // Create the quick answer button
            const button = document.createElement('button');
            button.className = 'quick-answer-btn';
            button.textContent = '快點我';

            // Calculate random position (ensure button is fully visible)
            const containerRect = container.getBoundingClientRect();
            const buttonSize = 200; // 200px width and height
            const maxLeft = containerRect.width - buttonSize;
            const maxTop = containerRect.height - buttonSize;

            const randomLeft = Math.random() * Math.max(0, maxLeft);
            const randomTop = Math.random() * Math.max(0, maxTop);

            button.style.left = randomLeft + 'px';
            button.style.top = randomTop + 'px';

            // Add click handler
            button.addEventListener('click', handleQuickAnswerClick);

            container.appendChild(button);
        }

        async function handleQuickAnswerClick() {
            if (!quickAnswerActive || quickAnswerWinner) return;

            try {
                // Submit the quick answer to Firebase
                const response = `搶答成功：${studentName}`;
                console.log('Submitting quick answer:', response);
                await submitAnswer(response);
                console.log('Quick answer submitted successfully');

                // Lock the button（自己按的不顯示「搶答結束，下次再加油」，等判定結果）
                lockQuickAnswerButton(false);

                // V6.2: 先顯示等待判定，由監聽器依伺服器時間統一判定勝者（原本直接顯示成功，可能誤導）
                // 修正：伺服器的更新常比送出完成更早到達，監聽器可能已判定勝者；此時不可再蓋回「等待判定」
                if (!quickAnswerWinner) {
                    document.getElementById('quick-answer-status-text').textContent = '已送出搶答，等待判定…';
                }

            } catch (error) {
                console.error('Failed to submit quick answer:', error);
                showMessage('搶答提交失敗！', 'error');
            }
        }

        function lockQuickAnswerButton(showLockedMessage = true) {
            const button = document.querySelector('.quick-answer-btn');
            if (button) {
                button.classList.add('locked');
                button.disabled = true;
                button.removeEventListener('click', handleQuickAnswerClick);
            }

            // Show locked message for other students（自己按的不顯示，也不蓋掉已判定的結果）
            if (showLockedMessage) {
                document.getElementById('quick-answer-locked').classList.remove('hidden');
                document.getElementById('quick-answer-result').classList.add('hidden');
            }
        }

        /** 依伺服器時間判定搶答勝者 */
        function decideQuickAnswerWinner(snapshot) {
            if (snapshot.empty) return;

            const responses = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.answer && typeof data.answer === 'string' && data.answer.includes('搶答成功')) {
                    // V6.2: serverTimestamp 尚未寫回（pending）時先略過，等確定時間再判定
                    const ts = getResponseTimeMs(data.timestamp);
                    if (!ts) return;
                    responses.push({ ...data, _ts: ts });
                }
            });
            // V6.2: 以伺服器時間排序（同時間以姓名決勝負），所有裝置判定結果一致
            responses.sort((a, b) => (a._ts - b._ts) || String(a.name || '').localeCompare(String(b.name || '')));

            // V6.2: 依伺服器時間統一判定勝者（無論是不是自己）
            if (responses.length > 0 && !quickAnswerWinner) {
                const winner = responses[0];
                quickAnswerWinner = winner.name;
                if (winner.name !== studentName) {
                    lockQuickAnswerButton();
                    document.getElementById('quick-answer-status-text').textContent = `${winner.name} 搶答成功！`;
                    document.getElementById('quick-answer-result').classList.add('hidden');
                } else {
                    document.getElementById('quick-answer-status-text').textContent = '你搶答成功了！';
                    document.getElementById('quick-answer-locked').classList.add('hidden');
                    document.getElementById('quick-answer-result').classList.remove('hidden');
                }
            }
        }

        // Listen for quick answer winner updates
        function listenToQuickAnswerUpdates() {
            if (currentRole !== 'student' || currentInteractionMode !== 'quick_answer') return;

            const responsesRef = collection(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'studentResponses');
            onSnapshot(responsesRef, decideQuickAnswerWinner);
        }

        function showQuickAnswerWinner(winnerName) {
            console.log('showQuickAnswerWinner called with:', winnerName);
            if (quickAnswerWinnerDisplayed) {
                console.log('Winner already displayed, skipping');
                return; // Prevent showing multiple times
            }
            quickAnswerWinnerDisplayed = true;
            console.log('Displaying winner overlay');

            // Create a big overlay notification for the teacher
            const overlay = document.createElement('div');
            overlay.id = 'quick-answer-winner-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                animation: fadeIn 0.5s ease-in-out;
            `;

            overlay.innerHTML = `
                <div style="text-align: center; color: white; font-size: 3rem; font-weight: bold;">
                    <i class="fas fa-trophy" style="color: #ffd700; font-size: 6rem; margin-bottom: 20px;"></i>
                    <h1 style="margin: 20px 0; color: #4ade80;">搶答成功！</h1>
                    <h2 style="margin: 20px 0; color: #60a5fa; font-size: 4rem;">${winnerName}</h2>
                    <p style="font-size: 1.5rem; color: #d1d5db;">點擊任意位置關閉</p>
                </div>
                <style>
                    @keyframes fadeIn {
                        from { opacity: 0; transform: scale(0.8); }
                        to { opacity: 1; transform: scale(1); }
                    }
                </style>
            `;

            // Add click handler to close the overlay
            overlay.addEventListener('click', () => {
                overlay.remove();
                quickAnswerWinnerDisplayed = false; // Reset for next round
            });

            document.body.appendChild(overlay);

            // Auto close after 5 seconds
            setTimeout(() => {
                if (overlay.parentElement) {
                    overlay.remove();
                    quickAnswerWinnerDisplayed = false;
                }
            }, 5000);
        }
