        // =====================================================================
        // 【16 圖片點選題】 modules/16-hotspot/hotspot.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        // =====================================================================
        //
        // 老師派送一張題目圖（使用繪圖題的「背景圖片設定」），學生在圖上點一個位置作答；
        // 教師端即時顯示全班點選位置的熱點圖（越密集越紅），可顯示姓名、不規則圈選正確區域自動統計答對人數。
        // 作答資料：studentResponses/{userId}.answer = '{"x":0.1234,"y":0.5678}'（相對於圖片寬高的比例 0～1）

        const hotspotStudent = { x: null, y: null };
        const hotspotTeacher = { image: null, points: [], total: 0, region: null, regionMode: false, drawing: null, showNames: false, showHeat: true };
        const hotspotEl = (id) => document.getElementById(id);

        function parseHotspotAnswer(answer) {
            try {
                const a = JSON.parse(answer);
                if (Number.isFinite(a.x) && Number.isFinite(a.y) && a.x >= 0 && a.x <= 1 && a.y >= 0 && a.y <= 1) return a;
            } catch { /* 格式錯誤的作答不畫在圖上 */ }
            return null;
        }

        // ---------- 學生端 ----------

        /** 由 listenToInteractionMode() 在進入圖片點選題時呼叫 */
        function initHotspotStudent() {
            hotspotStudent.x = hotspotStudent.y = null;
            const marker = hotspotEl('hotspot-student-marker');
            marker.classList.add('hidden');
            marker.classList.remove('sent');
            hotspotEl('hotspot-student-status').textContent = '';
            updateHotspotQuestionImage();
        }

        /** 題目圖片＝繪圖題的背景圖（背景圖更新時由 05 繪圖題的監聽呼叫） */
        function updateHotspotQuestionImage() {
            const src = teacherUploadedBackgroundImageDataURL || '';
            hotspotEl('hotspot-student-img').src = src;
            hotspotEl('hotspot-student-stage').classList.toggle('hidden', !src);
            hotspotEl('hotspot-student-noimg').classList.toggle('hidden', !!src);
        }

        function placeHotspotMarker(e) {
            if (isResponsePaused) return;
            const img = hotspotEl('hotspot-student-img');
            const r = img.getBoundingClientRect();
            if (!r.width || !r.height) return;
            const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
            const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
            hotspotStudent.x = Math.round(x * 10000) / 10000;
            hotspotStudent.y = Math.round(y * 10000) / 10000;
            const marker = hotspotEl('hotspot-student-marker');
            marker.style.left = `${x * 100}%`;
            marker.style.top = `${y * 100}%`;
            marker.classList.remove('hidden', 'sent');
            hotspotEl('hotspot-student-status').textContent = '已選好位置，按「送出位置」送出（也可以點其他地方移動）';
        }

        async function submitHotspot(e) {
            if (hotspotStudent.x === null) {
                showMessage('請先在圖片上點選一個位置！', 'error');
                return;
            }
            const btn = e.currentTarget;
            btn.disabled = true;
            const ok = await submitAnswer(JSON.stringify({ x: hotspotStudent.x, y: hotspotStudent.y }));
            btn.disabled = isResponsePaused;
            if (ok) {
                hotspotEl('hotspot-student-marker').classList.add('sent');
                hotspotEl('hotspot-student-status').textContent = '✅ 已送出！如要修改，點選新位置後再送出一次。';
            }
        }

        // ---------- 教師端 ----------

        /** 由 listenToStudentSubmissions() 在開始圖片點選題時呼叫 */
        function initHotspotDisplay() {
            hotspotTeacher.image = teacherUploadedBackgroundImageDataURL || null;
            hotspotTeacher.points = [];
            hotspotTeacher.total = 0;
            hotspotTeacher.region = null;
            setHotspotRegionMode(false);
            hotspotEl('hotspot-teacher-img').src = hotspotTeacher.image || '';
            renderHotspotTeacher();
        }

        /** 由 listenToStudentSubmissions() 在收到作答時呼叫 */
        function updateHotspotDisplay(responses) {
            hotspotTeacher.total = responses.length;
            hotspotTeacher.points = responses
                .map(r => ({ name: r.name || '學生', p: parseHotspotAnswer(r.answer) }))
                .filter(r => r.p)
                .map(r => ({ name: r.name, x: r.p.x, y: r.p.y }));
            renderHotspotTeacher();
        }

        /** 點是否在不規則圈選的正確區域內（射線法；region 為 [{x, y}, ...] 多邊形頂點） */
        function inHotspotRegion(p, region) {
            let inside = false;
            for (let i = 0, j = region.length - 1; i < region.length; j = i++) {
                const a = region[i], b = region[j];
                if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
            }
            return inside;
        }

        /** 多邊形面積（比例座標），用來判斷圈選是否太小 */
        function hotspotRegionArea(region) {
            let s = 0;
            for (let i = 0, j = region.length - 1; i < region.length; j = i++) s += (region[j].x + region[i].x) * (region[j].y - region[i].y);
            return Math.abs(s) / 2;
        }

        // 熱點圖色階：藍 → 青 → 綠 → 黃 → 紅（越密集越紅）
        let hotspotPaletteCache = null;
        function hotspotPalette() {
            if (hotspotPaletteCache) return hotspotPaletteCache;
            const c = document.createElement('canvas');
            c.width = 256; c.height = 1;
            const x = c.getContext('2d');
            const g = x.createLinearGradient(0, 0, 256, 0);
            g.addColorStop(0, '#3b82f6');
            g.addColorStop(0.3, '#06b6d4');
            g.addColorStop(0.5, '#84cc16');
            g.addColorStop(0.75, '#facc15');
            g.addColorStop(1, '#ef4444');
            x.fillStyle = g;
            x.fillRect(0, 0, 256, 1);
            hotspotPaletteCache = x.getImageData(0, 0, 256, 1).data;
            return hotspotPaletteCache;
        }

        /** 在 ctx 的 (0,0)～(w,h) 範圍畫出熱點圖 */
        function drawHotspotHeat(ctx, w, h, points) {
            w = Math.round(w); h = Math.round(h);
            if (!points.length || !w || !h) return;
            const radius = Math.max(16, Math.min(w, h) * 0.07);
            const shadow = document.createElement('canvas');
            shadow.width = w; shadow.height = h;
            const s = shadow.getContext('2d');
            points.forEach(p => {
                const x = p.x * w, y = p.y * h;
                const g = s.createRadialGradient(x, y, 0, x, y, radius);
                g.addColorStop(0, 'rgba(0,0,0,0.45)');
                g.addColorStop(1, 'rgba(0,0,0,0)');
                s.fillStyle = g;
                s.fillRect(x - radius, y - radius, radius * 2, radius * 2);
            });
            const pal = hotspotPalette();
            const img = s.getImageData(0, 0, w, h);
            const d = img.data;
            for (let i = 0; i < d.length; i += 4) {
                const a = d[i + 3];
                if (!a) continue;
                d[i] = pal[a * 4]; d[i + 1] = pal[a * 4 + 1]; d[i + 2] = pal[a * 4 + 2];
                d[i + 3] = Math.min(200, a * 1.6);
            }
            s.putImageData(img, 0, 0);
            ctx.drawImage(shadow, 0, 0);
        }

        function renderHotspotTeacher() {
            const t = hotspotTeacher;
            const img = hotspotEl('hotspot-teacher-img');
            // 熱點圖
            const heat = hotspotEl('hotspot-heat-canvas');
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            heat.width = Math.round(img.clientWidth * dpr);
            heat.height = Math.round(img.clientHeight * dpr);
            const hctx = heat.getContext('2d');
            hctx.clearRect(0, 0, heat.width, heat.height);
            if (t.showHeat) drawHotspotHeat(hctx, heat.width, heat.height, t.points);
            // 正確區域
            const regionEl = hotspotEl('hotspot-region');
            const shape = t.drawing || t.region; // 圈選中顯示正在畫的路徑
            regionEl.classList.toggle('hidden', !shape);
            if (shape) hotspotEl('hotspot-region-shape').setAttribute('points', shape.map(p => `${p.x},${p.y}`).join(' '));
            // 每位學生的點（滑過或點一下顯示姓名）
            const dots = hotspotEl('hotspot-dots');
            dots.classList.toggle('hotspot-names-on', t.showNames);
            dots.innerHTML = '';
            t.points.forEach(p => {
                const dot = document.createElement('div');
                dot.className = 'hotspot-dot' + (t.region ? (inHotspotRegion(p, t.region) ? ' correct' : ' wrong') : '');
                dot.style.left = `${p.x * 100}%`;
                dot.style.top = `${p.y * 100}%`;
                const label = document.createElement('span');
                label.className = 'hotspot-dot-label';
                label.textContent = p.name;
                dot.appendChild(label);
                dot.addEventListener('click', () => dot.classList.toggle('show-label'));
                dots.appendChild(dot);
            });
            // 統計
            let stats = `已作答 ${t.total} 人`;
            if (t.region) {
                const correct = t.points.filter(p => inHotspotRegion(p, t.region)).length;
                stats += ` · 答對 ${correct} 人（${t.total ? Math.round(correct / t.total * 100) : 0}%）`;
            }
            hotspotEl('hotspot-stats').textContent = stats;
        }

        function setHotspotRegionMode(on) {
            hotspotTeacher.regionMode = on;
            hotspotEl('hotspot-teacher-stage').classList.toggle('region-drawing', on);
            hotspotEl('hotspot-region-btn').classList.toggle('on', on);
            hotspotEl('hotspot-region-hint').classList.toggle('hidden', !on);
            hotspotEl('hotspot-region-clear-btn').classList.toggle('hidden', !hotspotTeacher.region);
        }

        function hotspotStagePoint(e) {
            const r = hotspotEl('hotspot-teacher-img').getBoundingClientRect();
            return {
                x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
                y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
            };
        }

        /** 下載媒體（圖片點選題）：題目圖 + 熱點圖 + 每位學生的點（顯示姓名時附姓名）+ 正確區域，存成一張 PNG */
        /** 繪出結果圖：題目圖 + 熱點圖 + 每位學生的點（可附姓名）+ 正確區域；下載媒體與課堂歷程共用 */
        async function renderHotspotResult(imageUrl, points, region, showHeat, showNames) {
            const base = new Image();
            base.src = imageUrl;
            await base.decode();
            const scale = Math.max(1, 1200 / Math.max(base.naturalWidth, base.naturalHeight)); // 小圖放大一些，姓名才看得清楚
            const w = Math.round(base.naturalWidth * scale), h = Math.round(base.naturalHeight * scale);
            const out = document.createElement('canvas');
            out.width = w; out.height = h;
            const o = out.getContext('2d');
            o.drawImage(base, 0, 0, w, h);
            if (showHeat) drawHotspotHeat(o, w, h, points);
            if (region) {
                o.save();
                o.fillStyle = 'rgba(16,185,129,.12)';
                o.strokeStyle = '#10b981';
                o.lineWidth = 4;
                o.setLineDash([12, 8]);
                o.lineJoin = 'round';
                o.beginPath();
                region.forEach((p, i) => (i ? o.lineTo(p.x * w, p.y * h) : o.moveTo(p.x * w, p.y * h)));
                o.closePath();
                o.fill();
                o.stroke();
                o.restore();
            }
            o.font = 'bold 16px -apple-system, "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
            o.textAlign = 'center';
            points.forEach(p => {
                const x = p.x * w, y = p.y * h;
                o.beginPath();
                o.arc(x, y, 8, 0, Math.PI * 2);
                o.fillStyle = region ? (inHotspotRegion(p, region) ? '#10b981' : '#ef4444') : '#f43f5e';
                o.fill();
                o.lineWidth = 2.5;
                o.strokeStyle = '#fff';
                o.stroke();
                if (showNames) {
                    const tw = o.measureText(p.name).width + 12;
                    o.fillStyle = 'rgba(30,41,59,.78)';
                    o.fillRect(x - tw / 2, y + 12, tw, 22);
                    o.fillStyle = '#fff';
                    o.fillText(p.name, x, y + 29);
                }
            });
            return out;
        }

        /** 課堂歷程：為每一輪圖片點選題畫出熱點圖結果（含姓名與正確區域），回傳 Map(事件 → 圖片 dataURL) */
        async function buildHotspotHistoryImages(history) {
            const images = new Map();
            for (const event of history) {
                if (event.type !== 'interaction' || event.mode !== 'hotspot' || !event.details?.questionImage) continue;
                const points = Object.entries(event.responses || {})
                    .filter(([, r]) => r.point)
                    .map(([name, r]) => ({ name, x: r.point.x, y: r.point.y }));
                try {
                    const canvas = await renderHotspotResult(event.details.questionImage, points, event.details.region || null, true, true);
                    images.set(event, canvas.toDataURL('image/jpeg', 0.85));
                } catch (err) {
                    console.warn('歷程熱點圖繪製失敗:', err);
                }
            }
            return images;
        }

        /** 老師圈選或清除正確區域時，記到本輪的課堂歷程（歷程中據此判斷對錯） */
        function recordHotspotRegionInHistory() {
            if (!classroomCode) return;
            const historyKey = `classHistory_${classroomCode}`;
            const history = ClassHistoryStore.get(historyKey);
            for (let i = history.length - 1; i >= 0; i--) {
                if (history[i].type !== 'interaction') continue;
                if (history[i].mode === 'hotspot') {
                    history[i].details = { ...(history[i].details || {}), region: hotspotTeacher.region };
                    ClassHistoryStore.set(historyKey, history);
                }
                return;
            }
        }

        async function downloadHotspotImage(btn) {
            const t = hotspotTeacher;
            if (!t.image) return showMessage('沒有題目圖片可供下載。', 'info');
            btn.disabled = true;
            try {
                const out = await renderHotspotResult(t.image, t.points, t.region, t.showHeat, t.showNames);
                const blob = await new Promise(r => out.toBlob(r, 'image/png'));
                saveAs(blob, `圖片點選題_${new Date().toLocaleDateString('zh-TW')}.png`);
                showMessage('已下載全班點選位置圖。', 'success');
            } catch (error) {
                console.error('下載圖片點選題結果失敗:', error);
                showMessage('下載失敗，請再試一次。', 'error');
            } finally {
                btn.disabled = false;
            }
        }

        /**
         * 16 圖片點選題：事件監聽設定（由 modules/main/events.js 的 setupEventListeners() 呼叫）。
         */
        function setupHotspotEventListeners() {
            // --- 學生端 ---
            hotspotEl('hotspot-student-stage').addEventListener('click', placeHotspotMarker);
            hotspotEl('submit-hotspot-btn').addEventListener('click', submitHotspot);

            // --- 教師端 ---
            hotspotEl('hotspot-heat-toggle').addEventListener('click', (e) => {
                hotspotTeacher.showHeat = !hotspotTeacher.showHeat;
                e.currentTarget.classList.toggle('on', hotspotTeacher.showHeat);
                renderHotspotTeacher();
            });
            hotspotEl('hotspot-names-toggle').addEventListener('click', (e) => {
                hotspotTeacher.showNames = !hotspotTeacher.showNames;
                e.currentTarget.classList.toggle('on', hotspotTeacher.showNames);
                renderHotspotTeacher();
            });
            hotspotEl('hotspot-region-btn').addEventListener('click', () => setHotspotRegionMode(!hotspotTeacher.regionMode));
            hotspotEl('hotspot-region-clear-btn').addEventListener('click', () => {
                hotspotTeacher.region = null;
                recordHotspotRegionInHistory();
                setHotspotRegionMode(false);
                renderHotspotTeacher();
            });

            // 按住拖曳，不規則圈選正確區域（放開後自動封閉）
            const stage = hotspotEl('hotspot-teacher-stage');
            stage.addEventListener('pointerdown', (e) => {
                if (!hotspotTeacher.regionMode) return;
                e.preventDefault();
                try { stage.setPointerCapture(e.pointerId); } catch (err) { }
                hotspotTeacher.drawing = [hotspotStagePoint(e)];
                renderHotspotTeacher();
            });
            stage.addEventListener('pointermove', (e) => {
                const path = hotspotTeacher.drawing;
                if (!path) return;
                const p = hotspotStagePoint(e), last = path[path.length - 1];
                if (Math.hypot(p.x - last.x, p.y - last.y) < 0.004) return; // 過密的點略過
                path.push({ x: Math.round(p.x * 10000) / 10000, y: Math.round(p.y * 10000) / 10000 });
                renderHotspotTeacher();
            });
            const endDrag = () => {
                const path = hotspotTeacher.drawing;
                if (!path) return;
                hotspotTeacher.drawing = null;
                // 太小（只點一下或幾乎沒圈）視為取消，保留原本的區域
                if (path.length >= 3 && hotspotRegionArea(path) >= 0.0005) {
                    hotspotTeacher.region = path;
                    recordHotspotRegionInHistory();
                }
                setHotspotRegionMode(false);
                renderHotspotTeacher();
            };
            stage.addEventListener('pointerup', endDrag);
            stage.addEventListener('pointercancel', endDrag);

            const teacherImg = hotspotEl('hotspot-teacher-img');
            teacherImg.addEventListener('load', renderHotspotTeacher);
            new ResizeObserver(() => { if (currentInteractionMode === 'hotspot') renderHotspotTeacher(); }).observe(teacherImg);
        }
