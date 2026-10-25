        // =====================================================================
        // 【AI 設定】 modules/ai-settings/ai-settings.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        // =====================================================================

        // AI Settings Global Object
        let aiSettings = {
            aiSource: 'gemini-custom', // 'gemini-custom', 'ollama', or 'apple-ai'
            geminiApiKey: '', // Custom API key if 'gemini-custom' is selected
            selectedModel: 'gemini-3-flash-preview', // Selected AI model (default to Gemini 3 Flash Preview)
            ollamaHost: 'http://localhost:11434', // Local Ollama host
            ollamaModel: '', // Selected Ollama model
            appleAiHost: 'http://localhost:11435', // Local macOS Apple AI host (e.g. afm-Server or apple-to-openai)
            appleAiModel: 'apple-intelligence' // Selected macOS Apple AI model
        };

        // --- AI Settings Modal Functions ---
        const aiSettingsModal = document.getElementById('ai-settings-modal');
        const aiSettingsModalCloseBtn = document.getElementById('ai-settings-modal-close-btn');
        const aiSourceSelect = document.getElementById('ai-source-select');
        const geminiApiKeyGroup = document.getElementById('gemini-api-key-group');
        const geminiApiKeyInput = document.getElementById('gemini-api-key-input');
        const saveAiSettingsBtn = document.getElementById('save-ai-settings-btn');
        const aiModelSelect = document.getElementById('ai-model-select');

        // Ollama & Apple AI elements
        const ollamaSettingsGroup = document.getElementById('ollama-settings-group');
        const ollamaHostInput = document.getElementById('ollama-host-input');
        const ollamaModelSelect = document.getElementById('ollama-model-select');
        const ollamaCustomModelInput = document.getElementById('ollama-custom-model-input');
        const fetchOllamaModelsBtn = document.getElementById('fetch-ollama-models-btn');
        const ollamaFetchStatus = document.getElementById('ollama-fetch-status');

        const appleAiSettingsGroup = document.getElementById('apple-ai-settings-group');
        const appleAiDetectedBanner = document.getElementById('apple-ai-detected-banner');
        const appleAiHostInput = document.getElementById('apple-ai-host-input');
        const appleAiModelInput = document.getElementById('apple-ai-model-input');
        const testAppleAiBtn = document.getElementById('test-apple-ai-btn');
        const appleAiTestStatus = document.getElementById('apple-ai-test-status');
        const appleAiOption = document.getElementById('apple-ai-option');

        function detectIsMacOS() {
            return /Macintosh|Mac OS X|MacIntel/i.test(navigator.userAgent || navigator.platform || '');
        }

        function updateAiSourceDisplay(source) {
            const isGemini = (source === 'gemini-custom' || source === 'gemini-default');
            const isOllama = (source === 'ollama');
            const isAppleAi = (source === 'apple-ai');

            if (geminiApiKeyGroup) geminiApiKeyGroup.classList.toggle('hidden', !isGemini);
            if (ollamaSettingsGroup) ollamaSettingsGroup.classList.toggle('hidden', !isOllama);
            if (appleAiSettingsGroup) appleAiSettingsGroup.classList.toggle('hidden', !isAppleAi);

            if (appleAiDetectedBanner) {
                const isMac = detectIsMacOS();
                appleAiDetectedBanner.classList.toggle('hidden', !isMac);
            }
        }

        async function fetchOllamaModels(silent = false) {
            const host = (ollamaHostInput ? ollamaHostInput.value : aiSettings.ollamaHost || 'http://localhost:11434').trim().replace(/\/+$/, '');
            const btn = document.getElementById('fetch-ollama-models-btn');
            const statusEl = document.getElementById('ollama-fetch-status');

            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> 抓取中...';
            }
            if (statusEl) {
                statusEl.textContent = '連線至 Ollama 抓取模型中...';
                statusEl.className = 'text-xs text-blue-600 mt-1';
            }

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 6000);
                const res = await fetch(`${host}/api/tags`, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                }
                const data = await res.json();
                const models = Array.isArray(data.models) ? data.models : [];

                if (ollamaModelSelect) {
                    ollamaModelSelect.innerHTML = '';
                    if (models.length === 0) {
                        const opt = document.createElement('option');
                        opt.value = '';
                        opt.textContent = '-- 尚未下載模型，請先在終端機執行 ollama pull --';
                        ollamaModelSelect.appendChild(opt);
                        if (statusEl) {
                            statusEl.textContent = '⚠️ Ollama 已連線，但尚未下載任何模型。可執行例如 ollama pull llama3.2';
                            statusEl.className = 'text-xs text-amber-600 mt-1';
                        }
                    } else {
                        models.forEach(m => {
                            const opt = document.createElement('option');
                            const sizeGB = m.size ? ` (${(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB)` : '';
                            opt.value = m.name;
                            opt.textContent = `${m.name}${sizeGB}`;
                            ollamaModelSelect.appendChild(opt);
                        });

                        // 選擇先前記住的模型，或預設選第一個
                        if (aiSettings.ollamaModel && models.some(m => m.name === aiSettings.ollamaModel)) {
                            ollamaModelSelect.value = aiSettings.ollamaModel;
                        } else {
                            ollamaModelSelect.value = models[0].name;
                            aiSettings.ollamaModel = models[0].name;
                        }

                        if (statusEl) {
                            statusEl.textContent = `✅ 成功連線！已自動抓取 ${models.length} 個本機 Ollama 模型`;
                            statusEl.className = 'text-xs text-green-600 mt-1 font-semibold';
                        }
                        if (!silent) {
                            showMessage(`成功抓取 ${models.length} 個本機 Ollama 模型！`, 'success');
                        }
                    }
                }
            } catch (err) {
                console.warn('抓取 Ollama 模型失敗:', err);
                if (statusEl) {
                    statusEl.textContent = `❌ 無法連線 (${err.message})。請確認 Ollama 正在運行 (ollama serve) 並已允許跨域存取`;
                    statusEl.className = 'text-xs text-red-600 mt-1';
                }
                if (!silent) {
                    showMessage('無法連線至 Ollama，請確認服務已啟動並開啟 CORS', 'error');
                }
                // 保底選項
                if (ollamaModelSelect && ollamaModelSelect.options.length === 0) {
                    const fallbackModel = aiSettings.ollamaModel || 'llama3.2';
                    const opt = document.createElement('option');
                    opt.value = fallbackModel;
                    opt.textContent = `${fallbackModel} (未連線/自訂預設)`;
                    ollamaModelSelect.appendChild(opt);
                    ollamaModelSelect.value = fallbackModel;
                }
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-sync-alt mr-1"></i> 自動抓取本機模型';
                }
            }
        }

        async function testAppleAiConnection() {
            const host = (appleAiHostInput ? appleAiHostInput.value : aiSettings.appleAiHost || 'http://localhost:11435').trim().replace(/\/+$/, '');
            const model = (appleAiModelInput ? appleAiModelInput.value : aiSettings.appleAiModel || 'apple-intelligence').trim();
            const btn = document.getElementById('test-apple-ai-btn');
            const statusEl = document.getElementById('apple-ai-test-status');

            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> 測試中...';
            }
            if (statusEl) {
                statusEl.textContent = '測試連線至 Apple AI 本地服務...';
                statusEl.className = 'text-xs text-blue-600 mt-1';
            }

            // 檢查是否有 window.ai 原生支援
            if (typeof window !== 'undefined' && window.ai?.languageModel) {
                if (statusEl) {
                    statusEl.textContent = '✅ 偵測到瀏覽器原生系統 AI 介面已啟用！';
                    statusEl.className = 'text-xs text-green-600 mt-1 font-semibold';
                }
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-plug mr-1"></i> 測試連線';
                }
                showMessage('✅ 偵測到 macOS 系統原生 AI 介面！', 'success');
                return;
            }

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 4000);
                const modelsUrl = host.endsWith('/v1') ? `${host}/models` : `${host}/v1/models`;
                let connected = false;

                try {
                    const res = await fetch(modelsUrl, { signal: controller.signal });
                    if (res.ok) connected = true;
                } catch (e) {
                    // 若 /v1/models 不通，嘗試 ping chat completions
                    const chatUrl = host.endsWith('/v1') ? `${host}/chat/completions` : `${host}/v1/chat/completions`;
                    const chatRes = await fetch(chatUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: model,
                            messages: [{ role: 'user', content: 'ping' }],
                            max_tokens: 1
                        }),
                        signal: controller.signal
                    });
                    if (chatRes.ok || chatRes.status === 400 || chatRes.status === 422) {
                        connected = true;
                    }
                } finally {
                    clearTimeout(timeoutId);
                }

                if (connected) {
                    if (statusEl) {
                        statusEl.textContent = '✅ 連線成功！本地 Apple AI 模型伺服器已就緒。';
                        statusEl.className = 'text-xs text-green-600 mt-1 font-semibold';
                    }
                    showMessage('macOS 本地 Apple AI 連線成功！', 'success');
                } else {
                    throw new Error('未收到預期回應');
                }
            } catch (err) {
                if (statusEl) {
                    statusEl.textContent = `❌ 連線未成功 (${err.message})。請確認已啟動 afm-Server (埠號 11435) 或 apple-to-openai (埠號 8000)。`;
                    statusEl.className = 'text-xs text-red-600 mt-1';
                }
                showMessage('無法連線至本地 Apple AI 伺服器', 'error');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-plug mr-1"></i> 測試連線';
                }
            }
        }

        function showAISettingsModal() {
            const isMac = detectIsMacOS();
            if (appleAiOption) {
                if (isMac) {
                    appleAiOption.textContent = '🍎 macOS 本地 Apple AI (系統內建模型，本機已支援)';
                } else {
                    appleAiOption.textContent = '🍎 macOS 本地 Apple AI (僅支援 macOS)';
                }
            }

            // 確保 aiSource 格式正確
            let currentSource = aiSettings.aiSource;
            if (currentSource === 'gemini-default') currentSource = 'gemini-custom';
            aiSourceSelect.value = currentSource || 'gemini-custom';

            geminiApiKeyInput.value = aiSettings.geminiApiKey || '';
            aiModelSelect.value = normalizeModelName(aiSettings.selectedModel);

            if (ollamaHostInput) ollamaHostInput.value = aiSettings.ollamaHost || 'http://localhost:11434';
            if (ollamaCustomModelInput) ollamaCustomModelInput.value = '';

            // 如果已有儲存的 ollamaModel 但下拉選單尚未加載，先加入此選項
            if (ollamaModelSelect && aiSettings.ollamaModel && ollamaModelSelect.options.length <= 1) {
                let exists = false;
                for (let i = 0; i < ollamaModelSelect.options.length; i++) {
                    if (ollamaModelSelect.options[i].value === aiSettings.ollamaModel) {
                        exists = true;
                        break;
                    }
                }
                if (!exists) {
                    const opt = document.createElement('option');
                    opt.value = aiSettings.ollamaModel;
                    opt.textContent = `${aiSettings.ollamaModel} (已儲存)`;
                    ollamaModelSelect.appendChild(opt);
                }
                ollamaModelSelect.value = aiSettings.ollamaModel;
            }

            if (appleAiHostInput) appleAiHostInput.value = aiSettings.appleAiHost || 'http://localhost:11435';
            if (appleAiModelInput) appleAiModelInput.value = aiSettings.appleAiModel || 'apple-intelligence';

            updateAiSourceDisplay(currentSource);

            // 若目前為 Ollama 模式，靜默自動嘗試抓取最新模型清單
            if (currentSource === 'ollama') {
                fetchOllamaModels(true);
            }

            aiSettingsModal.classList.remove('hidden');
        }

        function hideAISettingsModal() {
            aiSettingsModal.classList.add('hidden');
        }

        /**
         * Show API error modal with detailed error message in Chinese
         */
        function showAPIErrorModal(error, response = null) {
            const errorMessageEl = document.getElementById('api-error-message');
            const errorSolutionsEl = document.getElementById('api-error-solutions');

            let errorMessage = '';
            let solutions = [];

            // 針對 Ollama 專屬錯誤處理解析
            if (aiSettings.aiSource === 'ollama') {
                errorMessage = error.message || '本地 Ollama 呼叫失敗';
                solutions = [
                    '請確認電腦終端機已啟動 Ollama 服務（執行：ollama serve）',
                    `請確認已下載所選模型（例如執行：ollama pull ${aiSettings.ollamaModel || 'llama3.2'}）`,
                    '若瀏覽器出現跨網域 (CORS) 阻擋，啟動時請允許跨來源：<br><code class="bg-gray-100 px-1 rounded">OLLAMA_ORIGINS="*" ollama serve</code><br>(Windows PowerShell: <code class="bg-gray-100 px-1 rounded">$env:OLLAMA_ORIGINS="*" ; ollama serve</code>)',
                    '請至右上角齒輪「AI 設定」確認 Ollama 服務網址是否正確（預設 http://localhost:11434）'
                ];
            } else if (aiSettings.aiSource === 'apple-ai') {
                // 針對 macOS 本地 Apple AI 專屬錯誤處理解析
                errorMessage = error.message || 'macOS 本地 Apple AI 呼叫失敗';
                solutions = [
                    '請確認您的 Mac 搭載 Apple Silicon (M1/M2/M3/M4 系列晶片)',
                    '請至 Mac「系統設定 > Apple Intelligence」確認已開啟功能並完成本地模型下載',
                    '請確認已啟動本地轉接伺服器（例如 afm-Server 埠號 11435，或 apple-to-openai 埠號 8000）',
                    '請至右上角齒輪「AI 設定」確認服務網址與埠號是否正確，並點擊「測試連線」'
                ];
            } else if (response && !response.ok) {
                // Gemini API 錯誤代碼解析
                const statusCode = response.status;
                if (statusCode === 400) {
                    errorMessage = 'API 請求格式錯誤或 API Key 無效';
                    solutions = [
                        '請檢查您的 API Key 是否正確',
                        '請確認 API Key 是否已啟用',
                        '請到右上角齒輪圖示重新設定 API Key'
                    ];
                } else if (statusCode === 401) {
                    errorMessage = 'API Key 驗證失敗，無法存取 API 服務';
                    solutions = [
                        '您的 API Key 可能無效或已過期',
                        '請到 Google AI Studio 確認 API Key 狀態',
                        '請到右上角齒輪圖示重新設定正確的 API Key'
                    ];
                } else if (statusCode === 403) {
                    errorMessage = 'API Key 沒有權限使用此服務';
                    solutions = [
                        '請確認 API Key 是否有 Gemini API 的使用權限',
                        '請檢查 API Key 是否已超過使用額度',
                        '請到 Google AI Studio 檢查專案設定'
                    ];
                } else if (statusCode === 429) {
                    errorMessage = 'API 請求次數超過限制';
                    solutions = [
                        '您已超過 API 的使用次數限制',
                        '請稍後再試，或更換為本地 Ollama / Apple AI 方案',
                        '如使用免費方案，請等待配額重置（通常為每分鐘重置）'
                    ];
                } else if (statusCode === 500 || statusCode === 503) {
                    errorMessage = 'API 服務暫時無法使用';
                    solutions = [
                        'Google API 伺服器目前發生問題',
                        '請稍後再試',
                        '如持續發生問題，請查看 Google API 服務狀態'
                    ];
                } else {
                    errorMessage = `API 請求失敗（錯誤代碼：${statusCode}）`;
                    solutions = [
                        '請檢查網路連線是否正常',
                        '請確認 API Key 設定是否正確',
                        '請稍後再試'
                    ];
                }
            } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                errorMessage = '無法連接到 API 服務';
                solutions = [
                    '請檢查您的網路連線是否正常',
                    '請確認防火牆或網路設定是否阻擋了 API 請求',
                    '請稍後再試'
                ];
            } else if (error.message.includes('API Key')) {
                errorMessage = 'API Key 設定有誤';
                solutions = [
                    '請到右上角齒輪圖示設定 API Key',
                    '請確認 API Key 格式正確（無多餘空格或字元）',
                    '請到 Google AI Studio 取得有效的 API Key'
                ];
            } else {
                errorMessage = error.message || 'AI 生成過程發生未知錯誤';
                solutions = [
                    '請檢查連線設定',
                    '請確認所選模型設定正確',
                    '請稍後再試，或切換至其他模型來源'
                ];
            }

            // Update modal content
            errorMessageEl.textContent = errorMessage;
            errorSolutionsEl.innerHTML = solutions.map(solution => `<li>${solution}</li>`).join('');

            // Show modal
            document.getElementById('api-error-modal').classList.remove('hidden');
        }

        function hideAPIErrorModal() {
            document.getElementById('api-error-modal').classList.add('hidden');
        }

        function saveAISettings() {
            aiSettings.aiSource = aiSourceSelect.value;
            aiSettings.geminiApiKey = geminiApiKeyInput.value.trim();
            aiSettings.selectedModel = normalizeModelName(aiModelSelect.value);

            // 儲存 Ollama 設定
            if (ollamaHostInput) {
                aiSettings.ollamaHost = ollamaHostInput.value.trim() || 'http://localhost:11434';
            }
            if (ollamaCustomModelInput && ollamaCustomModelInput.value.trim()) {
                aiSettings.ollamaModel = ollamaCustomModelInput.value.trim();
            } else if (ollamaModelSelect && ollamaModelSelect.value) {
                aiSettings.ollamaModel = ollamaModelSelect.value;
            }

            // 儲存 Apple AI 設定
            if (appleAiHostInput) {
                aiSettings.appleAiHost = appleAiHostInput.value.trim() || 'http://localhost:11435';
            }
            if (appleAiModelInput) {
                aiSettings.appleAiModel = appleAiModelInput.value.trim() || 'apple-intelligence';
            }

            localStorage.setItem('aiSettings', JSON.stringify(aiSettings));
            updateModelDisplays();
            showMessage('AI 設定已儲存！', 'success');
            hideAISettingsModal();
        }

        function loadAISettings() {
            const savedSettings = localStorage.getItem('aiSettings');
            if (savedSettings) {
                try {
                    const parsedSettings = JSON.parse(savedSettings);
                    if (parsedSettings.aiSource) {
                        aiSettings.aiSource = parsedSettings.aiSource === 'gemini-default' ? 'gemini-custom' : parsedSettings.aiSource;
                    }
                    aiSettings.geminiApiKey = parsedSettings.geminiApiKey || '';
                    aiSettings.selectedModel = normalizeModelName(parsedSettings.selectedModel);
                    if (parsedSettings.ollamaHost) aiSettings.ollamaHost = parsedSettings.ollamaHost;
                    if (parsedSettings.ollamaModel) aiSettings.ollamaModel = parsedSettings.ollamaModel;
                    if (parsedSettings.appleAiHost) aiSettings.appleAiHost = parsedSettings.appleAiHost;
                    if (parsedSettings.appleAiModel) aiSettings.appleAiModel = parsedSettings.appleAiModel;
                } catch (e) {
                    console.error("Failed to parse AI settings from localStorage:", e);
                    aiSettings.geminiApiKey = '';
                    aiSettings.selectedModel = 'gemini-3-flash-preview';
                }
            } else {
                aiSettings.geminiApiKey = '';
                aiSettings.selectedModel = 'gemini-3-flash-preview';
            }
            updateModelDisplays();
        }

        function normalizeModelName(model) {
            const modelAliases = {
                'gemini-2.5-flash': 'gemini-3-flash-preview',
                'gemini-2.5-flash-preview-09-2025': 'gemini-3-flash-preview',
                'gemini-3-flash': 'gemini-3-flash-preview',
                'gemini-3-pro': 'gemini-3-pro-preview',
                'gemma-4-27b-it': 'gemma-4-31b-it',
                'gemma-3-27b-it': 'gemma-4-31b-it'
            };
            return modelAliases[model] || model || 'gemini-3-flash-preview';
        }

        function getApiUrl(apiKey) {
            const key = (apiKey || '').trim();
            let model = normalizeModelName(aiSettings.selectedModel);
            if (!key) {
                model = 'gemini-3-flash-preview';
                console.log(`✓ 使用免 Key 模式: ${model}`);
            } else {
                console.log(`✓ 使用 API Key 模式: ${model}`);
            }
            const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
            return key ? `${baseUrl}?key=${key}` : baseUrl;
        }

        function isOpenAiCompatibleModel(model) {
            return model.startsWith('gemma-4-');
        }

        function geminiPayloadToOpenAiMessages(payload) {
            const content = [];
            let hasMedia = false;
            (payload.contents || []).forEach(item => {
                (item.parts || []).forEach(part => {
                    if (part.text) {
                        content.push({ type: 'text', text: part.text });
                    } else if (part.inlineData) {
                        hasMedia = true;
                        content.push({
                            type: 'image_url',
                            image_url: {
                                url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
                            }
                        });
                    }
                });
            });
            if (!hasMedia) {
                return [{ role: 'user', content: content.map(part => part.text).join('\n\n') }];
            }
            return [{ role: 'user', content }];
        }

        function extractOpenAiText(data) {
            const choice = data?.choices?.[0];
            const message = choice?.message || {};
            const content = message.content ?? choice?.text ?? data?.output_text;

            if (typeof content === 'string') return content;
            if (Array.isArray(content)) {
                return content.map(part => {
                    if (typeof part === 'string') return part;
                    return part.text || part.output_text || part.content || '';
                }).join('');
            }
            if (typeof message.reasoning_content === 'string') return message.reasoning_content;
            if (Array.isArray(data?.output)) {
                return data.output.map(item => {
                    if (typeof item === 'string') return item;
                    if (typeof item.content === 'string') return item.content;
                    if (Array.isArray(item.content)) {
                        return item.content.map(part => part.text || part.output_text || '').join('');
                    }
                    return '';
                }).join('');
            }
            return '';
        }

        async function callAi(payload, apiKey = aiSettings.geminiApiKey) {
            // 1. 本地 Ollama 模式
            if (aiSettings.aiSource === 'ollama') {
                const host = (aiSettings.ollamaHost || 'http://localhost:11434').trim().replace(/\/+$/, '');
                const model = (aiSettings.ollamaModel || 'llama3.2').trim();
                const messages = geminiPayloadToOpenAiMessages(payload);
                const temp = payload.generationConfig?.temperature ?? 0.7;

                try {
                    // 優先使用 Ollama 原生 /api/chat 端點
                    const response = await fetch(`${host}/api/chat`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: model,
                            messages: messages.map(m => ({
                                role: m.role || 'user',
                                content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
                            })),
                            stream: false,
                            options: { temperature: temp }
                        })
                    });

                    if (!response.ok) {
                        // 若 /api/chat 失敗，嘗試相容的 /v1/chat/completions
                        const v1Response = await fetch(`${host}/v1/chat/completions`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                model: model,
                                messages: messages,
                                temperature: temp,
                                stream: false
                            })
                        });
                        if (!v1Response.ok) {
                            throw new Error(`Ollama 請求失敗 (${response.status}: ${response.statusText})`);
                        }
                        const v1Data = await v1Response.json();
                        const text = extractOpenAiText(v1Data);
                        if (!text) throw new Error('Ollama 回傳內容為空');
                        return text;
                    }

                    const data = await response.json();
                    if (data.error) throw new Error(data.error);
                    const text = data.message?.content || extractOpenAiText(data);
                    if (!text) throw new Error('Ollama 回傳內容為空');
                    return text;
                } catch (err) {
                    console.error('Ollama 呼叫失敗:', err);
                    if (err.message && (err.message.includes('Failed to fetch') || err.name === 'TypeError')) {
                        throw new Error(`無法連線至本地 Ollama (${host})。請確認已執行「ollama serve」，若為跨域問題請設定 OLLAMA_ORIGINS="*" 啟動。`);
                    }
                    throw err;
                }
            }

            // 2. macOS 本地 Apple AI 模式
            if (aiSettings.aiSource === 'apple-ai') {
                // 若瀏覽器原生支援 window.ai 則優先使用
                if (typeof window !== 'undefined' && window.ai?.languageModel) {
                    try {
                        const userPrompt = payload.contents?.map(c => (c.parts || []).map(p => p.text).join('\n')).join('\n') || '';
                        const session = await window.ai.languageModel.create();
                        const result = await session.prompt(userPrompt);
                        if (result) return result;
                    } catch (e) {
                        console.warn('原生 window.ai 呼叫失敗，嘗試透過本地 Apple AI 服務端點呼叫:', e);
                    }
                }

                const host = (aiSettings.appleAiHost || 'http://localhost:11435').trim().replace(/\/+$/, '');
                const model = (aiSettings.appleAiModel || 'apple-intelligence').trim();
                const messages = geminiPayloadToOpenAiMessages(payload);
                const temp = payload.generationConfig?.temperature ?? 0.7;
                const endpoint = host.endsWith('/v1') ? `${host}/chat/completions` : `${host}/v1/chat/completions`;

                try {
                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer local'
                        },
                        body: JSON.stringify({
                            model: model,
                            messages: messages,
                            temperature: temp,
                            stream: false
                        })
                    });

                    if (!response.ok) {
                        throw new Error(`macOS Apple AI 請求失敗 (${response.status}: ${response.statusText})`);
                    }

                    const data = await response.json();
                    const text = extractOpenAiText(data) || data.message?.content;
                    if (!text) throw new Error('Apple AI 回傳內容為空');
                    return text;
                } catch (err) {
                    console.error('Apple AI 呼叫失敗:', err);
                    if (err.message && (err.message.includes('Failed to fetch') || err.name === 'TypeError')) {
                        throw new Error(`無法連線至 macOS 本地 Apple AI 服務 (${host})。請確認已開啟 Apple Intelligence 並啟動本地轉接服務 (afm-Server 或 apple-to-openai)。`);
                    }
                    throw err;
                }
            }

            // 3. Google Gemini 模式 (保留其他模型，預設 gemini-3-flash-preview)
            const key = (apiKey || aiSettings.geminiApiKey || '').trim();
            const model = key ? normalizeModelName(aiSettings.selectedModel) : 'gemini-3-flash-preview';

            if (key && isOpenAiCompatibleModel(model)) {
                const response = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${key}`
                    },
                    body: JSON.stringify({
                        model,
                        messages: geminiPayloadToOpenAiMessages(payload),
                        temperature: payload.generationConfig?.temperature
                    })
                });
                const data = await response.json();
                const apiError = Array.isArray(data) ? data.find(item => item?.error)?.error : data.error;
                if (apiError) throw new Error(apiError.message || apiError);
                const text = extractOpenAiText(data);
                if (!text) {
                    console.error('OpenAI-compatible response missing text:', data);
                    throw new Error(`AI 回傳格式不完整${data.choices?.[0]?.finish_reason ? ` (${data.choices[0].finish_reason})` : ''}`);
                }
                return text;
            }

            const response = await fetch(getApiUrl(key), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                throw new Error(`AI API request failed with status ${response.status}`);
            }
            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error('AI 回傳格式不完整');
            return text;
        }

        function cleanAiJsonText(text) {
            let cleaned = String(text || '')
                .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
                .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
                .replace(/```(?:json)?/gi, '')
                .replace(/```/g, '')
                .trim();

            const firstArray = cleaned.indexOf('[');
            const firstObject = cleaned.indexOf('{');
            const starts = [firstArray, firstObject].filter(index => index >= 0);
            if (starts.length) {
                const start = Math.min(...starts);
                const end = Math.max(cleaned.lastIndexOf(']'), cleaned.lastIndexOf('}'));
                if (end > start) cleaned = cleaned.slice(start, end + 1);
            }
            return cleaned.trim();
        }

        function cleanAiGeneratedText(text) {
            return String(text || '')
                .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
                .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
                .replace(/```(?:csv|text|plaintext)?/gi, '')
                .replace(/```/g, '')
                .trim();
        }

        function getCurrentModelName() {
            if (aiSettings.aiSource === 'ollama') {
                const model = aiSettings.ollamaModel || '本機模型';
                return `Ollama: ${model}`;
            }
            if (aiSettings.aiSource === 'apple-ai') {
                const model = aiSettings.appleAiModel || 'apple-intelligence';
                return `Apple AI: ${model}`;
            }

            const modelMap = {
                'gemini-3-flash-preview': 'Gemini 3 Flash Preview',
                'gemini-3-pro-preview': 'Gemini 3 Pro Preview',
                'gemma-4-31b-it': 'Gemma 4 31B IT',
                'gemma-4-26b-a4b-it': 'Gemma 4 26B A4B IT'
            };
            const model = normalizeModelName(aiSettings.selectedModel);
            let name = modelMap[model] || model;
            if (!aiSettings.geminiApiKey.trim()) name += ' (免 Key 模式)';
            return name;
        }

        function updateModelDisplays() {
            const modelName = getCurrentModelName();
            const displayText = `使用模型: ${modelName}`;

            const displays = [
                document.getElementById('ai-mc-model-name'),
                document.getElementById('ai-seq-model-name'),
                document.getElementById('ai-match-model-name')
            ];

            displays.forEach(display => {
                if (display) display.textContent = displayText;
            });
        }

        /**
         * AI 設定：事件監聽設定（原本位於 setupEventListeners() 內的段落，
         * 由 modules/main/events.js 的 setupEventListeners() 依原順序呼叫）。
         */
        function setupAISettingsEventListeners() {
            document.getElementById('ai-settings-btn').addEventListener('click', showAISettingsModal);
            aiSettingsModalCloseBtn.addEventListener('click', hideAISettingsModal);
            saveAiSettingsBtn.addEventListener('click', saveAISettings);
            aiSourceSelect.addEventListener('change', (e) => {
                updateAiSourceDisplay(e.target.value);
                if (e.target.value === 'ollama') {
                    fetchOllamaModels(true);
                }
            });
            if (fetchOllamaModelsBtn) {
                fetchOllamaModelsBtn.addEventListener('click', () => fetchOllamaModels(false));
            }
            if (testAppleAiBtn) {
                testAppleAiBtn.addEventListener('click', testAppleAiConnection);
            }

            // API Error Modal listeners
            document.getElementById('api-error-modal-close-btn').addEventListener('click', hideAPIErrorModal);
            document.getElementById('api-error-modal-ok-btn').addEventListener('click', hideAPIErrorModal);
        }
