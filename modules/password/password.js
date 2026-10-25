        // =====================================================================
        // 【預設密碼設定（教師密碼 / 班級密碼）】 modules/password/password.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        // =====================================================================

        // 教師密碼改由後端（src/worker.js 的 /api/teacher-login）驗證，網頁程式碼中不再存放密碼。
        // 修改密碼的方式請見 wrangler.jsonc 的 TEACHER_PASSWORD_SHA256 說明。

        /**
         * Compute SHA-256 hash of a string and return it as a lowercase hex string.
         * Used to store classroom passwords without keeping plaintext in Firestore.
         */
        async function sha256Hex(str) {
            const data = new TextEncoder().encode(str);
            const buf = await crypto.subtle.digest('SHA-256', data);
            return Array.from(new Uint8Array(buf))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
        }

        /**
         * Password prompt for entering / deleting a password-protected classroom.
         * Resolves with the entered password string, or null if cancelled.
         * @param {string} title - Modal title.
         * @param {string} desc  - Optional description line.
         */
        function promptClassroomPassword(title = '請輸入班級密碼', desc = '') {
            return new Promise((resolve) => {
                const modal = document.getElementById('classroom-password-modal');
                const titleEl = document.getElementById('classroom-password-modal-title');
                const descEl = document.getElementById('classroom-password-modal-desc');
                const input = document.getElementById('classroom-password-modal-input');
                const errorEl = document.getElementById('classroom-password-modal-error');
                const submitBtn = document.getElementById('classroom-password-modal-submit-btn');
                const cancelBtn = document.getElementById('classroom-password-modal-cancel-btn');
                const closeBtn = document.getElementById('classroom-password-modal-close-btn');

                titleEl.textContent = title;
                descEl.textContent = desc;
                descEl.classList.toggle('hidden', !desc);
                input.value = '';
                errorEl.classList.add('hidden');
                modal.classList.remove('hidden');
                setTimeout(() => input.focus(), 50);

                const cleanup = () => {
                    modal.classList.add('hidden');
                    submitBtn.removeEventListener('click', handleOk);
                    cancelBtn.removeEventListener('click', handleCancel);
                    closeBtn.removeEventListener('click', handleCancel);
                    input.removeEventListener('keydown', handleKey);
                };
                const handleOk = () => {
                    const val = input.value.trim();
                    if (!val) { errorEl.textContent = '請輸入密碼。'; errorEl.classList.remove('hidden'); return; }
                    cleanup();
                    resolve(val);
                };
                const handleCancel = () => { cleanup(); resolve(null); };
                const handleKey = (e) => {
                    if (e.key === 'Enter') handleOk();
                    else if (e.key === 'Escape') handleCancel();
                };

                submitBtn.addEventListener('click', handleOk);
                cancelBtn.addEventListener('click', handleCancel);
                closeBtn.addEventListener('click', handleCancel);
                input.addEventListener('keydown', handleKey);
            });
        }

        /** Verify a password against a classroom's stored hash. Returns true if it matches. */
        async function verifyClassroomPassword(code, plain) {
            const classroomDocRef = doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', code);
            const snap = await getDoc(classroomDocRef);
            if (!snap.exists()) return false;
            const stored = snap.data().passwordHash;
            if (!stored) return true; // no password set
            return (await sha256Hex(plain)) === stored;
        }

        /**
         * 預設密碼設定（教師密碼 / 班級密碼）：事件監聽設定（原本位於 setupEventListeners() 內的段落，
         * 由 modules/main/events.js 的 setupEventListeners() 依原順序呼叫）。
         */
        function setupPasswordEventListeners() {

            // Entry screen.
            document.getElementById('teacher-entry-btn').addEventListener('click', () => {
                document.getElementById('teacher-password-modal').classList.remove('hidden');
            });

            // Teacher Password Modal Event Listeners
            const teacherPasswordModal = document.getElementById('teacher-password-modal');
            const teacherPasswordModalCloseBtn = document.getElementById('teacher-password-modal-close-btn');
            const teacherPasswordInput = document.getElementById('teacher-password-input');
            const teacherPasswordSubmitBtn = document.getElementById('teacher-password-submit-btn');
            const teacherPasswordCancelBtn = document.getElementById('teacher-password-cancel-btn');

            teacherPasswordModalCloseBtn.addEventListener('click', () => {
                teacherPasswordModal.classList.add('hidden');
                teacherPasswordInput.value = '';
            });
            teacherPasswordCancelBtn.addEventListener('click', () => {
                teacherPasswordModal.classList.add('hidden');
                teacherPasswordInput.value = '';
            });
            teacherPasswordSubmitBtn.addEventListener('click', async () => {
                const password = teacherPasswordInput.value.trim();
                let ok = false;
                try {
                    const res = await fetch('/api/teacher-login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ password })
                    });
                    ok = (await res.json()).ok === true;
                } catch (err) {
                    console.error('教師密碼驗證失敗:', err);
                    showMessage('無法連線到伺服器驗證密碼，請稍後再試。', 'error');
                    return;
                }
                if (ok) {
                    teacherPasswordModal.classList.add('hidden');
                    teacherPasswordInput.value = '';
                    loadOpenClassrooms(); // Load currently-open classrooms from Firestore
                    showView('teacherClassroomCode');
                } else {
                    showMessage('密碼錯誤！', 'error');
                    teacherPasswordInput.value = '';
                    teacherPasswordInput.focus();
                }
            });
            teacherPasswordInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    teacherPasswordSubmitBtn.click();
                }
            });
        }
