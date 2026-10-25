        // =====================================================================
        // 【06 派送網址/HTML】 modules/06-url-dispatch/url-dispatch.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        // =====================================================================

        // MODIFIED: Combined Dispatch Settings Global Object
        let dispatchSettings = {
            type: 'url', // 'url' or 'html'
            url: '',
            isYoutube: false, // Only relevant if type is 'url'
            htmlContent: null // Only relevant if type is 'html'
        };

        /**
         * (Student) Displays the dispatched URL or YouTube video.
         * @param {object} settings - The URL settings object from Firestore.
         */
        function displayDispatchedUrl(settings) {
            const container = interactionUIs.url_dispatch;
            container.innerHTML = ''; // Clear previous content

            if (settings.isYoutube) {
                const videoId = getYouTubeVideoId(settings.url);
                console.log('YouTube URL:', settings.url, 'Video ID:', videoId); // 調試信息
                if (videoId) {
                    const embedContainer = document.createElement('div');
                    embedContainer.className = 'youtube-embed-container';

                    // 添加載入中的提示
                    embedContainer.innerHTML = `<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; text-align: center;">
                        <i class="fas fa-spinner fa-spin text-2xl mb-2"></i><br>
                        影片載入中...
                    </div>`;

                    const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&showinfo=0&modestbranding=1`;
                    console.log('Embed URL:', embedUrl); // 調試信息

                    // 創建iframe元素
                    const iframe = document.createElement('iframe');
                    iframe.src = embedUrl;
                    iframe.frameBorder = '0';
                    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
                    iframe.allowFullscreen = true;
                    iframe.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;';

                    // 載入完成後移除載入提示
                    iframe.onload = function () {
                        const loadingDiv = embedContainer.querySelector('div');
                        if (loadingDiv) loadingDiv.remove();
                    };

                    // 錯誤處理
                    iframe.onerror = function () {
                        embedContainer.innerHTML = `<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; text-align: center;">
                            <i class="fas fa-exclamation-triangle text-2xl mb-2"></i><br>
                            影片載入失敗
                        </div>`;
                    };

                    embedContainer.appendChild(iframe);
                    container.appendChild(embedContainer);
                } else {
                    console.error('無效的 YouTube 網址:', settings.url); // 調試信息
                    container.innerHTML = `<p class="text-red-500">無效的 YouTube 網址。</p>`;
                }
            } else {
                const card = document.createElement('a');
                card.className = 'url-card';
                card.href = settings.url;
                card.target = '_blank';
                card.rel = 'noopener noreferrer';
                card.innerHTML = `
                    <i class="fas fa-external-link-alt url-card-icon"></i>
                    <p class="url-card-text">老師分享了一個連結</p>
                    <p class="url-card-link">${settings.url}</p>
                `;
                container.appendChild(card);
            }
        }

        /**
         * NEW: (Student) Displays the dispatched HTML content in an iframe.
         * @param {string} htmlContent - The HTML content to display.
         */
        function displayDispatchedHtml(htmlContent) {
            const container = interactionUIs.url_dispatch; // Use the same container
            container.innerHTML = ''; // Clear previous content

            const iframe = document.createElement('iframe');
            iframe.id = 'html-content-iframe'; // Re-use the ID for consistency if needed, but it's internal to this function now
            iframe.sandbox = 'allow-scripts allow-same-origin allow-popups allow-forms';
            iframe.srcdoc = htmlContent;
            iframe.style.cssText = 'width: 100vw; height: 100vh; margin: 0; padding: 0; border: none; background-color: white; display: block;';
            container.appendChild(iframe);

            // Add status indicator
            const statusIndicator = document.createElement('div');
            statusIndicator.className = 'html-dispatch-indicator';
            statusIndicator.textContent = '教師派送html中...';
            container.appendChild(statusIndicator);

            addDispatchScreenshotUI(container, iframe); // 右下角「截圖送出」

            // Apply the specific HTML dispatch container styles to the outer container
            container.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; margin: 0; padding: 0; border: none; overflow: hidden; background-color: white; z-index: 1000;';
        }

        /**
         * Extracts YouTube video ID from various URL formats.
         * @param {string} url - The YouTube URL.
         * @returns {string|null} The video ID or null if not found.
         */
        function getYouTubeVideoId(url) {
            const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
            const match = url.match(regExp);
            return (match && match[2].length === 11) ? match[2] : null;
        }

        // --- New: URL/HTML Dispatch Settings Modal Functions (Combined) ---
        const urlDispatchModal = document.getElementById('url-dispatch-settings-modal');
        const urlDispatchModalCloseBtn = document.getElementById('url-dispatch-settings-modal-close-btn');

        const urlDispatchSection = document.getElementById('url-dispatch-section');
        const htmlDispatchSection = document.getElementById('html-dispatch-section');
        const dispatchTypeRadios = document.querySelectorAll('input[name="dispatchType"]');

        const urlInput = document.getElementById('dispatch-url-input');
        const isYoutubeCheckbox = document.getElementById('is-youtube-checkbox');

        const dispatchHtmlUploadInput = document.getElementById('dispatch-html-upload-input');
        const clearDispatchHtmlBtn = document.getElementById('clear-dispatch-html-btn');
        const dispatchHtmlStatus = document.getElementById('dispatch-html-status');

        function showUrlDispatchSettingsModal() {
            // Set radio button based on current dispatchSettings.type
            document.querySelector(`input[name="dispatchType"][value="${dispatchSettings.type}"]`).checked = true;

            // Show/hide sections based on type
            urlDispatchSection.classList.toggle('hidden', dispatchSettings.type === 'html');
            htmlDispatchSection.classList.toggle('hidden', dispatchSettings.type === 'url');

            // Populate URL fields
            urlInput.value = dispatchSettings.url;
            isYoutubeCheckbox.checked = dispatchSettings.isYoutube;

            // Update HTML status
            dispatchHtmlStatus.textContent = dispatchSettings.htmlContent ? '已上傳 HTML 檔案。' : '目前沒有 HTML 檔案。';

            urlDispatchModal.classList.remove('hidden');
        }

        function hideUrlDispatchSettingsModal() {
            urlDispatchModal.classList.add('hidden');
        }

        function saveDispatchSettings() { // Renamed from saveUrlDispatchSettings
            dispatchSettings.type = document.querySelector('input[name="dispatchType"]:checked').value;

            if (dispatchSettings.type === 'url') {
                dispatchSettings.url = urlInput.value.trim();
                dispatchSettings.isYoutube = isYoutubeCheckbox.checked;
                dispatchSettings.htmlContent = null; // Clear HTML content if switching to URL
            } else { // type === 'html'
                // htmlContent is updated via handleHtmlFile or clearDispatchHtml
                dispatchSettings.url = ''; // Clear URL if switching to HTML
                dispatchSettings.isYoutube = false; // Clear YouTube flag
            }

            localStorage.setItem('dispatchSettings', JSON.stringify(dispatchSettings));
            showMessage('派送設定已儲存！', 'success');
            hideUrlDispatchSettingsModal();
        }

        function clearDispatchSettings() { // Renamed from clearUrlDispatchSettings
            urlInput.value = '';
            isYoutubeCheckbox.checked = false;
            dispatchHtmlUploadInput.value = ''; // Clear file input
            dispatchHtmlStatus.textContent = '目前沒有 HTML 檔案。';

            dispatchSettings = { type: 'url', url: '', isYoutube: false, htmlContent: null }; // Reset global variable
            localStorage.removeItem('dispatchSettings'); // Clear from localStorage

            // Reset UI to default (URL selected)
            document.querySelector('input[name="dispatchType"][value="url"]').checked = true;
            urlDispatchSection.classList.remove('hidden');
            htmlDispatchSection.classList.add('hidden');
        }

        function loadDispatchSettings() { // Renamed from loadUrlDispatchSettings
            const savedSettings = localStorage.getItem('dispatchSettings');
            if (savedSettings) {
                try {
                    const parsedSettings = JSON.parse(savedSettings);
                    // Ensure all properties are set, even if null in saved data
                    dispatchSettings.type = parsedSettings.type || 'url';
                    dispatchSettings.url = parsedSettings.url || '';
                    dispatchSettings.isYoutube = parsedSettings.isYoutube || false;
                    dispatchSettings.htmlContent = parsedSettings.htmlContent || null;
                } catch (e) {
                    console.error("Failed to parse dispatch settings from localStorage:", e);
                    // Reset to default if parsing fails
                    dispatchSettings = { type: 'url', url: '', isYoutube: false, htmlContent: null };
                }
            }
        }

        /**
         * NEW: Handles HTML file upload within the combined dispatch settings modal.
         * @param {File} file - The HTML file to process.
         */
        function handleDispatchHtmlFile(file) {
            if (!file || !file.type.includes('html')) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                dispatchSettings.htmlContent = event.target.result; // Update global state
                dispatchHtmlStatus.textContent = `已上傳檔案: ${file.name}`;
                showMessage('HTML 檔案已上傳！', 'success');
            };
            reader.readAsText(file);
        }

        // ==================== 截圖送出（派送 HTML 時） ====================
        // 學生在派送的 HTML 畫面右下角按「截圖送出」，可選「目前畫面」或「整個頁面」，預覽後送給老師。
        // 只有派送 HTML 時可用：HTML 內容與本網站同源，才能讀取並截圖；
        // 一般網址是另開分頁、YouTube 是其他網站的內容，瀏覽器的安全限制不允許網頁截取。
        // 截圖存在 studentResponses/{userId}.answer（每位學生保留最新一張）。

        const HTML2CANVAS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        const DISPATCH_SHOT_MAX_LENGTH = 900000;  // 截圖字串上限（資料庫單筆上限約 1.9MB）
        const DISPATCH_SHOT_MAX_W = 1280;         // 截圖寬度上限
        const DISPATCH_SHOT_MAX_H = 6000;         // 整頁截圖高度上限（太長時等比縮小）
        let html2canvasLoading = null;
        let dispatchScreenshots = new Map();      // 教師端：學生姓名 → { image, time }
        let dispatchScreenshotUnsubscribe = null;

        /** 需要時才載入 html2canvas（只有按下截圖的學生會下載） */
        function loadHtml2canvas() {
            if (window.html2canvas) return Promise.resolve(window.html2canvas);
            if (!html2canvasLoading) {
                html2canvasLoading = new Promise((resolve, reject) => {
                    const s = document.createElement('script');
                    s.src = HTML2CANVAS_URL;
                    s.onload = () => resolve(window.html2canvas);
                    s.onerror = () => { html2canvasLoading = null; reject(new Error('截圖元件載入失敗')); };
                    document.head.appendChild(s);
                });
            }
            return html2canvasLoading;
        }

        /** 截取 iframe 內的 HTML 畫面；full = true 截整個頁面，否則只截目前看到的畫面 */
        async function captureDispatchIframe(iframe, full) {
            const html2canvas = await loadHtml2canvas();
            const win = iframe.contentWindow;
            const docEl = win.document.documentElement;
            const options = { backgroundColor: '#ffffff', useCORS: true, logging: false, scale: 1 };
            if (full) {
                const w = Math.max(docEl.scrollWidth, win.innerWidth), h = Math.max(docEl.scrollHeight, win.document.body ? win.document.body.scrollHeight : 0, win.innerHeight);
                Object.assign(options, { x: 0, y: 0, width: w, height: h, windowWidth: win.innerWidth, windowHeight: h, scrollX: 0, scrollY: 0 });
            } else {
                Object.assign(options, { x: win.scrollX, y: win.scrollY, width: win.innerWidth, height: win.innerHeight, windowWidth: win.innerWidth, windowHeight: win.innerHeight });
            }
            return html2canvas(docEl, options);
        }

        /** 截圖轉成 JPEG：限制寬高與字串長度，超過時逐步縮小、降低品質 */
        function compressDispatchShot(src) {
            let scale = Math.min(1, DISPATCH_SHOT_MAX_W / src.width, DISPATCH_SHOT_MAX_H / src.height);
            let quality = 0.85, dataUrl = '';
            const out = document.createElement('canvas');
            const o = out.getContext('2d');
            for (let attempt = 0; attempt < 6; attempt++) {
                out.width = Math.max(1, Math.round(src.width * scale));
                out.height = Math.max(1, Math.round(src.height * scale));
                o.fillStyle = '#ffffff';
                o.fillRect(0, 0, out.width, out.height);
                o.drawImage(src, 0, 0, out.width, out.height);
                dataUrl = out.toDataURL('image/jpeg', quality);
                if (dataUrl.length <= DISPATCH_SHOT_MAX_LENGTH) return dataUrl;
                quality = Math.max(0.5, quality - 0.1);
                scale *= 0.8;
            }
            return dataUrl;
        }

        /** 學生端：在派送 HTML 畫面加上右下角「截圖送出」按鈕、選單與預覽視窗 */
        function addDispatchScreenshotUI(container, iframe) {
            const ui = document.createElement('div');
            ui.innerHTML = `
                <div class="dispatch-shot-menu hidden">
                    <button data-shot="view"><i class="fas fa-desktop mr-2"></i>目前畫面</button>
                    <button data-shot="full"><i class="fas fa-file-image mr-2"></i>整個頁面</button>
                </div>
                <button class="dispatch-shot-btn"><i class="fas fa-camera mr-2"></i>截圖送出</button>
                <div class="dispatch-shot-modal hidden">
                    <div class="dispatch-shot-card">
                        <p class="dispatch-shot-title">截圖預覽</p>
                        <div class="dispatch-shot-preview"><img alt="截圖預覽"></div>
                        <p class="dispatch-shot-status"></p>
                        <div class="dispatch-shot-actions">
                            <button class="dispatch-shot-cancel">取消</button>
                            <button class="dispatch-shot-send"><i class="fas fa-paper-plane mr-2"></i>送給老師</button>
                        </div>
                    </div>
                </div>`;
            container.appendChild(ui);
            const btn = ui.querySelector('.dispatch-shot-btn');
            const menu = ui.querySelector('.dispatch-shot-menu');
            const modal = ui.querySelector('.dispatch-shot-modal');
            const status = ui.querySelector('.dispatch-shot-status');
            const sendBtn = ui.querySelector('.dispatch-shot-send');
            let shot = null;
            const closeModal = () => { modal.classList.add('hidden'); shot = null; };

            btn.addEventListener('click', () => menu.classList.toggle('hidden'));
            menu.querySelectorAll('[data-shot]').forEach(b => b.addEventListener('click', async () => {
                menu.classList.add('hidden');
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>截圖中…';
                try {
                    shot = compressDispatchShot(await captureDispatchIframe(iframe, b.dataset.shot === 'full'));
                    ui.querySelector('.dispatch-shot-preview img').src = shot;
                    ui.querySelector('.dispatch-shot-title').textContent = b.dataset.shot === 'full' ? '截圖預覽（整個頁面）' : '截圖預覽（目前畫面）';
                    status.textContent = '';
                    sendBtn.disabled = false;
                    modal.classList.remove('hidden');
                } catch (err) {
                    console.error('截圖失敗:', err);
                    alert('截圖失敗，請再試一次。');
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-camera mr-2"></i>截圖送出';
                }
            }));
            ui.querySelector('.dispatch-shot-cancel').addEventListener('click', closeModal);
            sendBtn.addEventListener('click', async () => {
                if (!shot) return;
                sendBtn.disabled = true;
                status.textContent = '送出中…';
                if (await submitAnswer(shot)) {
                    status.textContent = '✅ 已送給老師！';
                    setTimeout(closeModal, 1000);
                } else {
                    status.textContent = '送出失敗，請再試一次。';
                    sendBtn.disabled = false;
                }
            });
        }

        /** 教師端：派送網址/HTML 時監聽學生的截圖 */
        function listenToDispatchScreenshots() {
            stopDispatchScreenshotListener();
            dispatchScreenshots = new Map();
            const colRef = collection(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'studentResponses');
            dispatchScreenshotUnsubscribe = onSnapshot(colRef, (snap) => {
                dispatchScreenshots = new Map();
                const shots = [];
                snap.forEach(d => {
                    const r = d.data();
                    if (currentRound && r.round && r.round !== currentRound) return;
                    if (typeof r.answer === 'string' && r.answer.startsWith('data:image')) {
                        dispatchScreenshots.set(r.name, { image: r.answer, time: getResponseTimeMs(r.timestamp) });
                        shots.push(r);
                    }
                });
                // 學生回傳的截圖記入課堂歷程（下課下載歷程時可看到每位學生的截圖）
                try { updateClassroomHistoryResponses(shots); } catch (e) { console.warn('記錄截圖歷程失敗（不影響畫面顯示）:', e); }
                if (currentInteractionMode === 'url_dispatch') renderDispatchMonitor();
            });
        }

        function stopDispatchScreenshotListener() {
            if (dispatchScreenshotUnsubscribe) dispatchScreenshotUnsubscribe();
            dispatchScreenshotUnsubscribe = null;
        }

        /** 下載媒體（派送網址/HTML）：全班截圖打包成 zip，檔名為學生姓名 */
        async function downloadDispatchScreenshots(btn) {
            if (dispatchScreenshots.size === 0) return showMessage('目前沒有學生截圖可供下載。', 'info');
            btn.disabled = true;
            showMessage('正在打包學生截圖...', 'info');
            try {
                const zip = new JSZip();
                for (const [name, shot] of dispatchScreenshots) {
                    zip.file(`${String(name || '學生').replace(/[\\/:*?"<>|]/g, '_')}.jpg`, shot.image.split(',')[1], { base64: true });
                }
                const content = await zip.generateAsync({ type: 'blob' });
                saveAs(content, `派送截圖_${new Date().toLocaleDateString('zh-TW')}.zip`);
                showMessage(`已成功打包 ${dispatchScreenshots.size} 張學生截圖並開始下載。`, 'success');
            } catch (error) {
                console.error('打包學生截圖失敗:', error);
                showMessage('打包失敗，請檢查瀏覽器支援或檔案大小。', 'error');
            } finally {
                btn.disabled = false;
            }
        }

        /** 教師端監看畫面：在線學生（✓）＋已送出截圖的學生（顯示截圖，點擊可放大） */
        function renderDispatchMonitor() {
            const container = document.getElementById('student-responses-container');
            const names = [...new Set([...activeStudentNames, ...dispatchScreenshots.keys()])].sort();
            container.innerHTML = '';
            if (names.length === 0) {
                container.innerHTML = '<p class="text-gray-500 text-center col-span-full">沒有學生在線</p>';
                return;
            }
            names.forEach(name => {
                const shot = dispatchScreenshots.get(name);
                const card = document.createElement('div');
                card.className = 'student-response-item';
                const nameBox = document.createElement('div');
                nameBox.className = 'name-box';
                nameBox.textContent = name;
                const answerBox = document.createElement('div');
                answerBox.className = 'answer-box';
                if (shot) {
                    answerBox.classList.add('flex-col'); // 截圖時間放在截圖下方
                    const img = document.createElement('img');
                    img.src = shot.image;
                    img.alt = `${name} 的截圖`;
                    img.className = 'w-full h-auto rounded-md border max-h-32 object-contain cursor-pointer';
                    img.dataset.dispatchShot = '1';
                    answerBox.appendChild(img);
                    if (shot.time) {
                        const t = document.createElement('p');
                        t.className = 'text-xs text-slate-400 mt-1';
                        t.textContent = `截圖時間 ${new Date(shot.time).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
                        answerBox.appendChild(t);
                    }
                } else {
                    answerBox.innerHTML = '<i class="fas fa-check-circle text-green-500 text-2xl"></i>';
                }
                card.append(nameBox, answerBox);
                container.appendChild(card);
            });
        }

        /**
         * 06 派送網址/HTML：事件監聽設定（原本位於 setupEventListeners() 內的段落，
         * 由 modules/main/events.js 的 setupEventListeners() 依原順序呼叫）。
         */
        function setupUrlDispatchEventListeners() {

            // New: URL/HTML Dispatch Settings Modal listeners.
            document.getElementById('url-dispatch-settings-btn').addEventListener('click', showUrlDispatchSettingsModal);
            urlDispatchModalCloseBtn.addEventListener('click', hideUrlDispatchSettingsModal);
            document.getElementById('save-dispatch-settings-btn').addEventListener('click', saveDispatchSettings); // Renamed
            document.getElementById('clear-dispatch-settings-btn').addEventListener('click', clearDispatchSettings); // Renamed

            // NEW: Event listeners for dispatch type radio buttons
            dispatchTypeRadios.forEach(radio => {
                radio.addEventListener('change', (e) => {
                    const selectedType = e.target.value;
                    urlDispatchSection.classList.toggle('hidden', selectedType === 'html');
                    htmlDispatchSection.classList.toggle('hidden', selectedType === 'url');
                });
            });

            // NEW: HTML upload/clear listeners within the dispatch settings modal
            dispatchHtmlUploadInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                e.target.value = ''; // Reset input
                if (file) {
                    handleDispatchHtmlFile(file);
                }
            });
            clearDispatchHtmlBtn.addEventListener('click', () => {
                dispatchSettings.htmlContent = null; // Clear content in global state
                dispatchHtmlUploadInput.value = ''; // Clear file input
                dispatchHtmlStatus.textContent = '目前沒有 HTML 檔案。';
                showMessage('HTML 檔案已清除！', 'info');
            });

            // 教師端：點學生截圖放大檢視
            document.getElementById('student-responses-container').addEventListener('click', (e) => {
                const img = e.target.closest('img[data-dispatch-shot]');
                if (img) showMagnifiedDrawing(img.src);
            });
        }
