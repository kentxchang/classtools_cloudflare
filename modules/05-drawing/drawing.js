        // =====================================================================
        // 【05 繪圖題】 modules/05-drawing/drawing.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        // =====================================================================

        // Drawing specific variables.
        const canvas = document.getElementById('drawing-canvas'); // Main canvas for student display.
        const ctx = canvas.getContext('2d'); // 2D context of the main canvas.

        let backgroundCanvas = document.createElement('canvas'); // Canvas for teacher's background image.
        let backgroundCtx = backgroundCanvas.getContext('2d');

        let studentImageCanvas = document.createElement('canvas');
        let studentImageCtx = studentImageCanvas.getContext('2d');
        let studentUploadedImageDataURL = null; // Stores the scaled and compressed student uploaded image Data URL.

        let drawingCanvas = document.createElement('canvas'); // Canvas for student's drawing strokes.
        let drawingCtx = drawingCanvas.getContext('2d');

        let isDrawing = false;
        let lastX = 0;
        let lastY = 0;

        let teacherUploadedBackgroundImageDataURL = null; // Stores the scaled and compressed background image Data URL from Firestore.

        // Canvas content preservation
        let savedCanvasState = null; // Save student's drawing when switching to peer review

        // --- 畫筆重播 ---
        // 學生端記錄每一筆畫筆（座標、時間、顏色、粗細、是否為橡皮擦）與「清除畫布」，送出作品時另存到
        // classrooms/{教室代碼}/drawingReplays/{userId}；原本的作答資料、作答列表與下載媒體都不變。
        // 教師端點開學生作品放大檢視時，可用 0.5X / 1X / 2X / 3X 重播。
        const REPLAY_MAX_GAP_MS = 1000;            // 重播時，停頓超過 1 秒一律只等 1 秒（避免學生思考時畫面長時間不動）
        const REPLAY_MAX_STROKES_LENGTH = 450000;  // 畫筆紀錄字串上限，超過時減少取樣點
        const REPLAY_MAX_BASE_LENGTH = 600000;     // 底圖快照字串上限（加上畫筆紀錄，整筆仍遠低於資料庫單筆上限 1.9MB）
        let replayLog = { events: [], t0: 0 };     // events：{ c, w, e, p: [x, y, t, ...] } 或 { clear: 1, t }
        let replayCurrentStroke = null;
        const drawingReplayIds = new WeakMap();    // 教師端：學生作答資料物件 → 學生 userId（用來讀取重播資料）
        let replayData = null;                     // 教師端：目前放大檢視作品的重播資料
        let replayRequestId = 0;
        let replayAnimationId = null;
        let replayPlayToken = 0;

        function resetReplayLog() {
            replayLog = { events: [], t0: performance.now() };
            replayCurrentStroke = null;
        }

        function replayNow() {
            return Math.round(performance.now() - replayLog.t0);
        }

        // --- Drawing Board Logic ---
        function setupCanvas() {
            const canvasElement = document.getElementById('drawing-canvas');
            if (!canvasElement.offsetParent) return; // Don't setup if not visible
            let renderedWidth = canvasElement.clientWidth;
            let renderedHeight = canvasElement.clientHeight;

            canvasElement.width = Math.min(MAX_IMAGE_DIMENSION * 2, Math.max(1, renderedWidth));
            canvasElement.height = Math.min(MAX_IMAGE_DIMENSION * 2, Math.max(1, renderedHeight));

            [backgroundCanvas, studentImageCanvas, drawingCanvas].forEach(c => {
                c.width = canvasElement.width;
                c.height = canvasElement.height;
            });

            drawingCtx.lineJoin = 'round';
            drawingCtx.lineCap = 'round';
            drawingCtx.strokeStyle = document.getElementById('color-select').value;
            drawingCtx.lineWidth = parseInt(document.getElementById('size-select').value);
            drawingCtx.globalCompositeOperation = 'source-over';

            // Only clear drawingCanvas if it's a new session, not just a resize within the same session.
            // This is handled by the `resetStudentUIState` function now.
            // For setupCanvas, it's about setting dimensions and initial drawing context properties.
            // The actual clearing should be conditional based on pause state.
            // However, for a fresh setup (e.g., first time entering drawing mode), it should be cleared.
            // The logic in resetStudentUIState is responsible for this.
            // So, here, we just ensure the canvases are ready.
            backgroundCtx.fillStyle = 'white';
            backgroundCtx.fillRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
            studentImageCtx.clearRect(0, 0, studentImageCanvas.width, studentImageCanvas.height);
            resetReplayLog(); // 調整畫布尺寸會清空筆跡，重播紀錄也從頭開始
        }

        function loadBackgroundImage() {
            backgroundCtx.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
            backgroundCtx.fillStyle = 'white';
            backgroundCtx.fillRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);

            if (teacherUploadedBackgroundImageDataURL) {
                const tempImg = new Image();
                tempImg.onload = () => {
                    const canvasRatio = backgroundCanvas.width / backgroundCanvas.height;
                    const imgRatio = tempImg.width / tempImg.height;
                    let drawWidth, drawHeight, offsetX, offsetY;
                    if (imgRatio > canvasRatio) {
                        drawHeight = backgroundCanvas.width / imgRatio;
                        drawWidth = backgroundCanvas.width;
                        offsetY = (backgroundCanvas.height - drawHeight) / 2;
                        offsetX = 0;
                    } else {
                        drawWidth = backgroundCanvas.height * imgRatio;
                        drawHeight = backgroundCanvas.height;
                        offsetX = (backgroundCanvas.width - drawWidth) / 2;
                        offsetY = 0;
                    }
                    backgroundCtx.drawImage(tempImg, offsetX, offsetY, drawWidth, drawHeight);
                    drawCombinedCanvas();
                };
                tempImg.src = teacherUploadedBackgroundImageDataURL;
            } else {
                drawCombinedCanvas();
            }
        }

        function loadStudentImage() {
            studentImageCtx.clearRect(0, 0, studentImageCanvas.width, studentImageCanvas.height);

            if (studentUploadedImageDataURL) {
                const tempImg = new Image();
                tempImg.onload = () => {
                    const canvasRatio = studentImageCanvas.width / studentImageCanvas.height;
                    const imgRatio = tempImg.width / tempImg.height;
                    let drawWidth, drawHeight, offsetX, offsetY;
                    if (imgRatio > canvasRatio) {
                        drawHeight = studentImageCanvas.width / imgRatio;
                        drawWidth = studentImageCanvas.width;
                        offsetY = (studentImageCanvas.height - drawHeight) / 2;
                        offsetX = 0;
                    } else {
                        drawWidth = studentImageCanvas.height * imgRatio;
                        drawHeight = studentImageCanvas.height;
                        offsetX = (studentImageCanvas.width - drawWidth) / 2;
                        offsetY = 0;
                    }
                    studentImageCtx.drawImage(tempImg, offsetX, offsetY, drawWidth, drawHeight);
                    drawCombinedCanvas();
                };
                tempImg.src = studentUploadedImageDataURL;
            } else {
                drawCombinedCanvas();
            }
        }

        function drawCombinedCanvas() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(backgroundCanvas, 0, 0);
            ctx.drawImage(studentImageCanvas, 0, 0);
            ctx.drawImage(drawingCanvas, 0, 0);
        }

        // --- 繪圖題圖片尺寸與品質（學生作品、老師背景圖、學生上傳圖、重播底圖共用） ---
        const DRAWING_IMAGE_MAX_DIM = 1024;      // 最長邊（px）
        const DRAWING_JPEG_QUALITY = 0.9;        // JPEG 品質
        const DRAWING_IMAGE_MAX_LENGTH = 900000; // 單張圖片字串上限（base64 長度約等於位元組數，資料庫單筆上限約 1.9MB）

        /**
         * 把圖片壓縮成 JPEG dataURL：最長邊縮到 DRAWING_IMAGE_MAX_DIM，品質 DRAWING_JPEG_QUALITY；
         * 若超過 maxLength，逐步降低尺寸與品質，確保不會超過資料庫上限或拖慢教室網路。
         * @param {number} srcW, srcH - 原圖尺寸
         * @param {function} paint - (ctx, w, h) => 把原圖畫到指定大小
         * @param {boolean} fillWhite - JPEG 不支援透明，畫布合成的圖先鋪白底
         */
        function compressDrawingImage(srcW, srcH, paint, maxLength = DRAWING_IMAGE_MAX_LENGTH, fillWhite = true) {
            srcW = srcW || 1;
            srcH = srcH || 1;
            let scale = Math.min(1, DRAWING_IMAGE_MAX_DIM / Math.max(srcW, srcH));
            let quality = DRAWING_JPEG_QUALITY;
            const off = document.createElement('canvas');
            const octx = off.getContext('2d');
            let dataUrl = '';
            for (let attempt = 0; attempt < 5; attempt++) {
                off.width = Math.max(1, Math.round(srcW * scale));
                off.height = Math.max(1, Math.round(srcH * scale));
                if (fillWhite) {
                    octx.fillStyle = '#ffffff';
                    octx.fillRect(0, 0, off.width, off.height);
                } else {
                    octx.clearRect(0, 0, off.width, off.height);
                }
                paint(octx, off.width, off.height);
                dataUrl = off.toDataURL('image/jpeg', quality);
                if (dataUrl.length <= maxLength) return dataUrl;
                quality = Math.max(0.4, quality - 0.15);
                scale *= 0.8;
            }
            return dataUrl;
        }

        /**
         * 將繪圖結果轉成適合上傳的壓縮 JPEG dataURL（避免超過資料庫單筆上限，造成送出失敗、教師端看不到作品）。
         */
        function getDrawingSubmitDataUrl() {
            return compressDrawingImage(canvas.width, canvas.height, (c, w, h) => c.drawImage(canvas, 0, 0, w, h));
        }

        function draw(e) {
            if (!isDrawing) return;
            e.preventDefault();
            const { offsetX, offsetY } = getMousePos(e);
            drawingCtx.beginPath();
            drawingCtx.moveTo(lastX, lastY);
            drawingCtx.lineTo(offsetX, offsetY);
            drawingCtx.stroke();
            [lastX, lastY] = [offsetX, offsetY];
            drawCombinedCanvas();
            if (replayCurrentStroke) replayCurrentStroke.p.push(Math.round(offsetX * 10) / 10, Math.round(offsetY * 10) / 10, replayNow());
        }

        function getMousePos(e) {
            const rect = canvas.getBoundingClientRect();
            let clientX = e.touches ? e.touches[0].clientX : e.clientX;
            let clientY = e.touches ? e.touches[0].clientY : e.clientY;
            const rawOffsetX = clientX - rect.left;
            const rawOffsetY = clientY - rect.top;
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            return { offsetX: rawOffsetX * scaleX, offsetY: rawOffsetY * scaleY };
        }

        function startDrawing(e) {
            isDrawing = true;
            const { offsetX, offsetY } = getMousePos(e);
            [lastX, lastY] = [offsetX, offsetY];
            replayCurrentStroke = {
                c: drawingCtx.strokeStyle,
                w: drawingCtx.lineWidth,
                e: drawingCtx.globalCompositeOperation === 'destination-out' ? 1 : 0,
                p: [Math.round(offsetX * 10) / 10, Math.round(offsetY * 10) / 10, replayNow()]
            };
            replayLog.events.push(replayCurrentStroke);
        }

        function stopDrawing() { isDrawing = false; replayCurrentStroke = null; }

        function clearDrawingCanvas() {
            drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
            drawCombinedCanvas();
            replayLog.events.push({ clear: 1, t: replayNow() });
        }

        function updateColorSwatch(color) {
            const swatch = document.getElementById('current-color-swatch');
            if (swatch) swatch.style.backgroundColor = color;
        }


        // --- Event Listeners ---

        /**
         * NEW: Processes an image file (from upload or paste), resizes it, and applies it.
         * @param {File} file - The image file to process.
         * @param {boolean} isTeacher - True if the image is for the teacher's background.
         */
        function handleImageFile(file, isTeacher) {
            if (!file || !file.type.startsWith('image/')) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    // 最長邊 1024px、JPEG 0.9，並限制大小（見 compressDrawingImage）
                    const dataUrl = compressDrawingImage(img.width, img.height, (c, w, h) => c.drawImage(img, 0, 0, w, h), DRAWING_IMAGE_MAX_LENGTH, false);

                    if (isTeacher) {
                        teacherUploadedBackgroundImageDataURL = dataUrl;
                        // For teacher image, we need to pass statusId, previewId, previewContainerId
                        // These are not directly available in handleImageFile without context.
                        // Let's assume these are passed as arguments or accessed globally.
                        // Re-evaluate how setupImageUpload calls this.
                        document.getElementById('teacher-image-status').textContent = '已上傳背景圖片。可選擇檔案或直接貼上(Ctrl+V)。';
                        document.getElementById('teacher-image-preview').src = dataUrl;
                        document.getElementById('teacher-image-preview-container').classList.remove('hidden');
                        showMessage('背景圖片已上傳！', 'success');
                    } else {
                        studentUploadedImageDataURL = dataUrl;
                        showMessage('圖片已上傳！', 'success');
                        loadStudentImage();
                    }
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }

        /**
         * MODIFIED: Sets up image upload functionality for both file input and pasting.
         */
        const setupImageUpload = (inputId, statusId, previewContainerId, previewId, clearBtnId, isTeacher) => {
            const input = document.getElementById(inputId);
            const clearBtn = document.getElementById(clearBtnId);

            input.addEventListener('change', (e) => {
                const file = e.target.files[0];
                e.target.value = ''; // Reset input to allow re-uploading the same file
                if (file) {
                    // Pass the IDs to handleImageFile for teacher-specific updates
                    if (isTeacher) {
                        handleImageFileForTeacher(file, statusId, previewContainerId, previewId);
                    } else {
                        handleImageFile(file, isTeacher);
                    }
                }
            });

            clearBtn.addEventListener('click', () => {
                if (isTeacher) {
                    teacherUploadedBackgroundImageDataURL = null;
                    document.getElementById(statusId).textContent = '目前沒有背景圖片。可選擇檔案或直接貼上(Ctrl+V)。';
                    document.getElementById(previewId).src = '';
                    document.getElementById(previewContainerId).classList.add('hidden');
                    showMessage('背景圖片已清除！', 'info');
                } else {
                    studentUploadedImageDataURL = null;
                    studentImageCtx.clearRect(0, 0, studentImageCanvas.width, studentImageCanvas.height);
                    showMessage('圖片已清除！', 'info');
                    drawCombinedCanvas();
                }
            });
        };

        // NEW: Separate function for teacher image handling to pass specific DOM IDs
        function handleImageFileForTeacher(file, statusId, previewContainerId, previewId) {
            if (!file || !file.type.startsWith('image/')) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    // 最長邊 1024px、JPEG 0.9，並限制大小（見 compressDrawingImage）
                    const dataUrl = compressDrawingImage(img.width, img.height, (c, w, h) => c.drawImage(img, 0, 0, w, h), DRAWING_IMAGE_MAX_LENGTH, false);

                    teacherUploadedBackgroundImageDataURL = dataUrl;
                    document.getElementById(statusId).textContent = '已上傳背景圖片。可選擇檔案或直接貼上(Ctrl+V)。';
                    document.getElementById(previewId).src = dataUrl;
                    document.getElementById(previewContainerId).classList.remove('hidden');
                    showMessage('背景圖片已上傳！', 'success');
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }


        // --- Canvas State Management Functions ---

        /**
         * Saves the current canvas state when switching to peer review.
         */
        function saveCanvasState() {
            if (canvas && currentInteractionMode === 'drawing') {
                try {
                    savedCanvasState = {
                        mainCanvas: canvas.toDataURL(),
                        drawingCanvas: drawingCanvas.toDataURL(),
                        studentImageCanvas: studentImageCanvas.toDataURL(),
                        canvasWidth: canvas.width,
                        canvasHeight: canvas.height,
                        replayLog: replayLog // 互評結束回來後，重播紀錄接續原本的筆跡
                    };
                    console.log('Canvas state saved');
                } catch (error) {
                    console.error('Error saving canvas state:', error);
                }
            }
        }

        /**
         * Restores the canvas state when returning from peer review.
         */
        function restoreCanvasState() {
            if (savedCanvasState && canvas && currentInteractionMode === 'drawing') {
                try {
                    // Ensure canvas setup is complete
                    if (canvas.width === 0 || canvas.height === 0) {
                        setupCanvas();
                    }
                    if (savedCanvasState.replayLog) replayLog = savedCanvasState.replayLog;

                    // Restore canvas dimensions
                    canvas.width = savedCanvasState.canvasWidth;
                    canvas.height = savedCanvasState.canvasHeight;
                    drawingCanvas.width = savedCanvasState.canvasWidth;
                    drawingCanvas.height = savedCanvasState.canvasHeight;
                    studentImageCanvas.width = savedCanvasState.canvasWidth;
                    studentImageCanvas.height = savedCanvasState.canvasHeight;

                    let imagesLoaded = 0;
                    const totalImages = 2; // drawing and student image

                    function checkAllImagesLoaded() {
                        imagesLoaded++;
                        if (imagesLoaded === totalImages) {
                            // All images loaded, recompose the final canvas
                            redrawCanvas();
                            console.log('Canvas state restored');
                        }
                    }

                    // Restore drawing canvas content
                    if (savedCanvasState.drawingCanvas && savedCanvasState.drawingCanvas !== 'data:,') {
                        const drawingImg = new Image();
                        drawingImg.onload = function () {
                            drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
                            drawingCtx.drawImage(drawingImg, 0, 0);
                            checkAllImagesLoaded();
                        };
                        drawingImg.onerror = function () {
                            console.warn('Failed to load drawing canvas');
                            checkAllImagesLoaded();
                        };
                        drawingImg.src = savedCanvasState.drawingCanvas;
                    } else {
                        drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
                        checkAllImagesLoaded();
                    }

                    // Restore student image canvas content
                    if (savedCanvasState.studentImageCanvas && savedCanvasState.studentImageCanvas !== 'data:,') {
                        const studentImg = new Image();
                        studentImg.onload = function () {
                            studentImageCtx.clearRect(0, 0, studentImageCanvas.width, studentImageCanvas.height);
                            studentImageCtx.drawImage(studentImg, 0, 0);
                            checkAllImagesLoaded();
                        };
                        studentImg.onerror = function () {
                            console.warn('Failed to load student image canvas');
                            checkAllImagesLoaded();
                        };
                        studentImg.src = savedCanvasState.studentImageCanvas;
                    } else {
                        studentImageCtx.clearRect(0, 0, studentImageCanvas.width, studentImageCanvas.height);
                        checkAllImagesLoaded();
                    }

                } catch (error) {
                    console.error('Error restoring canvas state:', error);
                    // Fallback: just redraw what we can
                    redrawCanvas();
                }
            }
        }

        /**
         * Redraws the main canvas by compositing all layers.
         */
        function redrawCanvas() {
            if (!canvas || !ctx) return;

            // Clear main canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw background (teacher's background image)
            if (teacherUploadedBackgroundImageDataURL && backgroundCanvas) {
                try {
                    ctx.drawImage(backgroundCanvas, 0, 0);
                } catch (error) {
                    console.warn('Error drawing background canvas:', error);
                }
            }

            // Draw student's uploaded image
            if (studentUploadedImageDataURL && studentImageCanvas) {
                try {
                    ctx.drawImage(studentImageCanvas, 0, 0);
                } catch (error) {
                    console.warn('Error drawing student image canvas:', error);
                }
            }

            // Draw student's drawing strokes
            if (drawingCanvas) {
                try {
                    ctx.drawImage(drawingCanvas, 0, 0);
                } catch (error) {
                    console.warn('Error drawing drawing canvas:', error);
                }
            }
        }

        // --- 背景圖拆分 ---
        // 老師的背景圖另存在 classrooms/{教室代碼}/settings/drawingBackground，不再放在派送設定（control）裡。
        // 這樣老師暫停／恢復或改其他設定時，不會把整張背景圖重送給全班；只有開始繪圖題時才傳一次。
        let drawingBackgroundUnsubscribe = null; // 學生端的背景圖監聽

        function drawingBackgroundRef() {
            return doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'settings', 'drawingBackground');
        }

        /** 教師端：開始繪圖題前呼叫（由 setInteractionMode() 呼叫），寫入目前的背景圖 */
        async function sendDrawingBackground() {
            await setDoc(drawingBackgroundRef(), { image: teacherUploadedBackgroundImageDataURL || null });
        }

        /** 學生端：監聽老師的背景圖（由 listenToInteractionMode() 呼叫） */
        function listenToDrawingBackground() {
            stopDrawingBackgroundListener();
            drawingBackgroundUnsubscribe = onSnapshot(drawingBackgroundRef(), (snap) => {
                teacherUploadedBackgroundImageDataURL = (snap.exists() && snap.data().image) || null;
                // 正在作答繪圖題時立即換上新背景（筆跡在另一層，不會受影響）
                if (currentInteractionMode === 'drawing' && !interactionUIs.drawing.classList.contains('hidden') && canvas.width > 0) {
                    loadBackgroundImage();
                }
                updateCalcQuestionImage(); // 15 計算題的題目圖片也使用這張背景圖
                updateHotspotQuestionImage(); // 16 圖片點選題的題目圖片也使用這張背景圖
            });
        }

        function stopDrawingBackgroundListener() {
            if (drawingBackgroundUnsubscribe) drawingBackgroundUnsubscribe();
            drawingBackgroundUnsubscribe = null;
        }

        // --- 畫筆重播：學生端儲存 ---

        /** 每筆畫筆只保留每 step 個取樣點（一定保留起點與終點），用於紀錄太大時縮小資料量 */
        function thinReplayPoints(p, step) {
            const n = p.length / 3, out = [];
            for (let i = 0; i < n; i++) if (i % step === 0 || i === n - 1) out.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
            return out;
        }

        /** 把畫筆紀錄轉成字串；沒有任何筆跡或太大時回傳 null */
        function buildReplayStrokes() {
            const events = replayLog.events.filter(ev => ev.clear || ev.p.length >= 6); // 只點一下沒移動的不會留下筆跡
            if (!events.some(ev => !ev.clear)) return null;
            let json = JSON.stringify(events);
            for (let step = 2; json.length > REPLAY_MAX_STROKES_LENGTH && step <= 32; step *= 2) {
                json = JSON.stringify(events.map(ev => ev.clear ? ev : { ...ev, p: thinReplayPoints(ev.p, step) }));
            }
            return json.length <= REPLAY_MAX_STROKES_LENGTH ? json : null;
        }

        /** 底圖快照（老師的背景圖 + 學生上傳的圖片）；沒有底圖時回傳 null（重播時用白底） */
        function getReplayBaseDataUrl() {
            if (!teacherUploadedBackgroundImageDataURL && !studentUploadedImageDataURL) return null;
            const dataUrl = compressDrawingImage(canvas.width, canvas.height, (c, w, h) => {
                c.drawImage(backgroundCanvas, 0, 0, w, h);
                c.drawImage(studentImageCanvas, 0, 0, w, h);
            }, REPLAY_MAX_BASE_LENGTH);
            return dataUrl.length <= REPLAY_MAX_BASE_LENGTH ? dataUrl : null;
        }

        /** 送出作品後另存重播資料（失敗不影響作品送出） */
        async function saveDrawingReplay() {
            const strokes = buildReplayStrokes();
            if (!strokes || !userId || !classroomCode) return;
            try {
                const replayRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'drawingReplays', userId);
                await setDoc(replayRef, {
                    round: currentRound || null,
                    width: canvas.width,
                    height: canvas.height,
                    base: getReplayBaseDataUrl(),
                    strokes
                });
            } catch (err) {
                console.warn('畫筆重播資料儲存失敗（不影響作品送出）:', err);
            }
        }

        // --- 畫筆重播：教師端播放 ---

        /** 由 showMagnifiedDrawing() 呼叫：讀取該學生的重播資料並顯示重播按鈕（沒有 studentId 時隱藏） */
        async function prepareDrawingReplay(studentId) {
            stopDrawingReplay();
            replayData = null;
            const requestId = ++replayRequestId;
            const bar = document.getElementById('drawing-replay-bar');
            bar.classList.toggle('hidden', !studentId);
            if (!studentId) return;
            setReplayButtonsEnabled(false);
            setReplayStatus('讀取畫筆紀錄中…');

            let data = null;
            try {
                const snap = await getDoc(doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'drawingReplays', studentId));
                if (snap.exists()) data = snap.data();
            } catch (err) {
                console.warn('讀取畫筆重播資料失敗:', err);
            }
            if (requestId !== replayRequestId) return; // 已關閉或換看其他作品
            if (data && currentRound && data.round && data.round !== currentRound) data = null; // 上一輪的紀錄
            let events = null;
            try { events = data && JSON.parse(data.strokes); } catch { events = null; }
            if (!Array.isArray(events) || events.length === 0) {
                setReplayStatus('此作品沒有可重播的畫筆紀錄');
                return;
            }
            replayData = { width: data.width, height: data.height, base: data.base || null, ops: buildReplayOps(events) };
            setReplayButtonsEnabled(true);
            setReplayStatus('');
        }

        /** 把畫筆紀錄轉成依時間排序的播放動作；停頓超過 REPLAY_MAX_GAP_MS 的部分會縮短 */
        function buildReplayOps(events) {
            const ops = [];
            let at = 0, lastT = null;
            const advance = (t) => {
                if (lastT !== null) at += Math.min(Math.max(t - lastT, 0), REPLAY_MAX_GAP_MS);
                lastT = t;
            };
            for (const ev of events) {
                if (ev.clear) { advance(ev.t); ops.push({ at, clear: true }); continue; }
                advance(ev.p[2]);
                for (let i = 3; i + 2 < ev.p.length; i += 3) {
                    advance(ev.p[i + 2]);
                    ops.push({ at, stroke: ev, from: i - 3, to: i });
                }
            }
            return ops;
        }

        function setReplayStatus(text) {
            document.getElementById('drawing-replay-status').textContent = text;
        }

        function setReplayButtonsEnabled(enabled) {
            document.querySelectorAll('.drawing-replay-speed-btn').forEach(btn => {
                btn.disabled = !enabled;
                btn.classList.toggle('opacity-50', !enabled);
                btn.classList.toggle('cursor-not-allowed', !enabled);
            });
        }

        function highlightReplaySpeed(speed) {
            document.querySelectorAll('.drawing-replay-speed-btn').forEach(btn => {
                const active = Number(btn.dataset.speed) === speed;
                btn.classList.toggle('bg-purple-600', active);
                btn.classList.toggle('text-white', active);
                btn.classList.toggle('bg-purple-100', !active);
                btn.classList.toggle('text-purple-700', !active);
            });
        }

        /** 以指定倍速從頭重播（重播畫面與原作品大小、位置相同，筆跡畫在原底圖上） */
        function startDrawingReplay(speed) {
            if (!replayData) return;
            stopDrawingReplay();
            const data = replayData;
            const img = document.getElementById('magnified-image');
            const view = document.getElementById('drawing-replay-canvas');
            view.width = data.width;
            view.height = data.height;
            view.style.width = img.clientWidth + 'px';
            view.style.height = img.clientHeight + 'px';
            const viewCtx = view.getContext('2d');
            const layer = document.createElement('canvas'); // 筆跡層（與學生端相同：橡皮擦只擦筆跡、不擦底圖）
            layer.width = data.width;
            layer.height = data.height;
            const layerCtx = layer.getContext('2d');
            layerCtx.lineJoin = 'round';
            layerCtx.lineCap = 'round';

            const run = (baseImg) => {
                img.classList.add('hidden');
                view.classList.remove('hidden');
                highlightReplaySpeed(speed);
                setReplayStatus(`重播中（${speed}X）…`);
                const startTime = performance.now();
                let next = 0;
                const frame = (now) => {
                    const elapsed = (now - startTime) * speed;
                    while (next < data.ops.length && data.ops[next].at <= elapsed) {
                        const op = data.ops[next++];
                        if (op.clear) { layerCtx.clearRect(0, 0, layer.width, layer.height); continue; }
                        const s = op.stroke;
                        layerCtx.strokeStyle = s.c;
                        layerCtx.lineWidth = s.w;
                        layerCtx.globalCompositeOperation = s.e ? 'destination-out' : 'source-over';
                        layerCtx.beginPath();
                        layerCtx.moveTo(s.p[op.from], s.p[op.from + 1]);
                        layerCtx.lineTo(s.p[op.to], s.p[op.to + 1]);
                        layerCtx.stroke();
                    }
                    viewCtx.fillStyle = '#ffffff';
                    viewCtx.fillRect(0, 0, view.width, view.height);
                    if (baseImg) viewCtx.drawImage(baseImg, 0, 0, view.width, view.height);
                    viewCtx.drawImage(layer, 0, 0);
                    if (next < data.ops.length) {
                        replayAnimationId = requestAnimationFrame(frame);
                    } else {
                        replayAnimationId = null;
                        setReplayStatus('重播完成');
                    }
                };
                replayAnimationId = requestAnimationFrame(frame);
            };

            if (!data.base) { run(null); return; }
            const baseImg = new Image();
            const token = replayPlayToken;
            baseImg.onload = () => { if (token === replayPlayToken) run(baseImg); };
            baseImg.onerror = () => { if (token === replayPlayToken) run(null); };
            baseImg.src = data.base;
        }

        /** 停止重播並顯示原本的作品圖片 */
        function stopDrawingReplay() {
            replayPlayToken++; // 讓尚未載入完底圖的重播不再開始
            if (replayAnimationId) cancelAnimationFrame(replayAnimationId);
            replayAnimationId = null;
            document.getElementById('drawing-replay-canvas').classList.add('hidden');
            document.getElementById('magnified-image').classList.remove('hidden');
            highlightReplaySpeed(null);
            if (replayData) setReplayStatus('');
        }

        /** 由 hideMagnifiedDrawing() 呼叫：關閉放大檢視時結束重播 */
        function closeDrawingReplay() {
            replayRequestId++;
            stopDrawingReplay();
            replayData = null;
            document.getElementById('drawing-replay-bar').classList.add('hidden');
        }

        /**
         * 05 繪圖題：事件監聽設定（原本位於 setupEventListeners() 內的段落，
         * 由 modules/main/events.js 的 setupEventListeners() 依原順序呼叫）。
         */
        function setupDrawingEventListeners() {

            // Drawing submission.
            document.getElementById('submit-drawing-btn').addEventListener('click', async (e) => {
                // NEW: Check pause state before submitting
                if (isResponsePaused) {
                    showMessage('老師已暫停回覆，無法送出答案。', 'error');
                    return;
                }
                drawCombinedCanvas(); // 確保送出的是最新合成結果 (背景 + 上傳圖 + 筆跡)
                const dataUrl = getDrawingSubmitDataUrl();
                const button = e.currentTarget; // await 之後 e.currentTarget 會變成 null，需先保存
                await submitAnswer(dataUrl);
                button.disabled = true;
                button.classList.replace('btn-primary', 'btn-gray');
                saveDrawingReplay(); // 另存畫筆重播資料（不影響上面已送出的作品）
            });

            // 教師端：畫筆重播按鈕
            document.querySelectorAll('.drawing-replay-speed-btn').forEach(btn => {
                btn.addEventListener('click', () => startDrawingReplay(Number(btn.dataset.speed)));
            });
            document.getElementById('drawing-replay-stop-btn').addEventListener('click', stopDrawingReplay);

            // Drawing board events.
            canvas.addEventListener('mousedown', startDrawing);
            canvas.addEventListener('mousemove', draw);
            canvas.addEventListener('mouseup', stopDrawing);
            canvas.addEventListener('mouseleave', stopDrawing);
            canvas.addEventListener('touchstart', startDrawing, { passive: false });
            canvas.addEventListener('touchmove', draw, { passive: false });
            canvas.addEventListener('touchend', stopDrawing);
            window.addEventListener('resize', () => {
                if (!views.studentInteraction.classList.contains('hidden') && !interactionUIs.drawing.classList.contains('hidden')) {
                    setupCanvas();
                    loadBackgroundImage();
                    loadStudentImage();
                }
            });

            // Drawing tool controls.
            const colorSelect = document.getElementById('color-select');
            const sizeSelect = document.getElementById('size-select');
            const penToolBtn = document.getElementById('pen-tool-btn');
            const eraserBtn = document.getElementById('eraser-btn');
            colorSelect.addEventListener('change', (e) => {
                drawingCtx.strokeStyle = e.target.value;
                drawingCtx.globalCompositeOperation = 'source-over';
                updateColorSwatch(e.target.value);
                penToolBtn.classList.add('border-blue-500');
                eraserBtn.classList.remove('border-blue-500');
            });
            sizeSelect.addEventListener('change', (e) => { drawingCtx.lineWidth = parseInt(e.target.value); });
            penToolBtn.addEventListener('click', () => {
                drawingCtx.globalCompositeOperation = 'source-over';
                drawingCtx.strokeStyle = colorSelect.value;
                drawingCtx.lineWidth = parseInt(sizeSelect.value);
                penToolBtn.classList.add('border-blue-500');
                eraserBtn.classList.remove('border-blue-500');
            });
            eraserBtn.addEventListener('click', () => {
                drawingCtx.globalCompositeOperation = 'destination-out';
                drawingCtx.lineWidth = 15;
                penToolBtn.classList.remove('border-blue-500');
                eraserBtn.classList.add('border-blue-500');
            });
            document.getElementById('clear-canvas-btn').addEventListener('click', clearDrawingCanvas);

            // Image upload handlers (teacher and student).
            setupImageUpload('teacher-image-upload-input', 'teacher-image-status', 'teacher-image-preview-container', 'teacher-image-preview', 'clear-teacher-background-btn', true);
            setupImageUpload('student-image-upload-input', null, null, null, 'clear-student-image-btn', false);

            // NEW: Paste event listener for teacher background image
            document.addEventListener('paste', e => {
                // Only allow pasting when the teacher menu is visible
                if (views.teacherMenu.classList.contains('hidden')) {
                    return;
                }

                // Don't interfere if the user is typing in an input field
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                    return;
                }

                const items = (e.clipboardData || window.clipboardData).items;
                for (const item of items) {
                    if (item.kind === 'file' && item.type.startsWith('image/')) {
                        const file = item.getAsFile();
                        if (file) {
                            // Call the specific teacher image handler
                            handleImageFileForTeacher(file, 'teacher-image-status', 'teacher-image-preview-container', 'teacher-image-preview');
                            e.preventDefault(); // Prevent the image from being pasted as a file object
                            return; // Exit after handling the first image
                        }
                    }
                }
            });

            // NEW: 浮動貼上按鈕事件監聽
            document.getElementById('floating-paste-btn').addEventListener('click', async () => {
                try {
                    const clipboardItems = await navigator.clipboard.read();
                    for (const item of clipboardItems) {
                        const imageType = item.types.find(type => type.startsWith('image/'));
                        if (imageType) {
                            const blob = await item.getType(imageType);
                            const file = new File([blob], 'pasted-image.png', { type: imageType });
                            handleImageFileForTeacher(file, 'teacher-image-status', 'teacher-image-preview-container', 'teacher-image-preview');
                            return;
                        }
                    }
                    showMessage('剪貼簿中沒有圖片！', 'error');
                } catch (err) {
                    console.error('讀取剪貼簿圖片失敗:', err);
                    showMessage('無法讀取剪貼簿，請確認已允許剪貼簿存取權限。', 'error');
                }
            });

            // V2：背景圖片設定改為左側滑動圖層 — 點擊把手可展開/收合；有圖片設定進來時自動滑出，5 秒後自動收合
            const teacherBgDrawer = document.getElementById('teacher-bg-drawer');
            const teacherImagePreview = document.getElementById('teacher-image-preview');
            let teacherBgDrawerTimer = null;
            document.getElementById('teacher-bg-drawer-tab').addEventListener('click', () => {
                clearTimeout(teacherBgDrawerTimer);
                teacherBgDrawer.classList.toggle('open');
            });
            new MutationObserver(() => {
                if (!teacherImagePreview.getAttribute('src')) return; // 清除背景時不自動滑出
                teacherBgDrawer.classList.add('open');
                clearTimeout(teacherBgDrawerTimer);
                teacherBgDrawerTimer = setTimeout(() => teacherBgDrawer.classList.remove('open'), 5000);
            }).observe(teacherImagePreview, { attributes: true, attributeFilter: ['src'] });
        }
