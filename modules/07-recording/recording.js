        // =====================================================================
        // 【07 錄音題】 modules/07-recording/recording.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        // =====================================================================

        // New: Recording specific variables
        let mediaRecorder;
        let audioChunks = [];
        let audioBlob = null;
        let audioDataURL = null;
        let audioStream = null; // To store the MediaStream object


        // --- New: Recording Functions (Student Side) ---
        const startRecordingBtn = document.getElementById('start-recording-btn');
        const stopRecordingBtn = document.getElementById('stop-recording-btn');
        const playRecordingBtn = document.getElementById('play-recording-btn');
        const resetRecordingBtn = document.getElementById('reset-recording-btn');
        const submitRecordingBtn = document.getElementById('submit-recording-btn');
        const audioPreview = document.getElementById('audio-preview');
        const recordingStatusText = document.getElementById('recording-status-text');
        const recordingStatusIcon = document.getElementById('recording-status-icon');

        /**
         * Starts the audio recording process.
         */
        async function startRecording() {
            try {
                // Request access to microphone
                audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

                // Try to use audio/wav first for better iOS compatibility.
                // Fallback to audio/webm if wav is not supported.
                let mimeType = 'audio/webm';
                if (MediaRecorder.isTypeSupported('audio/wav')) {
                    mimeType = 'audio/wav';
                } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                    mimeType = 'audio/mp4'; // Another common format
                } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
                    mimeType = 'audio/ogg';
                }

                mediaRecorder = new MediaRecorder(audioStream, { mimeType: mimeType });
                audioChunks = [];

                mediaRecorder.ondataavailable = event => {
                    audioChunks.push(event.data);
                };

                mediaRecorder.onstop = () => {
                    audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType }); // Use the actual mimeType recorded
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        audioDataURL = reader.result;
                        audioPreview.src = audioDataURL;
                        audioPreview.classList.remove('hidden');
                        playRecordingBtn.disabled = false;
                        resetRecordingBtn.disabled = false;
                        submitRecordingBtn.disabled = false;
                        recordingStatusText.textContent = '錄音完成，可試聽或送出';
                        recordingStatusIcon.classList.remove('fa-spin', 'text-red-500');
                        recordingStatusIcon.classList.add('text-green-500');
                    };
                    reader.readAsDataURL(audioBlob);

                    // Stop all tracks to release microphone
                    audioStream.getTracks().forEach(track => track.stop());
                };

                mediaRecorder.start();
                startRecordingBtn.disabled = true;
                stopRecordingBtn.disabled = false;
                playRecordingBtn.disabled = true;
                resetRecordingBtn.disabled = true;
                submitRecordingBtn.disabled = true;
                recordingStatusText.textContent = '正在錄音...';
                recordingStatusIcon.classList.remove('text-gray-400');
                recordingStatusIcon.classList.add('fa-spin', 'text-red-500');
                showMessage('開始錄音', 'info');
            } catch (err) {
                console.error('無法取得麥克風權限:', err);
                showMessage('無法取得麥克風權限，請檢查設定。', 'error');
                // Reset buttons if permission fails
                startRecordingBtn.disabled = false;
                stopRecordingBtn.disabled = true;
                playRecordingBtn.disabled = true;
                resetRecordingBtn.disabled = true;
                submitRecordingBtn.disabled = true;
                recordingStatusText.textContent = '錄音失敗';
                recordingStatusIcon.classList.remove('fa-spin', 'text-red-500');
                recordingStatusIcon.classList.add('text-gray-400');
            }
        }

        /**
         * Stops the audio recording.
         */
        function stopRecording() {
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
                stopRecordingBtn.disabled = true;
            }
        }

        /**
         * Plays the recorded audio.
         */
        function playRecording() {
            if (audioPreview.src) {
                audioPreview.play();
                showMessage('正在播放錄音', 'info');
            } else {
                showMessage('沒有可播放的錄音', 'info');
            }
        }

        /**
         * Resets the recording state, allowing for a new recording.
         */
        function resetRecording() {
            if (audioStream) {
                audioStream.getTracks().forEach(track => track.stop());
            }
            audioChunks = [];
            audioBlob = null;
            audioDataURL = null;
            audioPreview.src = '';
            audioPreview.classList.add('hidden');

            startRecordingBtn.disabled = false;
            stopRecordingBtn.disabled = true;
            playRecordingBtn.disabled = true;
            resetRecordingBtn.disabled = true;
            submitRecordingBtn.disabled = true;
            recordingStatusText.textContent = '準備錄音...';
            recordingStatusIcon.classList.remove('fa-spin', 'text-red-500', 'text-green-500');
            recordingStatusIcon.classList.add('text-gray-400');
            showMessage('錄音已重置', 'info');
        }

        /**
         * 07 錄音題：事件監聽設定（原本位於 setupEventListeners() 內的段落，
         * 由 modules/main/events.js 的 setupEventListeners() 依原順序呼叫）。
         */
        function setupRecordingEventListeners() {


            // New: Recording button event listeners
            startRecordingBtn.addEventListener('click', async () => {
                // NEW: Check pause state before starting recording
                if (isResponsePaused) {
                    showMessage('老師已暫停回覆，無法開始錄音。', 'error');
                    return;
                }
                startRecording();
            });
            stopRecordingBtn.addEventListener('click', stopRecording);
            playRecordingBtn.addEventListener('click', playRecording);
            resetRecordingBtn.addEventListener('click', resetRecording);
            submitRecordingBtn.addEventListener('click', async () => {
                // NEW: Check pause state before submitting recording
                if (isResponsePaused) {
                    showMessage('老師已暫停回覆，無法送出錄音。', 'error');
                    return;
                }
                if (audioDataURL) {
                    await submitAnswer(audioDataURL);
                    submitRecordingBtn.disabled = true;
                    submitRecordingBtn.classList.replace('btn-primary', 'btn-gray');
                } else {
                    showMessage('沒有錄音可送出', 'error');
                }
            });
        }
