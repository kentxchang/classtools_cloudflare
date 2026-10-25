        // =====================================================================
        // 【15 計算題】 modules/15-calc/calc.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        // =====================================================================
        //
        // 學生端：多頁計算紙（移植自「區網版桌面截圖互動工具」的計算題，操作與配置相同）。
        //   題目圖片使用繪圖題的背景圖（老師在「背景圖片設定」上傳的圖），點左上角「題目」可放大。
        // 資料：
        //   studentResponses/{userId}.answer  → 總覽圖（所有頁合併，作答卡片與下載用）
        //   calcAnswers/{userId}              → 每一頁的筆跡（老師端以相同程式繪出每頁的完整解析度圖片）
        //   以筆跡取代逐頁圖片上傳，可讓 20 頁的作答也不會超過資料庫單筆上限，並大幅減少教室網路與伺服器記憶體用量。

        const CALC_SIZE = { thin: 3.2, thick: 8, eraser: 34 };
        const CALC_COLORS = ['#2B2B2B', '#3E7BFA', '#E5484D', '#2FA37A'];
        const CALC_MAX_PAGES = 20;
        const CALC_OVERVIEW_MAX_LENGTH = 900000;  // 總覽圖字串上限
        const CALC_PAGES_MAX_LENGTH = 1400000;    // 筆跡資料字串上限（資料庫單筆上限約 1.9MB）
        const CC = {
            pages: [[], [], [], []], hist: [], PW: 1200, PH: 0, G: 50,
            tool: 'thin', color: CALC_COLORS[0], focus: -1, last: 0, penMode: false,
            cur: null, pid: null, touches: new Map(), pinch0: 0, t0: 0, fs: 1, anim: false,
            peekOpen: false, peekPage: 0, penSeen: false, penManual: false
        };
        let calcPanels = [];
        const calcEl = (id) => document.getElementById(id);
        const calcScreen = calcEl('calc-screen');
        const calcFocusEl = calcEl('calc-focus');
        const calcFpage = calcEl('calc-fpage');
        const calcFcan = calcEl('calc-fcanvas');
        const calcFctx = calcFcan.getContext('2d');
        const calcPeekEl = calcEl('calc-peek');
        const calcPeekCan = calcEl('calc-peek-canvas');
        const calcPeekCtx = calcPeekCan.getContext('2d');

        function calcAnswerRef(id) {
            return doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, 'calcAnswers', id);
        }

        // ---------- 共用：筆跡繪製與頁面圖片（學生端與教師端相同） ----------

        function calcTracePath(ctx, pts) {
            ctx.beginPath();
            if (pts.length === 1) {
                ctx.arc(pts[0][0], pts[0][1], ctx.lineWidth / 2, 0, Math.PI * 2);
                ctx.fill();
                return;
            }
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length - 1; i++) {
                const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
                ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
            }
            const last = pts[pts.length - 1];
            ctx.lineTo(last[0], last[1]);
            ctx.stroke();
        }

        function calcStroke(ctx, st, PW = CC.PW, PH = CC.PH) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, PW, PH);
            ctx.clip();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = st.w;
            ctx.globalCompositeOperation = st.tool === 'eraser' ? 'destination-out' : 'source-over';
            ctx.strokeStyle = ctx.fillStyle = st.tool === 'eraser' ? '#000' : st.color;
            calcTracePath(ctx, st.pts);
            ctx.restore();
        }

        // 單頁圖片（格線 + 墨跡），k = 縮放倍率
        function calcPageImage(strokes, PW, PH, G, k) {
            const w = Math.round(PW * k), h = Math.round(PH * k);
            const out = document.createElement('canvas');
            out.width = w; out.height = h;
            const o = out.getContext('2d');
            o.fillStyle = '#fff';
            o.fillRect(0, 0, w, h);
            o.strokeStyle = '#EEE8F3';
            o.lineWidth = Math.max(1, k);
            o.beginPath();
            for (let x = 0; x <= w; x += G * k) { o.moveTo(x + .5, 0); o.lineTo(x + .5, h); }
            for (let y = 0; y <= h; y += G * k) { o.moveTo(0, y + .5); o.lineTo(w, y + .5); }
            o.stroke();
            const ink = document.createElement('canvas');
            ink.width = w; ink.height = h;
            const ix = ink.getContext('2d');
            ix.setTransform(k, 0, 0, k, 0, 0);
            strokes.forEach(st => calcStroke(ix, st, PW, PH));
            o.drawImage(ink, 0, 0);
            return out;
        }

        // 所有頁合併成一張（2 欄排列，含頁碼角標）
        function calcComposite(pages, PW, PH, G, k) {
            const gap = Math.round(16 * k * 2), pad = gap;
            const pw = Math.round(PW * k), ph = Math.round(PH * k);
            const out = document.createElement('canvas');
            const n = pages.length, rows = Math.ceil(n / 2);
            out.width = pw * 2 + gap + pad * 2;
            out.height = ph * rows + gap * (rows - 1) + pad * 2;
            const o = out.getContext('2d');
            o.fillStyle = '#F6F1F8';
            o.fillRect(0, 0, out.width, out.height);
            for (let i = 0; i < n; i++) {
                const x = pad + (i % 2) * (pw + gap), y = pad + Math.floor(i / 2) * (ph + gap);
                o.save();
                o.shadowColor = 'rgba(120,100,150,.18)';
                o.shadowBlur = 12 * k;
                o.shadowOffsetY = 3 * k;
                o.fillStyle = '#fff';
                o.fillRect(x, y, pw, ph);
                o.restore();
                o.drawImage(calcPageImage(pages[i], PW, PH, G, k), x, y);
                const r = 18 * k * 1.4;
                o.fillStyle = 'rgba(143,135,156,.55)';
                o.beginPath();
                o.arc(x + r + 10 * k, y + r + 10 * k, r, 0, Math.PI * 2);
                o.fill();
                o.fillStyle = '#fff';
                o.font = `bold ${Math.round(r * 1.1)}px -apple-system, "PingFang TC", sans-serif`;
                o.textAlign = 'center';
                o.textBaseline = 'middle';
                o.fillText(String(i + 1), x + r + 10 * k, y + r + 10 * k + 1);
            }
            return out;
        }

        // ---------- 學生端：浮層（提示、確認） ----------

        let calcToastTimer;
        function calcToast(msg, ms = 2200) {
            const t = calcEl('calc-toast');
            t.textContent = msg;
            t.classList.add('show');
            clearTimeout(calcToastTimer);
            calcToastTimer = setTimeout(() => t.classList.remove('show'), ms);
        }

        function calcConfirm(title, text, yesLabel = '確定') {
            return new Promise(resolve => {
                calcEl('calc-confirm-title').textContent = title;
                calcEl('calc-confirm-text').textContent = text;
                calcEl('calc-confirm-yes').textContent = yesLabel;
                const m = calcEl('calc-confirm-modal');
                m.classList.add('show');
                const done = v => { m.classList.remove('show'); resolve(v); };
                calcEl('calc-confirm-yes').onclick = () => done(true);
                calcEl('calc-confirm-no').onclick = () => done(false);
            });
        }

        // ---------- 學生端：四格計算紙 ----------

        /** 由 listenToInteractionMode() 在進入計算題時呼叫：清空計算紙並顯示題目 */
        function initCalc() {
            CC.pages = [[], [], [], []];
            CC.hist = [];
            CC.last = 0;
            buildCalcPanels();
            CC.cur = null; CC.pid = null;
            CC.PH = 0;
            CC.t0 = performance.now();
            CC.focus = -1;
            calcFocusEl.classList.remove('show', 'on');
            setCalcPeek(false);
            updateCalcAddButtons();
            updateCalcQuestionImage();
            calcEl('calc-me-name').textContent = studentName || '';
            calcEl('calc-sent').classList.remove('show');
            requestAnimationFrame(calcLayout);
        }

        /** 題目圖片＝繪圖題的背景圖（背景圖更新時由 05 繪圖題的監聽呼叫） */
        function updateCalcQuestionImage() {
            const src = teacherUploadedBackgroundImageDataURL || '';
            calcEl('calc-q-img').src = src;
            calcEl('calc-q-btn').style.display = src ? '' : 'none';
        }

        /** 老師暫停作答：顯示提示並停用送出（仍可繼續書寫） */
        function updateCalcPaused(paused) {
            calcScreen.classList.toggle('paused', paused);
            calcEl('calc-submit').disabled = paused;
        }

        function setCalcTool(t) {
            CC.tool = t;
            calcScreen.querySelectorAll('.calc-tbtn[data-ctool]').forEach(b => b.classList.toggle('on', b.dataset.ctool === t));
        }

        function renderCalcPage(canvas, ctx, i, s, ox, oy) {
            const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
            CC.pages[i].forEach(st => calcStroke(ctx, st));
        }

        function sizeCalcCanvas(c) {
            const r = c.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
            const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
            if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
            return r;
        }

        // 四宮格縮圖（每一筆完成後即時更新）
        function renderCalcThumb(i) {
            const c = calcPanels[i].querySelector('canvas');
            const r = sizeCalcCanvas(c);
            if (!r.width) return;
            const s = Math.min(r.width / CC.PW, r.height / CC.PH);
            const ox = (r.width - CC.PW * s) / 2, oy = (r.height - CC.PH * s) / 2;
            calcPanels[i].style.setProperty('--g', `${CC.G * s}px`);
            calcPanels[i].style.setProperty('--gx', `${ox}px`);
            calcPanels[i].style.setProperty('--gy', `${oy}px`);
            renderCalcPage(c, c.getContext('2d'), i, s, ox, oy);
        }

        // 依頁數建立總覽格（2 欄；超過 4 頁時往下延伸並可捲動）
        function buildCalcPanels() {
            const grid = calcEl('calc-grid');
            grid.innerHTML = '';
            calcPanels = CC.pages.map((_, i) => {
                const d = document.createElement('div');
                d.className = 'calc-cpanel';
                d.innerHTML = `<canvas></canvas><span class="calc-pbadge">${i + 1}</span>`;
                d.addEventListener('click', () => openCalcFocus(i));
                grid.appendChild(d);
                return d;
            });
            calcEl('calc-add').disabled = CC.pages.length >= CALC_MAX_PAGES;
            calcEl('calc-fadd').disabled = CC.pages.length >= CALC_MAX_PAGES;
            updateCalcAddButtons();
        }

        // 「新增一頁」只在目前位於最後一頁時出現（總覽時頂列的 ➕頁 保留，新增在最後）
        function updateCalcAddButtons() {
            const inFocus = CC.focus >= 0;
            const onLast = inFocus && CC.focus === CC.pages.length - 1;
            calcEl('calc-fadd').style.display = onLast ? '' : 'none';
            calcEl('calc-add').style.display = (!inFocus || onLast) ? '' : 'none';
        }

        function calcLayout() {
            const a = calcEl('calc-area').getBoundingClientRect();
            if (!a.height || !calcPanels.length) return;
            calcEl('calc-grid').style.setProperty('--rowh', `${(a.height - 8) / 2}px`);
            const r = calcPanels[0].getBoundingClientRect();
            if (!r.width || !r.height) return;
            if (!CC.PH) CC.PH = Math.max(500, Math.min(1800, Math.round(CC.PW * r.height / r.width)));
            calcPanels.forEach((_, i) => renderCalcThumb(i));
            if (CC.focus >= 0) layoutCalcFocus();
        }

        function layoutCalcFocus() {
            const a = calcEl('calc-area').getBoundingClientRect();
            const s = Math.min((a.width - 16) / CC.PW, (a.height - 16) / CC.PH);
            CC.fs = s;
            calcFpage.style.width = `${CC.PW * s}px`;
            calcFpage.style.height = `${CC.PH * s}px`;
            calcFpage.style.setProperty('--g', `${CC.G * s}px`);
            sizeCalcCanvas(calcFcan);
            renderCalcPage(calcFcan, calcFctx, CC.focus, s, 0, 0);
            calcEl('calc-fback').textContent = `⊞ 回全覽 · 第 ${CC.focus + 1} / ${CC.pages.length} 頁`;
            if (CC.peekOpen) {
                if (CC.focus === 0) setCalcPeek(false);
                else { CC.peekPage = CC.focus - 1; renderCalcPeek(); }  // 換頁後自動顯示新的前一頁
            }
            updateCalcPeekButton();
            updateCalcAddButtons();
        }

        // 點擊即放大（FLIP 動畫）
        function openCalcFocus(i) {
            if (CC.anim) return;
            CC.focus = i; CC.last = i;
            calcFocusEl.classList.add('show');
            layoutCalcFocus();
            const pr = calcPanels[i].getBoundingClientRect(), fr = calcFpage.getBoundingClientRect();
            calcFpage.style.transition = 'none';
            calcFpage.style.transform = `translate(${pr.left - fr.left}px, ${pr.top - fr.top}px) scale(${pr.width / fr.width}, ${pr.height / fr.height})`;
            void calcFpage.offsetWidth;
            CC.anim = true;
            calcFpage.style.transition = 'transform .32s cubic-bezier(.2,.8,.2,1)';
            calcFpage.style.transform = '';
            calcFocusEl.classList.add('on');
            setTimeout(() => { CC.anim = false; }, 340);
        }

        function closeCalcFocus() {
            if (CC.focus < 0 || CC.anim) return;
            if (CC.cur) abandonCalcStroke();
            setCalcPeek(false);
            const i = CC.focus;
            calcPanels[i].scrollIntoView({ block: 'nearest' });
            renderCalcThumb(i);
            const pr = calcPanels[i].getBoundingClientRect(), fr = calcFpage.getBoundingClientRect();
            CC.anim = true;
            calcFpage.style.transition = 'transform .28s cubic-bezier(.4,0,.2,1)';
            calcFpage.style.transform = `translate(${pr.left - fr.left}px, ${pr.top - fr.top}px) scale(${pr.width / fr.width}, ${pr.height / fr.height})`;
            calcFocusEl.classList.remove('on');
            setTimeout(() => {
                calcFocusEl.classList.remove('show');
                calcFpage.style.transition = 'none';
                calcFpage.style.transform = '';
                CC.focus = -1;
                CC.anim = false;
                updateCalcAddButtons();
            }, 290);
        }

        // 水平滑動換頁：1 ➔ 2 ➔ … ➔ 最後一頁 循環；target 可直接指定頁
        function goCalcPage(d, target) {
            if (CC.focus < 0 || CC.anim) return;
            if (CC.cur) abandonCalcStroke();
            CC.anim = true;
            calcFpage.style.transition = 'transform .2s ease-in, opacity .2s';
            calcFpage.style.transform = `translateX(${-d * 45}%)`;
            calcFpage.style.opacity = '0';
            setTimeout(() => {
                const n = CC.pages.length;
                CC.focus = target !== undefined ? target : (CC.focus + d + n) % n;
                CC.last = CC.focus;
                layoutCalcFocus();
                calcFpage.style.transition = 'none';
                calcFpage.style.transform = `translateX(${d * 45}%)`;
                void calcFpage.offsetWidth;
                calcFpage.style.transition = 'transform .24s ease-out, opacity .24s';
                calcFpage.style.transform = '';
                calcFpage.style.opacity = '1';
                setTimeout(() => { CC.anim = false; }, 250);
            }, 200);
        }

        // ---------- 查看前一頁（第 2 頁起可即時叫出前面的計算） ----------

        function updateCalcPeekButton() {
            const btn = calcEl('calc-fpeek-btn');
            btn.style.display = CC.focus > 0 ? '' : 'none';
            btn.classList.toggle('on', CC.peekOpen);
            btn.textContent = CC.peekOpen ? '🙈 收起前一頁' : `👁 看第 ${CC.focus} 頁`;
        }

        function renderCalcPeek() {
            if (!CC.peekOpen) return;
            const body = calcEl('calc-peek-body');
            const w = body.getBoundingClientRect().width;
            body.style.height = `${w * CC.PH / CC.PW}px`;
            const s = w / CC.PW;
            body.style.setProperty('--g', `${CC.G * s}px`);
            sizeCalcCanvas(calcPeekCan);
            renderCalcPage(calcPeekCan, calcPeekCtx, CC.peekPage, s, 0, 0);
            calcEl('calc-peek-title').textContent = `第 ${CC.peekPage + 1} 頁`;
            calcEl('calc-peek-prev').disabled = CC.peekPage <= 0;
            calcEl('calc-peek-next').disabled = CC.peekPage >= CC.focus - 1;
            clampCalcPeek();
        }

        function setCalcPeek(open) {
            CC.peekOpen = open && CC.focus > 0;
            calcPeekEl.classList.toggle('show', CC.peekOpen);
            if (CC.peekOpen) {
                CC.peekPage = CC.focus - 1;
                requestAnimationFrame(renderCalcPeek);
            }
            updateCalcPeekButton();
        }

        // 預覽框保持在書寫區域內
        function clampCalcPeek() {
            if (!calcPeekEl.style.left) return;
            const a = calcFocusEl.getBoundingClientRect(), r = calcPeekEl.getBoundingClientRect();
            const x = Math.max(0, Math.min(a.width - r.width, parseFloat(calcPeekEl.style.left)));
            const y = Math.max(0, Math.min(a.height - r.height, parseFloat(calcPeekEl.style.top)));
            calcPeekEl.style.left = `${x}px`;
            calcPeekEl.style.top = `${y}px`;
        }

        // ---------- 觸控筆模式 / 手寫模式切換 ----------
        function setCalcPenMode(on) {
            CC.penMode = !!on;
            calcScreen.classList.toggle('penmode', CC.penMode);
            calcEl('calc-pen-toggle').textContent = CC.penMode ? '✍️ 觸控筆模式' : '☝️ 手寫模式';
        }

        // ---------- 新增 / 刪除計算紙 ----------
        function addCalcPage() {
            if (CC.pages.length >= CALC_MAX_PAGES) { calcToast(`最多 ${CALC_MAX_PAGES} 頁`); return; }
            if (CC.cur) abandonCalcStroke();
            CC.pages.push([]);
            const idx = CC.pages.length - 1;
            buildCalcPanels();
            calcLayout();
            calcToast(`➕ 已新增第 ${idx + 1} 頁`);
            if (CC.focus >= 0) {
                goCalcPage(1, idx);  // 書寫中：直接滑到新的一頁
            } else {
                calcPanels[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                setTimeout(() => openCalcFocus(idx), 380);
            }
        }

        function deleteCalcPage(page) {
            if (CC.pages.length <= 1) return;
            CC.pages.splice(page, 1);
            CC.hist = CC.hist.filter(x => x !== page).map(x => (x > page ? x - 1 : x));
            CC.last = Math.min(CC.last, CC.pages.length - 1);
            buildCalcPanels();
            if (CC.focus >= 0) {
                CC.focus = Math.min(page, CC.pages.length - 1);
                CC.last = CC.focus;
            }
            calcLayout();
            calcToast(`🗑 已刪除第 ${page + 1} 頁`);
        }

        // ---------- 書寫：Apple Pencil 出現後只接受筆尖；兩指捏合退回總覽 ----------
        function calcPt(e) {
            const r = calcFcan.getBoundingClientRect();
            const ts = (e.timeStamp && e.timeStamp > 0) ? e.timeStamp : performance.now();
            return [(e.clientX - r.left) / CC.fs, (e.clientY - r.top) / CC.fs, Math.max(0, Math.round(ts - CC.t0))];
        }

        function calcTouchDist() {
            const v = [...CC.touches.values()];
            return v.length < 2 ? 0 : Math.hypot(v[0][0] - v[1][0], v[0][1] - v[1][1]);
        }

        function abandonCalcStroke() {
            CC.cur = null; CC.pid = null;
            if (CC.focus >= 0) renderCalcPage(calcFcan, calcFctx, CC.focus, CC.fs, 0, 0);
        }

        function drawCalcSeg(st, from) {
            const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
            calcFctx.setTransform(dpr * CC.fs, 0, 0, dpr * CC.fs, 0, 0);
            if (st.pts.length === 1) { calcStroke(calcFctx, st); return; }
            calcStroke(calcFctx, { ...st, pts: st.pts.slice(Math.max(0, from - 1)) });
        }

        function endCalcStroke(e) {
            if (e.pointerType === 'touch') {
                CC.touches.delete(e.pointerId);
                if (CC.touches.size < 2) CC.pinch0 = 0;
            }
            if (!CC.cur || e.pointerId !== CC.pid) return;
            const st = CC.cur;
            CC.cur = null; CC.pid = null;
            delete st.ptype;
            CC.pages[CC.focus].push(st);
            CC.hist.push(CC.focus);
            renderCalcPage(calcFcan, calcFctx, CC.focus, CC.fs, 0, 0);
            renderCalcThumb(CC.focus);  // 即時同步四宮格縮圖
        }

        // ---------- 下載與送出 ----------

        // 整頁匯出：iPad 可透過分享選單「儲存影像」存入相簿
        async function exportCalc() {
            const c = calcComposite(CC.pages, CC.PW, CC.PH, CC.G, 1);
            const blob = await new Promise(r => c.toBlob(r, 'image/png'));
            const fname = `計算過程_${studentName || '作業'}.png`;
            try {
                const file = new File([blob], fname, { type: 'image/png' });
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({ files: [file], title: '計算過程' });
                    return;
                }
            } catch (e) {
                if (e && e.name === 'AbortError') return;
            }
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = fname;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 5000);
            calcToast('⬇️ 已下載計算過程圖');
        }

        /** 把每一頁的筆跡壓成精簡字串（座標取到小數一位）；太大時減少取樣點，仍太大回傳 null */
        function buildCalcPagesJson() {
            const pack = (step) => JSON.stringify(CC.pages.map(page => page.map(st => {
                const p = [];
                st.pts.forEach((pt, i) => {
                    if (i % step === 0 || i === st.pts.length - 1) p.push(Math.round(pt[0] * 10) / 10, Math.round(pt[1] * 10) / 10);
                });
                return { e: st.tool === 'eraser' ? 1 : 0, c: st.color, w: st.w, p };
            })));
            let json = pack(1);
            for (let step = 2; json.length > CALC_PAGES_MAX_LENGTH && step <= 16; step *= 2) json = pack(step);
            return json.length <= CALC_PAGES_MAX_LENGTH ? json : null;
        }

        /** 總覽圖（同參考程式：所有頁 2 欄合併、0.5 倍）；超過上限時逐步縮小 */
        function buildCalcOverview() {
            let k = 0.5, quality = 0.85, dataUrl = '';
            for (let attempt = 0; attempt < 5; attempt++) {
                dataUrl = calcComposite(CC.pages, CC.PW, CC.PH, CC.G, k).toDataURL('image/jpeg', quality);
                if (dataUrl.length <= CALC_OVERVIEW_MAX_LENGTH) return dataUrl;
                k *= 0.8;
                quality = Math.max(0.5, quality - 0.1);
            }
            return dataUrl;
        }

        async function submitCalc(e) {
            const btn = e.currentTarget;
            const empty = CC.pages.map(p => p.length === 0);
            if (empty.every(Boolean) && !(await calcConfirm('還沒有寫任何計算', '確定要直接送出嗎？', '送出'))) return;
            if (CC.focus >= 0) closeCalcFocus();
            const pages = buildCalcPagesJson();
            if (!pages) { calcToast('計算內容太多，請刪除幾頁後再送出'); return; }
            btn.disabled = true;
            try {
                // 先存每一頁的筆跡，再送出總覽圖（老師看到作答卡片時，逐頁資料一定已經存在）
                await setDoc(calcAnswerRef(userId), { round: currentRound || null, PW: CC.PW, PH: CC.PH, G: CC.G, pages, empty });
                if (await submitAnswer(buildCalcOverview())) {
                    calcEl('calc-sent').classList.add('show');
                } else {
                    calcToast('送出失敗，請再試一次');
                }
            } catch (err) {
                console.error('計算題送出失敗:', err);
                calcToast('送出失敗，請再試一次');
            } finally {
                btn.disabled = isResponsePaused;
            }
        }

        // ---------- 教師端：作答卡片 ----------

        function calcEscapeAttr(s) {
            return String(s ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        /** 由 buildResponseAnswerHTML() 呼叫：作答卡片顯示總覽圖，點擊開啟「計算過程」 */
        function buildCalcAnswerHTML(student) {
            if (!String(student.answer).startsWith('data:image')) return `<p class="text-gray-500">計算題作答格式錯誤</p>`;
            const uid = drawingReplayIds.get(student) || ''; // 學生作答 → userId 對照表（定義於 05 繪圖題）
            return `<img src="${student.answer}" alt="${calcEscapeAttr(student.name)} 的計算過程" class="w-full h-auto rounded-md border max-h-32 object-contain cursor-pointer" data-calc-uid="${calcEscapeAttr(uid)}" data-calc-name="${calcEscapeAttr(student.name)}"/>`;
        }

        /** 讀取一位學生的逐頁筆跡；不是本輪的作答回傳 null */
        async function loadCalcAnswer(uid) {
            if (!uid) return null;
            const snap = await getDoc(calcAnswerRef(uid));
            if (!snap.exists()) return null;
            const data = snap.data();
            if (currentRound && data.round && data.round !== currentRound) return null;
            const pages = JSON.parse(data.pages).map(page => page.map(st => {
                const pts = [];
                for (let i = 0; i + 1 < st.p.length; i += 2) pts.push([st.p[i], st.p[i + 1]]);
                return { tool: st.e ? 'eraser' : 'pen', color: st.c, w: st.w, pts };
            }));
            return { PW: data.PW, PH: data.PH, G: data.G, pages, empty: data.empty || pages.map(p => p.length === 0) };
        }

        // ---------- 教師端：計算過程檢視（每位學生的多頁計算紙，可逐頁放大） ----------

        const calcViewer = { entries: [], index: 0, page: null, data: null, req: 0 };

        function openCalcViewer(uid) {
            const imgs = [...document.querySelectorAll('#student-responses-container img[data-calc-uid]')];
            calcViewer.entries = imgs.map(img => ({ uid: img.dataset.calcUid, name: img.dataset.calcName }));
            if (!calcViewer.entries.length) return;
            calcViewer.index = Math.max(0, calcViewer.entries.findIndex(en => en.uid === uid));
            calcViewer.page = null;
            calcEl('calc-viewer-modal').classList.remove('hidden');
            loadCalcViewerEntry();
        }

        function closeCalcViewer() {
            calcViewer.req++;
            calcViewer.data = null;
            calcEl('calc-viewer-modal').classList.add('hidden');
        }

        async function loadCalcViewerEntry() {
            const req = ++calcViewer.req;
            const entry = calcViewer.entries[calcViewer.index];
            calcViewer.data = null;
            setCalcViewerStatus('讀取中…');
            renderCalcViewer();
            let data = null;
            try { data = await loadCalcAnswer(entry.uid); } catch (err) { console.warn('讀取計算過程失敗:', err); }
            if (req !== calcViewer.req) return; // 已關閉或已切換學生
            calcViewer.data = data;
            setCalcViewerStatus(data ? '' : '讀取不到這位學生的計算過程');
            renderCalcViewer();
        }

        function setCalcViewerStatus(text) {
            const el = calcEl('calc-viewer-status');
            el.textContent = text;
            el.classList.toggle('hidden', !text);
        }

        function renderCalcViewer() {
            const entry = calcViewer.entries[calcViewer.index];
            const data = calcViewer.data;
            const n = data ? data.pages.length : 0;
            if (calcViewer.page !== null && calcViewer.page >= n) calcViewer.page = n ? n - 1 : null;
            calcEl('calc-viewer-title').textContent = data ? `🧮 ${entry.name} 的計算過程（共 ${n} 頁）` : `🧮 ${entry.name} 的計算過程`;
            calcEl('calc-viewer-counter').textContent = `${calcViewer.index + 1} / ${calcViewer.entries.length}`;
            const multi = calcViewer.entries.length > 1;
            calcEl('calc-viewer-prev-stu').classList.toggle('invisible', !multi);
            calcEl('calc-viewer-next-stu').classList.toggle('invisible', !multi);
            const single = data && calcViewer.page !== null;
            ['calc-viewer-prev-page', 'calc-viewer-next-page', 'calc-viewer-page-label'].forEach(id => calcEl(id).classList.toggle('invisible', !single));
            calcEl('calc-viewer-grid-btn').classList.toggle('hidden', !single);
            const grid = calcEl('calc-viewer-grid'), one = calcEl('calc-viewer-single');
            grid.innerHTML = '';
            one.querySelector('canvas')?.remove();
            grid.classList.toggle('hidden', !data || single);
            one.classList.toggle('hidden', !single);
            if (!data) return;
            if (single) {
                const p = calcViewer.page;
                one.appendChild(calcPageImage(data.pages[p], data.PW, data.PH, data.G, 1));
                calcEl('calc-viewer-single-badge').textContent = `第 ${p + 1} 頁`;
                calcEl('calc-viewer-single-empty').classList.toggle('hidden', !data.empty[p]);
                calcEl('calc-viewer-page-label').textContent = `第 ${p + 1} / ${n} 頁`;
                return;
            }
            // 總覽：4 頁以內 2 欄；超過 4 頁改 3 欄並可捲動
            const cols = n <= 4 ? 2 : 3;
            grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
            const maxTileW = n <= 4 ? (grid.clientHeight - 12) / 2 * data.PW / data.PH : Infinity; // 2×2 時填滿畫面高度
            data.pages.forEach((strokes, i) => {
                const tile = document.createElement('div');
                tile.className = 'calc-viewer-tile relative bg-white rounded-2xl border border-slate-200 p-2 cursor-pointer hover:shadow-lg transition mx-auto w-full';
                if (isFinite(maxTileW) && maxTileW > 0) tile.style.maxWidth = `${maxTileW + 16}px`;
                tile.appendChild(calcPageImage(strokes, data.PW, data.PH, data.G, 0.5));
                tile.insertAdjacentHTML('beforeend', `<span class="absolute top-3 left-3 w-8 h-8 rounded-full bg-slate-500/60 text-white font-extrabold flex items-center justify-center">${i + 1}</span>`
                    + (data.empty[i] ? '<span class="absolute inset-0 flex items-center justify-center text-slate-400 font-bold text-lg">（空白）</span>' : ''));
                tile.addEventListener('click', () => { calcViewer.page = i; renderCalcViewer(); });
                grid.appendChild(tile);
            });
        }

        function goCalcViewerStudent(d) {
            if (calcViewer.entries.length < 2) return;
            calcViewer.index = (calcViewer.index + d + calcViewer.entries.length) % calcViewer.entries.length;
            calcViewer.page = null;
            loadCalcViewerEntry();
        }

        function goCalcViewerPage(d) {
            if (!calcViewer.data || calcViewer.page === null) return;
            const n = calcViewer.data.pages.length;
            calcViewer.page = (calcViewer.page + d + n) % n;
            renderCalcViewer();
        }

        /**
         * 一位學生的作答合併成一張長圖：姓名 → 題目（有派送時）→ 全覽 → 第 1、2、3… 頁（由上往下接續）。
         * 頁數多時自動縮小，避免超過瀏覽器畫布上限（iPad Safari 約 1,670 萬像素）。
         */
        async function buildCalcStudentSheet(name, overviewUrl, data, questionUrl) {
            const MAX_AREA = 16000000;
            const QUESTION_MAX_H = 900; // 題目圖最高顯示高度（直式長圖不會把整張拉得太長）
            const pad = 40, labelH = 64, headerH = 96, gap = 32;
            const overview = new Image();
            overview.src = overviewUrl;
            await overview.decode();
            const contentW = data ? data.PW : overview.naturalWidth;
            const W = contentW + pad * 2;
            const overviewH = Math.round(overview.naturalHeight * contentW / overview.naturalWidth);
            const sections = [];
            if (questionUrl) { // 老師派送的題目（底圖）放在最上面，依原比例置中
                const question = new Image();
                question.src = questionUrl;
                await question.decode();
                const qs = Math.min(contentW / question.naturalWidth, QUESTION_MAX_H / question.naturalHeight);
                const qw = Math.round(question.naturalWidth * qs), qh = Math.round(question.naturalHeight * qs);
                sections.push({ label: '題目', h: qh, draw: (o, x, y) => o.drawImage(question, x + (contentW - qw) / 2, y, qw, qh) });
            }
            sections.push({ label: '全覽', h: overviewH, draw: (o, x, y) => o.drawImage(overview, x, y, contentW, overviewH) });
            if (data) {
                data.pages.forEach((strokes, i) => sections.push({
                    label: `第 ${i + 1} 頁${data.empty[i] ? '（空白）' : ''}`,
                    h: data.PH,
                    draw: (o, x, y) => o.drawImage(calcPageImage(strokes, data.PW, data.PH, data.G, 1), x, y)
                }));
            }
            const H = headerH + sections.reduce((sum, s) => sum + labelH + s.h + gap, 0) + pad;
            const scale = Math.min(1, Math.sqrt(MAX_AREA / (W * H)));
            const out = document.createElement('canvas');
            out.width = Math.round(W * scale);
            out.height = Math.round(H * scale);
            const o = out.getContext('2d');
            o.scale(scale, scale);
            o.fillStyle = '#F6F1F8';
            o.fillRect(0, 0, W, H);
            o.fillStyle = '#4A4358';
            o.textBaseline = 'middle';
            o.font = 'bold 44px -apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
            o.fillText(`🧮 ${name} 的計算過程`, pad, headerH / 2 + 8);
            let y = headerH;
            o.font = 'bold 32px -apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
            for (const s of sections) {
                o.fillStyle = '#8F879C';
                o.fillText(s.label, pad, y + labelH / 2);
                y += labelH;
                o.save();
                o.shadowColor = 'rgba(120,100,150,.18)';
                o.shadowBlur = 12;
                o.shadowOffsetY = 3;
                o.fillStyle = '#fff';
                o.fillRect(pad, y, contentW, s.h);
                o.restore();
                s.draw(o, pad, y);
                y += s.h + gap;
            }
            return out.toDataURL('image/jpeg', 0.85);
        }

        /** 下載媒體（計算題）：有派送題目時附上「題目」原圖，每位學生一張合併長圖（題目 → 全覽 → 第 1、2、3… 頁），打包成 zip */
        async function downloadCalcAnswers(btn) {
            const responses = allStudentResponses.filter(r => typeof r.answer === 'string' && r.answer.startsWith('data:image'));
            if (responses.length === 0) return showMessage('目前沒有計算題作答可供下載。', 'info');
            btn.disabled = true;
            showMessage('正在打包計算題作答...', 'info');
            try {
                const zip = new JSZip();
                const used = new Map();
                const question = teacherUploadedBackgroundImageDataURL; // 本輪派送的題目（繪圖題背景圖）
                if (question) {
                    const ext = (question.match(/^data:image\/(\w+)/) || [])[1] === 'png' ? 'png' : 'jpg';
                    zip.file(`題目.${ext}`, question.split(',')[1], { base64: true });
                    used.set('題目', 1); // 學生姓名剛好是「題目」時改用「題目-2」，避免覆蓋
                }
                for (const r of responses) {
                    const base = String(r.name || '學生').replace(/[\\/:*?"<>|]/g, '_');
                    const count = (used.get(base) || 0) + 1;
                    used.set(base, count);
                    const data = await loadCalcAnswer(drawingReplayIds.get(r));
                    const sheet = await buildCalcStudentSheet(r.name || '學生', r.answer, data, question);
                    zip.file(`${count > 1 ? `${base}-${count}` : base}.jpg`, sheet.split(',')[1], { base64: true });
                }
                const content = await zip.generateAsync({ type: 'blob' });
                saveAs(content, `計算題作答_${new Date().toLocaleDateString('zh-TW')}.zip`);
                showMessage(`已成功打包 ${responses.length} 位學生的計算題作答並開始下載。`, 'success');
            } catch (error) {
                console.error('打包計算題作答失敗:', error);
                showMessage('打包失敗，請檢查瀏覽器支援或檔案大小。', 'error');
            } finally {
                btn.disabled = false;
            }
        }

        /**
         * 15 計算題：事件監聽設定（由 modules/main/events.js 的 setupEventListeners() 呼叫）。
         */
        function setupCalcEventListeners() {
            // --- 學生端 ---
            const ccWrap = calcEl('calc-colors');
            CALC_COLORS.forEach((c, i) => {
                const b = document.createElement('button');
                b.className = 'calc-swatch' + (i === 0 ? ' on' : '');
                b.innerHTML = `<i style="background:${c}"></i>`;
                b.onclick = () => {
                    CC.color = c;
                    ccWrap.querySelectorAll('.calc-swatch').forEach(x => x.classList.toggle('on', x === b));
                    if (CC.tool === 'eraser') setCalcTool('thin');
                };
                ccWrap.appendChild(b);
            });
            calcScreen.querySelectorAll('.calc-tbtn[data-ctool]').forEach(b => b.onclick = () => setCalcTool(b.dataset.ctool));

            calcEl('calc-fpeek-btn').onclick = () => setCalcPeek(!CC.peekOpen);
            calcEl('calc-peek-close').onclick = () => setCalcPeek(false);
            calcEl('calc-peek-prev').onclick = () => { if (CC.peekPage > 0) { CC.peekPage--; renderCalcPeek(); } };
            calcEl('calc-peek-next').onclick = () => { if (CC.peekPage < CC.focus - 1) { CC.peekPage++; renderCalcPeek(); } };
            calcEl('calc-peek-size').onclick = () => { calcPeekEl.classList.toggle('big'); requestAnimationFrame(renderCalcPeek); };

            // 拖曳標題列移動預覽框
            let peekDrag = null;
            const peekHead = calcEl('calc-peek-head');
            peekHead.addEventListener('pointerdown', e => {
                if (e.target.closest('button')) return;
                const a = calcFocusEl.getBoundingClientRect(), r = calcPeekEl.getBoundingClientRect();
                peekDrag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, ax: a.left, ay: a.top };
                try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { }
            });
            peekHead.addEventListener('pointermove', e => {
                if (!peekDrag || e.pointerId !== peekDrag.id) return;
                calcPeekEl.style.right = 'auto';
                calcPeekEl.style.left = `${e.clientX - peekDrag.ax - peekDrag.dx}px`;
                calcPeekEl.style.top = `${e.clientY - peekDrag.ay - peekDrag.dy}px`;
                clampCalcPeek();
            });
            ['pointerup', 'pointercancel'].forEach(t => peekHead.addEventListener(t, () => { peekDrag = null; }));

            calcEl('calc-pen-toggle').onclick = () => {
                CC.penManual = true;
                setCalcPenMode(!CC.penMode);
                calcToast(CC.penMode ? '✍️ 觸控筆模式：只用筆書寫，手掌不會誤觸'
                                     : '☝️ 手寫模式：手指和觸控筆都可以書寫');
            };

            calcEl('calc-add').onclick = addCalcPage;
            calcEl('calc-fadd').onclick = addCalcPage;
            calcEl('calc-fback').onclick = closeCalcFocus;
            calcEl('calc-fprev').onclick = () => goCalcPage(-1);
            calcEl('calc-fnext').onclick = () => goCalcPage(1);
            calcEl('calc-q-btn').onclick = () => {
                if (!teacherUploadedBackgroundImageDataURL) return;
                calcEl('calc-viewer').querySelector('img').src = teacherUploadedBackgroundImageDataURL;
                calcEl('calc-viewer').classList.add('show');
            };
            calcEl('calc-viewer').onclick = () => calcEl('calc-viewer').classList.remove('show');

            ['touchstart', 'touchmove'].forEach(t =>
                calcFpage.addEventListener(t, e => { if (e.cancelable) e.preventDefault(); }, { passive: false }));

            calcFcan.addEventListener('pointerdown', e => {
                if (e.pointerType === 'touch') {
                    CC.touches.set(e.pointerId, [e.clientX, e.clientY]);
                    if (CC.touches.size >= 2) {
                        if (CC.cur && CC.cur.ptype === 'touch') abandonCalcStroke();
                        CC.pinch0 = calcTouchDist();
                        return;
                    }
                }
                if (e.pointerType === 'pen' && !CC.penSeen) {
                    CC.penSeen = true;
                    calcScreen.classList.add('pen-seen');
                    // 使用者手動選過模式後，不再自動切換
                    if (!CC.penManual) {
                        setCalcPenMode(true);
                        calcToast('✍️ 已切換觸控筆模式：只用筆書寫（點右上角按鈕可切回手寫）');
                    }
                }
                if (e.pointerType === 'touch' && CC.penMode) return;
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                if (CC.cur || CC.anim) return;
                e.preventDefault();
                try { calcFcan.setPointerCapture(e.pointerId); } catch (err) { }
                CC.pid = e.pointerId;
                CC.cur = {
                    tool: CC.tool === 'eraser' ? 'eraser' : 'pen', color: CC.color,
                    w: CALC_SIZE[CC.tool], pts: [calcPt(e)], ptype: e.pointerType
                };
                drawCalcSeg(CC.cur, 0);
            });

            calcFcan.addEventListener('pointermove', e => {
                if (e.pointerType === 'touch' && CC.touches.has(e.pointerId)) {
                    CC.touches.set(e.pointerId, [e.clientX, e.clientY]);
                    if (CC.touches.size >= 2 && CC.pinch0) {
                        if (calcTouchDist() < CC.pinch0 * 0.65) { CC.touches.clear(); CC.pinch0 = 0; closeCalcFocus(); }
                        return;
                    }
                }
                if (!CC.cur || e.pointerId !== CC.pid) return;
                e.preventDefault();
                let evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
                if (!evs || !evs.length) evs = [e];
                const before = CC.cur.pts.length;
                evs.forEach(ev => CC.cur.pts.push(calcPt(ev)));
                drawCalcSeg(CC.cur, before);
            });
            calcFcan.addEventListener('pointerup', endCalcStroke);
            calcFcan.addEventListener('pointercancel', endCalcStroke);
            calcFcan.addEventListener('lostpointercapture', endCalcStroke);

            calcEl('calc-undo').onclick = () => {
                const target = CC.focus >= 0 ? CC.focus : CC.hist[CC.hist.length - 1];
                if (target === undefined || !CC.pages[target].length) return;
                CC.pages[target].pop();
                const at = CC.hist.lastIndexOf(target);
                if (at >= 0) CC.hist.splice(at, 1);
                renderCalcThumb(target);
                if (CC.focus >= 0) renderCalcPage(calcFcan, calcFctx, CC.focus, CC.fs, 0, 0);
            };

            calcEl('calc-clear').onclick = () => {
                const page = CC.focus >= 0 ? CC.focus : CC.last;
                const m = calcEl('calc-clear-modal');
                calcEl('calc-cc-page').textContent = `清除第 ${page + 1} 頁`;
                calcEl('calc-cc-all').textContent = `清除全部 ${CC.pages.length} 頁`;
                calcEl('calc-cc-del').textContent = `🗑 刪除第 ${page + 1} 頁`;
                calcEl('calc-cc-del').style.display = CC.pages.length > 1 ? '' : 'none';
                m.classList.add('show');
                const close = () => m.classList.remove('show');
                calcEl('calc-cc-cancel').onclick = close;
                calcEl('calc-cc-page').onclick = () => {
                    CC.pages[page] = [];
                    CC.hist = CC.hist.filter(x => x !== page);
                    close(); calcLayout();
                };
                calcEl('calc-cc-all').onclick = () => {
                    CC.pages = CC.pages.map(() => []);
                    CC.hist = [];
                    close(); calcLayout();
                };
                calcEl('calc-cc-del').onclick = () => {
                    close();
                    deleteCalcPage(page);
                };
            };

            calcEl('calc-export').onclick = exportCalc;
            calcEl('calc-submit').onclick = submitCalc;
            calcEl('calc-edit-btn').onclick = () => {
                calcEl('calc-sent').classList.remove('show');
                requestAnimationFrame(calcLayout);
            };

            new ResizeObserver(() => { if (currentInteractionMode === 'calc') calcLayout(); }).observe(calcEl('calc-area'));

            // --- 教師端 ---
            document.getElementById('student-responses-container').addEventListener('click', (e) => {
                const img = e.target.closest('img[data-calc-uid]');
                if (img) openCalcViewer(img.dataset.calcUid);
            });
            calcEl('calc-viewer-close-btn').addEventListener('click', closeCalcViewer);
            calcEl('calc-viewer-grid-btn').addEventListener('click', () => { calcViewer.page = null; renderCalcViewer(); });
            calcEl('calc-viewer-prev-stu').addEventListener('click', () => goCalcViewerStudent(-1));
            calcEl('calc-viewer-next-stu').addEventListener('click', () => goCalcViewerStudent(1));
            calcEl('calc-viewer-prev-page').addEventListener('click', () => goCalcViewerPage(-1));
            calcEl('calc-viewer-next-page').addEventListener('click', () => goCalcViewerPage(1));
            document.addEventListener('keydown', (e) => {
                if (calcEl('calc-viewer-modal').classList.contains('hidden')) return;
                const single = calcViewer.page !== null;
                if (e.key === 'ArrowLeft') single ? goCalcViewerPage(-1) : goCalcViewerStudent(-1);
                else if (e.key === 'ArrowRight') single ? goCalcViewerPage(1) : goCalcViewerStudent(1);
                else if (e.key === 'Escape') single ? (calcViewer.page = null, renderCalcViewer()) : closeCalcViewer();
            });
        }
