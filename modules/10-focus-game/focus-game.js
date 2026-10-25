        // =====================================================================
        // 【10 專注力遊戲】 modules/10-focus-game/focus-game.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        // =====================================================================

        // === Focus Game Functions ===
        let focusGameState = {
            numbers: [],
            currentNumber: 1,
            startTime: null,
            isPlaying: false,
            timerInterval: null
        };

        function initializeFocusGame(numberCount = 36) {
            // Calculate grid size (e.g., 9->3, 16->4, 25->5, 36->6)
            const gridSize = Math.sqrt(numberCount);

            // Reset game state
            focusGameState = {
                numbers: shuffleArray([...Array(numberCount)].map((_, i) => i + 1)),
                currentNumber: 1,
                startTime: null,
                isPlaying: false,
                timerInterval: null,
                totalNumbers: numberCount
            };

            // Show instructions, hide timer and completion
            document.getElementById('focus-game-instructions').classList.remove('hidden');
            document.getElementById('focus-game-timer').classList.add('hidden');
            document.getElementById('focus-game-complete').classList.add('hidden');

            // Generate grid with dynamic columns
            const grid = document.getElementById('focus-game-grid');
            grid.classList.remove('hidden'); // Show the grid
            grid.innerHTML = '';
            // Set dynamic grid columns based on grid size
            grid.style.gridTemplateColumns = `repeat(${gridSize}, 1fr)`;

            focusGameState.numbers.forEach((num, index) => {
                const cell = document.createElement('button');
                cell.className = 'focus-game-cell w-full aspect-square bg-gradient-to-br from-cyan-100 to-blue-100 hover:from-cyan-200 hover:to-blue-200 rounded-xl shadow-md border-2 border-cyan-300 text-3xl font-bold text-cyan-700 transition transform hover:scale-105 active:scale-95';
                cell.textContent = num;
                cell.dataset.number = num;
                cell.addEventListener('click', handleFocusGameClick);
                grid.appendChild(cell);
            });

            document.getElementById('focus-next-number').textContent = '1';
            document.getElementById('focus-timer-display').textContent = '0.00';
        }

        function shuffleArray(array) {
            const newArray = [...array];
            for (let i = newArray.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
            }
            return newArray;
        }

        function handleFocusGameClick(e) {
            const clickedNumber = parseInt(e.currentTarget.dataset.number);

            // Start timer on first click (number 1)
            if (!focusGameState.isPlaying && clickedNumber === 1) {
                focusGameState.isPlaying = true;
                focusGameState.startTime = Date.now();
                document.getElementById('focus-game-instructions').classList.add('hidden');
                document.getElementById('focus-game-timer').classList.remove('hidden');
                startFocusGameTimer();
            }

            // Check if clicked correct number
            if (clickedNumber === focusGameState.currentNumber) {
                // Correct click - hide the cell
                e.currentTarget.style.opacity = '0';
                e.currentTarget.style.pointerEvents = 'none';

                focusGameState.currentNumber++;
                document.getElementById('focus-next-number').textContent = focusGameState.currentNumber;

                // Check if game is complete
                if (focusGameState.currentNumber > focusGameState.totalNumbers) {
                    completeFocusGame();
                }
            } else if (focusGameState.isPlaying) {
                // Wrong click - visual feedback
                e.currentTarget.classList.add('shake');
                setTimeout(() => {
                    e.currentTarget.classList.remove('shake');
                }, 500);
            }
        }

        function startFocusGameTimer() {
            focusGameState.timerInterval = setInterval(() => {
                const elapsed = (Date.now() - focusGameState.startTime) / 1000;
                document.getElementById('focus-timer-display').textContent = elapsed.toFixed(2);
            }, 10);
        }

        function completeFocusGame() {
            // Stop timer
            clearInterval(focusGameState.timerInterval);
            const finalTime = ((Date.now() - focusGameState.startTime) / 1000).toFixed(2);

            // Hide timer and grid
            document.getElementById('focus-game-timer').classList.add('hidden');
            document.getElementById('focus-game-grid').classList.add('hidden');

            // Show completion message
            document.getElementById('focus-final-time').textContent = finalTime;
            document.getElementById('focus-encouragement').textContent = getFocusEncouragement(parseFloat(finalTime));
            document.getElementById('focus-game-complete').classList.remove('hidden');

            // Submit result to teacher
            submitAnswer(finalTime);
        }

        function getFocusEncouragement(time) {
            if (time <= 10) return '驚人！你的專注力超乎尋常，反應神速！🏆';
            if (time <= 15) return '太棒了！你的專注力非常優秀！⭐';
            if (time <= 20) return '很好！你的專注力很不錯！👍';
            if (time <= 30) return '不錯！繼續保持專注！💪';
            if (time <= 40) return '做得好！多練習會更進步！😊';
            return '完成了！記得常常練習提升專注力哦！📚';
        }

        function clearFocusGameResults() {
            const container = document.getElementById('focus-time-groups');
            container.innerHTML = `
                <div class="text-center py-20 text-slate-400">
                    <i class="fas fa-hourglass-start text-4xl mb-4"></i>
                    <p class="text-lg font-medium">等待學生完成遊戲...</p>
                </div>
            `;
        }

        function updateFocusGameResults(responses) {
            const container = document.getElementById('focus-time-groups');

            if (!responses || responses.length === 0) {
                clearFocusGameResults();
                return;
            }

            // Parse times and group students
            const students = responses.map(r => ({
                name: r.name,
                time: parseFloat(r.answer)
            })).filter(s => !isNaN(s.time));

            // Sort by time
            students.sort((a, b) => a.time - b.time);

            // Group students by time ranges
            const groups = [
                { label: '⚡ 閃電級 (1-10秒)', min: 0, max: 10, students: [], color: 'from-yellow-100 to-amber-100 border-yellow-300' },
                { label: '🏆 優秀級 (10-15秒)', min: 10, max: 15, students: [], color: 'from-green-100 to-emerald-100 border-green-300' },
                { label: '⭐ 良好級 (15-20秒)', min: 15, max: 20, students: [], color: 'from-blue-100 to-cyan-100 border-blue-300' },
                { label: '💪 加油級 (20-25秒)', min: 20, max: 25, students: [], color: 'from-purple-100 to-violet-100 border-purple-300' },
                { label: '📚 練習級 (25-30秒)', min: 25, max: 30, students: [], color: 'from-pink-100 to-rose-100 border-pink-300' },
                { label: '🌟 努力級 (30秒以上)', min: 30, max: Infinity, students: [], color: 'from-slate-100 to-gray-100 border-slate-300' }
            ];

            students.forEach(student => {
                const group = groups.find(g => student.time > g.min && student.time <= g.max);
                if (group) {
                    group.students.push(student);
                }
            });

            // Display groups
            container.innerHTML = groups
                .filter(g => g.students.length > 0)
                .map(group => `
                    <div class="bg-gradient-to-r ${group.color} border-2 rounded-xl p-4 shadow-md">
                        <div class="flex items-center justify-between mb-3">
                            <h4 class="text-lg font-bold text-slate-700">${group.label}</h4>
                            <span class="bg-white px-3 py-1 rounded-full text-sm font-bold text-slate-600">
                                ${group.students.length} 位學生
                            </span>
                        </div>
                        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                            ${group.students.map(s => `
                                <div class="bg-white p-2 rounded-lg shadow-sm border border-slate-200">
                                    <div class="font-bold text-slate-700 text-sm truncate">${s.name}</div>
                                    <div class="text-cyan-600 font-bold text-lg">${s.time.toFixed(2)}秒</div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('');
        }

        /**
         * 10 專注力遊戲：事件監聽設定（原本位於 setupEventListeners() 內的段落，
         * 由 modules/main/events.js 的 setupEventListeners() 依原順序呼叫）。
         */
        function setupFocusGameEventListeners() {

            // Focus Game Settings Modal listeners
            let selectedFocusGameNumber = 36; // Default number

            document.getElementById('focus-game-settings-btn').addEventListener('click', () => {
                document.getElementById('focus-game-settings-modal').classList.remove('hidden');
            });

            document.getElementById('focus-game-settings-modal-close-btn').addEventListener('click', () => {
                document.getElementById('focus-game-settings-modal').classList.add('hidden');
            });

            document.getElementById('cancel-focus-game-settings-btn').addEventListener('click', () => {
                document.getElementById('focus-game-settings-modal').classList.add('hidden');
            });

            // Handle number option selection
            document.querySelectorAll('.focus-game-number-option').forEach(button => {
                button.addEventListener('click', (e) => {
                    // Remove selected class from all buttons
                    document.querySelectorAll('.focus-game-number-option').forEach(btn => {
                        btn.classList.remove('selected');
                    });
                    // Add selected class to clicked button
                    e.currentTarget.classList.add('selected');
                    // Store the selected number
                    selectedFocusGameNumber = parseInt(e.currentTarget.dataset.number);
                });
            });

            // Start focus game interaction
            document.getElementById('start-focus-game-interaction-btn').addEventListener('click', async () => {
                document.getElementById('focus-game-settings-modal').classList.add('hidden');
                showView('teacherMonitor');
                await setInteractionMode('focus_game', {
                    numberCount: selectedFocusGameNumber
                });
            });
        }
