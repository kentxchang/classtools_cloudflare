        // =====================================================================
        // 【17 Live Quiz 即時答題競賽】 modules/17-live-quiz/live-quiz.js
        // 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
        // public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
        //
        // 資料（皆在 classrooms/{教室代碼}/ 底下）：
        //   liveQuiz/state           教師寫入的競賽狀態（階段、題目、計時、揭曉結果），學生只讀
        //   liveQuizPlayers/{uid}    學生進入準備室時寫入（姓名、自選掛件）
        //   liveQuizAnswers/{uid}    學生作答（每人一份，換題時覆蓋）
        //   liveQuizReactions/{uid}  學生在準備室發射的愛心/拍手
        // 計分、作答耗時都由教師端計算（以教師收到作答的時間為準，暫停時間不計），避免學生裝置時鐘誤差。
        // =====================================================================

        const LQ_SHAPES = ['●', '▲', '■', '★'];
        const LQ_COLORS = ['pink', 'sky', 'lemon', 'mint'];
        const LQ_AVATARS = ['🐰', '🐻', '🐱', '🐶', '🦊', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐧', '🐤', '🦄', '🐹', '🐮'];
        const LQ_ACCS = [['', '不戴'], ['👑', '小皇冠'], ['👓', '眼鏡'], ['🐾', '貓掌'], ['🎀', '蝴蝶結'], ['🌸', '小花']];
        const LQ_TEAMS = [['🍓', '草莓隊'], ['🫐', '藍莓隊'], ['🍋', '檸檬隊'], ['🍈', '哈密瓜隊'], ['🍇', '葡萄隊'], ['🍑', '水蜜桃隊']];
        const LQ_REACTS = ['❤️', '👏', '🎉', '😆'];
        const LQ_PRAISE = ['太棒了！', '答對囉！', '好厲害！', '完全正確！'];
        const LQ_CHEER = ['再接再厲！', '下次一定行！', '沒關係，繼續加油！'];
        const LQ_MODES = { classic: '經典個人競速賽', mastery: '精熟練習模式', team: '分組對抗賽' };
        const LQ_DEFAULT_CFG = { mode: 'classic', limit: 20, streak: true, sound: true, theme: 'happy', display: 'symbol', privacy: true, teamCount: 4, range: 'all', count: 10, shuffleQ: false, shuffleOpt: false };

        // lq：本模組的執行狀態（教師端與學生端共用同一個物件，依 role 使用不同欄位）
        const lq = {
            role: null, open: false, unsubs: [], S: null,
            // 教師端
            cfg: null, questions: [], players: new Map(), roster: new Map(), answers: new Map(), qStats: [],
            prevRanks: new Map(), reactSeen: new Map(), bubbled: new Set(), showNames: false, saved: false,
            timer: { limit: 0, remain: 0, elapsed: 0, running: false, last: 0, lastSec: null }, tickIv: null, autoRevealT: null, podiumTs: [],
            // 學生端
            me: { acc: '', key: '', chosen: null, deadline: 0, remain: 0, cdIv: null, lastReact: 0 }
        };

        const lqE = s => escapeHtml(String(s ?? ''));
        const lqRef = (...seg) => doc(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, ...seg);
        const lqCol = name => collection(db, 'artifacts', baseAppId, 'public', 'data', 'classrooms', classroomCode, name);
        function lqAvatar(uid) {
            let h = 0;
            for (const ch of String(uid)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
            return LQ_AVATARS[h % LQ_AVATARS.length];
        }
        function lqAvaHtml(uid, acc, cls = '') {
            return `<span class="lq-ava ${cls}">${lqAvatar(uid)}${acc ? `<span class="lq-acc">${lqE(acc)}</span>` : ''}</span>`;
        }
        function lqShuffle(a) {
            for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
            return a;
        }
        const lqFmt = n => Number(n || 0).toLocaleString('en-US');

        // ---------------- 音效與背景音樂（Web Audio 合成，不需音檔） ----------------
        const LQSound = {
            ctx: null, on: true, bgmIv: null,
            _ac() {
                if (!this.ctx) {
                    const AC = window.AudioContext || window.webkitAudioContext;
                    if (!AC) return null;
                    this.ctx = new AC();
                }
                if (this.ctx.state === 'suspended') this.ctx.resume();
                return this.ctx;
            },
            tone(freq, start, dur, type = 'sine', vol = 0.15) {
                const ac = this._ac();
                if (!ac) return;
                const t = ac.currentTime + start;
                const o = ac.createOscillator(), g = ac.createGain();
                o.type = type; o.frequency.value = freq;
                g.gain.setValueAtTime(0.0001, t);
                g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
                o.connect(g).connect(ac.destination);
                o.start(t); o.stop(t + dur + 0.05);
            },
            play(name) {
                if (!this.on) return;
                const T = (...a) => this.tone(...a);
                switch (name) {
                    case 'click': T(880, 0, 0.08, 'triangle', 0.12); T(1320, 0.05, 0.08, 'triangle', 0.08); break;
                    case 'pop': T(620, 0, 0.1, 'sine', 0.12); T(930, 0.04, 0.1, 'sine', 0.08); break;
                    case 'tick': T(1200, 0, 0.05, 'square', 0.05); break;
                    case 'reveal': [392, 523, 659].forEach((f, i) => T(f, i * 0.06, 0.3, 'sine', 0.12)); break;
                    case 'correct': [523, 659, 784, 1047].forEach((f, i) => T(f, i * 0.09, 0.25, 'triangle', 0.14)); break;
                    case 'wrong': T(392, 0, 0.25, 'sine', 0.1); T(330, 0.18, 0.35, 'sine', 0.08); break;
                    case 'drum': T(140, 0, 0.18, 'sine', 0.3); T(90, 0.02, 0.2, 'sine', 0.2); break;
                    case 'fanfare': [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => T(f, i * 0.14, 0.3, 'triangle', 0.15)); break;
                }
            },
            // 三種背景音樂主題：歡樂 / 緊張 / 輕快（八分音符旋律 + 每小節低音）
            BGM: {
                happy: { bpm: 132, mel: [523, 659, 784, 659, 587, 698, 880, 698, 523, 659, 784, 1047, 784, 659, 587, 0], bass: [131, 147, 131, 196] },
                tense: { bpm: 150, mel: [440, 0, 440, 523, 440, 0, 415, 0, 440, 0, 440, 587, 523, 0, 494, 0], bass: [110, 110, 104, 104] },
                light: { bpm: 112, mel: [698, 880, 1047, 880, 784, 659, 698, 0, 587, 698, 880, 698, 659, 523, 587, 0], bass: [175, 147, 131, 175] }
            },
            startBgm(theme) {
                this.stopBgm();
                if (!this.on) return;
                const m = this.BGM[theme] || this.BGM.happy;
                const step = 60 / m.bpm / 2;
                let i = 0;
                this.bgmIv = setInterval(() => {
                    const n = m.mel[i % m.mel.length];
                    if (n) this.tone(n, 0, step * 0.9, 'triangle', 0.035);
                    if (i % 4 === 0) this.tone(m.bass[(i / 4) % m.bass.length], 0, step * 3.5, 'sine', 0.05);
                    i++;
                }, step * 1000);
            },
            stopBgm() { clearInterval(this.bgmIv); this.bgmIv = null; }
        };

        // ---------------- 共用：開啟/關閉圖層、特效 ----------------
        function lqShowOverlay(role) {
            const ov = document.getElementById('lq-overlay');
            ov.className = 'lq-' + role;
            document.body.classList.add('lq-lock');
        }
        function lqToast(msg) {
            const el = document.createElement('div');
            el.className = 'lq-toast';
            el.textContent = msg;
            document.getElementById('lq-fx').appendChild(el);
            setTimeout(() => el.remove(), 2600);
        }
        function lqFloat(emoji, label = '') {
            const el = document.createElement('div');
            el.className = 'lq-float';
            el.style.left = (8 + Math.random() * 84) + '%';
            el.innerHTML = `${lqE(emoji)}${label ? `<small>${lqE(label)}</small>` : ''}`;
            document.getElementById('lq-fx').appendChild(el);
            setTimeout(() => el.remove(), 3200);
        }
        function lqConfetti() {
            const fx = document.getElementById('lq-fx');
            const colors = ['#ffc8dd', '#bde0fe', '#ffe9a6', '#bcebd4', '#d9c9f8', '#ffd3b5'];
            for (let i = 0; i < 140; i++) {
                const c = document.createElement('i');
                c.className = 'lq-confetti';
                c.style.left = Math.random() * 100 + '%';
                c.style.background = colors[i % colors.length];
                c.style.animationDelay = (Math.random() * 1.8) + 's';
                c.style.animationDuration = (2.8 + Math.random() * 2.4) + 's';
                c.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
                fx.appendChild(c);
                setTimeout(() => c.remove(), 7500);
            }
        }
        function lqTeardown() {
            lq.unsubs.forEach(u => { try { u(); } catch (e) { } });
            lq.unsubs = [];
            clearInterval(lq.tickIv); lq.tickIv = null;
            clearTimeout(lq.autoRevealT);
            lq.podiumTs.forEach(clearTimeout); lq.podiumTs = [];
            clearInterval(lq.me.cdIv); lq.me.cdIv = null;
            LQSound.stopBgm();
            lq.open = false; lq.role = null; lq.S = null;
            document.getElementById('lq-overlay').className = 'hidden';
            document.getElementById('lq-root').innerHTML = '';
            document.getElementById('lq-fx').innerHTML = '';
            document.body.classList.remove('lq-lock');
        }

        // =====================================================================
        // 教師端（主控 / 大屏展示）
        // =====================================================================
        function lqLoadCfg() {
            try { return { ...LQ_DEFAULT_CFG, ...JSON.parse(localStorage.getItem('liveQuizCfg') || '{}') }; }
            catch (e) { return { ...LQ_DEFAULT_CFG }; }
        }
        // 可選題庫：本教室的選擇題題庫 + 跨課堂本地題庫（同名以本教室為準）
        function lqBanks() {
            loadQuestionBanksFromStorage();
            const list = [...questionBanks];
            readGlobalBanks('questionBanks_global').forEach(b => { if (!list.some(x => x.name === b.name)) list.push(b); });
            return list.map(b => ({ name: b.name, qs: parseCustomQuestions(b.content || '') || [] })).filter(b => b.qs.length);
        }
        const lqPush = () => setDoc(lqRef('liveQuiz', 'state'), lq.S).catch(e => console.error('[LiveQuiz] 寫入狀態失敗:', e));
        const lqControl = mode => setDoc(lqRef('settings', 'control'), { active_mode: mode }, { merge: true });
        const lqActiveIds = () => [...lq.players.keys()].filter(id => lq.roster.size === 0 || lq.roster.has(id));
        function lqRanking() {
            return [...lq.players.entries()].map(([id, p]) => ({ id, ...p }))
                .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'zh-Hant'));
        }

        async function lqOpenTeacher() {
            if (!classroomCode) { showMessage('請先進入教室再使用此功能', 'error'); return; }
            if (lq.open) return;
            lq.role = 'teacher'; lq.open = true;
            lq.cfg = lqLoadCfg();
            lq.banks = lqBanks();
            lq.players = new Map(); lq.roster = new Map(); lq.answers = new Map(); lq.reactSeen = new Map();
            lq.bubbled = new Set(); lq.bubbledSound = null; lq.qStats = []; lq.questions = []; lq.showNames = false; lq.saved = false;
            lq.S = { sid: String(Date.now()), phase: 'lobby', cfg: lq.cfg, teams: {}, total: 0, qi: -1, att: 0, q: null, timer: null, reveal: null, res: null, podium: null };
            LQSound.on = lq.cfg.sound;
            lqShowOverlay('teacher');
            lqRenderTeacher();
            try {
                await Promise.all(['liveQuizAnswers', 'liveQuizPlayers', 'liveQuizReactions'].map(n => deleteTree(lqCol(n))));
                await lqPush();
                currentInteractionMode = 'live_quiz';
                await lqControl('live_quiz');
            } catch (e) {
                console.error('[LiveQuiz] 啟動失敗:', e);
                lqToast('啟動失敗，請檢查網路連線');
            }
            lq.unsubs.push(onSnapshot(lqCol('presence'), snap => {
                lq.roster = new Map();
                snap.forEach(d => lq.roster.set(d.id, d.data().name || '同學'));
                lqOnRosterChange();
            }));
            lq.unsubs.push(onSnapshot(lqCol('liveQuizPlayers'), snap => {
                snap.forEach(d => lqEnsurePlayer(d.id, d.data().name, d.data().acc));
                lqOnRosterChange();
            }));
            lq.unsubs.push(onSnapshot(lqCol('liveQuizAnswers'), lqOnAnswers));
            lq.unsubs.push(onSnapshot(lqCol('liveQuizReactions'), snap => {
                snap.forEach(d => {
                    const r = d.data();
                    if (lq.reactSeen.get(d.id) === r.t) return;
                    lq.reactSeen.set(d.id, r.t);
                    if (lq.S && lq.S.phase === 'lobby') lqFloat(r.e, lq.players.get(d.id)?.name);
                });
            }));
            lq.tickIv = setInterval(lqTick, 100);
            LQSound.startBgm(lq.cfg.theme);
        }

        function lqEnsurePlayer(id, name, acc) {
            let p = lq.players.get(id);
            if (!p) {
                p = { name: name || '同學', acc: acc || '', score: 0, streak: 0, wrongRun: 0, correct: 0, answered: 0, totalMs: 0, hist: [] };
                lq.players.set(id, p);
                if (lq.S.cfg.mode === 'team' && lq.S.teams[id] === undefined) lqAssignTeam(id);
            } else {
                if (name) p.name = name;
                if (acc !== undefined) p.acc = acc;
            }
            return p;
        }
        // 新加入者分到人數最少的隊伍
        function lqAssignTeam(id) {
            const n = lq.S.cfg.teamCount;
            const sizes = Array(n).fill(0);
            Object.values(lq.S.teams).forEach(t => { if (t < n) sizes[t]++; });
            lq.S.teams[id] = sizes.indexOf(Math.min(...sizes));
        }
        // 全部重新隨機平均分組
        function lqReshuffleTeams() {
            lq.S.teams = {};
            lqShuffle(lqActiveIds()).forEach((id, i) => { lq.S.teams[id] = i % lq.S.cfg.teamCount; });
        }

        let lqRosterPushT = null;
        function lqOnRosterChange() {
            if (!lq.S) return;
            if (lq.S.phase === 'lobby') {
                lqRenderLobbyRoom();
                // 分組有新成員時同步給學生（合併短時間內的多次變動）
                if (lq.S.cfg.mode === 'team') { clearTimeout(lqRosterPushT); lqRosterPushT = setTimeout(lqPush, 400); }
            } else if (lq.S.phase === 'question') {
                lqUpdateAnswered();
            }
        }

        function lqOnAnswers(snap) {
            const S = lq.S;
            if (!S || S.phase !== 'question') return;
            let changed = false;
            snap.forEach(d => {
                const a = d.data();
                if (a.sid !== S.sid || a.qi !== S.qi || a.att !== S.att || lq.answers.has(d.id)) return;
                if (!(a.c >= 0 && a.c < 4)) return;
                lqEnsurePlayer(d.id, a.name);
                lq.answers.set(d.id, { c: a.c, ms: Math.round(lq.timer.elapsed) });
                changed = true;
            });
            if (changed) lqUpdateAnswered();
        }

        function lqUpdateAnswered() {
            const n = lq.answers.size, total = lqActiveIds().length;
            const a = document.getElementById('lq-ans-n'), t = document.getElementById('lq-ans-total');
            if (a) a.textContent = n;
            if (t) t.textContent = total;
            // 全員完成自動提早開牌
            clearTimeout(lq.autoRevealT);
            if (total > 0 && n >= total) lq.autoRevealT = setTimeout(lqReveal, 700);
        }

        function lqTick() {
            const t = lq.timer, now = performance.now();
            if (t.running) {
                t.elapsed += now - t.last;
                if (t.limit) t.remain = Math.max(0, t.limit - t.elapsed);
            }
            t.last = now;
            if (!lq.S || lq.S.phase !== 'question') return;
            const ring = document.getElementById('lq-ring');
            if (ring) {
                const num = document.getElementById('lq-ring-num');
                if (t.limit) {
                    const sec = Math.ceil(t.remain / 1000);
                    num.textContent = sec;
                    ring.querySelector('.lq-ring-fg').style.strokeDashoffset = (339.3 * (1 - t.remain / t.limit)).toFixed(1);
                    ring.classList.toggle('lq-warn', t.remain <= 5000);
                    if (t.running && sec <= 5 && sec > 0 && sec !== t.lastSec) LQSound.play('tick');
                    t.lastSec = sec;
                } else {
                    num.textContent = Math.floor(t.elapsed / 1000);
                }
                ring.classList.toggle('lq-paused', !t.running);
            }
            if (t.limit && t.running && t.remain <= 0) lqReveal();
        }

        function lqReadSettings() {
            const v = id => document.getElementById(id);
            if (!v('lq-bank')) return;
            const c = lq.cfg;
            c.bank = v('lq-bank').value;
            c.range = document.querySelector('input[name="lq-range"]:checked').value;
            c.count = Math.max(1, parseInt(v('lq-count').value) || 10);
            c.shuffleQ = v('lq-shuffle-q').checked;
            c.shuffleOpt = v('lq-shuffle-opt').checked;
            c.mode = document.querySelector('input[name="lq-mode"]:checked').value;
            c.teamCount = parseInt(v('lq-team-count').value) || 4;
            c.limit = parseInt(v('lq-limit').value);
            c.streak = v('lq-streak').checked;
            c.display = v('lq-display').checked ? 'full' : 'symbol';
            c.privacy = v('lq-privacy').checked;
            c.sound = v('lq-sound').checked;
            c.theme = v('lq-theme').value;
            try { localStorage.setItem('liveQuizCfg', JSON.stringify(c)); } catch (e) { }
        }

        function lqOnSettingsChange(e) {
            const prevMode = lq.S.cfg.mode, prevTeams = lq.S.cfg.teamCount, prevSound = lq.cfg.sound, prevTheme = lq.cfg.theme;
            lqReadSettings();
            lq.S.cfg = { ...lq.cfg };
            if (lq.cfg.mode === 'team' && (prevMode !== 'team' || prevTeams !== lq.cfg.teamCount)) lqReshuffleTeams();
            if (prevSound !== lq.cfg.sound || prevTheme !== lq.cfg.theme) {
                LQSound.on = lq.cfg.sound;
                LQSound.startBgm(lq.cfg.theme);
                lqRenderBar();
            }
            lqRenderSettings();
            lqRenderLobbyRoom();
            lqPush();
        }

        // 依設定組出本場題目（可隨機抽題、打亂題序與選項順序）
        function lqBuildQuestions() {
            const bank = lq.banks.find(b => b.name === lq.cfg.bank) || lq.banks[0];
            if (!bank) return null;
            let qs = bank.qs.map(q => ({ text: q.questionText, options: q.options.slice(), correct: Number(q.correctAnswer) - 1 }));
            if (lq.cfg.range === 'random') qs = lqShuffle(qs).slice(0, Math.min(lq.cfg.count, qs.length));
            else if (lq.cfg.shuffleQ) lqShuffle(qs);
            if (lq.cfg.shuffleOpt) {
                qs.forEach(q => {
                    const order = lqShuffle([0, 1, 2, 3]);
                    q.options = order.map(i => q.options[i]);
                    q.correct = order.indexOf(q.correct);
                });
            }
            return { name: bank.name, qs };
        }

        function lqStartGame() {
            lqReadSettings();
            const built = lqBuildQuestions();
            if (!built) { lqToast('沒有可用的選擇題題庫'); return; }
            if (lqActiveIds().length === 0) { lqToast('還沒有同學進入準備室'); return; }
            lq.questions = built.qs; lq.bankName = built.name;
            lq.qStats = []; lq.saved = false;
            lq.players.forEach(p => Object.assign(p, { score: 0, streak: 0, wrongRun: 0, correct: 0, answered: 0, totalMs: 0, hist: [] }));
            lq.S.cfg = { ...lq.cfg };
            lq.S.total = lq.questions.length;
            if (lq.cfg.mode === 'team') lqActiveIds().forEach(id => { if (lq.S.teams[id] === undefined) lqAssignTeam(id); });
            LQSound.on = lq.cfg.sound;
            lqGoQuestion(0);
        }

        function lqGoQuestion(i) {
            const q = lq.questions[i], S = lq.S;
            clearTimeout(lq.autoRevealT);
            lq.answers = new Map();
            S.phase = 'question'; S.qi = i; S.att = (S.att || 0) + 1;
            S.q = { text: q.text, options: q.options };
            S.reveal = null; S.res = null;
            const limit = S.cfg.mode === 'mastery' ? 0 : (S.cfg.limit || 0) * 1000; // 精熟模式與「教師手動」不倒數
            Object.assign(lq.timer, { limit, remain: limit, elapsed: 0, running: true, last: performance.now(), lastSec: null });
            S.timer = { running: true, remainMs: limit, limitMs: limit };
            lqPush();
            lqRenderTeacher();
            LQSound.startBgm(S.cfg.theme);
        }

        function lqTogglePause() {
            const t = lq.timer;
            t.running = !t.running;
            t.last = performance.now();
            lq.S.timer = { running: t.running, remainMs: Math.round(t.remain), limitMs: t.limit };
            lqPush();
            if (t.running) LQSound.startBgm(lq.S.cfg.theme); else LQSound.stopBgm();
            const btn = document.getElementById('lq-pause-btn');
            if (btn) btn.innerHTML = t.running ? '⏸ 暫停時間' : '▶ 繼續作答';
        }

        function lqReveal() {
            const S = lq.S;
            if (!S || S.phase !== 'question') return;
            clearTimeout(lq.autoRevealT);
            lq.timer.running = false;
            LQSound.stopBgm();
            LQSound.play('reveal');
            const q = lq.questions[S.qi], mastery = S.cfg.mode === 'mastery';
            const refMs = lq.timer.limit || 30000; // 教師手動倒數時，以 30 秒為速度加成基準
            lq.prevRanks = new Map(lqRanking().map((p, i) => [p.id, i + 1]));
            const counts = [0, 0, 0, 0];
            lq.answers.forEach(a => counts[a.c]++);
            const res = {};
            lq.players.forEach((p, id) => {
                const a = lq.answers.get(id);
                if (!a && !lqActiveIds().includes(id)) return; // 已離線且未作答者不計
                const ok = !!a && a.c === q.correct;
                let base = 0, speed = 0, sb = 0, cbPts = 0, cb = false;
                if (ok) {
                    base = 1000;
                    p.streak++;
                    cb = p.wrongRun >= 2; // 無壓補償：連錯 2 題後答對 → 逆轉起飛
                    if (!mastery) {
                        speed = Math.round(500 * Math.max(0, 1 - a.ms / refMs));
                        if (S.cfg.streak && p.streak >= 2) sb = Math.min(100 * (p.streak - 1), 500);
                        if (cb) cbPts = 300;
                    }
                    p.wrongRun = 0; p.correct++;
                } else {
                    p.streak = 0; p.wrongRun++;
                }
                if (a) { p.answered++; p.totalMs += a.ms; }
                const gain = base + speed + sb + cbPts;
                p.score += gain;
                p.hist[S.qi] = { c: a ? a.c : null, ok, ms: a ? a.ms : null };
                res[id] = { ok, ans: a ? a.c : null, base, speed, sb, cb, cbPts, gain, streak: p.streak };
            });
            const ranking = lqRanking();
            ranking.forEach((p, i) => {
                const r = res[p.id];
                if (!r) return;
                Object.assign(r, { score: p.score, rank: i + 1, n: ranking.length, gap: i > 0 ? ranking[i - 1].score - p.score : 0 });
            });
            const okN = Object.values(res).filter(r => r.ok).length;
            lq.qStats[S.qi] = { text: q.text, options: q.options, correct: q.correct, counts, ok: okN, n: Object.keys(res).length };
            S.phase = 'reveal';
            S.reveal = { correct: q.correct, counts };
            S.res = res;
            lqPush();
            lqRenderTeacher();
        }

        function lqTeamScores() {
            const n = lq.S.cfg.teamCount;
            const teams = Array.from({ length: n }, (_, i) => ({ i, icon: LQ_TEAMS[i][0], name: LQ_TEAMS[i][1], score: 0, members: 0 }));
            lq.players.forEach((p, id) => {
                const t = lq.S.teams[id];
                if (t === undefined || !teams[t]) return;
                teams[t].score += p.score; teams[t].members++;
            });
            return teams.sort((a, b) => b.score - a.score);
        }

        function lqPodium() {
            const S = lq.S, ranking = lqRanking(), total = lq.questions.length;
            S.phase = 'podium';
            S.podium = { top: ranking.slice(0, 3).map(p => ({ id: p.id, name: p.name, acc: p.acc, score: p.score })) };
            S.res = {};
            ranking.forEach((p, i) => { S.res[p.id] = { rank: i + 1, n: ranking.length, score: p.score, correct: p.correct, total }; });
            if (S.cfg.mode === 'team') S.podium.teams = lqTeamScores().map(t => ({ icon: t.icon, name: t.name, score: t.score }));
            lqPush();
            lqRenderTeacher();
        }

        // 即時課堂洞察：最難的 3 題、需關懷名單
        function lqInsights() {
            const total = lq.questions.length;
            const hardest = lq.qStats.map((s, i) => ({ ...s, i, rate: s.n ? s.ok / s.n : 0 }))
                .sort((a, b) => a.rate - b.rate).slice(0, 3);
            const players = lqRanking();
            const avgs = players.filter(p => p.answered).map(p => p.totalMs / p.answered).sort((a, b) => a - b);
            const median = avgs.length ? avgs[Math.floor(avgs.length / 2)] : 0;
            const care = [];
            players.forEach(p => {
                const acc = total ? p.correct / total : 0;
                const reasons = [];
                if (acc < 0.5) reasons.push(`答對率 ${Math.round(acc * 100)}%`);
                if (total - p.answered >= Math.ceil(total / 2)) reasons.push(`${total - p.answered} 題未作答`);
                if (p.answered && median && p.totalMs / p.answered < median * 0.35 && acc < 0.6) reasons.push('作答過快，可能猜題');
                if (reasons.length) care.push({ name: p.name, reasons });
            });
            const avgAcc = players.length && total ? players.reduce((s, p) => s + p.correct, 0) / (players.length * total) : 0;
            return { hardest, care, avgAcc };
        }

        // 一鍵回存至課堂歷程（教師面板「歷程 💾」可下載）
        function lqSaveHistory() {
            if (lq.saved) { lqToast('本場成績已回存過了'); return; }
            const total = lq.questions.length;
            logClassroomHistory('interaction', `Live Quiz 即時答題（${LQ_MODES[lq.S.cfg.mode]}）`, {
                questions: lq.questions.map(q => ({ questionText: q.text, options: q.options, correctAnswer: String(q.correct + 1) }))
            }, 'live_quiz');
            const history = ClassHistoryStore.get(`classHistory_${classroomCode}`);
            const ev = history[history.length - 1];
            const now = new Date().toLocaleString('zh-TW');
            ev.responses = {};
            lqRanking().forEach((p, i) => {
                const marks = lq.questions.map((_, qi) => `Q${qi + 1}${p.hist[qi] ? (p.hist[qi].ok ? '✅' : (p.hist[qi].c === null ? '—' : '❌')) : '—'}`).join(' ');
                const team = lq.S.cfg.mode === 'team' && lq.S.teams[p.id] !== undefined ? `｜${LQ_TEAMS[lq.S.teams[p.id]][1]}` : '';
                ev.responses[p.name] = { answer: `第 ${i + 1} 名｜總分 ${lqFmt(p.score)}｜答對 ${p.correct}/${total}${team}\n${marks}`, isCorrect: null, timestamp: now };
            });
            ClassHistoryStore.set(`classHistory_${classroomCode}`, history);
            lq.saved = true;
            lqToast('✅ 已回存至課堂歷程');
            const btn = document.getElementById('lq-save-btn');
            if (btn) { btn.disabled = true; btn.textContent = '✅ 已回存課堂歷程'; }
        }

        async function lqCloseTeacher() {
            const S = lq.S;
            if (S && (S.phase === 'question' || S.phase === 'reveal' || S.phase === 'leaderboard')) {
                if (!(await customConfirm('競賽尚未結束，確定要離開 Live Quiz 嗎？'))) return;
            }
            const sid = S && S.sid;
            lqTeardown();
            currentInteractionMode = 'waiting';
            try {
                await setDoc(lqRef('liveQuiz', 'state'), { sid, phase: 'closed' });
                await lqControl('waiting');
            } catch (e) { console.error('[LiveQuiz] 關閉失敗:', e); }
        }

        function lqTeacherAction(act, el) {
            switch (act) {
                case 'close': lqCloseTeacher(); break;
                case 'names': lq.showNames = !lq.showNames; lqRenderBar(); if (lq.S.phase === 'reveal' || lq.S.phase === 'podium') lqRenderTeacher(); break;
                case 'sound':
                    lq.cfg.sound = !lq.cfg.sound; lq.S.cfg.sound = lq.cfg.sound; LQSound.on = lq.cfg.sound;
                    try { localStorage.setItem('liveQuizCfg', JSON.stringify(lq.cfg)); } catch (e) { }
                    if (lq.cfg.sound && (lq.S.phase === 'lobby' || (lq.S.phase === 'question' && lq.timer.running))) LQSound.startBgm(lq.cfg.theme); else LQSound.stopBgm();
                    if (document.getElementById('lq-sound')) document.getElementById('lq-sound').checked = lq.cfg.sound;
                    lqRenderBar(); lqPush(); break;
                case 'reshuffle': lqReshuffleTeams(); lqRenderLobbyRoom(); lqPush(); break;
                case 'start': lqStartGame(); break;
                case 'pause': lqTogglePause(); break;
                case 'end-q': lqReveal(); break;
                case 'reset-q': lqGoQuestion(lq.S.qi); lqToast('↺ 已重置本題，同學請重新作答'); break;
                case 'board': lq.S.phase = 'leaderboard'; lqPush(); lqRenderTeacher(); break;
                case 'next':
                    if (lq.S.qi + 1 < lq.questions.length) lqGoQuestion(lq.S.qi + 1); else lqPodium();
                    break;
                case 'save': lqSaveHistory(); break;
                case 'again':
                    lq.S.phase = 'lobby'; lq.S.qi = -1; lq.S.q = null; lq.S.res = null; lq.S.podium = null;
                    lq.players.forEach(p => Object.assign(p, { score: 0, streak: 0, wrongRun: 0, correct: 0, answered: 0, totalMs: 0, hist: [] }));
                    lq.bubbled = new Set();
                    lqPush(); lqRenderTeacher(); LQSound.startBgm(lq.cfg.theme); break;
            }
        }

        // ---------------- 教師端畫面 ----------------
        function lqRenderTeacher() {
            const root = document.getElementById('lq-root');
            if (!root.querySelector('#lq-stage')) {
                root.innerHTML = '<div class="lq-bar" id="lq-bar"></div><div class="lq-stage" id="lq-stage"></div>';
                root.onclick = e => {
                    const b = e.target.closest('[data-act]');
                    if (b && !b.disabled) lqTeacherAction(b.dataset.act, b);
                };
            }
            lqRenderBar();
            lq.podiumTs.forEach(clearTimeout); lq.podiumTs = [];
            const stage = document.getElementById('lq-stage');
            stage.className = 'lq-stage lq-phase-' + lq.S.phase;
            switch (lq.S.phase) {
                case 'lobby': lqRenderLobby(stage); break;
                case 'question': lqRenderQuestion(stage); break;
                case 'reveal': lqRenderReveal(stage); break;
                case 'leaderboard': lqRenderBoard(stage); break;
                case 'podium': lqRenderPodium(stage); break;
            }
        }

        function lqRenderBar() {
            const S = lq.S, bar = document.getElementById('lq-bar');
            if (!bar) return;
            const info = S.phase === 'lobby' ? '遊戲準備室' : `${LQ_MODES[S.cfg.mode]}${lq.bankName ? '．' + lqE(lq.bankName) : ''}`;
            bar.innerHTML = `
                <div class="lq-brand">🎮 Live Quiz <span>即時答題競賽</span></div>
                <div class="lq-bar-info">${info}</div>
                <button class="lq-iconbtn ${lq.showNames ? 'on' : ''}" data-act="names" title="教師檢視：顯示／隱藏個別學生名單（隱私模式下大螢幕預設只顯示人數）">👁 ${lq.showNames ? '隱藏名單' : '顯示名單'}</button>
                <button class="lq-iconbtn" data-act="sound" title="音樂與音效">${lq.cfg.sound ? '🔊' : '🔇'}</button>
                <button class="lq-iconbtn lq-close" data-act="close">✕ 離開</button>`;
        }

        function lqRenderLobby(stage) {
            stage.innerHTML = `
                <div class="lq-lobby">
                    <section class="lq-card lq-settings" id="lq-settings"></section>
                    <section class="lq-card lq-room">
                        <div class="lq-room-head">
                            <h2>🎈 同學進場中…</h2>
                            <div class="lq-count"><b id="lq-joined">0</b> 人已進入 ／ <b id="lq-online">0</b> 人在線</div>
                        </div>
                        <div id="lq-bubbles" class="lq-bubbles"></div>
                        <div class="lq-room-foot">
                            <span class="lq-hint" id="lq-room-hint"></span>
                            <button class="lq-btn lq-btn-go" data-act="start">🚀 開始答題</button>
                        </div>
                    </section>
                </div>`;
            lqRenderSettings();
            lqRenderLobbyRoom();
        }

        function lqRenderSettings() {
            const box = document.getElementById('lq-settings');
            if (!box) return;
            const c = lq.cfg, banks = lq.banks;
            const sel = banks.find(b => b.name === c.bank) || banks[0];
            const chk = (id, on, label) => `<label class="lq-switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><i></i><span>${label}</span></label>`;
            const modeCard = (v, icon, title, desc) => `<label class="lq-mode ${c.mode === v ? 'on' : ''}"><input type="radio" name="lq-mode" value="${v}" ${c.mode === v ? 'checked' : ''}><b>${icon} ${title}</b><small>${desc}</small></label>`;
            box.innerHTML = `
                <h3>⚙️ 競賽設定</h3>
                ${banks.length ? '' : '<p class="lq-warnbox">尚無選擇題題庫。請先到「選擇/排序/配對」建立並儲存選擇題題庫。</p>'}
                <label class="lq-field"><span>📚 題庫</span>
                    <select id="lq-bank">${banks.map(b => `<option value="${lqE(b.name)}" ${sel && b.name === sel.name ? 'selected' : ''}>${lqE(b.name)}（${b.qs.length} 題）</option>`).join('')}</select></label>
                <div class="lq-field"><span>🎯 出題範圍</span>
                    <div class="lq-inline">
                        <label><input type="radio" name="lq-range" value="all" ${c.range !== 'random' ? 'checked' : ''}> 全部出題</label>
                        <label><input type="radio" name="lq-range" value="random" ${c.range === 'random' ? 'checked' : ''}> 隨機抽選 <input type="number" id="lq-count" min="1" max="${sel ? sel.qs.length : 99}" value="${c.count}" class="lq-num"> 題</label>
                    </div>
                    <div class="lq-inline">
                        ${chk('lq-shuffle-q', c.shuffleQ, '打亂題序')}
                        ${chk('lq-shuffle-opt', c.shuffleOpt, '打亂選項順序')}
                    </div>
                </div>
                <div class="lq-field"><span>🏁 遊戲模式</span>
                    <div class="lq-modes">
                        ${modeCard('classic', '⚡', '經典個人競速賽', '個人計分，越快答對分數越高')}
                        ${modeCard('mastery', '🌱', '精熟練習模式', '只算正確率，不倒數計時')}
                        ${modeCard('team', '🤝', '分組對抗賽', '隨機分組，組員得分加總')}
                    </div>
                    <div class="lq-inline ${c.mode === 'team' ? '' : 'hidden'}">
                        分成 <select id="lq-team-count" class="lq-num">${[2, 3, 4, 5, 6].map(n => `<option ${n === c.teamCount ? 'selected' : ''}>${n}</option>`).join('')}</select> 組
                        <button type="button" class="lq-btn lq-btn-soft lq-btn-sm" data-act="reshuffle">🔀 重新分組</button>
                    </div>
                </div>
                <div class="lq-field"><span>⏱️ 每題作答時間</span>
                    <select id="lq-limit" ${c.mode === 'mastery' ? 'disabled' : ''}>
                        ${[[10, '10 秒'], [20, '20 秒'], [30, '30 秒'], [60, '60 秒'], [0, '教師手動截止（不倒數）']].map(([v, t]) => `<option value="${v}" ${c.limit === v ? 'selected' : ''}>${t}</option>`).join('')}
                    </select>
                    ${c.mode === 'mastery' ? '<small class="lq-hint">精熟練習模式不倒數，由老師按「截止本題」開牌</small>' : ''}
                </div>
                <div class="lq-field"><span>✨ 其他</span>
                    ${chk('lq-streak', c.streak, '連對加成（Streak Bonus）')}
                    ${chk('lq-display', c.display === 'full', '學生裝置同步顯示題目與選項文字（關閉＝只顯示四色符號）')}
                    ${chk('lq-privacy', c.privacy, '隱私模式（大螢幕只顯示人數，名單需老師按「👁 顯示名單」）')}
                    <div class="lq-inline">
                        ${chk('lq-sound', c.sound, '音樂與音效')}
                        <select id="lq-theme" class="lq-num">${[['happy', '🎵 歡樂'], ['tense', '🥁 緊張'], ['light', '🎶 輕快']].map(([v, t]) => `<option value="${v}" ${c.theme === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
                    </div>
                </div>`;
            box.onchange = lqOnSettingsChange;
        }

        function lqRenderLobbyRoom() {
            const wrap = document.getElementById('lq-bubbles');
            if (!wrap) return;
            const ids = lqActiveIds();
            document.getElementById('lq-joined').textContent = ids.length;
            document.getElementById('lq-online').textContent = lq.roster.size;
            const waiting = [...lq.roster.entries()].filter(([id]) => !lq.players.has(id));
            const hint = document.getElementById('lq-room-hint');
            hint.textContent = lq.roster.size && ids.length >= lq.roster.size ? '✅ 全員到齊，可以開始囉！' : (waiting.length ? `還在連線中：${waiting.map(w => w[1]).join('、')}` : '等待同學加入…');
            const bubble = id => {
                const p = lq.players.get(id);
                const isNew = !lq.bubbled.has(id);
                lq.bubbled.add(id);
                return `<div class="lq-bubble ${isNew ? 'lq-pop' : ''}" style="--d:${(LQ_AVATARS.indexOf(lqAvatar(id + 'd')) * 0.19).toFixed(2)}s">${lqAvaHtml(id, p.acc)}<span>${lqE(p.name)}</span></div>`;
            };
            if (lq.S.cfg.mode === 'team') {
                const n = lq.S.cfg.teamCount;
                wrap.className = 'lq-bubbles lq-teams';
                wrap.innerHTML = Array.from({ length: n }, (_, t) => {
                    const members = ids.filter(id => lq.S.teams[id] === t);
                    return `<div class="lq-team lq-team-${t}"><h4>${LQ_TEAMS[t][0]} ${LQ_TEAMS[t][1]} <small>${members.length} 人</small></h4><div>${members.map(bubble).join('')}</div></div>`;
                }).join('');
            } else {
                wrap.className = 'lq-bubbles';
                wrap.innerHTML = ids.length ? ids.map(bubble).join('') : '<p class="lq-empty">同學進入教室後會自動出現在這裡 ✨</p>';
            }
            if (ids.some(id => !lq.bubbledSound?.has(id))) {
                if (lq.bubbledSound) LQSound.play('pop');
                lq.bubbledSound = new Set(ids);
            }
        }

        function lqOptCards(options, cls = '') {
            return options.map((o, i) => `<div class="lq-opt lq-c-${LQ_COLORS[i]} ${cls}"><span class="lq-shape">${LQ_SHAPES[i]}</span><span class="lq-opt-t">${lqE(o)}</span></div>`).join('');
        }

        function lqRenderQuestion(stage) {
            const S = lq.S, pct = ((S.qi + 1) / S.total * 100).toFixed(1);
            stage.innerHTML = `
                <div class="lq-q">
                    <div class="lq-progress"><b>第 ${S.qi + 1} / ${S.total} 題</b><div class="lq-track"><i style="width:${pct}%"></i></div></div>
                    <div class="lq-q-main">
                        <div class="lq-q-text">${lqE(S.q.text)}</div>
                        <div class="lq-ring" id="lq-ring">
                            <svg viewBox="0 0 120 120"><circle class="lq-ring-bg" cx="60" cy="60" r="54"/><circle class="lq-ring-fg" cx="60" cy="60" r="54"/></svg>
                            <b id="lq-ring-num">${lq.timer.limit ? Math.ceil(lq.timer.limit / 1000) : 0}</b>
                            <small>${lq.timer.limit ? '秒' : '不限時'}</small>
                        </div>
                    </div>
                    <div class="lq-opts">${lqOptCards(S.q.options)}</div>
                    <div class="lq-q-foot">
                        <div class="lq-answered"><b id="lq-ans-n">0</b> / <span id="lq-ans-total">0</span> 人已作答</div>
                        <div class="lq-ctrl">
                            <button class="lq-btn lq-btn-soft" id="lq-pause-btn" data-act="pause">⏸ 暫停時間</button>
                            <button class="lq-btn lq-btn-soft" data-act="end-q">⏭ ${lq.timer.limit ? '提早截止本題' : '截止本題'}</button>
                            <button class="lq-btn lq-btn-soft" data-act="reset-q">↺ 重置本題</button>
                        </div>
                    </div>
                </div>`;
            lqUpdateAnswered();
        }

        function lqNamesFor(choice) {
            return [...lq.answers.entries()].filter(([, a]) => a.c === choice).map(([id]) => lq.players.get(id)?.name || '同學');
        }

        function lqRenderReveal(stage) {
            const S = lq.S, st = lq.qStats[S.qi];
            const max = Math.max(1, ...st.counts);
            const showNames = !S.cfg.privacy || lq.showNames;
            const rate = st.n ? Math.round(st.ok / st.n * 100) : 0;
            stage.innerHTML = `
                <div class="lq-reveal">
                    <div class="lq-progress"><b>第 ${S.qi + 1} / ${S.total} 題．揭曉</b></div>
                    <div class="lq-q-text">${lqE(S.q.text)}</div>
                    <div class="lq-bars">
                        ${S.q.options.map((o, i) => {
                            const names = lqNamesFor(i);
                            return `<div class="lq-barcol ${i === st.correct ? 'lq-correct' : 'lq-faded'}">
                                <div class="lq-bar-n">${st.counts[i]} 人</div>
                                <div class="lq-bar-wrap"><div class="lq-bar lq-c-${LQ_COLORS[i]}" style="--h:${(st.counts[i] / max * 100).toFixed(1)}%;--d:${i * 0.12}s"></div></div>
                                <div class="lq-bar-label lq-c-${LQ_COLORS[i]}"><span class="lq-shape">${LQ_SHAPES[i]}</span><span>${lqE(o)}</span>${i === st.correct ? '<em class="lq-check">✔</em>' : ''}</div>
                                ${showNames && names.length ? `<div class="lq-bar-names">${names.map(lqE).join('、')}</div>` : ''}
                            </div>`;
                        }).join('')}
                    </div>
                    <div class="lq-reveal-foot">
                        <span class="lq-rate">全班答對率 <b>${rate}%</b>（${st.ok} / ${st.n} 人）${S.cfg.privacy && !lq.showNames ? '<small>🔒 隱私模式：只顯示人數</small>' : ''}</span>
                        <button class="lq-btn lq-btn-go" data-act="board">📊 看排行榜 →</button>
                    </div>
                </div>`;
        }

        function lqRenderBoard(stage) {
            const S = lq.S, ranking = lqRanking(), top = ranking.slice(0, 5);
            const last = S.qi + 1 >= S.total;
            const arrow = (id, rank) => {
                const prev = lq.prevRanks.get(id);
                if (!prev || (prev > 5 && rank <= 5 && S.qi > 0)) return S.qi > 0 ? '<em class="lq-arrow new">✨ 新入榜</em>' : '';
                if (prev > rank) return `<em class="lq-arrow up">▲ ${prev - rank}</em>`;
                if (prev < rank) return `<em class="lq-arrow down">▼ ${rank - prev}</em>`;
                return '<em class="lq-arrow same">▬</em>';
            };
            const hot = ranking.filter(p => p.streak >= 3).sort((a, b) => b.streak - a.streak).slice(0, 3);
            const mastery = S.cfg.mode === 'mastery';
            const teams = S.cfg.mode === 'team' ? lqTeamScores() : null;
            const tMax = teams ? Math.max(1, ...teams.map(t => t.score)) : 1;
            stage.innerHTML = `
                <div class="lq-board">
                    <div class="lq-board-main lq-card">
                        <h2>🏅 目前前五名 <small>第 ${S.qi + 1} / ${S.total} 題後</small></h2>
                        <ol class="lq-rank">
                            ${top.map((p, i) => `<li style="--d:${i * 0.1}s"><span class="lq-rank-no">${i + 1}</span>${lqAvaHtml(p.id, p.acc)}<span class="lq-rank-name">${lqE(p.name)}${p.streak >= 3 ? ` <em class="lq-fire">🔥${p.streak}</em>` : ''}</span><span class="lq-rank-score">${mastery ? `答對 ${p.correct} 題` : lqFmt(p.score)}</span>${arrow(p.id, i + 1)}</li>`).join('')}
                        </ol>
                    </div>
                    <div class="lq-board-side">
                        ${hot.length ? `<div class="lq-card lq-hot"><h3>🔥 連對王 Hot Streak</h3>${hot.map(p => `<div class="lq-hot-row">${lqAvaHtml(p.id, p.acc)}<b>${lqE(p.name)}</b><span>連對 ${p.streak} 題</span></div>`).join('')}</div>` : ''}
                        ${teams ? `<div class="lq-card"><h3>🤝 隊伍積分</h3>${teams.map(t => `<div class="lq-team-row"><span>${t.icon} ${t.name}</span><div class="lq-team-bar lq-team-${t.i}"><i style="width:${(t.score / tMax * 100).toFixed(1)}%"></i></div><b>${lqFmt(t.score)}</b></div>`).join('')}</div>` : ''}
                        <button class="lq-btn lq-btn-go lq-btn-big" data-act="next">${last ? '🏆 頒獎典禮' : '下一題 →'}</button>
                    </div>
                </div>`;
        }

        function lqRenderPodium(stage) {
            const S = lq.S, ranking = lqRanking(), ins = lqInsights();
            const mastery = S.cfg.mode === 'mastery';
            const scoreTxt = p => mastery ? `答對 ${p.correct} 題` : `${lqFmt(p.score)} 分`;
            const slot = (p, place) => p ? `<div class="lq-pod lq-pod-${place}" id="lq-pod-${place}">
                    <div class="lq-pod-who">${place === 1 ? '<span class="lq-crown">👑</span>' : ''}${lqAvaHtml(p.id, p.acc, 'big')}<b>${lqE(p.name)}</b><small>${scoreTxt(p)}</small></div>
                    <div class="lq-pod-block">${place}</div></div>` : `<div class="lq-pod lq-pod-${place} lq-pod-empty"></div>`;
            const showCare = !S.cfg.privacy || lq.showNames;
            stage.innerHTML = `
                <div class="lq-podium-wrap">
                    <div class="lq-podium-main">
                        <h2 class="lq-title">🏆 頒獎典禮</h2>
                        ${S.podium.teams ? `<div class="lq-team-win">🎉 冠軍隊伍：${S.podium.teams[0].icon} ${S.podium.teams[0].name}（${lqFmt(S.podium.teams[0].score)} 分）</div>` : ''}
                        <div class="lq-podium">${slot(ranking[1], 2)}${slot(ranking[0], 1)}${slot(ranking[2], 3)}</div>
                        <div class="lq-honor lq-card">
                            <h3>🎖️ 榮譽榜（第 4–10 名）<span>全班平均答對率 <b>${Math.round(ins.avgAcc * 100)}%</b></span></h3>
                            <ol start="4">${ranking.slice(3, 10).map(p => `<li>${lqAvaHtml(p.id, p.acc)}<b>${lqE(p.name)}</b><span>${scoreTxt(p)}</span></li>`).join('') || '<p class="lq-empty">—</p>'}</ol>
                        </div>
                    </div>
                    <div class="lq-podium-side">
                        <div class="lq-card">
                            <h3>🧗 挑戰排行榜（最難題目）</h3>
                            ${ins.hardest.map(h => `<div class="lq-hard"><div><b>第 ${h.i + 1} 題</b>　答對率 <em>${Math.round(h.rate * 100)}%</em></div><p>${lqE(h.text)}</p><small>正解：${LQ_SHAPES[h.correct]} ${lqE(h.options[h.correct])}</small></div>`).join('')}
                        </div>
                        <div class="lq-card">
                            <h3>💗 需關懷提醒</h3>
                            ${showCare ? (ins.care.length ? ins.care.map(c => `<div class="lq-care"><b>${lqE(c.name)}</b><span>${c.reasons.map(lqE).join('、')}</span></div>`).join('') : '<p class="lq-empty">全班表現都很穩定 👍</p>')
                                : `<p class="lq-empty">🔒 隱私模式：共 ${ins.care.length} 位同學需要關懷，按上方「👁 顯示名單」查看</p>`}
                        </div>
                        <div class="lq-podium-btns">
                            <button class="lq-btn lq-btn-go" id="lq-save-btn" data-act="save" ${lq.saved ? 'disabled' : ''}>${lq.saved ? '✅ 已回存課堂歷程' : '💾 回存至課堂歷程'}</button>
                            <button class="lq-btn lq-btn-soft" data-act="again">🔁 再玩一場</button>
                            <button class="lq-btn lq-btn-soft" data-act="close">✕ 結束</button>
                        </div>
                    </div>
                </div>`;
            const podiumKey = S.sid + '|' + S.att;
            if (stage.dataset.podiumShown === podiumKey) {
                stage.querySelectorAll('.lq-pod').forEach(el => el.classList.add('lq-in'));
                return;
            }
            stage.dataset.podiumShown = podiumKey;
            // 依序揭曉第 3、2、1 名
            [[3, 800], [2, 2400], [1, 4200]].forEach(([place, t]) => {
                lq.podiumTs.push(setTimeout(() => {
                    const el = document.getElementById('lq-pod-' + place);
                    if (el) el.classList.add('lq-in');
                    LQSound.play(place === 1 ? 'fanfare' : 'drum');
                    if (place === 1) lqConfetti();
                }, t));
            });
        }

        // =====================================================================
        // 學生端
        // =====================================================================
        function lqMountStudent() {
            if (lq.open) return;
            lq.role = 'student'; lq.open = true;
            let acc = '';
            try { acc = localStorage.getItem('liveQuizAcc') || ''; } catch (e) { }
            lq.me = { acc, key: '', chosen: null, deadline: 0, remain: 0, cdIv: null, lastReact: 0 };
            lqShowOverlay('student');
            document.getElementById('lq-root').innerHTML = '<div class="lq-stu"><p class="lq-stu-hint">🎮 正在進入 Live Quiz…</p></div>';
            document.getElementById('lq-root').onclick = lqStudentClick;
            setDoc(lqRef('liveQuizPlayers', userId), { name: studentName, acc }).catch(e => console.error('[LiveQuiz] 加入失敗:', e));
            lq.unsubs.push(onSnapshot(lqRef('liveQuiz', 'state'), snap => {
                if (!snap.exists() || !lq.open) return;
                lq.S = snap.data();
                lqRenderStudent();
            }));
            lq.me.cdIv = setInterval(lqStudentTick, 200);
        }

        function lqStudentClick(e) {
            const b = e.target.closest('button');
            if (!b || b.disabled) return;
            if (b.dataset.c !== undefined) lqStudentAnswer(Number(b.dataset.c), b);
            else if (b.dataset.acc !== undefined) {
                lq.me.acc = b.dataset.acc;
                try { localStorage.setItem('liveQuizAcc', lq.me.acc); } catch (e) { }
                setDoc(lqRef('liveQuizPlayers', userId), { name: studentName, acc: lq.me.acc }).catch(() => { });
                LQSound.play('pop');
                lq.me.key = ''; lqRenderStudent();
            } else if (b.dataset.react) {
                const now = Date.now();
                if (now - lq.me.lastReact < 400) return;
                lq.me.lastReact = now;
                setDoc(lqRef('liveQuizReactions', userId), { e: b.dataset.react, t: now }).catch(() => { });
                lqFloat(b.dataset.react);
                b.classList.remove('lq-jelly'); void b.offsetWidth; b.classList.add('lq-jelly');
            }
        }

        function lqStudentAnswer(c, btn) {
            const S = lq.S;
            if (lq.me.chosen !== null || !S || S.phase !== 'question' || (S.timer && !S.timer.running)) return;
            lq.me.chosen = c;
            LQSound.play('click');
            btn.classList.add('lq-jelly');
            setDoc(lqRef('liveQuizAnswers', userId), { sid: S.sid, qi: S.qi, att: S.att, c, name: studentName })
                .catch(e => { console.error('[LiveQuiz] 送出失敗:', e); lq.me.chosen = null; lqToast('送出失敗，請再點一次'); });
            setTimeout(() => lqShowLocked(), 260);
        }

        function lqShowLocked() {
            const c = lq.me.chosen;
            const grid = document.getElementById('lq-stu-grid'), locked = document.getElementById('lq-locked');
            if (c === null || !grid || !locked) return;
            grid.classList.add('hidden');
            const qt = document.querySelector('.lq-stu-qtext');
            if (qt) qt.classList.add('hidden');
            locked.innerHTML = `<div class="lq-locked-shape lq-c-${LQ_COLORS[c]}">${LQ_SHAPES[c]}</div><p>作答成功，等待開牌中...</p>`;
            locked.classList.remove('hidden');
        }

        function lqStudentTick() {
            const S = lq.S;
            if (!S || S.phase !== 'question' || !S.timer || !S.timer.limitMs) return;
            const bar = document.getElementById('lq-stu-tbar'), num = document.getElementById('lq-stu-tnum');
            if (!bar) return;
            const remain = S.timer.running ? Math.max(0, lq.me.deadline - performance.now()) : lq.me.remain;
            bar.style.width = (remain / S.timer.limitMs * 100).toFixed(1) + '%';
            bar.classList.toggle('lq-warn', remain <= 5000);
            num.textContent = Math.ceil(remain / 1000) + ' 秒';
        }

        function lqRenderStudent() {
            const S = lq.S, root = document.getElementById('lq-root');
            if (!S || S.phase === 'closed') return;
            LQSound.on = S.cfg.sound;
            const key = [S.sid, S.phase, S.qi, S.att].join('|');
            // 計時（每次快照都更新：暫停 / 繼續）
            if (S.phase === 'question' && S.timer) {
                lq.me.remain = S.timer.remainMs;
                lq.me.deadline = performance.now() + S.timer.remainMs;
            }
            if (key === lq.me.key && S.phase !== 'lobby') {
                const pz = document.getElementById('lq-paused');
                if (pz) pz.classList.toggle('hidden', !(S.timer && !S.timer.running));
                return;
            }
            const firstOfKey = key !== lq.me.key;
            lq.me.key = key;
            if (S.phase === 'question' && firstOfKey) lq.me.chosen = null;
            const r = S.res && S.res[userId];
            const rankChip = r && r.rank ? `<div class="lq-rankchip">${r.rank === 1 ? '目前第 1 名 👑' : `第 ${r.rank} 名 ‧ 距離上一名差 ${lqFmt(r.gap)} 分`}</div>` : '';
            let html = '';
            if (S.phase === 'lobby') {
                const t = S.cfg.mode === 'team' && S.teams && S.teams[userId] !== undefined ? S.teams[userId] : null;
                html = `<div class="lq-stu lq-stu-lobby">
                    <div class="lq-me">${lqAvaHtml(userId, lq.me.acc, 'huge')}<div class="lq-me-name">${lqE(studentName)}</div>
                        ${t !== null ? `<div class="lq-team-chip lq-team-${t}">${LQ_TEAMS[t][0]} 你是「${LQ_TEAMS[t][1]}」</div>` : ''}</div>
                    <p class="lq-stu-hint">🎈 已進入競賽準備室，等待老師開始…</p>
                    <div class="lq-stu-box"><small>挑一個可愛掛件</small><div class="lq-acc-pick">${LQ_ACCS.map(([a, n]) => `<button data-acc="${a}" class="${a === lq.me.acc ? 'on' : ''}" title="${n}">${a || '🚫'}<small>${n}</small></button>`).join('')}</div></div>
                    <div class="lq-stu-box"><small>暖身一下！點一下會飄到大螢幕上</small><div class="lq-react">${LQ_REACTS.map(e => `<button data-react="${e}">${e}</button>`).join('')}</div></div>
                </div>`;
            } else if (S.phase === 'question') {
                const full = S.cfg.display === 'full';
                html = `<div class="lq-stu lq-stu-q">
                    <div class="lq-stu-top"><b>第 ${S.qi + 1} / ${S.total} 題</b>
                        ${S.timer && S.timer.limitMs ? '<div class="lq-stu-timer"><i id="lq-stu-tbar"></i></div><span id="lq-stu-tnum"></span>' : '<span class="lq-hint">不限時，慢慢想 🌱</span>'}</div>
                    ${full ? `<div class="lq-stu-qtext">${lqE(S.q.text)}</div>` : '<p class="lq-stu-hint lq-sm">👀 看大螢幕的題目，點選答案</p>'}
                    <div class="lq-stu-grid ${full ? 'full' : ''}" id="lq-stu-grid">
                        ${S.q.options.map((o, i) => `<button class="lq-big lq-c-${LQ_COLORS[i]}" data-c="${i}"><span class="lq-shape">${LQ_SHAPES[i]}</span>${full ? `<span class="lq-big-t">${lqE(o)}</span>` : ''}</button>`).join('')}
                    </div>
                    <div class="lq-locked hidden" id="lq-locked"></div>
                    <div class="lq-paused ${S.timer && !S.timer.running ? '' : 'hidden'}" id="lq-paused">⏸ 老師暫停中，請稍候</div>
                </div>`;
            } else if (S.phase === 'reveal' || S.phase === 'leaderboard') {
                const c = S.reveal ? S.reveal.correct : 0;
                const corr = `<div class="lq-fb-ans">正確答案：<span class="lq-c-${LQ_COLORS[c]}">${LQ_SHAPES[c]}</span> ${lqE(S.q.options[c])}</div>`;
                const mastery = S.cfg.mode === 'mastery';
                if (!r) {
                    html = `<div class="lq-stu lq-fb lq-fb-wait"><div class="lq-fb-title">👋 下一題就輪到你囉！</div>${corr}</div>`;
                } else if (r.ok) {
                    html = `<div class="lq-stu lq-fb lq-fb-ok">${rankChip}
                        <div class="lq-fb-title">${LQ_PRAISE[(S.qi + r.rank) % LQ_PRAISE.length]}</div>
                        <div class="lq-fb-gain">+${lqFmt(r.gain)} <small>分</small></div>
                        <div class="lq-fb-chips"><span>基礎 ${lqFmt(r.base)}</span>${mastery ? '' : `<span>⚡ 速度 +${r.speed}</span>`}${r.sb ? `<span>🔥 連對 +${r.sb}</span>` : ''}${r.cbPts ? `<span>🚀 打氣 +${r.cbPts}</span>` : ''}</div>
                        ${r.streak >= 2 ? `<div class="lq-fb-streak">🔥 連對 ${r.streak} 題！</div>` : ''}
                        ${r.cb ? '<div class="lq-badge">🚀 逆轉起飛！<small>連錯之後答對，超級棒！</small></div>' : ''}
                    </div>`;
                } else {
                    html = `<div class="lq-stu lq-fb lq-fb-no">${rankChip}
                        <div class="lq-fb-art">${r.ans === null ? '⏰' : '🌈'}</div>
                        <div class="lq-fb-title">${r.ans === null ? '這題沒來得及作答' : LQ_CHEER[S.qi % LQ_CHEER.length]}</div>
                        ${corr}
                        <div class="lq-fb-reset">🌱 連對紀錄已重置，重新出發！</div>
                    </div>`;
                }
            } else if (S.phase === 'podium') {
                const top = (S.podium && S.podium.top) || [];
                html = `<div class="lq-stu lq-stu-end">
                    <div class="lq-fb-title">🏁 競賽結束！</div>
                    ${r ? `<div class="lq-end-rank">第 <b>${r.rank}</b> 名 <small>/ ${r.n} 人</small></div>
                        <div class="lq-fb-chips"><span>${S.cfg.mode === 'mastery' ? '' : `總分 ${lqFmt(r.score)}．`}答對 ${r.correct} / ${r.total} 題</span></div>` : ''}
                    ${S.podium && S.podium.teams ? `<div class="lq-fb-ans">冠軍隊伍：${S.podium.teams[0].icon} ${S.podium.teams[0].name}</div>` : ''}
                    <div class="lq-stu-box"><small>🏆 前三名</small>${top.map((p, i) => `<div class="lq-end-top">${['🥇', '🥈', '🥉'][i]} ${lqAvaHtml(p.id, p.acc)} <b>${lqE(p.name)}</b></div>`).join('')}</div>
                    <p class="lq-stu-hint">${r && r.rank <= 3 ? '🎉 恭喜上台！' : '謝謝你的參與，下次再挑戰！💪'}</p>
                </div>`;
            }
            root.innerHTML = html;
            if (firstOfKey && (S.phase === 'reveal')) LQSound.play(r && r.ok ? 'correct' : 'wrong');
            if (firstOfKey && S.phase === 'podium' && r && r.rank <= 3) { LQSound.play('fanfare'); lqConfetti(); }
            lqStudentTick();
        }

        // 學生端：互動模式切換時由 listenToInteractionMode() 呼叫
        function lqCloseStudent() { if (lq.open && lq.role === 'student') lqTeardown(); }

        document.getElementById('live-quiz-card')?.addEventListener('click', lqOpenTeacher);
