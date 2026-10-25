        // =====================================================================
        // 【12 快速投票】 modules/12-quick-poll/quick-poll.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        // =====================================================================

        // Quick Poll variables
        let quickPollActive = false;
        let quickPollData = null; // Stores current poll configuration
        let quickPollVotesUnsubscribe = null; // Listener for vote updates
        let currentChartType = 'bar'; // 'bar' or 'pie'

        // --- Quick Poll Functions ---

        /**
         * Shows the quick poll settings modal
         */
        function showQuickPollSettingsModal() {
            document.getElementById('quick-poll-settings-modal').classList.remove('hidden');
            // Reset form
            document.querySelector('input[name="pollType"][value="emoji"]').checked = true;
            document.getElementById('custom-poll-options-section').classList.add('hidden');
            document.getElementById('custom-poll-options-input').value = '';
            document.getElementById('quick-poll-anonymous-checkbox').checked = true;
        }

        /**
         * Hides the quick poll settings modal
         */
        function hideQuickPollSettingsModal() {
            document.getElementById('quick-poll-settings-modal').classList.add('hidden');
        }

        /**
         * Gets poll options based on selected type
         */
        function getPollOptions(pollType, customOptions = '') {
            switch (pollType) {
                case 'emoji':
                    return ['😊', '😐', '😕'];
                case 'simple':
                    return ['同意', '不同意', '不確定'];
                case 'rating5':
                    return ['1', '2', '3', '4', '5'];
                case 'rating10':
                    return ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
                case 'custom':
                    return customOptions.split('\n').filter(opt => opt.trim() !== '').map(opt => opt.trim());
                default:
                    return [];
            }
        }

        /**
         * Starts a quick poll
         */
        async function startQuickPoll() {
            const question = '快速投票';
            const pollType = document.querySelector('input[name="pollType"]:checked').value;
            const anonymous = document.getElementById('quick-poll-anonymous-checkbox').checked;
            const customOptions = document.getElementById('custom-poll-options-input').value;

            // Validation
            const options = getPollOptions(pollType, customOptions);
            if (options.length === 0) {
                showMessage('請設定有效的投票選項！', 'error');
                return;
            }

            try {
                // Initialize vote counts
                const voteCounts = {};
                options.forEach(opt => voteCounts[opt] = 0);

                // Save poll configuration to Firebase
                quickPollData = {
                    question,
                    pollType,
                    options,
                    anonymous,
                    voteCounts,
                    active: true,
                    timestamp: Date.now()
                };

                const pollRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'quickPoll', 'config');
                await setDoc(pollRef, quickPollData);

                // Clear previous votes
                const votesRef = collection(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'quickPollVotes');
                await deleteTree(votesRef); // 伺服器端一次清空

                // Set interaction mode to quick_poll
                await setInteractionMode('quick_poll');

                quickPollActive = true;
                hideQuickPollSettingsModal();

                // Show stats modal for teacher
                showQuickPollStatsModal();

                // Start listening to votes
                listenToQuickPollVotes();

                showMessage('快速投票已開始！', 'success');
            } catch (error) {
                console.error('Error starting quick poll:', error);
                showMessage('啟動快速投票時發生錯誤，請稍後再試。', 'error');
            }
        }

        /**
         * Shows the quick poll statistics modal
         */
        function showQuickPollStatsModal() {
            const modal = document.getElementById('quick-poll-stats-modal');
            modal.classList.remove('hidden');

            // Display question
            document.getElementById('quick-poll-stats-question').textContent = quickPollData.question;

            // Display online student count
            document.getElementById('poll-online-students').textContent = activeStudentNames.length;

            // Initialize chart
            currentChartType = 'bar';
            updateChartButtonStyles();
            updateQuickPollChart();
        }

        /**
         * Hides the quick poll statistics modal
         */
        function hideQuickPollStatsModal() {
            document.getElementById('quick-poll-stats-modal').classList.add('hidden');
        }

        /**
         * Ends the current quick poll
         */
        async function endQuickPoll() {
            try {
                // Set poll as inactive
                const pollRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'quickPoll', 'config');
                await setDoc(pollRef, { active: false }, { merge: true });

                // Stop interaction
                await setInteractionMode('waiting');

                quickPollActive = false;
                hideQuickPollStatsModal();

                // Unsubscribe from votes listener
                if (quickPollVotesUnsubscribe) {
                    quickPollVotesUnsubscribe();
                    quickPollVotesUnsubscribe = null;
                }

                showMessage('快速投票已結束！', 'info');
            } catch (error) {
                console.error('Error ending quick poll:', error);
                showMessage('結束投票時發生錯誤，請稍後再試。', 'error');
            }
        }

        /**
         * Listens for vote updates
         */
        function listenToQuickPollVotes() {
            if (!classroomCode || !quickPollData) return;

            const votesRef = collection(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'quickPollVotes');

            if (quickPollVotesUnsubscribe) {
                quickPollVotesUnsubscribe();
            }

            quickPollVotesUnsubscribe = onSnapshot(votesRef, (snapshot) => {
                // Aggregate votes
                const voteCounts = {};
                quickPollData.options.forEach(opt => voteCounts[opt] = 0);

                snapshot.forEach(doc => {
                    const voteData = doc.data();
                    if (voteData.option && voteCounts.hasOwnProperty(voteData.option)) {
                        voteCounts[voteData.option]++;
                    }
                });

                // Update quickPollData
                quickPollData.voteCounts = voteCounts;

                // Update UI if teacher is viewing stats
                if (currentRole === 'teacher' && !document.getElementById('quick-poll-stats-modal').classList.contains('hidden')) {
                    updateQuickPollChart();
                    updateQuickPollTable();
                }
            });
        }

        /**
         * Updates the quick poll chart
         */
        function updateQuickPollChart() {
            if (!quickPollData) return;

            const svg = d3.select("#quick-poll-chart-svg");
            svg.selectAll("*").remove(); // Clear previous chart

            const data = quickPollData.options.map(opt => ({
                label: opt,
                value: quickPollData.voteCounts[opt] || 0
            }));

            const totalVotes = data.reduce((sum, d) => sum + d.value, 0);
            document.getElementById('poll-total-votes').textContent = totalVotes;

            if (currentChartType === 'bar') {
                drawQuickPollBarChart(svg, data);
            } else {
                drawQuickPollPieChart(svg, data);
            }
        }

        /**
         * Draws a bar chart for quick poll
         */
        function drawQuickPollBarChart(svg, data) {
            const width = 800;
            const height = 450;
            const margin = { top: 20, right: 20, bottom: 60, left: 60 };
            const chartWidth = width - margin.left - margin.right;
            const chartHeight = height - margin.top - margin.bottom;

            const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

            // X scale
            const x = d3.scaleBand()
                .range([0, chartWidth])
                .padding(0.2)
                .domain(data.map(d => d.label));

            // Y scale
            const maxValue = d3.max(data, d => d.value) || 1;
            const y = d3.scaleLinear()
                .range([chartHeight, 0])
                .domain([0, maxValue]);

            // Color scale
            const color = d3.scaleOrdinal()
                .domain(data.map(d => d.label))
                .range(['#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7']);

            // X axis
            g.append("g")
                .attr("transform", `translate(0,${chartHeight})`)
                .call(d3.axisBottom(x))
                .selectAll("text")
                .style("font-size", "14px")
                .attr("transform", "rotate(-45)")
                .style("text-anchor", "end");

            // Y axis
            g.append("g")
                .call(d3.axisLeft(y).ticks(5))
                .selectAll("text")
                .style("font-size", "14px");

            // Bars
            g.selectAll(".bar")
                .data(data)
                .enter()
                .append("rect")
                .attr("class", "bar")
                .attr("x", d => x(d.label))
                .attr("y", d => y(d.value))
                .attr("width", x.bandwidth())
                .attr("height", d => chartHeight - y(d.value))
                .attr("fill", d => color(d.label))
                .attr("rx", 4);

            // Value labels on top of bars
            g.selectAll(".label")
                .data(data)
                .enter()
                .append("text")
                .attr("class", "label")
                .attr("x", d => x(d.label) + x.bandwidth() / 2)
                .attr("y", d => y(d.value) - 5)
                .attr("text-anchor", "middle")
                .style("font-size", "16px")
                .style("font-weight", "bold")
                .style("fill", "#374151")
                .text(d => d.value);
        }

        /**
         * Draws a pie chart for quick poll
         */
        function drawQuickPollPieChart(svg, data) {
            const width = 800;
            const height = 450;
            const radius = Math.min(width, height) / 2 - 40;

            const g = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);

            // Color scale
            const color = d3.scaleOrdinal()
                .domain(data.map(d => d.label))
                .range(['#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7']);

            const pie = d3.pie().value(d => d.value).sort(null);
            const arc = d3.arc().innerRadius(0).outerRadius(radius);
            const labelArc = d3.arc().innerRadius(radius * 0.6).outerRadius(radius * 0.6);

            const arcs = g.selectAll(".arc")
                .data(pie(data))
                .enter()
                .append("g")
                .attr("class", "arc");

            arcs.append("path")
                .attr("d", arc)
                .attr("fill", d => color(d.data.label))
                .attr("stroke", "white")
                .attr("stroke-width", 2);

            // Labels
            arcs.append("text")
                .attr("transform", d => `translate(${labelArc.centroid(d)})`)
                .attr("text-anchor", "middle")
                .style("font-size", "14px")
                .style("font-weight", "bold")
                .style("fill", "white")
                .each(function (d) {
                    const text = d3.select(this);
                    text.append("tspan")
                        .attr("x", 0)
                        .attr("dy", "-0.2em")
                        .text(d.data.label);
                    text.append("tspan")
                        .attr("x", 0)
                        .attr("dy", "1.2em")
                        .text(d.data.value);
                });
        }

        /**
         * Updates the quick poll data table
         */
        function updateQuickPollTable() {
            if (!quickPollData) return;

            const tbody = document.getElementById('quick-poll-stats-table-body');
            tbody.innerHTML = '';

            const totalVotes = Object.values(quickPollData.voteCounts).reduce((sum, val) => sum + val, 0);

            quickPollData.options.forEach(opt => {
                const count = quickPollData.voteCounts[opt] || 0;
                const percentage = totalVotes > 0 ? ((count / totalVotes) * 100).toFixed(1) : '0.0';

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td class="border px-4 py-2">${opt}</td>
                    <td class="border px-4 py-2 text-right font-bold">${count}</td>
                    <td class="border px-4 py-2 text-right">${percentage}%</td>
                `;
                tbody.appendChild(row);
            });
        }

        /**
         * Switches between chart types
         */
        function switchChartType(type) {
            currentChartType = type;
            updateChartButtonStyles();
            updateQuickPollChart();
        }

        /**
         * Updates chart type button styles
         */
        function updateChartButtonStyles() {
            const barBtn = document.getElementById('chart-type-bar-btn');
            const pieBtn = document.getElementById('chart-type-pie-btn');

            if (currentChartType === 'bar') {
                barBtn.classList.remove('btn-gray');
                barBtn.classList.add('bg-blue-500', 'hover:bg-blue-600');
                pieBtn.classList.add('btn-gray');
                pieBtn.classList.remove('bg-blue-500', 'hover:bg-blue-600');
            } else {
                pieBtn.classList.remove('btn-gray');
                pieBtn.classList.add('bg-blue-500', 'hover:bg-blue-600');
                barBtn.classList.add('btn-gray');
                barBtn.classList.remove('bg-blue-500', 'hover:bg-blue-600');
            }
        }

        /**
         * Downloads poll results as CSV
         */
        async function downloadPollResults() {
            if (!quickPollData) return;

            const totalVotes = Object.values(quickPollData.voteCounts).reduce((sum, val) => sum + val, 0);

            let csv = '\uFEFF'; // BOM for Excel UTF-8 support
            csv += `快速投票結果\n`;
            csv += `問題,${quickPollData.question}\n`;
            csv += `總投票數,${totalVotes}\n`;
            csv += `投票模式,${quickPollData.anonymous ? '匿名' : '記名'}\n`;
            csv += `\n`;

            // Summary table
            csv += `選項統計\n`;
            csv += `選項,票數,百分比\n`;
            quickPollData.options.forEach(opt => {
                const count = quickPollData.voteCounts[opt] || 0;
                const percentage = totalVotes > 0 ? ((count / totalVotes) * 100).toFixed(1) : '0.0';
                csv += `${opt},${count},${percentage}%\n`;
            });

            // Detailed votes if not anonymous
            if (!quickPollData.anonymous) {
                csv += `\n詳細投票記錄\n`;
                csv += `學生姓名,選項,投票時間\n`;

                try {
                    const votesRef = collection(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'quickPollVotes');
                    const votesSnapshot = await getDocs(votesRef);

                    votesSnapshot.forEach(doc => {
                        const voteData = doc.data();
                        const studentName = voteData.studentName || '未知';
                        const option = voteData.option || '';
                        const timestamp = voteData.timestamp ? new Date(voteData.timestamp).toLocaleString('zh-TW') : '';
                        csv += `${studentName},${option},${timestamp}\n`;
                    });
                } catch (error) {
                    console.error('Error fetching vote details:', error);
                }
            }

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `快速投票結果_${new Date().toISOString().slice(0, 10)}.csv`;
            link.click();

            showMessage('投票結果已下載！', 'success');
        }

        /**
         * Student submits a vote
         */
        async function submitQuickPollVote(option) {
            if (!classroomCode || !studentName) return;

            const pollKey = `quickPoll_${classroomCode}_${quickPollData.timestamp}`;

            // Check if already voted (using localStorage)
            if (localStorage.getItem(pollKey)) {
                showMessage('您已經投過票了！', 'info');
                return;
            }

            try {
                // Generate unique vote ID (anonymous or with student name based on settings)
                // V6.2: 文件 id 綁定 userId — 同一學生無法重複投票（原本清 localStorage 即可重投）；
                // 匿名模式文件內容不含姓名，仍保持匿名。
                const voteId = quickPollData.anonymous
                    ? `anon_${userId}`
                    : `${studentName}_${userId}`;

                const voteRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'quickPollVotes', voteId);
                const voteData = {
                    option,
                    timestamp: Date.now()
                };

                // Add student name if not anonymous
                if (!quickPollData.anonymous) {
                    voteData.studentName = studentName;
                }

                await setDoc(voteRef, voteData);

                // Mark as voted in localStorage
                localStorage.setItem(pollKey, 'true');

                // Hide options, show success message
                document.getElementById('quick-poll-options-container').classList.add('hidden');
                document.getElementById('quick-poll-voted-status').classList.remove('hidden');

                showMessage('投票成功！感謝您的參與', 'success');
            } catch (error) {
                console.error('Error submitting vote:', error);
                showMessage('投票失敗，請稍後再試。', 'error');
            }
        }

        /**
         * Displays quick poll for students
         */
        function displayQuickPollForStudent(pollData) {
            if (!pollData || !pollData.active) return;

            quickPollData = pollData;

            // Use timestamp to create unique key for each poll session
            const pollKey = `quickPoll_${classroomCode}_${pollData.timestamp}`;
            const hasVoted = localStorage.getItem(pollKey);

            // Display question
            document.getElementById('quick-poll-question-display').textContent = pollData.question;

            const optionsContainer = document.getElementById('quick-poll-options-container');
            optionsContainer.innerHTML = '';

            if (hasVoted) {
                // Already voted - show success message
                optionsContainer.classList.add('hidden');
                document.getElementById('quick-poll-voted-status').classList.remove('hidden');
            } else {
                // Not voted yet - show options
                optionsContainer.classList.remove('hidden');
                document.getElementById('quick-poll-voted-status').classList.add('hidden');

                // Create buttons based on poll type
                if (pollData.pollType === 'emoji') {
                    optionsContainer.className = 'flex justify-center gap-6';
                    pollData.options.forEach(opt => {
                        const btn = document.createElement('button');
                        btn.className = 'text-8xl hover:scale-110 transition-transform duration-200 p-4 rounded-lg hover:bg-gray-100';
                        btn.textContent = opt;
                        btn.addEventListener('click', () => submitQuickPollVote(opt));
                        optionsContainer.appendChild(btn);
                    });
                } else if (pollData.pollType === 'rating5' || pollData.pollType === 'rating10') {
                    optionsContainer.className = 'flex justify-center gap-3 flex-wrap';
                    pollData.options.forEach(opt => {
                        const btn = document.createElement('button');
                        btn.className = 'btn bg-lime-500 hover:bg-lime-600 !w-20 !h-20 text-4xl font-bold';
                        btn.textContent = opt;
                        btn.addEventListener('click', () => submitQuickPollVote(opt));
                        optionsContainer.appendChild(btn);
                    });
                } else {
                    optionsContainer.className = 'space-y-3';
                    pollData.options.forEach(opt => {
                        const btn = document.createElement('button');
                        btn.className = 'btn bg-lime-500 hover:bg-lime-600 w-full h-16 text-2xl';
                        btn.textContent = opt;
                        btn.addEventListener('click', () => submitQuickPollVote(opt));
                        optionsContainer.appendChild(btn);
                    });
                }
            }
        }

        /**
         * Listens for quick poll configuration changes (for students)
         */
        function listenToQuickPollConfig() {
            if (!classroomCode) return;

            const pollRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'quickPoll', 'config');
            onSnapshot(pollRef, (doc) => {
                if (doc.exists()) {
                    const pollData = doc.data();
                    if (pollData.active && currentRole === 'student' && currentInteractionMode === 'quick_poll') {
                        displayQuickPollForStudent(pollData);
                    }
                }
            });
        }

        /**
         * 12 快速投票：事件監聽設定（原本位於 setupEventListeners() 內的段落，
         * 由 modules/main/events.js 的 setupEventListeners() 依原順序呼叫）。
         */
        function setupQuickPollEventListeners() {

            // Quick Poll Settings Modal listeners
            document.getElementById('quick-poll-settings-btn').addEventListener('click', showQuickPollSettingsModal);
            document.getElementById('quick-poll-settings-modal-close-btn').addEventListener('click', hideQuickPollSettingsModal);
            document.getElementById('cancel-quick-poll-settings-btn').addEventListener('click', hideQuickPollSettingsModal);
            document.getElementById('start-quick-poll-btn').addEventListener('click', startQuickPoll);

            // Quick Poll Stats Modal listeners
            document.getElementById('quick-poll-stats-modal-close-btn').addEventListener('click', hideQuickPollStatsModal);
            document.getElementById('end-quick-poll-btn').addEventListener('click', endQuickPoll);
            document.getElementById('download-poll-results-btn').addEventListener('click', downloadPollResults);
            document.getElementById('chart-type-bar-btn').addEventListener('click', () => switchChartType('bar'));
            document.getElementById('chart-type-pie-btn').addEventListener('click', () => switchChartType('pie'));

            // Poll type radio button listeners
            document.querySelectorAll('input[name="pollType"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    const customSection = document.getElementById('custom-poll-options-section');
                    customSection.classList.toggle('hidden', e.target.value !== 'custom');
                });
            });
        }
