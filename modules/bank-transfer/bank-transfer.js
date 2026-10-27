        // ==================== 本機題庫匯出 / 匯入（教師面板左下角浮動按鈕） ====================
        // 匯出：把這台電腦上所有題庫（跨課堂本地題庫 + 各課堂代碼下的題庫，同名取後者）存成 JSON 檔。
        // 匯入：讀取 JSON 檔，勾選模組 / 題庫後寫入「跨課堂本地題庫」，之後在各模組以「選擇本地題庫」載入。
        const BANK_TRANSFER_TYPES = {
            mc:      { label: '選擇題',   prefix: 'questionBanks_' },
            seq:     { label: '排序題',   prefix: 'sequencingBanks_' },
            match:   { label: '配對題',   prefix: 'matchingBanks_' },
            reading: { label: '閱讀測驗', prefix: 'readingQuestionBanks_' },
        };

        function collectAllLocalBanks() {
            const result = {};
            Object.entries(BANK_TRANSFER_TYPES).forEach(([type, { prefix }]) => {
                const byName = new Map();
                const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix) && k !== prefix + 'global');
                [...keys, prefix + 'global'].forEach(key => {
                    let arr = [];
                    try { arr = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { /* ignore */ }
                    if (Array.isArray(arr)) arr.forEach(b => { if (b && b.name) byName.set(b.name, b); });
                });
                result[type] = [...byName.values()];
            });
            return result;
        }

        function exportAllLocalBanks() {
            const banks = collectAllLocalBanks();
            const total = Object.values(banks).reduce((n, arr) => n + arr.length, 0);
            if (total === 0) { showMessage('這台電腦目前沒有可匯出的題庫', 'error'); return; }
            const data = { app: 'classtools-banks', version: 1, exportedAt: new Date().toISOString(), banks };
            const stamp = new Date().toISOString().slice(0, 10);
            saveAs(new Blob([JSON.stringify(data)], { type: 'application/json' }), `剛好學題庫_${stamp}.json`);
            showMessage(`已匯出 ${total} 個題庫`, 'success');
        }

        let pendingImportBanks = null;

        function showBankImportSelection(banks) {
            pendingImportBanks = banks;
            const tree = document.getElementById('bank-import-tree');
            tree.innerHTML = Object.entries(BANK_TRANSFER_TYPES).map(([type, { label }]) => {
                const arr = Array.isArray(banks[type]) ? banks[type].filter(b => b && b.name) : [];
                if (arr.length === 0) return '';
                return `<div class="border border-slate-200 rounded-lg p-3">
                    <label class="flex items-center gap-2 font-bold text-slate-800">
                        <input type="checkbox" class="bank-type-check" data-type="${type}" checked>
                        ${label}（${arr.length}）
                    </label>
                    <div class="mt-2 ml-6 space-y-1">
                        ${arr.map((b, i) => `<label class="flex items-center gap-2 text-sm">
                            <input type="checkbox" class="bank-item-check" data-type="${type}" data-index="${i}" checked>
                            ${escapeHtml(b.name)}
                        </label>`).join('')}
                    </div>
                </div>`;
            }).join('');
            if (!tree.innerHTML) { showMessage('檔案中沒有可匯入的題庫', 'error'); return; }
            document.getElementById('bank-transfer-main').classList.add('hidden');
            document.getElementById('bank-import-select').classList.remove('hidden');
        }

        function resetBankTransferModal() {
            pendingImportBanks = null;
            document.getElementById('bank-import-file').value = '';
            document.getElementById('bank-import-select').classList.add('hidden');
            document.getElementById('bank-transfer-main').classList.remove('hidden');
        }

        function importSelectedBanks() {
            let count = 0;
            Object.keys(BANK_TRANSFER_TYPES).forEach(type => {
                const picked = [...document.querySelectorAll(`.bank-item-check[data-type="${type}"]:checked`)]
                    .map(el => pendingImportBanks[type].filter(b => b && b.name)[parseInt(el.dataset.index)]);
                if (picked.length === 0) return;
                mirrorBanksToGlobal(BANK_REGISTRY[type].globalKey, picked);
                populateGlobalBankSelect(type);
                count += picked.length;
            });
            if (count === 0) { showMessage('請至少勾選一個題庫', 'error'); return; }
            document.getElementById('bank-transfer-modal').classList.add('hidden');
            resetBankTransferModal();
            showMessage(`已匯入 ${count} 個題庫，進入各模組後可從「選擇本地題庫」載入`, 'success');
        }

        function setupBankTransferEventListeners() {
            const modal = document.getElementById('bank-transfer-modal');
            const fileInput = document.getElementById('bank-import-file');
            document.getElementById('floating-bank-transfer-btn').addEventListener('click', () => {
                resetBankTransferModal();
                modal.classList.remove('hidden');
            });
            document.getElementById('bank-transfer-close-btn').addEventListener('click', () => modal.classList.add('hidden'));
            document.getElementById('bank-export-btn').addEventListener('click', exportAllLocalBanks);
            document.getElementById('bank-import-btn').addEventListener('click', () => fileInput.click());
            document.getElementById('bank-import-cancel-btn').addEventListener('click', resetBankTransferModal);
            document.getElementById('bank-import-confirm-btn').addEventListener('click', importSelectedBanks);
            fileInput.addEventListener('change', async () => {
                const file = fileInput.files[0];
                if (!file) return;
                try {
                    const data = JSON.parse(await file.text());
                    if (data.app !== 'classtools-banks' || !data.banks) throw new Error('format');
                    showBankImportSelection(data.banks);
                } catch (e) {
                    showMessage('無法讀取此檔案，請選擇由本功能匯出的題庫檔', 'error');
                }
                fileInput.value = '';
            });
            // 勾選模組 → 連動底下所有題庫；取消單一題庫 → 更新模組勾選狀態
            document.getElementById('bank-import-tree').addEventListener('change', (e) => {
                const el = e.target;
                if (el.classList.contains('bank-type-check')) {
                    document.querySelectorAll(`.bank-item-check[data-type="${el.dataset.type}"]`).forEach(c => { c.checked = el.checked; });
                } else if (el.classList.contains('bank-item-check')) {
                    const items = [...document.querySelectorAll(`.bank-item-check[data-type="${el.dataset.type}"]`)];
                    document.querySelector(`.bank-type-check[data-type="${el.dataset.type}"]`).checked = items.some(c => c.checked);
                }
            });
        }
