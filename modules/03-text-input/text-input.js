        // =====================================================================
        // 【03 文字題】 modules/03-text-input/text-input.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        // =====================================================================

        /**
         * 03 文字題：事件監聽設定（原本位於 setupEventListeners() 內的段落，
         * 由 modules/main/events.js 的 setupEventListeners() 依原順序呼叫）。
         */
        function setupTextInputEventListeners() {

            // Text input submission.
            document.getElementById('submit-text-btn').addEventListener('click', async (e) => {
                // NEW: Check pause state before submitting
                if (isResponsePaused) {
                    showMessage('老師已暫停回覆，無法送出答案。', 'error');
                    return;
                }
                const text = document.getElementById('text-input-area').value;
                const button = e.currentTarget; // await 之後 e.currentTarget 會變成 null，需先保存
                await submitAnswer(text);
                button.disabled = true;
                button.classList.replace('btn-primary', 'btn-gray');
            });

            // AI-related buttons and modals.
            document.getElementById('ai-text-summary-btn').addEventListener('click', async () => {
                const textResponses = allStudentResponses.filter(r => currentInteractionMode === 'text_input' && r.answer && r.answer.trim()).map(r => r.answer);
                if (textResponses.length === 0) return showMessage('目前沒有文字回答可供 AI 分析。', 'info');
                const aiSummaryModal = document.getElementById('ai-summary-modal');
                const aiLoadingSpinner = document.getElementById('ai-loading-spinner');
                const aiSummaryResultList = document.getElementById('ai-summary-result-list');
                aiSummaryModal.classList.remove('hidden');
                aiLoadingSpinner.classList.remove('hidden');
                aiSummaryResultList.innerHTML = '';
                const prompt = `請分析以下學生回答的文本內容，識別出語義上相似的詞語或短語，歸類為主要詞彙並統計總出現次數。列出最常出現的10個主要詞彙。請以繁體中文回應，排除常見助詞、連接詞、標點符號。

請使用以下JSON格式返回結果，只輸出JSON內容，不要有其他說明文字：
[{"word": "主要詞彙1", "count": 10}, {"word": "主要詞彙2", "count": 8}]

若無有意義詞彙，返回空陣列：[]

文本內容：
${textResponses.join('\n\n')}`;
                try {
                    const payload = {
                        contents: [{ role: "user", parts: [{ text: prompt }] }],
                        generationConfig: { temperature: 0.3 }
                    };
                    const apiKey = (aiSettings.aiSource === 'gemini-custom' && aiSettings.geminiApiKey) ? aiSettings.geminiApiKey : "";
                    const generatedText = cleanAiGeneratedText(await callAi(payload, apiKey));
                    aiLoadingSpinner.classList.add('hidden');
                    let jsonText = generatedText;

                    // Extract JSON from response text (in case there's extra text)
                    if (jsonText) {
                        // Try to find JSON array in the text
                        const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
                        if (jsonMatch) {
                            jsonText = jsonMatch[0];
                        }
                    }

                    const parsedResults = jsonText ? JSON.parse(cleanAiJsonText(jsonText)) : [];
                    if (parsedResults.length > 0) {
                        parsedResults.sort((a, b) => b.count - a.count).forEach(item => {
                            const li = document.createElement('li');
                            li.textContent = `${item.word} (${item.count}次)`;
                            aiSummaryResultList.appendChild(li);
                        });
                    } else {
                        aiSummaryResultList.innerHTML = '<li>沒有找到常用詞彙。</li>';
                    }
                } catch (error) {
                    console.error("AI 文字分析失敗:", error);
                    aiLoadingSpinner.classList.add('hidden');
                    showAPIErrorModal(error);
                }
            });
            document.getElementById('ai-summary-modal-close-btn').addEventListener('click', () => document.getElementById('ai-summary-modal').classList.add('hidden'));
        }
