        // =====================================================================
        // 【04 即時文字雲】 modules/04-word-cloud/word-cloud.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        // =====================================================================

        // === Word Cloud Functions ===
        let wordCloudUpdateTimer = null;

        function updateWordCloud(responses) {
            // Count word frequency
            const wordFreq = {};
            responses.forEach(response => {
                const word = response.answer;
                if (word && word.trim()) {
                    wordFreq[word] = (wordFreq[word] || 0) + 1;
                }
            });

            // Convert to array for d3-cloud
            const words = Object.entries(wordFreq).map(([text, size]) => ({
                text,
                size: 20 + size * 15 // Base size 20, increase by 15 for each occurrence
            }));

            if (words.length === 0) {
                d3.select('#word-cloud-svg').selectAll('*').remove();
                d3.select('#word-cloud-svg')
                    .append('text')
                    .attr('x', '50%')
                    .attr('y', '50%')
                    .attr('text-anchor', 'middle')
                    .attr('dominant-baseline', 'middle')
                    .style('font-size', '24px')
                    .style('fill', '#94a3b8')
                    .text('等待學生輸入關鍵字...');
                return;
            }

            const svg = document.getElementById('word-cloud-svg');
            const width = svg.clientWidth || 800;
            const height = svg.clientHeight || 600;

            const layout = d3.layout.cloud()
                .size([width, height])
                .words(words)
                .padding(8)
                .rotate(() => (~~(Math.random() * 2) * 90))
                .font('Noto Sans TC, sans-serif')
                .fontSize(d => d.size)
                .on('end', draw);

            layout.start();

            function draw(words) {
                d3.select('#word-cloud-svg').selectAll('*').remove();

                d3.select('#word-cloud-svg')
                    .attr('width', width)
                    .attr('height', height)
                    .append('g')
                    .attr('transform', `translate(${width / 2},${height / 2})`)
                    .selectAll('text')
                    .data(words)
                    .enter().append('text')
                    .style('font-size', d => d.size + 'px')
                    .style('font-family', 'Noto Sans TC, sans-serif')
                    .style('font-weight', '700')
                    .style('fill', (d, i) => {
                        const colors = ['#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#06b6d4'];
                        return colors[i % colors.length];
                    })
                    .attr('text-anchor', 'middle')
                    .attr('transform', d => `translate(${d.x},${d.y})rotate(${d.rotate})`)
                    .text(d => d.text)
                    .style('cursor', 'pointer')
                    .on('mouseover', function () {
                        d3.select(this).style('opacity', 0.7);
                    })
                    .on('mouseout', function () {
                        d3.select(this).style('opacity', 1);
                    });
            }
        }

        /**
         * 04 即時文字雲：事件監聽設定（原本位於 setupEventListeners() 內的段落，
         * 由 modules/main/events.js 的 setupEventListeners() 依原順序呼叫）。
         */
        function setupWordCloudEventListeners() {

            // Word cloud input character count
            document.getElementById('word-cloud-input').addEventListener('input', (e) => {
                const charCount = e.target.value.length;
                document.getElementById('word-cloud-char-count').textContent = charCount;
            });

            // Word cloud submission
            document.getElementById('submit-word-cloud-btn').addEventListener('click', async (e) => {
                if (isResponsePaused) {
                    showMessage('老師已暫停回覆，無法送出答案。', 'error');
                    return;
                }
                const text = document.getElementById('word-cloud-input').value.trim();
                if (!text) {
                    showMessage('請輸入關鍵字', 'error');
                    return;
                }
                // Save button reference before async call
                const btn = e.currentTarget;
                await submitAnswer(text);
                btn.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed');
                document.getElementById('word-cloud-input').value = '';
                document.getElementById('word-cloud-char-count').textContent = '0';
            });
        }
