        // =====================================================================
        // 【02 選擇/排序/配對】 modules/02-choice-sequencing-matching/choice-sequencing-matching.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        // =====================================================================
        let questionBanks = []; // Question Bank storage in memory (will be cleared when class ends)
        let sequencingQuestionBanks = []; // Sequencing Question Bank storage
        let matchingQuestionBanks = []; // Matching Question Bank storage

        // NEW: Custom Multiple Choice Questions (Teacher side)
        let customMultipleChoiceQuestions = []; // Stores parsed questions from teacher input

        // NEW: Sequencing and Matching Questions (Teacher side)
        let sequencingData = {
            question: '',
            correctOrder: [] // Array of items in correct order
        };
        let matchingData = {
            question: '',
            pairs: [] // Array of {left, right} objects
        };
        let currentMatchingSelection = {
            leftItem: null,
            rightItem: null
        };
        let currentMultipleChoiceQuestions = null; // Stores questions from Firestore for student/teacher monitor

        /**
         * Question Bank Management Functions (Classroom-specific)
         */
        function getQuestionBankKey() {
            return classroomCode ? `questionBanks_${classroomCode}` : 'questionBanks_default';
        }

        function loadQuestionBanksFromStorage() {
            if (!classroomCode) return;
            const key = getQuestionBankKey();
            const stored = localStorage.getItem(key);
            if (stored) {
                try {
                    questionBanks = JSON.parse(stored);
                } catch (e) {
                    console.error('載入題庫失敗:', e);
                    questionBanks = [];
                }
            } else {
                questionBanks = [];
            }
        }

        function saveQuestionBanksToStorage() {
            if (!classroomCode) return;
            const key = getQuestionBankKey();
            try {
                localStorage.setItem(key, JSON.stringify(questionBanks));
                mirrorBanksToGlobal('questionBanks_global', questionBanks); // 同步到跨課堂本地題庫
            } catch (e) {
                console.error('儲存題庫失敗:', e);
            }
        }

        function updateQuestionBankList() {
            loadQuestionBanksFromStorage(); // Load from storage first
            populateGlobalBankSelect('mc'); // 更新跨課堂本地題庫下拉
            const list = document.getElementById('question-bank-list');
            if (questionBanks.length === 0) {
                list.innerHTML = '<div class="text-gray-500 text-sm italic text-center">目前沒有儲存的題庫</div>';
            } else {
                list.innerHTML = questionBanks.map((bank, index) => `
                    <div class="flex items-center justify-between p-2 bg-gray-50 rounded border">
                        <span class="text-sm font-medium text-gray-700">${bank.name}</span>
                        <div class="flex gap-2">
                            <button onclick="loadQuestionBankToTextarea(${index})" class="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded">載入</button>
                            <button onclick="deleteQuestionBank(${index})" class="px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded">刪除</button>
                        </div>
                    </div>
                `).join('');
            }
        }

        function loadQuestionBankFromFile() {
            const fileInput = document.getElementById('question-bank-file-input');
            const file = fileInput.files[0];

            if (!file) {
                showMessage('請選擇一個txt檔案', 'error');
                return;
            }

            if (!file.name.toLowerCase().endsWith('.txt')) {
                showMessage('只能上傳txt格式的檔案', 'error');
                return;
            }

            const reader = new FileReader();
            reader.onload = async function (e) {
                const content = e.target.result;
                const fileName = file.name.replace('.txt', '');

                // Check if bank with same name exists
                const existingIndex = questionBanks.findIndex(bank => bank.name === fileName);
                if (existingIndex !== -1) {
                    const confirmed = await customConfirm(`題庫「${fileName}」已存在，是否要覆蓋？`);
                    if (confirmed) {
                        questionBanks[existingIndex] = { name: fileName, content: content };
                    } else {
                        return;
                    }
                } else {
                    questionBanks.push({ name: fileName, content: content });
                }

                updateQuestionBankList();
                showMessage(`題庫「${fileName}」載入成功`, 'success');
                fileInput.value = ''; // Clear file input
            };

            reader.onerror = function () {
                showMessage('讀取檔案時發生錯誤', 'error');
            };

            reader.readAsText(file, 'UTF-8');
        }

        async function saveQuestionBankFromTextarea() {
            const nameInput = document.getElementById('question-bank-name-input');
            const textarea = document.getElementById('custom-mc-questions-textarea');
            const name = nameInput.value.trim();
            const content = textarea.value.trim();

            if (!name) {
                showMessage('請輸入題庫名稱', 'error');
                return;
            }

            if (!content) {
                showMessage('題目內容不能為空', 'error');
                return;
            }

            loadQuestionBanksFromStorage(); // Load latest from storage

            // Check if bank with same name exists
            const existingIndex = questionBanks.findIndex(bank => bank.name === name);
            if (existingIndex !== -1) {
                const confirmed = await customConfirm(`題庫「${name}」已存在，是否要覆蓋？`);
                if (confirmed) {
                    questionBanks[existingIndex] = { name: name, content: content };
                } else {
                    return;
                }
            } else {
                questionBanks.push({ name: name, content: content });
            }

            saveQuestionBanksToStorage(); // Save to storage
            updateQuestionBankList();
            showMessage(`題庫「${name}」儲存成功`, 'success');
            nameInput.value = ''; // Clear name input
        }

        function loadQuestionBankToTextarea(index) {
            if (index >= 0 && index < questionBanks.length) {
                const textarea = document.getElementById('custom-mc-questions-textarea');
                textarea.value = questionBanks[index].content;
                showMessage(`題庫「${questionBanks[index].name}」已載入到輸入框`, 'success');
            }
        }

        async function deleteQuestionBank(index) {
            loadQuestionBanksFromStorage(); // Load latest from storage
            if (index >= 0 && index < questionBanks.length) {
                const bankName = questionBanks[index].name;
                const confirmed = await customConfirm(`確定要刪除題庫「${bankName}」嗎？`);
                if (confirmed) {
                    questionBanks.splice(index, 1);
                    saveQuestionBanksToStorage(); // Save to storage
                    updateQuestionBankList();
                    showMessage(`題庫「${bankName}」已刪除`, 'success');
                }
            }
        }

        // Make functions globally accessible for onclick handlers
        window.loadQuestionBankToTextarea = loadQuestionBankToTextarea;
        window.deleteQuestionBank = deleteQuestionBank;
        // ==================== Sequencing Question Bank Functions ====================

        function getSequencingBankKey() {
            return classroomCode ? `sequencingBanks_${classroomCode}` : 'sequencingBanks_default';
        }

        function loadSequencingBanksFromStorage() {
            if (!classroomCode) return;
            const key = getSequencingBankKey();
            const stored = localStorage.getItem(key);
            if (stored) {
                try {
                    sequencingQuestionBanks = JSON.parse(stored);
                } catch (e) {
                    console.error('載入排序題庫失敗:', e);
                    sequencingQuestionBanks = [];
                }
            } else {
                sequencingQuestionBanks = [];
            }
        }

        function saveSequencingBanksToStorage() {
            if (!classroomCode) return;
            const key = getSequencingBankKey();
            try {
                localStorage.setItem(key, JSON.stringify(sequencingQuestionBanks));
                mirrorBanksToGlobal('sequencingBanks_global', sequencingQuestionBanks); // 同步到跨課堂本地題庫
            } catch (e) {
                console.error('儲存排序題庫失敗:', e);
            }
        }

        function updateSequencingBankList() {
            loadSequencingBanksFromStorage(); // Load from storage first
            populateGlobalBankSelect('seq'); // 更新跨課堂本地題庫下拉
            const list = document.getElementById('seq-bank-list');
            if (sequencingQuestionBanks.length === 0) {
                list.innerHTML = '<div class="text-gray-500 text-sm italic text-center">目前沒有儲存的題庫</div>';
            } else {
                list.innerHTML = sequencingQuestionBanks.map((bank, index) => `
                    <div class="flex items-center justify-between p-2 bg-gray-50 rounded border">
                        <span class="text-sm font-medium text-gray-700">${bank.name}</span>
                        <div class="flex gap-2">
                            <button onclick="loadSequencingBankToTextarea(${index})" class="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded">載入</button>
                            <button onclick="deleteSequencingBank(${index})" class="px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded">刪除</button>
                        </div>
                    </div>
                `).join('');
            }
        }

        function loadSequencingBankFromFile() {
            const fileInput = document.getElementById('seq-bank-file-input');
            const file = fileInput.files[0];

            if (!file) {
                showMessage('請選擇一個txt檔案', 'error');
                return;
            }

            if (!file.name.toLowerCase().endsWith('.txt')) {
                showMessage('只能上傳txt格式的檔案', 'error');
                return;
            }

            const reader = new FileReader();
            reader.onload = async function (e) {
                const content = e.target.result;
                const fileName = file.name.replace('.txt', '');
                const lines = content.split('\n').map(line => line.trim()).filter(line => line);

                if (lines.length < 2) {
                    showMessage('題庫格式錯誤：至少需要2個排序項目', 'error');
                    return;
                }

                const question = '排序題';
                const items = lines.join('\n');

                loadSequencingBanksFromStorage(); // Load latest from storage
                const existingIndex = sequencingQuestionBanks.findIndex(bank => bank.name === fileName);
                if (existingIndex !== -1) {
                    const confirmed = await customConfirm(`題庫「${fileName}」已存在，是否要覆蓋？`);
                    if (confirmed) {
                        sequencingQuestionBanks[existingIndex] = { name: fileName, question: question, items: items };
                    } else {
                        return;
                    }
                } else {
                    sequencingQuestionBanks.push({ name: fileName, question: question, items: items });
                }

                saveSequencingBanksToStorage(); // Save to storage
                updateSequencingBankList();
                showMessage(`題庫「${fileName}」載入成功`, 'success');
                fileInput.value = '';
            };

            reader.onerror = function () {
                showMessage('讀取檔案時發生錯誤', 'error');
            };

            reader.readAsText(file, 'UTF-8');
        }

        async function saveSequencingBank() {
            const nameInput = document.getElementById('seq-bank-name-input');
            const itemsTextarea = document.getElementById('sequencing-items-textarea');

            const name = nameInput.value.trim();
            const question = '排序題';
            const items = itemsTextarea.value.trim();

            if (!name) {
                showMessage('請輸入題庫名稱', 'error');
                return;
            }

            if (!items) {
                showMessage('排序項目不能為空', 'error');
                return;
            }

            loadSequencingBanksFromStorage(); // Load latest from storage
            const existingIndex = sequencingQuestionBanks.findIndex(bank => bank.name === name);
            if (existingIndex !== -1) {
                const confirmed = await customConfirm(`題庫「${name}」已存在，是否要覆蓋？`);
                if (confirmed) {
                    sequencingQuestionBanks[existingIndex] = { name: name, question: question, items: items };
                } else {
                    return;
                }
            } else {
                sequencingQuestionBanks.push({ name: name, question: question, items: items });
            }

            saveSequencingBanksToStorage(); // Save to storage
            updateSequencingBankList();
            showMessage(`題庫「${name}」儲存成功`, 'success');
            nameInput.value = '';
        }

        function loadSequencingBankToTextarea(index) {
            if (index >= 0 && index < sequencingQuestionBanks.length) {
                const bank = sequencingQuestionBanks[index];
                document.getElementById('sequencing-items-textarea').value = bank.items;
                showMessage(`題庫「${bank.name}」已載入到輸入框`, 'success');
            }
        }

        async function deleteSequencingBank(index) {
            loadSequencingBanksFromStorage(); // Load latest from storage
            if (index >= 0 && index < sequencingQuestionBanks.length) {
                const bankName = sequencingQuestionBanks[index].name;
                const confirmed = await customConfirm(`確定要刪除題庫「${bankName}」嗎？`);
                if (confirmed) {
                    sequencingQuestionBanks.splice(index, 1);
                    saveSequencingBanksToStorage(); // Save to storage
                    updateSequencingBankList();
                    showMessage(`題庫「${bankName}」已刪除`, 'success');
                }
            }
        }

        // ==================== Matching Question Bank Functions ====================

        function getMatchingBankKey() {
            return classroomCode ? `matchingBanks_${classroomCode}` : 'matchingBanks_default';
        }

        function loadMatchingBanksFromStorage() {
            if (!classroomCode) return;
            const key = getMatchingBankKey();
            const stored = localStorage.getItem(key);
            if (stored) {
                try {
                    matchingQuestionBanks = JSON.parse(stored);
                } catch (e) {
                    console.error('載入配對題庫失敗:', e);
                    matchingQuestionBanks = [];
                }
            } else {
                matchingQuestionBanks = [];
            }
        }

        function saveMatchingBanksToStorage() {
            if (!classroomCode) return;
            const key = getMatchingBankKey();
            try {
                localStorage.setItem(key, JSON.stringify(matchingQuestionBanks));
                mirrorBanksToGlobal('matchingBanks_global', matchingQuestionBanks); // 同步到跨課堂本地題庫
            } catch (e) {
                console.error('儲存配對題庫失敗:', e);
            }
        }

        function updateMatchingBankList() {
            loadMatchingBanksFromStorage(); // Load from storage first
            populateGlobalBankSelect('match'); // 更新跨課堂本地題庫下拉
            const list = document.getElementById('match-bank-list');
            if (matchingQuestionBanks.length === 0) {
                list.innerHTML = '<div class="text-gray-500 text-sm italic text-center">目前沒有儲存的題庫</div>';
            } else {
                list.innerHTML = matchingQuestionBanks.map((bank, index) => `
                    <div class="flex items-center justify-between p-2 bg-gray-50 rounded border">
                        <span class="text-sm font-medium text-gray-700">${bank.name}</span>
                        <div class="flex gap-2">
                            <button onclick="loadMatchingBankToTextarea(${index})" class="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded">載入</button>
                            <button onclick="deleteMatchingBank(${index})" class="px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded">刪除</button>
                        </div>
                    </div>
                `).join('');
            }
        }

        function loadMatchingBankFromFile() {
            const fileInput = document.getElementById('match-bank-file-input');
            const file = fileInput.files[0];

            if (!file) {
                showMessage('請選擇一個txt檔案', 'error');
                return;
            }

            if (!file.name.toLowerCase().endsWith('.txt')) {
                showMessage('只能上傳txt格式的檔案', 'error');
                return;
            }

            const reader = new FileReader();
            reader.onload = async function (e) {
                const content = e.target.result;
                const fileName = file.name.replace('.txt', '');
                const lines = content.split('\n').map(line => line.trim()).filter(line => line);

                if (lines.length < 2) {
                    showMessage('題庫格式錯誤：至少需要2組配對項目', 'error');
                    return;
                }

                const question = '配對題';
                const pairs = lines.join('\n');

                loadMatchingBanksFromStorage(); // Load latest from storage
                const existingIndex = matchingQuestionBanks.findIndex(bank => bank.name === fileName);
                if (existingIndex !== -1) {
                    const confirmed = await customConfirm(`題庫「${fileName}」已存在，是否要覆蓋？`);
                    if (confirmed) {
                        matchingQuestionBanks[existingIndex] = { name: fileName, question: question, pairs: pairs };
                    } else {
                        return;
                    }
                } else {
                    matchingQuestionBanks.push({ name: fileName, question: question, pairs: pairs });
                }

                saveMatchingBanksToStorage(); // Save to storage
                updateMatchingBankList();
                showMessage(`題庫「${fileName}」載入成功`, 'success');
                fileInput.value = '';
            };

            reader.onerror = function () {
                showMessage('讀取檔案時發生錯誤', 'error');
            };

            reader.readAsText(file, 'UTF-8');
        }

        async function saveMatchingBank() {
            const nameInput = document.getElementById('match-bank-name-input');
            const pairsTextarea = document.getElementById('matching-pairs-textarea');

            const name = nameInput.value.trim();
            const question = '配對題';
            const pairs = pairsTextarea.value.trim();

            if (!name) {
                showMessage('請輸入題庫名稱', 'error');
                return;
            }

            if (!pairs) {
                showMessage('配對項目不能為空', 'error');
                return;
            }

            loadMatchingBanksFromStorage(); // Load latest from storage
            const existingIndex = matchingQuestionBanks.findIndex(bank => bank.name === name);
            if (existingIndex !== -1) {
                const confirmed = await customConfirm(`題庫「${name}」已存在，是否要覆蓋？`);
                if (confirmed) {
                    matchingQuestionBanks[existingIndex] = { name: name, question: question, pairs: pairs };
                } else {
                    return;
                }
            } else {
                matchingQuestionBanks.push({ name: name, question: question, pairs: pairs });
            }

            saveMatchingBanksToStorage(); // Save to storage
            updateMatchingBankList();
            showMessage(`題庫「${name}」儲存成功`, 'success');
            nameInput.value = '';
        }

        function loadMatchingBankToTextarea(index) {
            if (index >= 0 && index < matchingQuestionBanks.length) {
                const bank = matchingQuestionBanks[index];
                document.getElementById('matching-pairs-textarea').value = bank.pairs;
                showMessage(`題庫「${bank.name}」已載入到輸入框`, 'success');
            }
        }

        async function deleteMatchingBank(index) {
            loadMatchingBanksFromStorage(); // Load latest from storage
            if (index >= 0 && index < matchingQuestionBanks.length) {
                const bankName = matchingQuestionBanks[index].name;
                const confirmed = await customConfirm(`確定要刪除題庫「${bankName}」嗎？`);
                if (confirmed) {
                    matchingQuestionBanks.splice(index, 1);
                    saveMatchingBanksToStorage(); // Save to storage
                    updateMatchingBankList();
                    showMessage(`題庫「${bankName}」已刪除`, 'success');
                }
            }
        }

        // Make functions globally accessible
        window.loadSequencingBankToTextarea = loadSequencingBankToTextarea;
        window.deleteSequencingBank = deleteSequencingBank;
        window.loadMatchingBankToTextarea = loadMatchingBankToTextarea;
        window.deleteMatchingBank = deleteMatchingBank;

        // NEW: View Questions Modal Functions
        function showViewQuestionsModal() {
            if (!currentMultipleChoiceQuestions || currentMultipleChoiceQuestions.length === 0) {
                showMessage('目前沒有自訂題目可以查看。', 'info');
                return;
            }

            const modal = document.getElementById('view-questions-modal');
            const container = document.getElementById('questions-display-container');

            // 清空容器
            container.innerHTML = '';

            // 生成題目顯示HTML
            currentMultipleChoiceQuestions.forEach((question, index) => {
                const questionDiv = document.createElement('div');
                questionDiv.className = 'bg-gray-50 p-4 rounded-lg border';
                questionDiv.innerHTML = `
                    <h5 class="font-bold text-lg mb-3">第 ${index + 1} 題</h5>
                    <p class="text-gray-800 mb-4">${question.questionText}</p>
                    <div class="space-y-2">
                        <p class="font-medium text-gray-700">選項：</p>
                        <div class="grid grid-cols-2 gap-2">
                            ${question.options.map((option, optIndex) =>
                    `<div class="p-2 bg-white rounded border text-sm">
                                    ${String.fromCharCode(65 + optIndex)}. ${option}
                                </div>`
                ).join('')}
                        </div>
                    </div>
                    <div class="mt-4">
                        <label class="block text-sm font-medium text-gray-700 mb-2">正確答案：</label>
                        <select class="correct-answer-select w-full p-2 border rounded" data-question-index="${index}">
                            ${question.options.map((option, optIndex) => {
                    const optionValue = String.fromCharCode(65 + optIndex);
                    const isSelected = question.correctAnswer === optionValue || question.correctAnswer === (optIndex + 1).toString();
                    return `<option value="${optionValue}" ${isSelected ? 'selected' : ''}>${optionValue}. ${option}</option>`;
                }).join('')}
                        </select>
                    </div>
                `;
                container.appendChild(questionDiv);
            });

            modal.classList.remove('hidden');
        }

        function hideViewQuestionsModal() {
            document.getElementById('view-questions-modal').classList.add('hidden');
        }

        async function saveCorrectAnswers() {
            if (!currentMultipleChoiceQuestions || currentMultipleChoiceQuestions.length === 0) {
                showMessage('沒有題目可以儲存。', 'error');
                return;
            }

            try {
                // 更新currentMultipleChoiceQuestions中的正確答案
                const selects = document.querySelectorAll('.correct-answer-select');
                selects.forEach(select => {
                    const questionIndex = parseInt(select.getAttribute('data-question-index'));
                    let newCorrectAnswer = select.value;

                    // NEW: 將字母格式轉換為數字格式以保持一致性
                    if (newCorrectAnswer === 'A') newCorrectAnswer = '1';
                    else if (newCorrectAnswer === 'B') newCorrectAnswer = '2';
                    else if (newCorrectAnswer === 'C') newCorrectAnswer = '3';
                    else if (newCorrectAnswer === 'D') newCorrectAnswer = '4';

                    if (currentMultipleChoiceQuestions[questionIndex]) {
                        currentMultipleChoiceQuestions[questionIndex].correctAnswer = newCorrectAnswer;
                    }
                });

                // 更新Firestore中的題目資料
                const controlRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'settings', 'control');
                await updateDoc(controlRef, {
                    multiple_choice_questions: currentMultipleChoiceQuestions
                });

                // NEW: 等待一小段時間確保Firestore更新完成，然後觸發重新批改
                await new Promise(resolve => setTimeout(resolve, 100));

                // NEW: 自動重新批改所有學生已提交的答案
                await regradeAllStudentAnswers();

                // NEW: 確保教師端UI使用最新的正確答案進行渲染
                // 由於重新批改會觸發Firebase監聽器，UI會自動重新渲染

                showMessage('正確答案已更新並重新批改所有作答！', 'success');
                hideViewQuestionsModal();
            } catch (error) {
                console.error('更新正確答案失敗:', error);
                showMessage('更新失敗，請稍後再試。', 'error');
            }
        }

        // NEW: 重新批改所有學生答案的函數
        async function regradeAllStudentAnswers() {
            if (!currentMultipleChoiceQuestions || currentMultipleChoiceQuestions.length === 0) {
                return;
            }

            try {
                const studentsColRef = collection(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'studentResponses');
                const querySnapshot = await getDocs(studentsColRef);

                const batch = writeBatch(db);
                let regradeCount = 0;

                querySnapshot.forEach((docSnapshot) => {
                    const studentData = docSnapshot.data();

                    // 只處理選擇題的答案（Array格式）
                    if (Array.isArray(studentData.answer)) {
                        // 更新學生答案時間戳以觸發UI重新渲染（答案內容保持不變）
                        const studentRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'studentResponses', docSnapshot.id);
                        batch.update(studentRef, {
                            regraded: true,
                            regradeTimestamp: new Date(),
                            timestamp: new Date(), // 更新時間戳以觸發監聽器重新評判答案
                            forceUpdate: Math.random() // 添加隨機數強制觸發監聽器
                        });
                        regradeCount++;
                    }
                });

                if (regradeCount > 0) {
                    await batch.commit();
                    console.log(`重新批改了 ${regradeCount} 位學生的答案`);
                }
            } catch (error) {
                console.error('重新批改答案失敗:', error);
                throw error;
            }
        }

        function drawCustomMultipleChoiceBarChart(responses, questions) {
            const questionStats = questions.map((q, qIndex) => {
                let correctCount = 0;
                let answeredCount = 0; // Count students who attempted this question
                const wrongNames = [];

                responses.forEach(studentResponse => {
                    if (Array.isArray(studentResponse.answer)) {
                        const studentQAnswer = studentResponse.answer.find(ans => ans.qIndex === qIndex);
                        if (studentQAnswer) {
                            answeredCount++;
                            if (String(studentQAnswer.ans) === String(q.correctAnswer)) {
                                correctCount++;
                            } else {
                                wrongNames.push(studentResponse.name || '匿名');
                            }
                        }
                    }
                });
                return {
                    label: `Q${qIndex + 1}`,
                    correctCount: correctCount,
                    answeredCount: answeredCount,
                    correctRate: answeredCount > 0 ? (correctCount / answeredCount) * 100 : 0,
                    wrongNames: wrongNames
                };
            });

            const displayStats = questionStats.filter(s => s.answeredCount > 0);
            if (displayStats.length === 0) {
                const container = document.getElementById('modern-stats-container');
                const chartSvgEl = document.getElementById('chart-svg');
                if (chartSvgEl) chartSvgEl.classList.add('hidden');
                if (container) {
                    container.classList.remove('hidden');
                    container.innerHTML = `<p class="text-gray-500 text-center py-8">目前沒有學生作答任何自訂選擇題。</p>`;
                }
                return;
            }

            renderModernStatsChart(displayStats);
        }


        // --- Sequencing Question Logic ---
        function setupSequencingUI(data) {
            const questionText = document.getElementById('sequencing-question-text');
            const container = document.getElementById('sequencing-items-container');

            questionText.textContent = data.question || '請依照正確順序排列以下項目';
            container.innerHTML = '';

            // Shuffle items
            const shuffled = [...data.correctOrder].sort(() => Math.random() - 0.5);

            shuffled.forEach((text, index) => {
                const item = document.createElement('div');
                item.className = 'sequencing-item';
                item.draggable = true;
                item.dataset.text = text;
                item.innerHTML = `
                    <div class="sequencing-item-number">${index + 1}</div>
                    <div class="sequencing-item-text">${text}</div>
                `;

                // Drag events
                item.addEventListener('dragstart', (e) => {
                    item.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                });

                item.addEventListener('dragend', () => {
                    item.classList.remove('dragging');
                });

                item.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    const dragging = document.querySelector('.sequencing-item.dragging');
                    if (dragging && dragging !== item) {
                        const rect = item.getBoundingClientRect();
                        const midY = rect.top + rect.height / 2;
                        if (e.clientY < midY) {
                            container.insertBefore(dragging, item);
                        } else {
                            container.insertBefore(dragging, item.nextSibling);
                        }
                    }
                });

                // Touch events for mobile
                let touchStartY = 0;
                item.addEventListener('touchstart', (e) => {
                    touchStartY = e.touches[0].clientY;
                    item.classList.add('dragging');
                });

                item.addEventListener('touchmove', (e) => {
                    e.preventDefault();
                    const touch = e.touches[0];
                    const target = document.elementFromPoint(touch.clientX, touch.clientY);
                    if (target && target.classList.contains('sequencing-item') && target !== item) {
                        if (touch.clientY < touchStartY) {
                            container.insertBefore(item, target);
                        } else {
                            container.insertBefore(item, target.nextSibling);
                        }
                        touchStartY = touch.clientY;
                    }
                });

                item.addEventListener('touchend', () => {
                    item.classList.remove('dragging');
                });

                container.appendChild(item);
            });

            // Update numbers after any change
            updateSequencingNumbers();
        }

        function updateSequencingNumbers() {
            const items = document.querySelectorAll('.sequencing-item');
            items.forEach((item, index) => {
                const numberDiv = item.querySelector('.sequencing-item-number');
                if (numberDiv) numberDiv.textContent = index + 1;
            });
        }

        // --- Matching Question Logic ---
        function setupMatchingUI(data) {
            const questionText = document.getElementById('matching-question-text');
            const columnA = document.getElementById('matching-column-a');
            const columnB = document.getElementById('matching-column-b');
            const svg = document.getElementById('matching-svg-canvas');

            questionText.textContent = data.question || '請將左右兩側相關的項目配對';
            columnA.innerHTML = '';
            columnB.innerHTML = '';
            svg.innerHTML = '';

            // Shuffle items
            const leftItems = data.pairs.map(p => p.left).sort(() => Math.random() - 0.5);
            const rightItems = data.pairs.map(p => p.right).sort(() => Math.random() - 0.5);

            leftItems.forEach((text, index) => {
                const item = document.createElement('div');
                item.className = 'matching-item';
                item.dataset.side = 'left';
                item.dataset.text = text;
                item.dataset.index = index;
                item.textContent = text;
                item.addEventListener('click', () => handleMatchingClick(item));
                columnA.appendChild(item);
            });

            rightItems.forEach((text, index) => {
                const item = document.createElement('div');
                item.className = 'matching-item';
                item.dataset.side = 'right';
                item.dataset.text = text;
                item.dataset.index = index;
                item.textContent = text;
                item.addEventListener('click', () => handleMatchingClick(item));
                columnB.appendChild(item);
            });
        }

        function handleMatchingClick(item) {
            const side = item.dataset.side;

            if (item.classList.contains('matched')) {
                // Unmatch
                const matchedWith = item.dataset.matchedWith;
                delete item.dataset.matchedWith;
                item.classList.remove('matched');

                // Find and unmatch partner
                const partner = document.querySelector(`.matching-item[data-side="${side === 'left' ? 'right' : 'left'}"][data-text="${matchedWith}"]`);
                if (partner) {
                    delete partner.dataset.matchedWith;
                    partner.classList.remove('matched');
                }

                redrawMatchingLines();
                return;
            }

            if (side === 'left') {
                if (currentMatchingSelection.leftItem === item) {
                    currentMatchingSelection.leftItem.classList.remove('selected');
                    currentMatchingSelection.leftItem = null;
                } else {
                    if (currentMatchingSelection.leftItem) {
                        currentMatchingSelection.leftItem.classList.remove('selected');
                    }
                    currentMatchingSelection.leftItem = item;
                    item.classList.add('selected');
                }
            } else {
                if (currentMatchingSelection.rightItem === item) {
                    currentMatchingSelection.rightItem.classList.remove('selected');
                    currentMatchingSelection.rightItem = null;
                } else {
                    if (currentMatchingSelection.rightItem) {
                        currentMatchingSelection.rightItem.classList.remove('selected');
                    }
                    currentMatchingSelection.rightItem = item;
                    item.classList.add('selected');
                }
            }

            // If both sides selected, create match
            if (currentMatchingSelection.leftItem && currentMatchingSelection.rightItem) {
                const left = currentMatchingSelection.leftItem;
                const right = currentMatchingSelection.rightItem;

                left.classList.remove('selected');
                right.classList.remove('selected');
                left.classList.add('matched');
                right.classList.add('matched');

                left.dataset.matchedWith = right.dataset.text;
                right.dataset.matchedWith = left.dataset.text;

                currentMatchingSelection.leftItem = null;
                currentMatchingSelection.rightItem = null;

                redrawMatchingLines();
            }
        }

        function redrawMatchingLines() {
            const svg = document.getElementById('matching-svg-canvas');
            svg.innerHTML = '';

            const container = document.querySelector('.matching-container');
            const rect = container.getBoundingClientRect();
            svg.setAttribute('width', rect.width);
            svg.setAttribute('height', rect.height);

            document.querySelectorAll('.matching-item.matched[data-side="left"]').forEach(leftItem => {
                const rightText = leftItem.dataset.matchedWith;
                const rightItem = document.querySelector(`.matching-item[data-side="right"][data-text="${rightText}"]`);

                if (rightItem) {
                    const leftRect = leftItem.getBoundingClientRect();
                    const rightRect = rightItem.getBoundingClientRect();

                    const x1 = leftRect.right - rect.left;
                    const y1 = leftRect.top + leftRect.height / 2 - rect.top;
                    const x2 = rightRect.left - rect.left;
                    const y2 = rightRect.top + rightRect.height / 2 - rect.top;

                    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    const d = `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`;
                    line.setAttribute('d', d);
                    line.setAttribute('class', 'matching-line');
                    svg.appendChild(line);
                }
            });
        }

        /**
         * NEW: Parses custom multiple choice questions from a textarea string.
         * Expected format per line: Question,CorrectAnswer(1-4/A-D),Option1,Option2,Option3,Option4
         * @param {string} rawText - The raw string from the textarea.
         * @returns {Array|null} An array of question objects, or null if parsing fails.
         */
        function parseCustomQuestions(rawText) {
            const lines = rawText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            const questions = [];

            for (const line of lines) {
                // Try splitting by comma first, then by tab if comma yields too few parts
                let parts = line.split(',');
                if (parts.length < 6) {
                    parts = line.split('\t');
                }

                if (parts.length !== 6) {
                    console.error("Invalid line format:", line);
                    return null; // Invalid format
                }

                const questionText = parts[0].trim();
                let correctAnswer = parts[1].trim().toUpperCase();
                const options = parts.slice(2, 6).map(opt => opt.trim());

                // Normalize correct answer to 1, 2, 3, 4
                if (correctAnswer === 'A') correctAnswer = '1';
                else if (correctAnswer === 'B') correctAnswer = '2';
                else if (correctAnswer === 'C') correctAnswer = '3';
                else if (correctAnswer === 'D') correctAnswer = '4';

                if (!['1', '2', '3', '4'].includes(correctAnswer)) {
                    console.error("Invalid correct answer format:", correctAnswer);
                    return null; // Invalid correct answer
                }

                if (questionText === '' || options.some(opt => opt === '')) {
                    console.error("Empty question or option:", line);
                    return null; // Empty question or option
                }

                questions.push({
                    questionText: questionText,
                    correctAnswer: correctAnswer,
                    options: options
                });
            }

            if (questions.length === 0) {
                return null; // No valid questions parsed
            }

            return questions;
        }

        /**
         * NEW: Renders custom multiple choice questions on the student side.
         * @param {Array} questions - An array of question objects.
         */
        async function renderMultipleChoiceQuestions(questions) {
            const defaultMcOptions = document.getElementById('default-mc-options');
            const customMcQuestionsContainer = document.getElementById('custom-mc-questions-container');
            const submitCustomMcBtn = document.getElementById('submit-custom-mc-btn');
            const interactionMultipleChoice = document.getElementById('interaction-multiple-choice');

            if (questions && questions.length > 0) {
                defaultMcOptions.classList.add('hidden');
                customMcQuestionsContainer.classList.remove('hidden');
                submitCustomMcBtn.classList.remove('hidden');
                customMcQuestionsContainer.innerHTML = ''; // Clear previous questions
                interactionMultipleChoice.classList.remove('enlarged-buttons'); // Remove enlarged class for custom questions

                // NEW: 檢查學生是否已經提交過答案
                const hasSubmitted = await checkIfStudentSubmitted();

                questions.forEach((q, qIndex) => {
                    const questionDiv = document.createElement('div');
                    questionDiv.className = 'mc-question-item bg-white p-4 rounded-lg shadow-md';
                    questionDiv.innerHTML = `
                        <p class="font-bold text-lg mb-3 text-gray-800">Q${qIndex + 1}. ${q.questionText}</p>
                        <div class="space-y-2">
                            ${q.options.map((option, optIndex) => `
                                <label class="flex items-center p-2 border border-gray-200 rounded-md cursor-pointer hover:bg-gray-50 transition-colors">
                                    <input type="radio" name="question-${qIndex}" value="${optIndex + 1}" class="form-radio text-blue-600 h-5 w-5" ${hasSubmitted ? 'disabled' : ''}>
                                    <span class="ml-3 text-gray-700">${option}</span>
                                </label>
                            `).join('')}
                        </div>
                    `;
                    customMcQuestionsContainer.appendChild(questionDiv);
                });

                // NEW: 如果已提交，更新按鈕狀態
                if (hasSubmitted) {
                    submitCustomMcBtn.disabled = true;
                    submitCustomMcBtn.classList.replace('btn-primary', 'btn-gray');
                    submitCustomMcBtn.textContent = '已提交答案 ✓';

                    // 顯示逐題題目與答對／答錯情形
                    try {
                        const studentRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'studentResponses', studentName);
                        const docSnap = await getDoc(studentRef);
                        if (docSnap.exists() && Array.isArray(docSnap.data().answer)) {
                            showCustomMCResult(questions, docSnap.data().answer);
                        } else {
                            await displaySubmittedAnswers();
                        }
                    } catch (err) {
                        console.error('載入作答結果失敗:', err);
                        await displaySubmittedAnswers();
                    }
                }
            } else {
                defaultMcOptions.classList.remove('hidden');
                customMcQuestionsContainer.classList.add('hidden');
                submitCustomMcBtn.classList.add('hidden');
                interactionMultipleChoice.classList.add('enlarged-buttons'); // Add enlarged class for no custom questions
            }
        }

        // NEW: 檢查學生是否已經提交過答案
        async function checkIfStudentSubmitted() {
            if (!studentName || !classroomCode) return false;

            try {
                const studentRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'studentResponses', studentName);
                const docSnap = await getDoc(studentRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    // 檢查是否有陣列格式的答案（自訂選擇題）
                    return Array.isArray(data.answer) && data.answer.length > 0;
                }
                return false;
            } catch (error) {
                console.error('檢查提交狀態失敗:', error);
                return false;
            }
        }

        // NEW: 顯示學生已提交的答案
        async function displaySubmittedAnswers() {
            if (!studentName || !classroomCode) return;

            try {
                const studentRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'studentResponses', studentName);
                const docSnap = await getDoc(studentRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (Array.isArray(data.answer)) {
                        // 標記已選擇的答案
                        data.answer.forEach(qAns => {
                            const radio = document.querySelector(`input[name="question-${qAns.qIndex}"][value="${qAns.ans}"]`);
                            if (radio) {
                                radio.checked = true;
                            }
                        });
                    }
                }
            } catch (error) {
                console.error('載入已提交答案失敗:', error);
            }
        }

        /**
         * NEW: 學生送出選擇題後，於學生端顯示逐題題目與答對／答錯情形。
         * @param {Array} questions - 題目（含 correctAnswer）。
         * @param {Array} studentAnswers - [{ qIndex, ans }]。
         */
        function showCustomMCResult(questions, studentAnswers) {
            const container = document.getElementById('custom-mc-questions-container');
            if (!container || !questions || questions.length === 0) return;

            const ansMap = {};
            (studentAnswers || []).forEach(a => { ansMap[a.qIndex] = String(a.ans); });

            const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
            let correctCount = 0;
            let body = '';

            questions.forEach((q, qIndex) => {
                const studentAns = Object.prototype.hasOwnProperty.call(ansMap, qIndex) ? ansMap[qIndex] : '';
                const correctAns = String(q.correctAnswer);
                const isCorrect = studentAns === correctAns;
                if (isCorrect) correctCount++;

                body += `
                    <div class="mc-question-item bg-white p-4 rounded-lg shadow-md">
                        <div class="flex items-start justify-between mb-3 gap-2">
                            <p class="font-bold text-lg text-gray-800 flex-1">Q${qIndex + 1}. ${q.questionText}</p>
                            <span class="flex-shrink-0 px-3 py-1 rounded-full text-sm font-bold ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                                ${isCorrect ? '<i class="fas fa-check mr-1"></i>答對' : '<i class="fas fa-times mr-1"></i>答錯'}
                            </span>
                        </div>
                        <div class="space-y-2">
                            ${q.options.map((option, optIndex) => {
                    const val = String(optIndex + 1);
                    const isStudent = studentAns === val;
                    const isAnswer = correctAns === val;
                    let cls = 'flex items-center p-2 border-2 rounded-md ';
                    let tail = '';
                    if (isAnswer) { cls += 'border-green-400 bg-green-50'; tail = '<i class="fas fa-check-circle text-green-600 ml-auto"></i>'; }
                    else if (isStudent) { cls += 'border-red-400 bg-red-50'; tail = '<i class="fas fa-times-circle text-red-500 ml-auto"></i>'; }
                    else { cls += 'border-gray-200'; }
                    return `<div class="${cls}"><span class="text-gray-700"><span class="font-bold text-blue-600">${labels[optIndex]}.</span> ${option}</span>${isStudent ? '<span class="ml-2 text-xs text-gray-500 whitespace-nowrap">(你的答案)</span>' : ''}${tail}</div>`;
                }).join('')}
                        </div>
                    </div>
                `;
            });

            const total = questions.length;
            const summary = `
                <div class="bg-white p-4 rounded-lg shadow-md text-center border-2 ${correctCount === total ? 'border-green-300' : 'border-blue-200'}">
                    <p class="text-xl font-bold ${correctCount === total ? 'text-green-600' : 'text-blue-700'}"><i class="fas fa-clipboard-check mr-2"></i>答對 ${correctCount} / ${total} 題</p>
                </div>
            `;

            container.innerHTML = summary + body;
        }

        /**
         * 02 選擇/排序/配對：事件監聽設定（原本位於 setupEventListeners() 內的段落，
         * 由 modules/main/events.js 的 setupEventListeners() 依原順序呼叫）。
         */
        function setupChoiceSequencingMatchingEventListeners() {

            // Teacher mode selection.
            // MODIFIED: B button now opens a menu with Choice/Sequencing/Matching options
            document.getElementById('choice-sequencing-matching-menu-btn').addEventListener('click', () => {
                document.getElementById('choice-sequencing-matching-menu-modal').classList.remove('hidden');
            });

            // Close B menu modal
            document.getElementById('choice-sequencing-matching-menu-close-btn').addEventListener('click', () => {
                document.getElementById('choice-sequencing-matching-menu-modal').classList.add('hidden');
            });

            // Open Multiple Choice Settings from B menu
            document.getElementById('open-multiple-choice-settings-btn').addEventListener('click', () => {
                document.getElementById('choice-sequencing-matching-menu-modal').classList.add('hidden');

                // Update question bank list for current classroom
                updateQuestionBankList();

                // Initialize modal state based on current customMultipleChoiceQuestions
                const mcQuestionTypeNone = document.querySelector('input[name="mcQuestionType"][value="none"]');
                const mcQuestionTypeCustom = document.querySelector('input[name="mcQuestionType"][value="custom"]');
                const customMcQuestionsSection = document.getElementById('custom-mc-questions-section');
                const customMcQuestionsTextarea = document.getElementById('custom-mc-questions-textarea');
                const customMcQuestionsStatus = document.getElementById('custom-mc-questions-status');

                if (customMultipleChoiceQuestions && customMultipleChoiceQuestions.length > 0) {
                    mcQuestionTypeCustom.checked = true;
                    customMcQuestionsSection.classList.remove('hidden');
                    document.getElementById('question-bank-management-section').classList.remove('hidden');
                    customMcQuestionsTextarea.value = customMultipleChoiceQuestions.map(q => {
                        return `${q.question},${q.correctAnswer},${q.options.join(',')}`;
                    }).join('\n');
                } else {
                    mcQuestionTypeNone.checked = true;
                    customMcQuestionsSection.classList.add('hidden');
                    document.getElementById('question-bank-management-section').classList.add('hidden');
                    customMcQuestionsTextarea.value = '';
                }
                customMcQuestionsStatus.classList.add('hidden');
                document.getElementById('multiple-choice-settings-modal').classList.remove('hidden');
            });

            // Open Sequencing Settings from B menu
            document.getElementById('open-sequencing-settings-btn').addEventListener('click', () => {
                document.getElementById('choice-sequencing-matching-menu-modal').classList.add('hidden');

                // Update sequencing bank list for current classroom
                updateSequencingBankList();

                document.getElementById('sequencing-settings-modal').classList.remove('hidden');
            });

            // Open Matching Settings from B menu
            document.getElementById('open-matching-settings-btn').addEventListener('click', () => {
                document.getElementById('choice-sequencing-matching-menu-modal').classList.add('hidden');

                // Update matching bank list for current classroom
                updateMatchingBankList();

                document.getElementById('matching-settings-modal').classList.remove('hidden');
            });

            // Sequencing/Matching Menu Button - Keep for compatibility if needed elsewhere
            // Sequencing Settings Button (from menu)
            document.getElementById('sequencing-settings-btn')?.addEventListener('click', () => {
                document.getElementById('sequencing-matching-menu-modal').classList.add('hidden');
                document.getElementById('sequencing-settings-modal').classList.remove('hidden');
            });

            // Matching Settings Button (from menu)
            document.getElementById('matching-settings-btn')?.addEventListener('click', () => {
                document.getElementById('sequencing-matching-menu-modal').classList.add('hidden');
                document.getElementById('matching-settings-modal').classList.remove('hidden');
            });

            // 題型切換按鈕
            document.getElementById('switch-to-matching-btn').addEventListener('click', () => {
                document.getElementById('sequencing-settings-modal').classList.add('hidden');
                document.getElementById('matching-settings-modal').classList.remove('hidden');
            });

            document.getElementById('switch-to-sequencing-btn').addEventListener('click', () => {
                document.getElementById('matching-settings-modal').classList.add('hidden');
                document.getElementById('sequencing-settings-modal').classList.remove('hidden');
            });

            // Sequencing submission.
            document.getElementById('submit-sequencing-btn').addEventListener('click', async (e) => {
                if (isResponsePaused) {
                    showMessage('老師已暫停回覆，無法送出答案。', 'error');
                    return;
                }
                const container = document.getElementById('sequencing-items-container');
                const items = Array.from(container.children).map(item => item.dataset.text);
                const button = e.currentTarget; // await 之後 e.currentTarget 會變成 null，需先保存
                await submitAnswer(JSON.stringify(items));
                button.disabled = true;
                button.classList.replace('btn-primary', 'btn-gray');
                showMessage('答案已送出！', 'success');
            });

            // Matching submission.
            document.getElementById('submit-matching-btn').addEventListener('click', async (e) => {
                if (isResponsePaused) {
                    showMessage('老師已暫停回覆，無法送出答案。', 'error');
                    return;
                }
                const matches = [];
                document.querySelectorAll('.matching-item.matched').forEach(item => {
                    if (item.dataset.side === 'left' && item.dataset.matchedWith) {
                        matches.push({
                            left: item.dataset.text,
                            right: item.dataset.matchedWith
                        });
                    }
                });

                if (matches.length === 0) {
                    showMessage('請至少完成一個配對！', 'error');
                    return;
                }

                const button = e.currentTarget; // await 之後 e.currentTarget 會變成 null，需先保存
                await submitAnswer(JSON.stringify(matches));
                button.disabled = true;
                button.classList.replace('btn-primary', 'btn-gray');
                showMessage('答案已送出！', 'success');
            });

            // NEW: View Questions Button
            document.getElementById('view-questions-btn').addEventListener('click', showViewQuestionsModal);
            document.getElementById('view-questions-modal-close-btn').addEventListener('click', hideViewQuestionsModal);
            document.getElementById('cancel-questions-view-btn').addEventListener('click', hideViewQuestionsModal);
            document.getElementById('save-correct-answers-btn').addEventListener('click', saveCorrectAnswers);

            // Sequencing Settings Modal listeners
            document.getElementById('sequencing-settings-modal-close-btn').addEventListener('click', () => {
                document.getElementById('sequencing-settings-modal').classList.add('hidden');
            });
            document.getElementById('cancel-sequencing-settings-btn').addEventListener('click', () => {
                document.getElementById('sequencing-settings-modal').classList.add('hidden');
            });
            document.getElementById('start-sequencing-interaction-btn').addEventListener('click', async () => {
                const question = '排序題';
                const itemsText = document.getElementById('sequencing-items-textarea').value.trim();

                if (!itemsText) {
                    showMessage('請輸入排序項目！', 'error');
                    return;
                }

                const items = itemsText.split('\n').map(item => item.trim()).filter(item => item);
                if (items.length < 2) {
                    showMessage('至少需要兩個排序項目！', 'error');
                    return;
                }

                sequencingData.question = question;
                sequencingData.correctOrder = items;

                document.getElementById('sequencing-settings-modal').classList.add('hidden');
                showView('teacherMonitor');
                await setInteractionMode('sequencing', {
                    question: question,
                    correctOrder: items
                });
            });

            // Matching Settings Modal listeners
            document.getElementById('matching-settings-modal-close-btn').addEventListener('click', () => {
                document.getElementById('matching-settings-modal').classList.add('hidden');
            });
            document.getElementById('cancel-matching-settings-btn').addEventListener('click', () => {
                document.getElementById('matching-settings-modal').classList.add('hidden');
            });
            document.getElementById('start-matching-interaction-btn').addEventListener('click', async () => {
                const question = '配對題';
                const pairsText = document.getElementById('matching-pairs-textarea').value.trim();

                if (!pairsText) {
                    showMessage('請輸入配對項目！', 'error');
                    return;
                }

                const lines = pairsText.split('\n').map(line => line.trim()).filter(line => line);
                const pairs = [];

                for (const line of lines) {
                    const parts = line.split(/[,\t]/).map(p => p.trim()).filter(p => p);
                    if (parts.length >= 2) {
                        pairs.push({ left: parts[0], right: parts[1] });
                    }
                }

                if (pairs.length < 2) {
                    showMessage('至少需要兩對配對項目！', 'error');
                    return;
                }

                matchingData.question = question;
                matchingData.pairs = pairs;

                document.getElementById('matching-settings-modal').classList.add('hidden');
                showView('teacherMonitor');
                await setInteractionMode('matching', {
                    question: question,
                    pairs: pairs
                });
            });

            // NEW: Multiple Choice Settings Modal Listeners
            const multipleChoiceSettingsModal = document.getElementById('multiple-choice-settings-modal');
            const multipleChoiceSettingsModalCloseBtn = document.getElementById('multiple-choice-settings-modal-close-btn');
            const mcQuestionTypeRadios = document.querySelectorAll('input[name="mcQuestionType"]');
            const customMcQuestionsSection = document.getElementById('custom-mc-questions-section');
            const customMcQuestionsTextarea = document.getElementById('custom-mc-questions-textarea');
            const customMcQuestionsStatus = document.getElementById('custom-mc-questions-status');
            const startMcInteractionBtn = document.getElementById('start-mc-interaction-btn');
            const cancelMcSettingsBtn = document.getElementById('cancel-mc-settings-btn');

            // AI Question Generation elements
            const aiGenerateMcBtn = document.getElementById('ai-generate-mc-btn');
            const aiMcTopicTextarea = document.getElementById('ai-mc-topic-textarea');
            const aiMcCountInput = document.getElementById('ai-mc-count-input');
            const aiMcLoadingSpinner = document.getElementById('ai-mc-loading-spinner');
            const aiMcBtnText = document.getElementById('ai-mc-btn-text');
            const aiMcBtnIcon = document.getElementById('ai-mc-btn-icon');

            // Question Bank Management elements
            const questionBankFileInput = document.getElementById('question-bank-file-input');
            const loadQuestionBankBtn = document.getElementById('load-question-bank-btn');
            const questionBankNameInput = document.getElementById('question-bank-name-input');
            const saveQuestionBankBtn = document.getElementById('save-question-bank-btn');
            const questionBankList = document.getElementById('question-bank-list');


            multipleChoiceSettingsModalCloseBtn.addEventListener('click', () => multipleChoiceSettingsModal.classList.add('hidden'));
            cancelMcSettingsBtn.addEventListener('click', () => multipleChoiceSettingsModal.classList.add('hidden'));

            // Question Bank Management Event Listeners
            loadQuestionBankBtn.addEventListener('click', loadQuestionBankFromFile);
            saveQuestionBankBtn.addEventListener('click', saveQuestionBankFromTextarea);

            mcQuestionTypeRadios.forEach(radio => {
                radio.addEventListener('change', (e) => {
                    const isCustomMode = e.target.value === 'custom';
                    customMcQuestionsSection.classList.toggle('hidden', !isCustomMode);
                    document.getElementById('question-bank-management-section').classList.toggle('hidden', !isCustomMode);
                    customMcQuestionsStatus.classList.add('hidden'); // Hide status when changing radio
                });
            });

            startMcInteractionBtn.addEventListener('click', async () => {
                const selectedType = document.querySelector('input[name="mcQuestionType"]:checked').value;
                let questionsToDispatch = null;

                if (selectedType === 'custom') {
                    const parsedQuestions = parseCustomQuestions(customMcQuestionsTextarea.value);
                    if (!parsedQuestions) {
                        customMcQuestionsStatus.classList.remove('hidden');
                        return; // Stop if parsing failed
                    }
                    questionsToDispatch = parsedQuestions;
                    customMultipleChoiceQuestions = parsedQuestions; // Update global for teacher UI
                } else {
                    customMultipleChoiceQuestions = []; // Clear global if switching to none
                }

                customMcQuestionsStatus.classList.add('hidden'); // Hide status on successful dispatch
                multipleChoiceSettingsModal.classList.add('hidden');
                showView('teacherMonitor');
                await setInteractionMode('multiple_choice', { customQuestions: questionsToDispatch });
            });

            // AI Question Generation Button Listener
            aiGenerateMcBtn.addEventListener('click', async () => {
                const topic = aiMcTopicTextarea.value.trim();
                const count = parseInt(aiMcCountInput.value);

                if (!topic) {
                    showMessage('請輸入出題主題或要求！', 'error');
                    return;
                }
                if (!count || count < 1 || count > 10) {
                    showMessage('出題數量必須介於 1 到 10 之間！', 'error');
                    return;
                }

                // Show loading state
                aiGenerateMcBtn.disabled = true;
                aiMcBtnText.textContent = 'AI 思考中...';
                aiMcBtnIcon.classList.remove('fa-magic');
                aiMcBtnIcon.classList.add('fa-spinner', 'fa-spin');
                aiMcLoadingSpinner.classList.remove('hidden');

                const prompt = `請根據以下要求，生成 ${count} 題選擇題。
                要求：${topic}
                請嚴格遵守以下格式，每題一行，並用逗號分隔每個欄位：
                題目,正確答案(1-4),選項1,選項2,選項3,選項4
                請勿包含題號、任何多餘的說明文字或程式碼區塊標記。`;

                let apiResponse = null;
                try {
                    const payload = {
                        contents: [{ role: "user", parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.7 } // Adjust temperature for creativity
                    };
                    const apiKey = aiSettings.geminiApiKey;
                    const generatedText = cleanAiGeneratedText(await callAi(payload, apiKey));

                    if (generatedText) {
                        // Append to existing content, adding a newline if needed
                        const existingText = customMcQuestionsTextarea.value.trim();
                        customMcQuestionsTextarea.value = existingText ? `${existingText}\n${generatedText.trim()}` : generatedText.trim();
                        showMessage('AI 題目已成功生成並填入左方！', 'success');
                    } else {
                        throw new Error('AI 未返回有效內容。');
                    }

                } catch (error) {
                    console.error("AI 題目生成失敗:", error);
                    showAPIErrorModal(error, apiResponse);
                } finally {
                    // Hide loading state
                    aiGenerateMcBtn.disabled = false;
                    aiMcBtnText.textContent = 'AI 開始出題';
                    aiMcBtnIcon.classList.add('fa-magic');
                    aiMcBtnIcon.classList.remove('fa-spinner', 'fa-spin');
                    aiMcLoadingSpinner.classList.add('hidden');
                }
            });

            // AI Sequencing Question Generation Button Listener
            const aiGenerateSeqBtn = document.getElementById('ai-generate-seq-btn');
            const aiSeqTopicTextarea = document.getElementById('ai-seq-topic-textarea');
            const aiSeqCountInput = document.getElementById('ai-seq-count-input');
            const aiSeqBtnText = document.getElementById('ai-seq-btn-text');
            const aiSeqBtnIcon = document.getElementById('ai-seq-btn-icon');
            const aiSeqLoadingSpinner = document.getElementById('ai-seq-loading-spinner');

            aiGenerateSeqBtn.addEventListener('click', async () => {
                const topic = aiSeqTopicTextarea.value.trim();
                const count = parseInt(aiSeqCountInput.value);

                if (!topic) {
                    showMessage('請輸入出題主題或要求！', 'error');
                    return;
                }
                if (!count || count < 3 || count > 10) {
                    showMessage('項目數量必須介於 3 到 10 之間！', 'error');
                    return;
                }

                // Show loading state
                aiGenerateSeqBtn.disabled = true;
                aiSeqBtnText.textContent = 'AI 思考中...';
                aiSeqBtnIcon.classList.remove('fa-magic');
                aiSeqBtnIcon.classList.add('fa-spinner', 'fa-spin');
                aiSeqLoadingSpinner.classList.remove('hidden');

                const prompt = `請根據以下主題，生成 ${count} 個排序項目。
主題：${topic}
請按正確順序列出，每個項目一行，不要有題號或任何標記。
只需提供項目內容，不要包含說明文字或程式碼區塊標記。`;

                let apiResponse = null;
                try {
                    const payload = {
                        contents: [{ role: "user", parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.7 }
                    };
                    const apiKey = aiSettings.geminiApiKey;
                    const generatedText = cleanAiGeneratedText(await callAi(payload, apiKey));

                    if (generatedText) {
                        const sequencingItemsTextarea = document.getElementById('sequencing-items-textarea');
                        sequencingItemsTextarea.value = generatedText.trim();
                        showMessage('AI 排序題已成功生成並填入！', 'success');
                    } else {
                        throw new Error('AI 未返回有效內容。');
                    }

                } catch (error) {
                    console.error("AI 排序題生成失敗:", error);
                    showAPIErrorModal(error, apiResponse);
                } finally {
                    // Hide loading state
                    aiGenerateSeqBtn.disabled = false;
                    aiSeqBtnText.textContent = 'AI 開始出題';
                    aiSeqBtnIcon.classList.add('fa-magic');
                    aiSeqBtnIcon.classList.remove('fa-spinner', 'fa-spin');
                    aiSeqLoadingSpinner.classList.add('hidden');
                }
            });

            // AI Matching Question Generation Button Listener
            const aiGenerateMatchBtn = document.getElementById('ai-generate-match-btn');
            const aiMatchTopicTextarea = document.getElementById('ai-match-topic-textarea');
            const aiMatchCountInput = document.getElementById('ai-match-count-input');
            const aiMatchBtnText = document.getElementById('ai-match-btn-text');
            const aiMatchBtnIcon = document.getElementById('ai-match-btn-icon');
            const aiMatchLoadingSpinner = document.getElementById('ai-match-loading-spinner');

            aiGenerateMatchBtn.addEventListener('click', async () => {
                const topic = aiMatchTopicTextarea.value.trim();
                const count = parseInt(aiMatchCountInput.value);

                if (!topic) {
                    showMessage('請輸入出題主題或要求！', 'error');
                    return;
                }
                if (!count || count < 3 || count > 10) {
                    showMessage('配對數量必須介於 3 到 10 之間！', 'error');
                    return;
                }

                // Show loading state
                aiGenerateMatchBtn.disabled = true;
                aiMatchBtnText.textContent = 'AI 思考中...';
                aiMatchBtnIcon.classList.remove('fa-magic');
                aiMatchBtnIcon.classList.add('fa-spinner', 'fa-spin');
                aiMatchLoadingSpinner.classList.remove('hidden');

                const prompt = `請根據以下主題，生成 ${count} 組配對題。
主題：${topic}
每行格式：左側項目,右側項目
不要有題號、說明文字或程式碼區塊標記。
直接提供配對內容，每行一組。`;

                let apiResponse = null;
                try {
                    const payload = {
                        contents: [{ role: "user", parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.7 }
                    };
                    const apiKey = aiSettings.geminiApiKey;
                    const generatedText = cleanAiGeneratedText(await callAi(payload, apiKey));

                    if (generatedText) {
                        const matchingPairsTextarea = document.getElementById('matching-pairs-textarea');
                        matchingPairsTextarea.value = generatedText.trim();
                        showMessage('AI 配對題已成功生成並填入！', 'success');
                    } else {
                        throw new Error('AI 未返回有效內容。');
                    }

                } catch (error) {
                    console.error("AI 配對題生成失敗:", error);
                    showAPIErrorModal(error, apiResponse);
                } finally {
                    // Hide loading state
                    aiGenerateMatchBtn.disabled = false;
                    aiMatchBtnText.textContent = 'AI 開始出題';
                    aiMatchBtnIcon.classList.add('fa-magic');
                    aiMatchBtnIcon.classList.remove('fa-spinner', 'fa-spin');
                    aiMatchLoadingSpinner.classList.add('hidden');
                }
            });

            // Sequencing Question Bank Management Listeners
            document.getElementById('load-seq-bank-btn').addEventListener('click', loadSequencingBankFromFile);
            document.getElementById('save-seq-bank-btn').addEventListener('click', saveSequencingBank);

            // Matching Question Bank Management Listeners
            document.getElementById('load-match-bank-btn').addEventListener('click', loadMatchingBankFromFile);
            document.getElementById('save-match-bank-btn').addEventListener('click', saveMatchingBank);


            // NEW: Student side custom multiple choice submission
            document.getElementById('submit-custom-mc-btn').addEventListener('click', async (e) => {
                // Capture a stable reference: e.currentTarget becomes null after the first await.
                const submitBtn = e.currentTarget;

                // NEW: Check pause state before submitting
                if (isResponsePaused) {
                    showMessage('老師已暫停回覆，無法送出答案。', 'error');
                    return;
                }

                // NEW: 檢查是否已經提交過答案
                const hasSubmitted = await checkIfStudentSubmitted();
                if (hasSubmitted) {
                    showMessage('您已經提交過答案，無法重複提交。', 'error');
                    return;
                }

                const studentAnswers = [];
                const questionContainers = document.querySelectorAll('#custom-mc-questions-container .mc-question-item');
                let allAnswered = true;

                questionContainers.forEach((qContainer, index) => {
                    const selectedOption = qContainer.querySelector(`input[name="question-${index}"]:checked`);
                    if (selectedOption) {
                        studentAnswers.push({ qIndex: index, ans: selectedOption.value });
                    } else {
                        allAnswered = false;
                    }
                });

                if (!allAnswered) {
                    showMessage('請回答所有題目！', 'error');
                    return;
                }

                await submitAnswer(studentAnswers);

                // NEW: 更新UI顯示已提交狀態
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.classList.replace('btn-primary', 'btn-gray');
                    submitBtn.textContent = '已提交答案 ✓';
                }

                // Disable all radio buttons after submission
                document.querySelectorAll('#custom-mc-questions-container input[type="radio"]').forEach(radio => {
                    radio.disabled = true;
                });

                // NEW: 於學生端顯示逐題題目與答對／答錯情形
                showCustomMCResult(currentMultipleChoiceQuestions, studentAnswers);
            });
        }
