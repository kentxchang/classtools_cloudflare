// =====================================================================
// 【同步白板 / 同步簡報 共用 — CTP 控制器與啟動】 modules/sync-common/ctp-start.js
// 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
// public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
// =====================================================================

        // ====== CTP 控制器 ======
        const CTP = {
            cur:null, module:null, _participants:[],
            _open(mode){
                const ov=$("ctp-overlay");
                ov.dataset.mode = (mode==='presentation') ? 'presentation' : 'whiteboard';
                ov.classList.remove('hidden');
                $("ctp-title").textContent = (mode==='whiteboard') ? '🖌️ 同步白板' : '📽️ 同步簡報';
            },
            _mount(mode, asTeacher){
                if(this.cur===mode && this.module) return;
                if(this.module) this.close(true);
                State.currentMode = mode; this.cur = mode;
                this._open(mode);
                const el = $("ctp-module"); el.innerHTML = '';
                const mod = (mode==='whiteboard') ? WhiteboardModule : PresentationModule;
                this.module = mod;
                if(asTeacher) mod.mountTeacher(el); else mod.mountStudent(el);
            },
            async launchTeacher(mode){
                if(!window.__CT || !window.__CT.db){ alert('資料庫尚未連線'); return; }
                this._mount(mode, true);
                try{ await window.__CT.setActiveMode(mode); }catch(e){ console.error(e); }
            },
            mountStudent(mode){ this._mount(mode, false); },
            close(keepOverlay){
                try{ this.module && this.module.teardown && this.module.teardown(); }catch(e){}
                State.moduleUnsubs.forEach(u=>{ try{u();}catch(e){} }); State.moduleUnsubs=[];
                this.module=null; this.cur=null; State.currentMode='tools';
                const el=$("ctp-module"); if(el) el.innerHTML='';
                document.body.classList.remove('wb-maxed','ppt-fs','ppt-maxed','sticky-maxed');
                if(!keepOverlay) $("ctp-overlay").classList.add('hidden');
            }
        };
        window.__CTP = CTP;
        $("ctp-close").onclick = ()=>{
            if(window.__CT.role==='teacher'){ window.__CT.setActiveMode('waiting').catch(()=>{}); }
            CTP.close();
        };

