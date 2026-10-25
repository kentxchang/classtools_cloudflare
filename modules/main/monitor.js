        // =====================================================================
        // 【主畫面配置 — 教師監看畫面（作答列表、統計、互評、星號）】 modules/main/monitor.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        // =====================================================================


        // --- Magnified Drawing Modal Functions ---
        const magnifiedImageModal = document.getElementById('magnified-image-modal');
        const magnifiedImage = document.getElementById('magnified-image');
        const magnifiedImageModalCloseBtn = document.getElementById('magnified-image-modal-close-btn');

        function showMagnifiedDrawing(imageUrl, studentId) {
            magnifiedImage.src = imageUrl;
            magnifiedImageModal.classList.remove('hidden');
            prepareDrawingReplay(studentId); // 05 繪圖題：有學生 ID 時顯示畫筆重播按鈕
        }

        function hideMagnifiedDrawing() {
            closeDrawingReplay();
            magnifiedImageModal.classList.add('hidden');
            magnifiedImage.src = '';
        }

        // Make function globally accessible for onclick handlers
        window.showMagnifiedDrawing = showMagnifiedDrawing;

        // --- Student List Modal (Teacher Side) ---
        const studentListModal = document.getElementById('student-list-modal');
        const studentListModalCloseBtn = document.getElementById('student-list-modal-close-btn');

        function showStudentListModal() {
            studentListModal.classList.remove('hidden');
        }

        function hideStudentListModal() {
            studentListModal.classList.add('hidden');
            if (lastSelectedModalStudent) { // Clear highlight in modal when closing
                lastSelectedModalStudent.classList.remove('modal-selected-student-border');
                lastSelectedModalStudent = null;
            }
        }

        // --- NEW: Unsubmitted Students Modal Functions ---
        const unsubmittedStudentsModal = document.getElementById('unsubmitted-students-modal');
        const unsubmittedStudentsModalCloseBtn = document.getElementById('unsubmitted-students-modal-close-btn');
        const modalUnsubmittedStudentNamesDiv = document.getElementById('modal-unsubmitted-student-names');

        /**
         * Calculates the list of students who are active but have not submitted an answer.
         * @param {string[]} activeStudents - Array of names of all active students.
         * @param {Object[]} respondedStudents - Array of response objects from students.
         * @returns {string[]} Sorted array of names of unsubmitted students.
         */
        function getUnsubmittedStudents(activeStudents, respondedStudents) {
            const respondedNames = new Set(respondedStudents.map(s => s.name));
            return activeStudents.filter(name => !respondedNames.has(name)).sort();
        }

        /**
         * Displays the modal with the list of unsubmitted students.
         */
        function showUnsubmittedStudentsModal() {
            const unsubmittedNames = getUnsubmittedStudents(activeStudentNames, allStudentResponses);
            modalUnsubmittedStudentNamesDiv.innerHTML = '';
            if (unsubmittedNames.length === 0) {
                modalUnsubmittedStudentNamesDiv.innerHTML = '<p class="text-gray-500 text-sm col-span-full">所有學生皆已作答或無學生在線</p>';
            } else {
                unsubmittedNames.forEach(name => {
                    const p = document.createElement('p');
                    p.textContent = name;
                    p.className = 'bg-red-100 p-2 rounded-md text-center text-red-700 font-medium overflow-hidden text-ellipsis whitespace-nowrap';
                    modalUnsubmittedStudentNamesDiv.appendChild(p);
                });
            }
            unsubmittedStudentsModal.classList.remove('hidden');
        }

        /**
         * Hides the unsubmitted students modal.
         */
        function hideUnsubmittedStudentsModal() {
            unsubmittedStudentsModal.classList.add('hidden');
        }


        // --- Statistics Chart Modal (Teacher Side) ---
        const statisticsModal = document.getElementById('statistics-modal');
        const chartModalCloseBtn = document.getElementById('chart-modal-close-btn');
        const chartSvg = d3.select("#chart-svg");
        const studentsByAnswerListContainer = document.getElementById('students-by-answer-list-container');
        const studentsByAnswerListTitle = document.getElementById('students-by-answer-list-title');
        const studentsByAnswerNamesParagraph = document.getElementById('students-by-answer-names');


        function showStatisticsModal() {
            statisticsModal.classList.remove('hidden');
            drawChart(allStudentResponses, currentInteractionMode);
        }

        function hideStatisticsModal() {
            statisticsModal.classList.add('hidden');
            chartSvg.selectAll("*").remove();
            const modernStatsContainer = document.getElementById('modern-stats-container');
            if (modernStatsContainer) {
                modernStatsContainer.classList.add('hidden');
                modernStatsContainer.innerHTML = '';
            }
            clearStudentsByAnswerList();
        }

        function downloadStudentResponses() {
            if (!allStudentResponses || allStudentResponses.length === 0) {
                showMessage('目前沒有學生回應可以下載。', 'warning');
                return;
            }

            let csvData = [];
            let filename = '';

            if (currentInteractionMode === 'text_input') {
                // 文字題模式
                csvData.push('學生姓名,學生回應');

                allStudentResponses.forEach(student => {
                    const studentName = student.name || '未知學生';
                    let responseText = student.answer || '';

                    // 清理回應文字中的換行符號和雙引號，避免影響CSV格式
                    responseText = responseText.replace(/[\r\n]/g, ' ').replace(/"/g, '""');

                    // 如果內容包含逗號或雙引號，需要用雙引號包圍
                    if (responseText.includes(',') || responseText.includes('"') || responseText.includes('\n')) {
                        responseText = `"${responseText}"`;
                    }

                    csvData.push(`${studentName},${responseText}`);
                });

                const now = new Date();
                const timestamp = now.getFullYear() +
                    String(now.getMonth() + 1).padStart(2, '0') +
                    String(now.getDate()).padStart(2, '0') + '_' +
                    String(now.getHours()).padStart(2, '0') +
                    String(now.getMinutes()).padStart(2, '0') +
                    String(now.getSeconds()).padStart(2, '0');
                filename = `學生回應_${timestamp}.csv`;

            } else if (currentInteractionMode === 'multiple_choice' && currentMultipleChoiceQuestions) {
                // 自訂選擇題模式

                // 第一部分：題目資訊
                csvData.push('=== 題目資訊 ===');
                csvData.push('題號,題目內容,選項A,選項B,選項C,選項D,正確答案');

                currentMultipleChoiceQuestions.forEach((question, index) => {
                    const questionText = `"${question.questionText.replace(/"/g, '""')}"`;
                    const optionA = `"${question.options[0].replace(/"/g, '""')}"`;
                    const optionB = `"${question.options[1].replace(/"/g, '""')}"`;
                    const optionC = `"${question.options[2].replace(/"/g, '""')}"`;
                    const optionD = `"${question.options[3].replace(/"/g, '""')}"`;
                    const correctAnswer = `選項${['A', 'B', 'C', 'D'][parseInt(question.correctAnswer) - 1]}`;

                    csvData.push(`第${index + 1}題,${questionText},${optionA},${optionB},${optionC},${optionD},${correctAnswer}`);
                });

                // 空行分隔
                csvData.push('');

                // 第二部分：學生答題結果
                csvData.push('=== 學生答題結果 ===');

                // 建立表頭
                let header = '學生姓名';
                currentMultipleChoiceQuestions.forEach((_, index) => {
                    header += `,第${index + 1}題答案,第${index + 1}題結果`;
                });
                header += ',總分,總題數,正確率';
                csvData.push(header);

                // 建立每個學生的答題結果
                allStudentResponses.forEach(student => {
                    const studentName = student.name || '未知學生';
                    let row = studentName;
                    let correctCount = 0;
                    let totalQuestions = currentMultipleChoiceQuestions.length;

                    if (Array.isArray(student.answer)) {
                        // 為每題加入答案和結果
                        currentMultipleChoiceQuestions.forEach((question, questionIndex) => {
                            const studentAnswer = student.answer.find(ans => ans.qIndex === questionIndex);
                            if (studentAnswer) {
                                const answerText = `選項${['A', 'B', 'C', 'D'][parseInt(studentAnswer.ans) - 1]}`;
                                const isCorrect = String(studentAnswer.ans) === String(question.correctAnswer);
                                const result = isCorrect ? '正確' : '錯誤';
                                if (isCorrect) correctCount++;
                                row += `,${answerText},${result}`;
                            } else {
                                row += ',未作答,錯誤';
                            }
                        });
                    } else {
                        // 如果學生沒有回答或格式不正確
                        currentMultipleChoiceQuestions.forEach(() => {
                            row += ',未作答,錯誤';
                        });
                    }

                    // 加入統計資訊
                    const accuracy = totalQuestions > 0 ? ((correctCount / totalQuestions) * 100).toFixed(1) : '0.0';
                    row += `,${correctCount},${totalQuestions},${accuracy}%`;

                    csvData.push(row);
                });

                const now = new Date();
                const timestamp = now.getFullYear() +
                    String(now.getMonth() + 1).padStart(2, '0') +
                    String(now.getDate()).padStart(2, '0') + '_' +
                    String(now.getHours()).padStart(2, '0') +
                    String(now.getMinutes()).padStart(2, '0') +
                    String(now.getSeconds()).padStart(2, '0');
                filename = `選擇題結果_${timestamp}.csv`;

            } else if (currentInteractionMode === 'reading_comprehension' && readingComprehensionData.questions) {
                // 閱讀測驗模式

                // 第一部分：文本內容
                csvData.push('=== 閱讀文本 ===');
                const readingText = `"${readingComprehensionData.text.replace(/"/g, '""')}"`;
                csvData.push(`文本內容,${readingText}`);
                csvData.push('');

                // 第二部分：題目資訊
                csvData.push('=== 題目資訊 ===');
                csvData.push('題號,PIRLS層次,題目內容,選項1,選項2,選項3,選項4,正確答案');

                readingComprehensionData.questions.forEach((question, index) => {
                    const levelNames = ['直接提取', '直接推論', '詮釋整合', '比較評估'];
                    const levelName = levelNames[question.level - 1] || '未分類';
                    const questionText = `"${question.question.replace(/"/g, '""')}"`;
                    const option1 = `"${question.options[0].replace(/"/g, '""')}"`;
                    const option2 = `"${question.options[1].replace(/"/g, '""')}"`;
                    const option3 = `"${question.options[2].replace(/"/g, '""')}"`;
                    const option4 = `"${question.options[3].replace(/"/g, '""')}"`;
                    const correctAnswer = `選項${question.correctAnswer}`;

                    csvData.push(`第${index + 1}題,${levelName},${questionText},${option1},${option2},${option3},${option4},${correctAnswer}`);
                });

                // 空行分隔
                csvData.push('');

                // 第三部分：學生答題結果
                csvData.push('=== 學生答題結果 ===');

                // 建立表頭
                let header = '學生姓名';
                readingComprehensionData.questions.forEach((_, index) => {
                    header += `,第${index + 1}題答案,第${index + 1}題結果`;
                });
                header += ',總分,總題數,正確率';
                csvData.push(header);

                // 建立每個學生的答題結果
                allStudentResponses.forEach(student => {
                    const studentName = student.name || '未知學生';
                    let row = studentName;
                    let correctCount = 0;
                    let totalQuestions = readingComprehensionData.questions.length;

                    try {
                        let studentAnswers = [];
                        if (typeof student.answer === 'string') {
                            studentAnswers = JSON.parse(student.answer);
                        } else if (Array.isArray(student.answer)) {
                            studentAnswers = student.answer;
                        }

                        // 為每題加入答案和結果
                        readingComprehensionData.questions.forEach((question, questionIndex) => {
                            const studentAnswer = studentAnswers[questionIndex];
                            if (studentAnswer && studentAnswer > 0) {
                                const answerText = `選項${studentAnswer}`;
                                const isCorrect = studentAnswer === question.correctAnswer;
                                const result = isCorrect ? '正確' : '錯誤';
                                if (isCorrect) correctCount++;
                                row += `,${answerText},${result}`;
                            } else {
                                row += ',未作答,錯誤';
                            }
                        });
                    } catch (e) {
                        // 如果解析失敗，全部標記為未作答
                        readingComprehensionData.questions.forEach(() => {
                            row += ',未作答,錯誤';
                        });
                    }

                    // 加入統計資訊
                    const accuracy = totalQuestions > 0 ? ((correctCount / totalQuestions) * 100).toFixed(1) : '0.0';
                    row += `,${correctCount},${totalQuestions},${accuracy}%`;

                    csvData.push(row);
                });

                const now2 = new Date();
                const timestamp2 = now2.getFullYear() +
                    String(now2.getMonth() + 1).padStart(2, '0') +
                    String(now2.getDate()).padStart(2, '0') + '_' +
                    String(now2.getHours()).padStart(2, '0') +
                    String(now2.getMinutes()).padStart(2, '0') +
                    String(now2.getSeconds()).padStart(2, '0');
                filename = `閱讀測驗結果_${timestamp2}.csv`;

            } else {
                showMessage('目前模式不支援下載功能。', 'warning');
                return;
            }

            // 建立CSV內容
            const csvContent = csvData.join('\n');

            // 建立下載連結，加上BOM確保正確顯示中文
            const bom = '\uFEFF';
            const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showMessage(`已下載學生回應檔案: ${filename}`, 'success');
        }

        function clearStudentsByAnswerList() {
            studentsByAnswerListContainer.classList.add('hidden');
            studentsByAnswerListTitle.textContent = '';
            studentsByAnswerNamesParagraph.textContent = '';
        }

        function displayStudentsForAnswer(answer, mode, questionIndex = null) {
            clearStudentsByAnswerList();
            studentsByAnswerListContainer.classList.remove('hidden');

            let filteredStudents;
            let titleText;

            if (mode === 'multiple_choice' && questionIndex !== null && currentMultipleChoiceQuestions) {
                // For custom multiple choice, filter by specific question and correctness
                const question = currentMultipleChoiceQuestions[questionIndex];
                if (!question) {
                    studentsByAnswerListTitle.textContent = `問題 ${questionIndex + 1} 不存在。`;
                    studentsByAnswerNamesParagraph.textContent = '';
                    return;
                }

                // 'answer' here is 'correct' or 'incorrect'
                if (answer === 'correct') {
                    filteredStudents = allStudentResponses.filter(s =>
                        Array.isArray(s.answer) &&
                        s.answer.some(q => q.qIndex === questionIndex && String(q.ans) === String(question.correctAnswer))
                    );
                    titleText = `問題 ${questionIndex + 1} 答對的學生：`;
                } else if (answer === 'incorrect') {
                    filteredStudents = allStudentResponses.filter(s =>
                        Array.isArray(s.answer) &&
                        s.answer.some(q => q.qIndex === questionIndex && String(q.ans) !== String(question.correctAnswer))
                    );
                    titleText = `問題 ${questionIndex + 1} 答錯的學生：`;
                } else { // Should not happen with current chart logic
                    filteredStudents = [];
                    titleText = `問題 ${questionIndex + 1} 的學生：`;
                }
            } else {
                // For default multiple choice or true/false
                filteredStudents = allStudentResponses.filter(s => s.answer === answer);
                titleText = `選擇「${answer}」的學生：`;
            }

            const studentNames = filteredStudents.map(s => s.name).sort();
            studentsByAnswerListTitle.textContent = studentNames.length > 0 ? `${titleText} ${studentNames.join(', ')}` : `${titleText} 沒有學生選擇此答案。`;
            studentsByAnswerNamesParagraph.textContent = ''; // Clear this as the title now contains names
        }

        function drawChart(responses, mode) { // Changed parameter name from 'data' to 'responses' to avoid conflict
            chartSvg.selectAll("*").remove();
            clearStudentsByAnswerList();

            // Default: show the SVG chart, hide the modern HTML chart.
            // The modern (horizontal) renderers will flip these as needed.
            const modernStatsContainer = document.getElementById('modern-stats-container');
            const chartSvgEl = document.getElementById('chart-svg');
            if (modernStatsContainer) {
                modernStatsContainer.classList.add('hidden');
                modernStatsContainer.innerHTML = '';
            }
            if (chartSvgEl) chartSvgEl.classList.remove('hidden');

            let chartData = {}; // Renamed 'data' to 'chartData'
            const filteredResponses = responses.filter(r => {
                if (mode === 'true_false' && (r.answer === 'O' || r.answer === 'X')) return true;
                if (mode === 'multiple_choice') {
                    if (currentMultipleChoiceQuestions) { // Custom MC
                        return Array.isArray(r.answer);
                    } else { // Default MC
                        return (r.answer >= '1' && r.answer <= '4');
                    }
                }
                if (mode === 'reading_comprehension') {
                    // Check if answer is a valid JSON array
                    try {
                        const parsed = JSON.parse(r.answer);
                        return Array.isArray(parsed);
                    } catch (e) {
                        return false;
                    }
                }
                return false;
            });

            const totalValidResponses = filteredResponses.length;

            if (totalValidResponses === 0) {
                chartSvg.append("text")
                    .attr("x", chartSvg.attr("width") / 2)
                    .attr("y", chartSvg.attr("height") / 2)
                    .attr("text-anchor", "middle")
                    .style("font-size", "18px")
                    .style("fill", "#666")
                    .text("目前沒有作答資料。");
                return;
            }

            if (mode === 'true_false') {
                chartData = { 'O': 0, 'X': 0 }; // Use chartData
                filteredResponses.forEach(r => { chartData[r.answer]++; });
                drawPieChart(chartData, totalValidResponses); // Pass chartData
            } else if (mode === 'multiple_choice') {
                if (currentMultipleChoiceQuestions) { // Custom Multiple Choice Chart
                    drawCustomMultipleChoiceBarChart(filteredResponses, currentMultipleChoiceQuestions);
                } else { // Default Multiple Choice Chart
                    chartData = { '1': 0, '2': 0, '3': 0, '4': 0 }; // Use chartData
                    filteredResponses.forEach(r => { chartData[r.answer]++; });
                    drawBarChart(chartData, totalValidResponses); // Pass chartData
                }
            } else if (mode === 'reading_comprehension') {
                if (readingComprehensionData && readingComprehensionData.questions) {
                    drawReadingComprehensionChart(filteredResponses, readingComprehensionData.questions);
                }
            }
        }

        function drawPieChart(data, totalValidResponses) {
            const width = +chartSvg.attr("width");
            const height = +chartSvg.attr("height");
            const radius = Math.min(width, height) / 2 - 20;
            const g = chartSvg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);
            const color = d3.scaleOrdinal().domain(Object.keys(data)).range(['#16a34a', '#dc2626']); // Green for O, Red for X
            const pie = d3.pie().value(d => d[1]).sort(null);
            const arc = d3.arc().innerRadius(0).outerRadius(radius);
            const arcs = g.selectAll(".arc").data(pie(Object.entries(data))).enter().append("g").attr("class", "arc");

            arcs.append("path")
                .attr("d", arc)
                .attr("fill", d => color(d.data[0]))
                .attr("stroke", "white").style("stroke-width", "2px")
                .on("click", (event, d) => displayStudentsForAnswer(d.data[0], 'true_false'));

            arcs.append("text")
                .attr("transform", d => `translate(${arc.centroid(d)})`)
                .attr("dy", "0.35em")
                .text(d => {
                    const percentage = totalValidResponses > 0 ? ((d.data[1] / totalValidResponses) * 100).toFixed(1) : 0;
                    return `${d.data[0]}: ${d.data[1]} (${percentage}%)`;
                })
                .style("font-size", "14px").style("text-anchor", "middle").style("fill", "white");
        }

        function drawBarChart(data, totalValidResponses) {
            const width = +chartSvg.attr("width") - 60;
            const height = +chartSvg.attr("height") - 60;
            const margin = { top: 20, right: 20, bottom: 30, left: 40 };
            const x = d3.scaleBand().range([0, width]).padding(0.1).domain(Object.keys(data));
            const y = d3.scaleLinear().range([height, 0]).domain([0, d3.max(Object.values(data)) || 1]);
            const color = d3.scaleOrdinal().domain(Object.keys(data)).range(['#2563eb', '#ca8a04', '#16a34a', '#dc2626']);
            const g = chartSvg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

            g.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));
            g.append("g").call(d3.axisLeft(y).ticks(Math.min(10, d3.max(Object.values(data)) || 1)).tickFormat(d3.format('d')));

            g.selectAll(".bar").data(Object.entries(data)).enter().append("rect")
                .attr("class", "bar")
                .attr("x", d => x(d[0]) + x.bandwidth() / 2)
                .attr("y", d => y(d[1]))
                .attr("width", x.bandwidth())
                .attr("height", d => height - y(d[1]))
                .attr("fill", d => color(d[0]))
                .on("click", (event, d) => displayStudentsForAnswer(d[0], 'multiple_choice'));

            g.selectAll(".bar-label").data(Object.entries(data)).enter().append("text")
                .attr("class", "bar-label")
                .attr("x", d => x(d[0]) + x.bandwidth() / 2)
                .attr("y", d => y(d[1]) - 5)
                .attr("text-anchor", "middle").style("font-size", "12px")
                .text(d => {
                    const percentage = totalValidResponses > 0 ? ((d[1] / totalValidResponses) * 100).toFixed(1) : 0;
                    return `${d[1]} (${percentage}%)`;
                });
        }

        /**
         * NEW: Draws a bar chart for custom multiple choice questions, showing correctness rate per question.
         * @param {Array} responses - All student responses.
         * @param {Array} questions - The custom multiple choice questions.
         */
        /**
         * Returns a bar colour based on the correct-answer rate (red→green).
         */
        function modernStatsBarColor(rate) {
            if (rate >= 80) return '#16a34a';
            if (rate >= 60) return '#65a30d';
            if (rate >= 40) return '#f59e0b';
            return '#ef4444';
        }

        /**
         * Renders a modern, left-to-right horizontal bar chart into
         * #modern-stats-container. Each row shows one question's 答對率 plus the
         * names of students who answered it incorrectly.
         * @param {Array} rows - [{ label, tag, correctCount, answeredCount, correctRate, wrongNames }]
         * @param {Array} [legend] - optional [{ color, text }]
         */
        function renderModernStatsChart(rows, legend) {
            const container = document.getElementById('modern-stats-container');
            const chartSvgEl = document.getElementById('chart-svg');
            if (!container) return;
            if (chartSvgEl) chartSvgEl.classList.add('hidden');
            container.classList.remove('hidden');

            let html = '';
            rows.forEach(row => {
                const rate = row.correctRate;
                const color = modernStatsBarColor(rate);
                const pctText = `${rate.toFixed(0)}%`;
                // Put the percentage inside the bar when wide enough, otherwise outside.
                const pctInside = rate >= 18;
                const tagHtml = row.tag
                    ? `<span class="ms-q-tag" style="background:${row.tag.color}">${escapeHtml(row.tag.text)}</span>`
                    : '';

                let wrongHtml;
                if (row.wrongNames.length === 0) {
                    wrongHtml = `<div class="ms-wrong"><span class="ms-wrong-none"><i class="fas fa-check-circle"></i> 全班答對</span></div>`;
                } else {
                    const names = row.wrongNames
                        .map(n => `<span class="ms-wrong-name">${escapeHtml(n)}</span>`)
                        .join('');
                    wrongHtml = `<div class="ms-wrong"><span class="ms-wrong-label">答錯 (${row.wrongNames.length})：</span>${names}</div>`;
                }

                html += `
                    <div class="ms-row">
                        <div class="ms-row-head">
                            <span class="ms-q-label">${escapeHtml(row.label)}${tagHtml}</span>
                            <span class="ms-q-meta">答對 ${row.correctCount}/${row.answeredCount}</span>
                        </div>
                        <div class="ms-bar-track">
                            <div class="ms-bar-fill" style="width:${rate}%;background:${color}">
                                ${pctInside ? `<span class="ms-bar-pct">${pctText}</span>` : ''}
                            </div>
                            ${pctInside ? '' : `<span class="ms-bar-pct-outside" style="left:${rate}%">${pctText}</span>`}
                        </div>
                        ${wrongHtml}
                    </div>
                `;
            });

            if (legend && legend.length) {
                const items = legend
                    .map(l => `<span class="ms-legend-item"><span class="ms-legend-swatch" style="background:${l.color}"></span>${escapeHtml(l.text)}</span>`)
                    .join('');
                html += `<div class="ms-legend">${items}</div>`;
            }

            container.innerHTML = html;
        }

        // --- Peer Review Functions ---

        /**
         * Toggles the peer review process for the current interaction.
         * Only works for text_input and drawing modes.
         */
        async function startPeerReview() {
            if (!currentInteractionMode || (!['text_input', 'drawing'].includes(currentInteractionMode))) {
                showMessage('互評功能只支援文字題和繪圖題！', 'error');
                return;
            }

            const startPeerReviewBtn = document.getElementById('start-peer-review-btn');

            if (peerReviewActive) {
                // Stop peer review
                try {
                    const peerReviewRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'settings', 'peerReview');
                    await setDoc(peerReviewRef, { active: false });

                    peerReviewActive = false;
                    showMessage('互評已停止！學生回到原互動模式。', 'info');

                    // Hide voting statistics container
                    document.getElementById('peer-review-stats-container').classList.add('hidden');

                    // Update button text
                    startPeerReviewBtn.innerHTML = '<i class="fas fa-heart mr-2"></i> 開始互評 ❤️';

                } catch (error) {
                    console.error('Error stopping peer review:', error);
                    showMessage('停止互評時發生錯誤，請稍後再試。', 'error');
                }
            } else {
                // Start peer review
                if (allStudentResponses.length === 0) {
                    showMessage('目前沒有學生作答，無法開始互評！', 'error');
                    return;
                }

                try {
                    // Set peer review status in Firebase
                    const peerReviewRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'settings', 'peerReview');
                    await setDoc(peerReviewRef, {
                        active: true,
                        mode: currentInteractionMode,
                        works: allStudentResponses,
                        timestamp: Date.now()
                    });

                    peerReviewActive = true;
                    showMessage('互評已開始！學生可以開始觀摩投票。', 'success');

                    // Show voting statistics container
                    document.getElementById('peer-review-stats-container').classList.remove('hidden');

                    // Reset sorting to default (votes)
                    currentSortMethod = 'votes';
                    updateSortButtonStyles();

                    // Load starred works from localStorage
                    loadStarredWorks();
                    showOnlyStarred = false; // Reset filter to show all works
                    updateStarredFilterButton();

                    // Start listening for votes
                    listenToPeerReviewVotes();

                    // Update button text
                    startPeerReviewBtn.innerHTML = '<i class="fas fa-stop mr-2"></i> 停止互評 ⏹️';

                } catch (error) {
                    console.error('Error starting peer review:', error);
                    showMessage('開始互評時發生錯誤，請稍後再試。', 'error');
                }
            }
        }

        /**
         * Exits peer review mode for students and returns to original interaction mode.
         */
        function exitPeerReview() {
            if (currentInteractionMode && currentInteractionMode !== 'waiting') {
                // Return to the original interaction mode
                showView('studentInteraction');
                showInteractionUI(currentInteractionMode);

                // Restore canvas state if returning to drawing mode
                if (currentInteractionMode === 'drawing') {
                    // Use a small delay to ensure canvas is ready
                    setTimeout(() => {
                        restoreCanvasState();
                    }, 100);
                }
            } else {
                // Return to waiting if no active interaction
                showView('studentWaiting');
            }
        }

        /**
         * Listens for peer review status changes and updates student UI accordingly.
         */
        function listenToPeerReviewStatus() {
            if (!classroomCode) return;

            const peerReviewRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'settings', 'peerReview');
            onSnapshot(peerReviewRef, (doc) => {
                if (doc.exists() && doc.data().active) {
                    const data = doc.data();
                    if (currentRole === 'student') {
                        // Save canvas state before switching to peer review (if in drawing mode)
                        if (currentInteractionMode === 'drawing') {
                            saveCanvasState();
                        }

                        // Switch student to peer review view
                        showView('studentPeerReview');
                        displayPeerReviewWorks(data.works, data.mode);

                        // Restore student's voting history from Firebase
                        restoreStudentVotingHistory().then(() => {
                            listenToPeerReviewVotes();
                        });
                    }
                } else {
                    // Peer review ended, return to original interaction mode
                    if (currentRole === 'student' && !views.studentPeerReview.classList.contains('hidden')) {
                        if (currentInteractionMode && currentInteractionMode !== 'waiting') {
                            // Return to the original interaction mode
                            showView('studentInteraction');
                            showInteractionUI(currentInteractionMode);

                            // Restore canvas state if returning to drawing mode
                            if (currentInteractionMode === 'drawing') {
                                // Use a small delay to ensure canvas is ready
                                setTimeout(() => {
                                    restoreCanvasState();
                                }, 100);
                            }
                        } else {
                            // Return to waiting if no active interaction
                            showView('studentWaiting');
                        }
                    }
                }
            });
        }

        /**
         * Displays peer review works for students to vote on.
         */
        function displayPeerReviewWorks(works, mode) {
            const worksGrid = document.getElementById('peer-review-works-grid');
            worksGrid.innerHTML = '';

            works.forEach((work, index) => {
                // Create a more stable unique identifier using timestamp and student name
                const workId = `${work.name}-${work.timestamp || index}`;

                const workDiv = document.createElement('div');
                workDiv.className = 'peer-review-work-item';
                workDiv.dataset.workId = workId;

                let contentHtml = '';
                if (mode === 'drawing') {
                    contentHtml = `<img src="${work.answer}" alt="學生作品">`;
                } else {
                    contentHtml = `<p>${work.answer}</p>`;
                }

                workDiv.innerHTML = `
                    <div class="work-author">${work.name}</div>
                    <div class="work-content">${contentHtml}</div>
                    <div class="vote-section">
                        <button class="vote-btn" data-work-id="${workId}" data-tooltip="點擊投票/取消投票">
                            <i class="fas fa-heart"></i>
                        </button>
                        <span class="vote-count zero">0</span>
                    </div>
                `;

                worksGrid.appendChild(workDiv);
            });

            // Add vote button listeners and update vote display
            document.querySelectorAll('.vote-btn').forEach(btn => {
                btn.addEventListener('click', handleVote);

                // Check if student has already voted for this work
                const workId = btn.dataset.workId;
                if (studentVotedWorks.has(workId)) {
                    btn.classList.add('voted');
                }
            });

            // Update vote counts if available
            if (Object.keys(allPeerReviewVotes).length > 0) {
                updateStudentVoteUI(allPeerReviewVotes);
            }

            // Update student's vote count display
            updateVoteCountDisplay();
        }

        /**
         * Handles voting on a work (toggle vote/unvote).
         */
        async function handleVote(e) {
            const workId = e.currentTarget.dataset.workId;
            const voteBtn = e.currentTarget;
            const voteCountSpan = voteBtn.nextElementSibling;

            try {
                if (studentVotedWorks.has(workId)) {
                    // Remove vote (unvote)
                    const voteRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'peerReviewVotes', `${studentName}-${workId}`);
                    await deleteDoc(voteRef);

                    // Remove from local tracking
                    studentVotedWorks.delete(workId);
                    voteBtn.classList.remove('voted');
                    updateVoteCountDisplay();
                    showMessage('已取消投票！', 'info');

                } else {
                    // Add vote
                    if (studentVotedWorks.size >= MAX_VOTES_PER_STUDENT) {
                        showMessage(`最多只能投票 ${MAX_VOTES_PER_STUDENT} 個作品！請先取消其他投票。`, 'warning');
                        return;
                    }

                    const voteRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'peerReviewVotes', `${studentName}-${workId}`);
                    await setDoc(voteRef, {
                        voterName: studentName,
                        workId: workId,
                        timestamp: Date.now()
                    });

                    // Mark as voted locally
                    studentVotedWorks.add(workId);
                    voteBtn.classList.add('voted');
                    updateVoteCountDisplay();
                    showMessage('投票成功！', 'success');
                }

            } catch (error) {
                console.error('Error handling vote:', error);
                showMessage('操作失敗，請稍後再試。', 'error');
            }
        }

        /**
         * Listens for peer review votes and updates UI.
         */
        function listenToPeerReviewVotes() {
            if (!classroomCode) return;

            const votesRef = collection(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'peerReviewVotes');

            if (peerReviewUnsubscribe) {
                peerReviewUnsubscribe();
            }

            peerReviewUnsubscribe = onSnapshot(votesRef, (snapshot) => {
                const votes = {};
                snapshot.forEach(doc => {
                    const data = doc.data();
                    if (!votes[data.workId]) {
                        votes[data.workId] = 0;
                    }
                    votes[data.workId]++;
                });

                allPeerReviewVotes = votes;

                // Update student UI
                if (currentRole === 'student' && !views.studentPeerReview.classList.contains('hidden')) {
                    updateStudentVoteUI(votes);
                    updateVoteCountDisplay();
                }

                // Update teacher UI
                if (currentRole === 'teacher' && !document.getElementById('peer-review-stats-container').classList.contains('hidden')) {
                    updateTeacherVoteStats(votes, currentSortMethod);
                }
            });
        }

        /**
         * Updates the vote counts in student UI.
         */
        function updateStudentVoteUI(votes) {
            document.querySelectorAll('.vote-count').forEach(span => {
                const workId = span.previousElementSibling.dataset.workId;
                const count = votes[workId] || 0;
                span.textContent = count;
                span.classList.toggle('zero', count === 0);
            });
        }

        /**
         * Updates the student's current vote count display.
         */
        function updateVoteCountDisplay() {
            const voteCountElement = document.getElementById('current-vote-count');
            if (voteCountElement) {
                voteCountElement.textContent = studentVotedWorks.size;

                // Change color based on vote count
                const container = voteCountElement.parentElement;
                container.className = 'inline-block px-4 py-2 rounded-full text-sm font-medium';

                if (studentVotedWorks.size === 0) {
                    container.classList.add('bg-gray-100', 'text-gray-600');
                } else if (studentVotedWorks.size < MAX_VOTES_PER_STUDENT) {
                    container.classList.add('bg-blue-100', 'text-blue-800');
                } else {
                    container.classList.add('bg-green-100', 'text-green-800');
                }
            }
        }

        /**
         * Restores student's voting history from Firebase.
         */
        async function restoreStudentVotingHistory() {
            if (!classroomCode || !studentName) return;

            try {
                const votesRef = collection(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'peerReviewVotes');
                const votesSnapshot = await getDocs(votesRef);

                // Clear existing voting history
                studentVotedWorks.clear();

                // Find votes made by this student
                votesSnapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.voterName === studentName) {
                        studentVotedWorks.add(data.workId);
                    }
                });

                console.log('Restored student voting history:', Array.from(studentVotedWorks));

                // Update vote count display after restoration
                updateVoteCountDisplay();
            } catch (error) {
                console.error('Error restoring student voting history:', error);
            }
        }

        /**
         * Updates the teacher's vote statistics display.
         * @param {Object} votes - The votes object
         * @param {string} sortMethod - The sorting method: 'votes', 'name', or 'time'
         */
        function updateTeacherVoteStats(votes, sortMethod = 'votes') {
            const statsGrid = document.getElementById('peer-review-stats-grid');
            statsGrid.innerHTML = '';

            // Map works with their IDs and votes
            let worksWithData = allStudentResponses.map(work => {
                const workId = `${work.name}-${work.timestamp || allStudentResponses.indexOf(work)}`;
                return {
                    ...work,
                    workId: workId,
                    votes: votes[workId] || 0
                };
            });

            // Filter works if showing only starred
            if (showOnlyStarred) {
                worksWithData = worksWithData.filter(work => starredWorks.has(work.workId));
            }

            // Sort works based on the selected method
            let sortedWorks;
            switch (sortMethod) {
                case 'name':
                    // Sort by name alphabetically
                    sortedWorks = worksWithData.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
                    break;
                case 'time':
                    // Sort by timestamp (most recent first)
                    sortedWorks = worksWithData.sort((a, b) => {
                        const timeA = a.timestamp || 0;
                        const timeB = b.timestamp || 0;
                        return timeB - timeA;
                    });
                    break;
                case 'votes':
                default:
                    // Sort by vote count (descending)
                    sortedWorks = worksWithData.sort((a, b) => b.votes - a.votes);
                    break;
            }

            if (sortedWorks.length === 0) {
                statsGrid.innerHTML = '<p class="text-slate-400 text-center col-span-full py-8">沒有符合條件的作品...</p>';
                return;
            }

            sortedWorks.forEach((work, index) => {
                const statsDiv = document.createElement('div');
                statsDiv.className = 'vote-stats-item relative';
                statsDiv.dataset.workId = work.workId;

                const isStarred = starredWorks.has(work.workId);

                let contentHtml = '';
                if (currentInteractionMode === 'drawing') {
                    contentHtml = `<img src="${work.answer}" alt="學生作品">`;
                } else {
                    contentHtml = `<p>${work.answer}</p>`;
                }

                statsDiv.innerHTML = `
                    <button class="star-toggle-btn absolute top-2 right-2 w-8 h-8 rounded-full ${isStarred ? 'bg-yellow-400 text-white' : 'bg-white/80 text-slate-400'} hover:bg-yellow-400 hover:text-white transition-all shadow-sm z-10" data-work-id="${work.workId}" data-tooltip="${isStarred ? '取消星號' : '加入星號'}">
                        <i class="fas fa-star"></i>
                    </button>
                    <div class="stats-author">${work.name}</div>
                    <div class="stats-content">${contentHtml}</div>
                    <div class="stats-votes">
                        <i class="fas fa-heart vote-icon"></i>
                        <span class="vote-count ${work.votes === 0 ? 'zero' : ''}">${work.votes}</span>
                    </div>
                `;

                statsGrid.appendChild(statsDiv);
            });

            // Add event listeners to star buttons
            document.querySelectorAll('.star-toggle-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleStarWork(btn.dataset.workId);
                });
            });
        }

        /**
         * Updates the styling of sort buttons based on current sort method.
         */
        function updateSortButtonStyles() {
            const sortByVotesBtn = document.getElementById('sort-by-votes');
            const sortByNameBtn = document.getElementById('sort-by-name');
            const sortByTimeBtn = document.getElementById('sort-by-time');

            // Reset all buttons to default style
            [sortByVotesBtn, sortByNameBtn, sortByTimeBtn].forEach(btn => {
                btn.className = 'px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors font-medium text-sm';
            });

            // Highlight the active button
            const activeClasses = 'px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors font-medium text-sm shadow-sm';
            switch (currentSortMethod) {
                case 'votes':
                    sortByVotesBtn.className = activeClasses;
                    break;
                case 'name':
                    sortByNameBtn.className = activeClasses;
                    break;
                case 'time':
                    sortByTimeBtn.className = activeClasses;
                    break;
            }
        }

        /**
         * Toggles the star status for a work.
         * @param {string} workId - The ID of the work to toggle
         */
        function toggleStarWork(workId) {
            if (starredWorks.has(workId)) {
                starredWorks.delete(workId);
            } else {
                starredWorks.add(workId);
            }

            // Save to localStorage
            saveStarredWorks();

            // Update display based on current view
            if (!document.getElementById('peer-review-stats-container').classList.contains('hidden')) {
                // Update peer review stats display
                updateTeacherVoteStats(allPeerReviewVotes, currentSortMethod);
                updateStarredFilterButton();
            } else {
                // Update regular responses display
                refreshStudentResponsesDisplay();
                updateResponsesFilterButton();
            }
        }

        /**
         * Refresh the student responses display with current sort and filter settings.
         */
        /**
         * Builds the inner answer HTML for a single student response card.
         * Shared by the live onSnapshot render and the manual re-render
         * (e.g. when the teacher clicks 按姓名 / 按時間), so every mode keeps
         * its full formatting (including per-question 對/錯 marks for 選擇題
         * 與閱讀測驗).
         */
        function buildResponseAnswerHTML(student, mode, index) {
            let answerContentHTML = '';

            if (student.answer === undefined || student.answer === null) {
                answerContentHTML = `<p class="text-gray-400">尚未作答</p>`;
            } else if (mode === 'drawing') {
                if (String(student.answer).startsWith('data:image')) {
                    answerContentHTML = `<img src="${student.answer}" alt="${student.name} 的繪圖" class="w-full h-auto rounded-md border max-h-32 object-contain cursor-pointer" data-full-image="${student.answer}"/>`;
                } else {
                    answerContentHTML = `<p class="text-gray-500">繪圖未完成或格式錯誤</p>`;
                }
            } else if (mode === 'calc') {
                answerContentHTML = buildCalcAnswerHTML(student); // 15 計算題：總覽圖，點擊開啟「計算過程」
            } else if (mode === 'recording') {
                if (String(student.answer).startsWith('data:audio')) {
                    answerContentHTML = `<audio controls src="${student.answer}" class="w-full"></audio>`;
                } else {
                    answerContentHTML = `<p class="text-gray-500">錄音未完成或格式錯誤</p>`;
                }
            } else if (mode === 'text_input' || mode === 'word_cloud') {
                answerContentHTML = `<p class="text-gray-700 whitespace-pre-wrap">${student.answer || '(空白)'}</p>`;
            } else if (mode === 'multiple_choice' && Array.isArray(student.answer) && currentMultipleChoiceQuestions) {
                answerContentHTML = `<div class="flex flex-col w-full">`;
                student.answer.forEach((qAns) => {
                    const question = currentMultipleChoiceQuestions[qAns.qIndex];
                    if (question) {
                        const isCorrect = (String(qAns.ans) === String(question.correctAnswer));
                        answerContentHTML += `
                            <div class="mc-question-answer">
                                <i class="icon fas ${isCorrect ? 'fa-check-circle correct-icon' : 'fa-times-circle incorrect-icon'}"></i>
                                <span class="question-text">Q${qAns.qIndex + 1}:</span>
                                <span class="student-choice">${qAns.ans}</span>
                            </div>
                        `;
                    }
                });
                answerContentHTML += `</div>`;
            } else if (mode === 'quick_answer') {
                if (student.answer && student.answer.includes('搶答成功')) {
                    answerContentHTML = `<div class="text-center">
                        <i class="fas fa-trophy text-yellow-500 text-4xl mb-2"></i>
                        <p class="text-xl font-bold text-green-600">搶答成功！</p>
                        <p class="text-lg text-gray-600">第一名</p>
                    </div>`;
                } else {
                    answerContentHTML = `<p class="text-gray-500">未搶答或搶答失敗</p>`;
                }
            } else if (mode === 'sequencing') {
                try {
                    const studentOrder = JSON.parse(student.answer);
                    const correctOrder = sequencingData.correctOrder;
                    answerContentHTML = `<div class="flex flex-col w-full gap-1">`;
                    studentOrder.forEach((item, idx) => {
                        const correct = correctOrder[idx] === item;
                        answerContentHTML += `
                            <div class="flex items-center gap-2 text-sm">
                                <i class="fas ${correct ? 'fa-check-circle text-green-500' : 'fa-times-circle text-red-500'}"></i>
                                <span class="font-bold">${idx + 1}.</span>
                                <span>${item}</span>
                            </div>
                        `;
                    });
                    answerContentHTML += `</div>`;
                } catch (e) {
                    answerContentHTML = `<p class="text-gray-500">答案格式錯誤</p>`;
                }
            } else if (mode === 'matching') {
                try {
                    const studentMatches = JSON.parse(student.answer);
                    const correctPairs = matchingData.pairs;
                    let correctCount = 0;
                    answerContentHTML = `<div class="flex flex-col w-full gap-1">`;
                    studentMatches.forEach(match => {
                        const correctPair = correctPairs.find(p => p.left === match.left);
                        const isCorrect = correctPair && correctPair.right === match.right;
                        if (isCorrect) correctCount++;
                        answerContentHTML += `
                            <div class="flex items-center gap-2 text-xs">
                                <i class="fas ${isCorrect ? 'fa-check-circle text-green-500' : 'fa-times-circle text-red-500'}"></i>
                                <span>${match.left}</span>
                                <i class="fas fa-arrow-right text-gray-400"></i>
                                <span>${match.right}</span>
                            </div>
                        `;
                    });
                    answerContentHTML += `<div class="text-xs text-gray-600 mt-1">正確: ${correctCount}/${studentMatches.length}</div></div>`;
                } catch (e) {
                    answerContentHTML = `<p class="text-gray-500">答案格式錯誤</p>`;
                }
            } else if (mode === 'reading_comprehension') {
                try {
                    const studentAnswers = JSON.parse(student.answer);
                    const questions = readingComprehensionData.questions;
                    let correctCount = 0;
                    answerContentHTML = `<div class="flex flex-col w-full" style="font-size: 10px; gap: 1px;">`;
                    studentAnswers.forEach((ans, idx) => {
                        if (questions[idx]) {
                            const isCorrect = (ans === questions[idx].correctAnswer);
                            if (isCorrect) correctCount++;
                            answerContentHTML += `
                                <div class="flex items-center whitespace-nowrap" style="gap: 4px; line-height: 1.3;">
                                    <i class="fas ${isCorrect ? 'fa-check-circle text-green-500' : 'fa-times-circle text-red-500'}" style="font-size: 11px;"></i>
                                    <span class="font-bold" style="min-width: 22px;">Q${idx + 1}</span>
                                    <span class="text-gray-700" style="min-width: 32px;">答:${ans || '未'}</span>
                                    ${!isCorrect && ans > 0 ? `<span class="text-gray-500" style="font-size: 9px;">(正確:${questions[idx].correctAnswer})</span>` : ''}
                                </div>
                            `;
                        }
                    });
                    answerContentHTML += `<div class="font-bold mt-1 pt-1 border-t ${correctCount === questions.length ? 'text-green-600' : 'text-gray-700'}" style="font-size: 10px;">正確: ${correctCount}/${questions.length}</div></div>`;
                } catch (e) {
                    answerContentHTML = `<p class="text-gray-500">答案格式錯誤</p>`;
                }
            } else {
                answerContentHTML = `<p class="text-2xl font-bold text-blue-600">${student.answer}</p>`;
            }

            return answerContentHTML;
        }

        function refreshStudentResponsesDisplay() {
            if (!currentInteractionMode || allStudentResponses.length === 0) return;

            const container = document.getElementById('student-responses-container');
            const mode = currentInteractionMode;

            // Re-trigger the display logic
            // We'll use the cached allStudentResponses data
            container.innerHTML = '';

            let responses = [...allStudentResponses];

            // Apply sorting
            if (responsesSortMethod === 'name') {
                responses.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
            } else {
                responses.sort((a, b) => {
                    const timeA = a.timestamp || 0;
                    const timeB = b.timestamp || 0;
                    return timeB - timeA;
                });
            }

            // Apply starred filter
            if (responsesShowOnlyStarred) {
                responses = responses.filter(student => {
                    const workId = `${student.name}-${student.timestamp}`;
                    return starredWorks.has(workId);
                });
            }

            if (responses.length === 0) {
                container.innerHTML = '<p class="text-slate-400 text-center col-span-full py-8">沒有符合條件的作品...</p>';
                return;
            }

            // This triggers a manual refresh by temporarily storing responses and calling render
            // Since the full render logic is in listenToStudentSubmissions, we'll need to
            // manually recreate the cards here (code duplication, but necessary)

            // Simplified approach: just trigger a re-render by modifying a dummy field
            // But that won't work with onSnapshot...

            // Better approach: extract card rendering to a separate function
            // For now, let's just note that the next onSnapshot will pick up the changes
            // OR we can force a refresh by calling listenToStudentSubmissions again

            // Simplest approach: Wait for the next Firebase update
            // But we want immediate feedback...

            // Let's recreate the display logic inline for now
            responses.forEach((student, index) => {
                const card = document.createElement('div');
                card.className = 'student-response-item';

                // Use the shared renderer so every mode (including 選擇題與閱讀測驗
                // 的逐題對/錯) keeps its full formatting after sorting.
                const answerContentHTML = buildResponseAnswerHTML(student, mode, index);

                const workId = `${student.name}-${student.timestamp || index}`;
                const isStarred = starredWorks.has(workId);

                card.innerHTML = `
                    <button class="responses-star-toggle-btn absolute top-1 right-1 w-6 h-6 rounded-full ${isStarred ? 'bg-yellow-400 text-white' : 'bg-white/80 text-slate-400'} hover:bg-yellow-400 hover:text-white transition-all shadow-sm z-10" data-work-id="${workId}">
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
                            showMagnifiedDrawing(e.target.dataset.fullImage, drawingReplayIds.get(student));
                        });
                    }
                }
            });
        }

        /**
         * Toggles between showing all works and only starred works (for peer review).
         */
        function toggleStarredFilter() {
            showOnlyStarred = !showOnlyStarred;
            updateStarredFilterButton();
            updateTeacherVoteStats(allPeerReviewVotes, currentSortMethod);
        }

        /**
         * Toggles between showing all works and only starred works (for regular responses).
         */
        function toggleResponsesStarredFilter() {
            responsesShowOnlyStarred = !responsesShowOnlyStarred;
            updateResponsesFilterButton();
            refreshStudentResponsesDisplay();
        }

        /**
         * Updates the responses filter button text and styling.
         */
        function updateResponsesFilterButton() {
            const filterBtn = document.getElementById('responses-toggle-starred-filter');
            if (!filterBtn) return;

            const starredCount = starredWorks.size;

            if (responsesShowOnlyStarred) {
                filterBtn.className = 'px-3 py-1.5 bg-yellow-400 text-white rounded-lg hover:bg-yellow-500 transition-colors font-medium text-xs shadow-sm';
                filterBtn.innerHTML = `<i class="fas fa-star mr-1"></i>星號 (${starredCount})`;
            } else {
                filterBtn.className = 'px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors font-medium text-xs';
                filterBtn.innerHTML = `<i class="fas fa-star mr-1"></i>全部${starredCount > 0 ? ` (${starredCount}★)` : ''}`;
            }
        }

        /**
         * Updates the styling of responses sort buttons.
         */
        function updateResponsesSortButtonStyles() {
            const sortByNameBtn = document.getElementById('responses-sort-by-name');
            const sortByTimeBtn = document.getElementById('responses-sort-by-time');

            if (!sortByNameBtn || !sortByTimeBtn) return;

            // Reset buttons
            sortByNameBtn.className = 'px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors font-medium text-xs';
            sortByTimeBtn.className = 'px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors font-medium text-xs';

            // Highlight active button
            const activeClasses = 'px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium text-xs shadow-sm';
            if (responsesSortMethod === 'name') {
                sortByNameBtn.className = activeClasses;
            } else {
                sortByTimeBtn.className = activeClasses;
            }
        }

        /**
         * Updates the starred filter button text and styling.
         */
        function updateStarredFilterButton() {
            const filterBtn = document.getElementById('toggle-starred-filter');
            const starredCount = starredWorks.size;

            if (showOnlyStarred) {
                filterBtn.className = 'px-4 py-2 bg-yellow-400 text-white rounded-lg hover:bg-yellow-500 transition-colors font-medium text-sm shadow-sm';
                filterBtn.innerHTML = `<i class="fas fa-star mr-1"></i>只顯示星號 (${starredCount})`;
            } else {
                filterBtn.className = 'px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors font-medium text-sm';
                filterBtn.innerHTML = `<i class="fas fa-star mr-1"></i>顯示全部作品${starredCount > 0 ? ` (${starredCount}★)` : ''}`;
            }
        }

        /**
         * Saves starred works to localStorage.
         */
        function saveStarredWorks() {
            if (!classroomCode || !currentInteractionMode) return;
            const key = `starredWorks_${classroomCode}_${currentInteractionMode}`;
            localStorage.setItem(key, JSON.stringify(Array.from(starredWorks)));
        }

        /**
         * Loads starred works from localStorage.
         */
        function loadStarredWorks() {
            if (!classroomCode || !currentInteractionMode) return;
            const key = `starredWorks_${classroomCode}_${currentInteractionMode}`;
            const saved = localStorage.getItem(key);
            if (saved) {
                try {
                    starredWorks = new Set(JSON.parse(saved));
                } catch (error) {
                    console.error('Error loading starred works:', error);
                    starredWorks = new Set();
                }
            } else {
                starredWorks = new Set();
            }
        }

        /**
         * Clears starred works for the current interaction.
         */
        function clearStarredWorks() {
            starredWorks.clear();
            showOnlyStarred = false;
            saveStarredWorks();
            updateStarredFilterButton();
        }
