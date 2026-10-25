// =====================================================================
// 【14 同步簡報】 modules/14-presentation/presentation.js
// 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
// public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
// =====================================================================


/* =====================================================================
 * PresentationModule — 簡報模式（識別色：綠青）
 * ===================================================================== */
const PresentationModule = {
  session:null, pages:[], submissions:[], annotating:false, laser:false, _annPts:[],

  sessRef(){ return FS.doc(Fire.roomCol("presentation"), "live_session"); },
  pageCol(){ return Fire.roomCol("presentation","live_session","pages"); },
  subCol(){ return Fire.roomCol("presentation","live_session","submissions"); },

  teardown(){
    this.session=null; this.pages=[]; this.submissions=[];
    document.body.classList.remove("ppt-fs","ppt-maxed");
    document.removeEventListener("keydown", this._onKey);
    if(this._onStuResize){ window.removeEventListener("resize", this._onStuResize); this._onStuResize=null; }
    if(this._onStuVis){ document.removeEventListener("visibilitychange", this._onStuVis); this._onStuVis=null; }
    if(this._onTeachResize){ window.removeEventListener("resize", this._onTeachResize); this._onTeachResize=null; }
    if(this._laserT){ clearTimeout(this._laserT); this._laserT=null; }
    if(this._relistenT){ clearTimeout(this._relistenT); this._relistenT=null; }
  },

  curPage(){ return this.pages.find(p=>p.id===this.session?.currentPageId)||this.pages[0]||null; },
  sortedPages(){ return [...this.pages].sort((a,b)=>(a.order||0)-(b.order||0)); },

  /* ================= 教師端 ================= */
  async mountTeacher(c){
    c.innerHTML=`
      <div class="ppt-layout">
        <div class="ppt-left">
          <button class="ctpbtn" id="ppt-sync" style="font-size:15px;font-weight:900;padding:13px 10px;flex:0 0 auto">📡 開始同步簡報</button>
          <div class="ppt-thumbs glass" id="ppt-thumbs" style="flex:1"></div>
        </div>
        <div class="ppt-stage-wrap">
          <div id="ppt-stage" class="glass"><div class="slide" id="ppt-slide"></div>
            <canvas id="ppt-annot"></canvas><div id="ppt-laser"></div>
            <div id="ppt-thumbs-ov" class="hidden" style="position:absolute;inset:0;z-index:40;background:rgba(15,23,42,.85);overflow:auto;padding:16px"></div>
          </div>
          <div class="ppt-ctrl glass">
            <button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="ppt-prev">◀ 上一頁</button>
            <button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="ppt-next">下一頁 ▶</button>
            <span class="num" id="ppt-pageno" style="font-weight:800;font-size:13px"></span>
            <button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="ppt-thumbs-ctpbtn" title="縮圖導覽">🔳</button>
            <span style="flex:1"></span>
            <button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="ppt-pen">✏️ 標記</button>
            <button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="ppt-laser-ctpbtn">🔴 雷射筆</button>
            <button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="ppt-clear-ann">清除標記</button>
            <button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="ppt-max" title="收合左右側欄，最大化預覽">🗖 最大化</button>
            <button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="ppt-pagecfg">⚙ 本頁設定</button>
            <button class="ctpbtn ctpbtn-sm" id="ppt-io" title="可上傳 PDF 直接設為簡報內容"
              style="background:linear-gradient(135deg,#7C3AED,#EC4899);color:#fff">📂 匯入 / 匯出</button>
            <button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="ppt-reset">重置提交</button>
            <button class="ctpbtn ctpbtn-danger ctpbtn-sm" id="ppt-endp">🏁 結束簡報</button>
          </div>
        </div>
        <div class="ppt-submits glass">
          <div class="ppt-side-title">📥 即時提交</div>
          <div id="ppt-sub-body" style="flex:1;overflow:auto"></div>
          <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center">
            <span class="badge badge-blue hidden" id="ppt-cmp-n">已選 0</span>
            <button class="ctpbtn ctpbtn-ghost ctpbtn-sm hidden" id="ppt-cmp">🆚 比較</button>
            <button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="ppt-sub-export">⬇ 下載回應</button>
          </div>
        </div>
      </div>`;
    this._cmpSel=new Set();
    // 先綁定 UI 再處理雲端（雲端暫時失敗不影響介面操作）
    this.bindTeacher();
    try{
      const s=await FS.getDoc(this.sessRef());
      if(!s.exists()) await FS.setDoc(this.sessRef(), {currentPageId:null, broadcasting:false, createdAt:FS.serverTimestamp()});
    }catch(e){ console.warn("ppt session init failed", e); }
    this.listen(true);
  },

  bindTeacher(){
    $("ppt-prev").onclick=()=>this.step(-1);
    $("ppt-next").onclick=()=>this.step(1);
    this._onKey=e=>{
      if(State.currentMode!=="presentation"||State.role!=="teacher") return;
      if(e.key==="ArrowRight"||e.key==="PageDown") this.step(1);
      if(e.key==="ArrowLeft"||e.key==="PageUp") this.step(-1);
      if(e.key==="Escape") document.body.classList.remove("ppt-fs");
    };
    document.addEventListener("keydown", this._onKey);
    $("ppt-pen").onclick=()=>{
      this.annotating=!this.annotating; this.laser=false;
      $("ppt-pen").classList.toggle("ctpbtn-grad",this.annotating);
      $("ppt-laser-ctpbtn").classList.remove("ctpbtn-grad");
      $("ppt-annot").style.pointerEvents=this.annotating?"auto":"none";
    };
    $("ppt-laser-ctpbtn").onclick=()=>{
      this.laser=!this.laser; this.annotating=false;
      $("ppt-laser-ctpbtn").classList.toggle("ctpbtn-grad",this.laser);
      $("ppt-pen").classList.remove("ctpbtn-grad");
      $("ppt-annot").style.pointerEvents="none";
      $("ppt-laser").style.display="none";
      if(!this.laser) FS.updateDoc(this.sessRef(),{laser:{on:false}}).catch(()=>{});
    };
    $("ppt-clear-ann").onclick=()=>{
      const p=this.curPage();
      if(p) FS.updateDoc(FS.doc(this.pageCol(),p.id),{draw:[]}).catch(()=>{});
      const cv=$("ppt-annot"); cv.getContext("2d").clearRect(0,0,cv.width,cv.height);
    };
    $("ppt-pagecfg").onclick=()=>this.openPageCfg();
    $("ppt-io").onclick=()=>this.openIO();
    $("ppt-sync").onclick=()=>this.toggleSync();
    $("ppt-max").onclick=()=>{
      const lay=document.querySelector(".ppt-layout");
      const on=lay.classList.toggle("ppt-max");
      document.body.classList.toggle("ppt-maxed", on);   // 連同上方標題列與模式分頁一併隱藏
      $("ppt-max").classList.toggle("ctpbtn-grad", on);
      $("ppt-max").textContent=on?"🗗 還原" : "🗖 最大化";
      setTimeout(()=>{ this.sizeAnnot(); this.renderAnnot(); }, 250);
    };
    $("ppt-endp").onclick=()=>this.endPresentation();
    $("ppt-thumbs-ctpbtn").onclick=()=>this.toggleThumbsOverlay();
    $("ppt-cmp").onclick=()=>this.showComparison();
    $("ppt-reset").onclick=async()=>{
      if(!await UI.confirm("重置所有學生提交？")) return;
      await FS.deleteTree(this.subCol()); // 伺服器端一次清空，不需逐筆讀取
      UI.toast("已重置提交","ok");
    };
    $("ppt-sub-export").onclick=()=>this.downloadSubmissions();
    // 標記畫筆（座標以「投影內容區」標準化 0~1，寫入頁面文件 → 學生端同步顯示在相同位置）
    const cv=$("ppt-annot"); const ctx=cv.getContext("2d");
    let drawing=false, path=null;
    const clamp01=v=>Math.max(0, Math.min(1, Math.round(v*1000)/1000));
    const npos=e=>{
      const r=cv.getBoundingClientRect();
      const sr=this.slideRect($("ppt-stage"), this.curPage());
      return [clamp01(((e.clientX-r.left)-sr.x)/sr.w), clamp01(((e.clientY-r.top)-sr.y)/sr.h)];
    };
    cv.addEventListener("pointerdown",e=>{
      if(!this.annotating) return;
      e.preventDefault(); try{ cv.setPointerCapture(e.pointerId); }catch(err){}
      drawing=true; const pt=npos(e); path={c:"#EF4444", s:4, p:[pt[0],pt[1]]};
    });
    cv.addEventListener("pointermove",e=>{
      if(!drawing||!path) return; e.preventDefault();
      const pt=npos(e);
      const sr=this.slideRect($("ppt-stage"), this.curPage());
      const n=path.p.length;
      ctx.strokeStyle=path.c; ctx.lineWidth=path.s; ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(sr.x+path.p[n-2]*sr.w, sr.y+path.p[n-1]*sr.h);
      ctx.lineTo(sr.x+pt[0]*sr.w, sr.y+pt[1]*sr.h); ctx.stroke();
      path.p.push(pt[0],pt[1]);
    });
    const endStroke=()=>{
      if(!drawing) return;
      drawing=false;
      const p=this.curPage();
      if(p&&path&&path.p.length>=4){
        const draw=[...(p.draw||[]), path];
        FS.updateDoc(FS.doc(this.pageCol(),p.id),{draw}).catch(()=>{});
      }
      path=null;
    };
    cv.addEventListener("pointerup",endStroke); cv.addEventListener("pointercancel",endStroke);
    // 雷射筆（座標以「投影內容區」百分比同步，學生端對應到相同投影位置；節流 60ms）
    $("ppt-stage").addEventListener("pointermove",e=>{
      if(!this.laser) return;
      const st=$("ppt-stage"), r=st.getBoundingClientRect();
      const sr=this.slideRect(st, this.curPage());
      const x=((e.clientX-r.left)-sr.x)/sr.w*100, y=((e.clientY-r.top)-sr.y)/sr.h*100;
      const l=$("ppt-laser");
      l.style.display="block"; l.style.left=(e.clientX-r.left)+"px"; l.style.top=(e.clientY-r.top)+"px";
      if(this._laserT) return;
      this._laserT=setTimeout(()=>{
        this._laserT=null;
        const cx=Math.max(0,Math.min(100,Math.round(x*10)/10)), cy=Math.max(0,Math.min(100,Math.round(y*10)/10));
        FS.updateDoc(this.sessRef(),{laser:{x:cx, y:cy, on:true}}).catch(()=>{});
      },200); // V6.2: 60ms→200ms，避免超過 Firestore 單一文件寫入頻率限制
    });
    $("ppt-stage").addEventListener("pointerleave",()=>{
      if(!this.laser) return;
      $("ppt-laser").style.display="none";
      FS.updateDoc(this.sessRef(),{laser:{on:false}}).catch(()=>{});
    });
    this._onTeachResize=()=>{ this.sizeAnnot(); this.renderAnnot(); };
    window.addEventListener("resize", this._onTeachResize);
  },

  toggleSync(){
    // session 尚未載入時 (this.session 為 null) 切換會誤判狀態，先擋下
    if(!this.session){ UI.toast("與雲端連線中，請稍候再試","err"); return; }
    const on=this.session.broadcasting!==false;
    FS.updateDoc(this.sessRef(),{broadcasting:!on}).catch(()=>{});
    UI.toast(!on?"📡 開始同步！學生畫面開始跟隨":"⏸ 已停止同步，學生停留在目前畫面","info");
  },
  renderSyncBtn(){
    const b=$("ppt-sync"); if(!b) return;
    const on=this.session?.broadcasting!==false;
    // 未同步：醒目綠色「開始同步簡報」；同步中：紅色「停止同步」
    b.textContent=on?"🟢 同步中（點擊停止）":"📡 開始同步簡報";
    b.className="ctpbtn "+(on?"ctpbtn-danger":"ctpbtn-grad");
    b.style.fontSize="15px"; b.style.fontWeight="900"; b.style.padding="13px 10px";
    if(!on){ b.style.animation="pulse-sync 1.6s ease-in-out infinite"; } else { b.style.animation=""; }
  },

  toggleThumbsOverlay(){
    const ov=$("ppt-thumbs-ov"); if(!ov) return;
    if(!ov.classList.contains("hidden")){ ov.classList.add("hidden"); return; }
    const arr=this.sortedPages(), cur=this.session?.currentPageId;
    ov.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px">
      ${arr.map((p,i)=>`<div class="ppt-thumb ${p.id===cur?'active':''}" data-jump="${p.id}" style="background:${p.type==='color'?(p.bg||'#fff'):'#fff'}">
        ${p.type==="image"&&p.bg?`<img src="${p.bg}">`:""}
        <span class="no num">${i+1}</span></div>`).join("")}</div>`;
    ov.querySelectorAll("[data-jump]").forEach(t=>t.onclick=()=>{
      FS.updateDoc(this.sessRef(),{currentPageId:t.dataset.jump});
      ov.classList.add("hidden");
    });
    ov.classList.remove("hidden");
  },

  /* ---- 投影內容矩形：標記/雷射筆座標一律以「實際投影內容區」為基準，
         師生兩端各自換算，位置才會一致（contain 縮放下舞台留白不同） ---- */
  _aspectCache:{},
  pageAspect(p){
    if(!p) return 16/9;
    if(p.type==="image"&&p.bg){
      const a=this._aspectCache[p.id];
      if(a) return a;
      const im=new Image();
      im.onload=()=>{
        this._aspectCache[p.id]=im.naturalWidth/im.naturalHeight;
        if(State.role==="teacher") this.renderAnnot();
        else{ this.renderStudentAnnot(); this.renderStudentLaser(); }
      };
      im.src=p.bg;
      return 16/9;                          // 圖片載入前暫用 16:9
    }
    return 16/9;                            // 純色頁
  },
  slideRect(stageEl, p){
    const W=stageEl.clientWidth, H=stageEl.clientHeight;
    const a=this.pageAspect(p);
    if(!a||!W||!H) return {x:0, y:0, w:W||1, h:H||1};
    let w=W, h=W/a;
    if(h>H){ h=H; w=H*a; }
    return {x:(W-w)/2, y:(H-h)/2, w, h};
  },

  /** 教師端依目前頁面的標註資料重繪覆蓋層 */
  renderAnnot(){
    const cv=$("ppt-annot"); if(!cv) return;
    const ctx=cv.getContext("2d");
    ctx.clearRect(0,0,cv.width,cv.height);
    const st=$("ppt-stage"); if(!st) return;
    this.layoutSlide();
    this.drawPaths(ctx, this.slideRect(st, this.curPage()), this.curPage()?.draw);
  },
  drawPaths(ctx, sr, paths){
    for(const pa of (paths||[])){
      ctx.strokeStyle=pa.c||"#EF4444"; ctx.lineWidth=pa.s||4; ctx.lineCap="round"; ctx.lineJoin="round";
      ctx.beginPath();
      ctx.moveTo(sr.x+pa.p[0]*sr.w, sr.y+pa.p[1]*sr.h);
      for(let i=2;i<pa.p.length;i+=2) ctx.lineTo(sr.x+pa.p[i]*sr.w, sr.y+pa.p[i+1]*sr.h);
      ctx.stroke();
    }
  },
  sizeAnnot(){
    const cv=$("ppt-annot"), st=$("ppt-stage");
    if(!cv||!st) return;
    const r=st.getBoundingClientRect();
    cv.width=r.width; cv.height=r.height;
  },

  listen(isTeacher){
    // 先停掉舊監聽（重建時避免重複訂閱）
    if(this._stopListen) this._stopListen();
    // 監聽出錯（權限/連線異常）時 Firestore 會直接終止該監聽，
    // 若不重建，這位使用者從此收不到任何更新（學生端表現為「沒有同步」）。
    const onErr=err=>{
      console.warn("[ppt] snapshot 監聽中斷，1.5 秒後自動重建:", err);
      if(this._relistenT) return;
      this._relistenT=setTimeout(()=>{
        this._relistenT=null;
        if(State.currentMode==="presentation") this.listen(isTeacher);
      },1500);
    };
    const u1=FS.onSnapshot(this.sessRef(), s=>{
      this.session=s.exists()?s.data():null;
      if(isTeacher){ this.renderStage(); this.renderThumbs(); this.renderSyncBtn(); }
      else{ this.renderStudent(); this.renderStudentLaser(); }
    }, onErr);
    const u2=FS.onSnapshot(this.pageCol(), s=>{
      this.pages=s.docs.map(d=>({id:d.id,...d.data()}));
      if(isTeacher){ this.renderThumbs(); this.renderStage(); } else this.renderStudent();
    }, onErr);
    const u3=FS.onSnapshot(this.subCol(), s=>{
      this.submissions=s.docs.map(d=>({id:d.id,...d.data()}));
      if(isTeacher) this.renderSubs(); else this.renderStudentSent();
    }, onErr);
    this._stopListen=()=>{ [u1,u2,u3].forEach(u=>{ try{u();}catch(e){} }); this._stopListen=null; };
    State.moduleUnsubs.push(()=>{
      if(this._stopListen) this._stopListen();
      if(this._relistenT){ clearTimeout(this._relistenT); this._relistenT=null; }
    });
    if(isTeacher) setTimeout(()=>this.sizeAnnot(),100);
  },

  async step(dir){
    const arr=this.sortedPages();
    if(!arr.length) return;
    const i=Math.max(0,arr.findIndex(p=>p.id===this.session?.currentPageId));
    const ni=Math.min(arr.length-1, Math.max(0, i+dir));
    if(arr[ni]) await FS.updateDoc(this.sessRef(),{currentPageId:arr[ni].id});
  },

  renderThumbs(){
    const el=$("ppt-thumbs"); if(!el) return;
    const arr=this.sortedPages(), cur=this.session?.currentPageId;
    const IT_BADGE={
      choice:{ic:"🔠", bg:"#1368CE", t:"選擇題"},
      text:{ic:"💬", bg:"#7C3AED", t:"文字回覆"},
      draw:{ic:"🎨", bg:"#EA580C", t:"手繪"}
    };
    el.innerHTML=arr.map((p,i)=>{
      const b=IT_BADGE[this.itType(p.interaction)];
      return `
      <div class="ppt-thumb ${p.id===cur?'active':''}" data-pid="${p.id}" draggable="true" style="background:${p.type==='color'?(p.bg||'#fff'):'#fff'}">
        ${p.type==="image"&&p.bg?`<img src="${p.bg}">`:""}
        <span class="no num">${i+1}${p.url?" 🌐":""}</span>
        ${b?`<span title="本頁互動：${b.t}" style="position:absolute;left:5px;bottom:4px;font-size:11px;font-weight:900;color:#fff;background:${b.bg};padding:1px 7px;border-radius:99px;box-shadow:0 2px 6px rgba(15,23,42,.3)">${b.ic}</span>`:""}
        <button class="ctpbtn ctpbtn-danger ctpbtn-sm" data-pdel="${p.id}" style="position:absolute;right:3px;bottom:3px;padding:1px 7px;font-size:10px">✕</button>
      </div>`;}).join("")+`
      <button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="ppt-add-color">＋ 純色頁</button>
      <button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="ppt-add-img">＋ 圖片頁</button>
      <input type="file" id="ppt-img-file" accept="image/*" multiple class="hidden">`;
    let dragId=null;
    el.querySelectorAll(".ppt-thumb").forEach(t=>{
      t.onclick=e=>{ if(e.target.dataset.pdel) return; FS.updateDoc(this.sessRef(),{currentPageId:t.dataset.pid}); };
      t.addEventListener("dragstart",()=>dragId=t.dataset.pid);
      t.addEventListener("dragover",e=>e.preventDefault());
      t.addEventListener("drop",async e=>{
        e.preventDefault();
        const a=this.sortedPages();
        const from=a.findIndex(p=>p.id===dragId), to=a.findIndex(p=>p.id===t.dataset.pid);
        if(from<0||to<0||from===to) return;
        const [m]=a.splice(from,1); a.splice(to,0,m);
        const batch=FS.writeBatch(State.db);
        a.forEach((p,i)=>batch.update(FS.doc(this.pageCol(),p.id),{order:i}));
        await batch.commit();
      });
    });
    el.querySelectorAll("[data-pdel]").forEach(b=>b.onclick=async()=>{
      if(await UI.confirm("刪除此頁？")) FS.deleteDoc(FS.doc(this.pageCol(), b.dataset.pdel));
    });
    el.querySelector("#ppt-add-color").onclick=async()=>{
      const colors=["#FFFFFF","#0F172A","#FEF9C3","#DBEAFE","#DCFCE7","#FCE7F3"];
      const box=UI.modal(`<h3 style="margin:0 0 12px;font-weight:900">選擇底色</h3>
        <div style="display:flex;gap:10px;flex-wrap:wrap">${colors.map(c=>`<button data-c="${c}" style="width:56px;height:40px;border-radius:10px;background:${c};border:2px solid #CBD5E1"></button>`).join("")}</div>`);
      box.querySelectorAll("[data-c]").forEach(b=>b.onclick=()=>{ UI.closeModal(); this.addPage({type:"color", bg:b.dataset.c}); });
    };
    el.querySelector("#ppt-add-img").onclick=()=>el.querySelector("#ppt-img-file").click();
    el.querySelector("#ppt-img-file").onchange=async e=>{
      for(const f of e.target.files){
        const data=await UI.compressImage(await UI.fileToDataURL(f), 1200, .75);
        await this.addPage({type:"image", bg:data});
      }
      UI.toast("圖片頁已加入","ok");
    };
  },

  async addPage(p){
    const order=Math.max(-1,...this.pages.map(x=>x.order||0))+1;
    const ref=await FS.addDoc(this.pageCol(), {...p, order, interaction:null, url:""});
    if(!this.session?.currentPageId) FS.updateDoc(this.sessRef(),{currentPageId:ref.id});
  },

  renderStage(){
    const slide=$("ppt-slide"); if(!slide) return;
    const p=this.curPage();
    const arr=this.sortedPages();
    const no=$("ppt-pageno");
    if(no) no.textContent=p?`${arr.findIndex(x=>x.id===p.id)+1} / ${arr.length}`:"0 / 0";
    if(p?.id!==this._lastTeacherPid){ this._lastTeacherPid=p?.id; this._cmpSel=new Set(); }
    if(!p){ slide.innerHTML=`<div style="color:#94A3B8;font-weight:800">從左側新增頁面開始建立簡報</div>`; slide.style.background="#0F172A"; this.renderAnnot(); return; }
    this.renderSlideInto(slide, p);
    this.renderAnnot();
    this.renderSubs();
  },

  renderSlideInto(slide, p){
    slide.style.backgroundImage=p.type==="image"&&p.bg?`url(${p.bg})`:"none";
    slide.style.backgroundColor=p.type==="color"?(p.bg||"#fff"):"#fff";
    slide.innerHTML="";
    this.layoutSlide(p);
    this.renderUrlBadge(p);
  },

  /** 在頁面上顯示單一可點擊的 URL 圖示（位置可由老師設定，不取代頁面內容） */
  renderUrlBadge(p){
    const st=$("ppt-stage"); if(!st) return;
    // 切頁時關閉先前開啟的 iframe 覆蓋層
    const oldOv=document.getElementById("ppt-url-ov"); if(oldOv) oldOv.remove();
    const old=document.getElementById("ppt-url-badge"); if(old) old.remove();
    if(!p||!p.url) return;
    const badge=document.createElement("button");
    badge.id="ppt-url-badge";
    badge.dataset.pos=p.urlPos||"center";
    badge.title="點我開啟連結："+p.url;
    badge.style.cssText="position:absolute;z-index:18;width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;background:linear-gradient(135deg,rgba(15,23,42,.9),rgba(37,99,235,.92));color:#fff;box-shadow:0 8px 22px rgba(0,0,0,.4);cursor:pointer;animation:popIn .25s";
    badge.innerHTML="🌐";
    badge.onclick=()=>this.openPageUrl(p.url);
    st.appendChild(badge);
    this.positionUrlBadge();
  },

  /** 依老師設定的位置（五選一）把 URL 圖示貼到投影內容區的對應角落／中央 */
  positionUrlBadge(sr){
    const badge=document.getElementById("ppt-url-badge"); if(!badge) return;
    const st=$("ppt-stage"); if(!st) return;
    if(!sr) sr=this.slideRect(st, this.curPage());
    const size=54, pad=14;
    let left, top;
    switch(badge.dataset.pos){
      case "topleft":     left=sr.x+pad;            top=sr.y+pad; break;
      case "topright":    left=sr.x+sr.w-size-pad;  top=sr.y+pad; break;
      case "bottomleft":  left=sr.x+pad;            top=sr.y+sr.h-size-pad; break;
      case "bottomright": left=sr.x+sr.w-size-pad;  top=sr.y+sr.h-size-pad; break;
      default:            left=sr.x+sr.w/2-size/2;  top=sr.y+sr.h/2-size/2;
    }
    badge.style.left=left+"px"; badge.style.top=top+"px";
  },

  /** 點擊 URL 圖示後選擇開啟方式 */
  openPageUrl(url){
    const box=UI.modal(`
      <h3 style="margin:0 0 6px;font-weight:900">🌐 開啟連結</h3>
      <p class="hint" style="margin:0 0 14px;word-break:break-all">${esc(url)}</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="ctpbtn ctpbtn-grad" id="u-iframe">📺 在此頁面開啟（最大化）</button>
        <button class="ctpbtn ctpbtn-ghost" id="u-tab">↗ 開新分頁開啟</button>
      </div>
      <div style="text-align:right;margin-top:12px"><button class="ctpbtn ctpbtn-ghost" id="u-cancel">取消</button></div>`);
    box.querySelector("#u-cancel").onclick=()=>UI.closeModal();
    box.querySelector("#u-tab").onclick=()=>{ window.open(url,"_blank","noopener"); UI.closeModal(); };
    box.querySelector("#u-iframe").onclick=()=>{ UI.closeModal(); this.openUrlIframe(url); };
  },

  /** 在當下頁面上以 iframe 最大化開啟（覆蓋投影區，可關閉） */
  openUrlIframe(url){
    const st=$("ppt-stage"); if(!st) return;
    const old=document.getElementById("ppt-url-ov"); if(old) old.remove();
    const ov=document.createElement("div");
    ov.id="ppt-url-ov";
    ov.style.cssText="position:absolute;inset:0;z-index:60;background:#fff;display:flex;flex-direction:column;border-radius:var(--radius);overflow:hidden";
    ov.innerHTML=`
      <div style="flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:7px 10px;background:#0F172A;color:#fff">
        <span style="font-size:18px">🌐</span>
        <span style="flex:1;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(url)}</span>
        <button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="ppt-url-tab" style="color:#fff">↗ 新分頁</button>
        <button class="ctpbtn ctpbtn-danger ctpbtn-sm" id="ppt-url-close">✕ 關閉</button>
      </div>
      <iframe src="${esc(url)}" style="flex:1;border:none;background:#fff" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>`;
    st.appendChild(ov);
    ov.querySelector("#ppt-url-close").onclick=()=>ov.remove();
    ov.querySelector("#ppt-url-tab").onclick=()=>window.open(url,"_blank","noopener");
  },

  /** 將投影頁面精準排成「最大化且完整」的內容框（等比、置中、無變形） */
  layoutSlide(p){
    const slide=$("ppt-slide"), st=$("ppt-stage");
    if(!slide||!st) return;
    const sr=this.slideRect(st, p||this.curPage());
    Object.assign(slide.style, {
      inset:"auto",
      left:sr.x+"px", top:sr.y+"px", width:sr.w+"px", height:sr.h+"px",
      backgroundSize:"100% 100%",
      borderRadius:"6px", boxShadow:"0 4px 22px rgba(0,0,0,.4)"
    });
    this.positionUrlBadge(sr);  // URL 圖示跟著投影內容區重新對位
  },

  /** 選擇題格子標籤：ABCD 或 1234 */
  chLabel(it, i){ return (it?.labels==="num") ? String(i+1) : String.fromCharCode(65+i); },
  chCount(it){ return it?.count || it?.options?.length || 4; },
  /** 互動類型正規化（相容舊資料：doodle → draw） */
  itType(it){ const t=it?.type; return t==="doodle"?"draw":t; },

  openPageCfg(){
    const p=this.curPage();
    if(!p){ UI.toast("請先選擇頁面","err"); return; }
    const it=p.interaction||{};
    const box=UI.modal(`
      <h3 style="margin:0 0 12px;font-weight:900">⚙ 本頁設定</h3>
      <label class="lbl">外部 URL（選填，頁面上會顯示可點擊的連結圖示，學生點擊後可選擇在頁面內 iframe 開啟或開新分頁）</label>
      <input class="field" id="pc-url" value="${esc(p.url||"")}" placeholder="https://…">
      <label class="lbl">連結圖示位置</label>
      <select class="field" id="pc-urlpos">
        ${[["center","中央"],["topleft","左上"],["topright","右上"],["bottomleft","左下"],["bottomright","右下"]]
          .map(([v,t])=>`<option value="${v}" ${(p.urlPos||"center")===v?"selected":""}>${t}</option>`).join("")}
      </select>
      <label class="lbl">互動類型</label>
      <select class="field" id="pc-type">
        <option value="">無互動</option>
        <option value="choice" ${it.type==="choice"?"selected":""}>選擇題（無題目，學生按色塊作答）</option>
        <option value="text" ${it.type==="text"?"selected":""}>文字回覆</option>
        <option value="draw" ${it.type==="draw"?"selected":""}>手繪</option>
      </select>
      <div id="pc-extra"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
        <button class="ctpbtn ctpbtn-ghost" id="pc-cancel">取消</button><button class="ctpbtn ctpbtn-grad" id="pc-save">儲存</button></div>`);
    const renderExtra=()=>{
      const t=box.querySelector("#pc-type").value;
      if(!t){ box.querySelector("#pc-extra").innerHTML=""; return; }
      if(t==="choice"){
        // 無題目無選項：題目與選項在投影頁面上呈現，學生只按色塊
        const n=this.chCount(it);
        box.querySelector("#pc-extra").innerHTML=`
          <p class="hint" style="margin:8px 0 0">題目與選項內容直接放在投影頁面上即可，學生端只會看到色塊按鈕。</p>
          <label class="lbl">選項數量</label>
          <select class="field" id="pc-count">${[2,3,4].map(v=>`<option value="${v}" ${n===v?"selected":""}>${v} 個</option>`).join("")}</select>
          <label class="lbl">色塊標示文字</label>
          <select class="field" id="pc-labels">
            <option value="abc" ${it.labels!=="num"?"selected":""}>A B C D</option>
            <option value="num" ${it.labels==="num"?"selected":""}>1 2 3 4</option>
          </select>
          <label class="lbl">正解（選填）</label>
          <select class="field" id="pc-ans"><option value="-1">不設正解</option>
            ${[0,1,2,3].map(i=>`<option value="${i}" ${it.answer===i?"selected":""}>${String.fromCharCode(65+i)} / ${i+1}</option>`).join("")}</select>`;
      }else{
        box.querySelector("#pc-extra").innerHTML=`
          <label class="lbl">題目（選填）</label><input class="field" id="pc-q" value="${esc(it.question||"")}">`;
      }
    };
    renderExtra();
    box.querySelector("#pc-type").onchange=renderExtra;
    box.querySelector("#pc-cancel").onclick=()=>UI.closeModal();
    box.querySelector("#pc-save").onclick=async()=>{
      const t=box.querySelector("#pc-type").value;
      let interaction=null;
      if(t==="choice"){
        const count=Number(box.querySelector("#pc-count").value)||4;
        const a=Number(box.querySelector("#pc-ans").value);
        interaction={type:"choice", count, labels:box.querySelector("#pc-labels").value, answer:(a>=0&&a<count)?a:null};
      }else if(t){
        interaction={type:t, question:box.querySelector("#pc-q").value.trim()};
      }
      await FS.updateDoc(FS.doc(this.pageCol(),p.id),{url:box.querySelector("#pc-url").value.trim(), urlPos:box.querySelector("#pc-urlpos").value, interaction});
      UI.closeModal(); UI.toast("已儲存本頁設定","ok");
    };
  },

  renderSubs(){
    const el=$("ppt-sub-body"); if(!el) return;
    const p=this.curPage();
    if(!p){ el.innerHTML=""; return; }
    const subs=this.submissions.filter(s=>s.pageId===p.id);
    const it=p.interaction;
    if(!it){ el.innerHTML=`<p class="hint">本頁未設定互動。<br>提交總數（其他頁）：${this.submissions.length}</p>`; return; }
    let html=`<div style="font-weight:800;font-size:13px;margin-bottom:8px">${esc(it.question||"")}<br><span class="badge badge-blue">${subs.length} 則提交</span></div>`;
    if(this.itType(it)==="choice"){
      // 直條圖：每個選項一根直條，直條由「作答學生名牌」由下往上堆疊而成，
      // 高度即人數，同時呈現每位學生選了哪個答案。
      const n=this.chCount(it);
      const CH_COLORS=["#E21B3C","#1368CE","#D89E00","#26890C"];
      const groups=Array.from({length:n},(_,i)=>subs.filter(s=>s.value===i)
        .sort((a,b)=>((a.ts?.seconds||0)-(b.ts?.seconds||0))));
      html+=`<div style="display:flex;gap:6px;align-items:flex-end;margin:6px 0 0;min-height:70px">`+
        groups.map((g,i)=>{
          const isAns=it.answer===i;
          return `<div style="flex:1;min-width:0;display:flex;flex-direction:column-reverse;gap:3px;padding:5px 3px 4px;border-radius:8px 8px 0 0;background:${CH_COLORS[i%4]}22;${isAns?`box-shadow:inset 0 0 0 2px ${CH_COLORS[i%4]};`:""}">
            ${g.map(s=>`<div title="${esc(s.name)}" style="background:${CH_COLORS[i%4]};color:#fff;font-size:10.5px;font-weight:800;border-radius:6px;padding:2px 4px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.name)}</div>`).join("")}
          </div>`;
        }).join("")+`</div>`;
      html+=`<div style="display:flex;gap:6px">`+
        groups.map((g,i)=>`
        <div style="flex:1;min-width:0;text-align:center;font-weight:900;font-size:13px;border-top:3px solid ${CH_COLORS[i%4]};padding-top:3px">
          ${this.chLabel(it,i)}${it.answer===i?"✅":""}
          <span class="num" style="display:block;font-size:11px;color:var(--ink2)">${g.length} 人</span>
        </div>`).join("")+`</div>`;
      if(it.answer!=null){
        const ok=subs.filter(s=>s.value===it.answer).length;
        html+=`<div class="badge badge-green" style="margin-top:8px">答對 ${ok} / ${subs.length}</div>`;
      }
    }else if(this.itType(it)==="text"){
      html+=subs.map(s=>`<div class="resp-item" style="padding:6px 9px;font-size:13px">
        <input type="checkbox" class="ppt-cmp-ck" data-sid="${s.id}" ${this._cmpSel?.has(s.id)?"checked":""} title="勾選以比較">
        <span class="nm">${esc(s.name)}</span><span class="val">${esc(s.value)}</span></div>`).join("");
    }else{
      html+=`<div class="thumb-grid" style="grid-template-columns:repeat(2,1fr)">${subs.map(s=>`
        <div class="thumb-card" style="position:relative">
          <input type="checkbox" class="ppt-cmp-ck" data-sid="${s.id}" ${this._cmpSel?.has(s.id)?"checked":""} style="position:absolute;left:6px;top:6px;width:16px;height:16px;accent-color:var(--ppt-a)" title="勾選以比較">
          <img src="${s.value}" data-zoom="1"><div class="nm">${esc(s.name)}</div></div>`).join("")}</div>`;
    }
    el.innerHTML=html;
    el.querySelectorAll("img[data-zoom]").forEach(img=>img.onclick=()=>UI.modal(`<img src="${img.src}" style="width:100%;border-radius:12px">`,{wide:true}));
    // 挑選比較
    const canCmp=["text","draw"].includes(this.itType(it));
    $("ppt-cmp")?.classList.toggle("hidden", !canCmp);
    $("ppt-cmp-n")?.classList.toggle("hidden", !canCmp);
    el.querySelectorAll(".ppt-cmp-ck").forEach(ck=>ck.onchange=()=>{
      if(ck.checked) this._cmpSel.add(ck.dataset.sid); else this._cmpSel.delete(ck.dataset.sid);
      const n=$("ppt-cmp-n"); if(n) n.textContent="已選 "+this._cmpSel.size;
    });
    const n=$("ppt-cmp-n"); if(n) n.textContent="已選 "+(this._cmpSel?.size||0);
  },

  /** 挑選比較：將勾選的提交並排放大檢視 */
  showComparison(){
    const p=this.curPage(); if(!p) return;
    const sel=this.submissions.filter(s=>s.pageId===p.id&&this._cmpSel?.has(s.id));
    if(sel.length<2){ UI.toast("請先勾選至少 2 件作品再比較","err"); return; }
    UI.modal(`
      <h3 style="margin:0 0 12px;font-weight:900">🆚 作品比較（${sel.length} 件）</h3>
      <div style="display:grid;grid-template-columns:repeat(${Math.min(sel.length,3)},1fr);gap:12px;max-height:70vh;overflow:auto">
        ${sel.map(s=>`<div class="glass" style="padding:10px;text-align:center">
          ${typeof s.value==="string"&&s.value.startsWith("data:")
            ?`<img src="${s.value}" style="width:100%;border-radius:8px;background:#fff">`
            :`<div style="font-size:15px;line-height:1.7;text-align:left;min-height:60px">${esc(s.value)}</div>`}
          <div style="font-weight:800;margin-top:6px">${esc(s.name)}</div></div>`).join("")}
      </div>
      <div style="text-align:right;margin-top:12px"><button class="ctpbtn ctpbtn-grad" onclick="document.getElementById('shell-modal-root').classList.remove('show')">關閉</button></div>`,{wide:true});
  },

  /** 下載提交：依本頁互動類型——文字→txt、手繪→zip 圖片、選擇→csv */
  async downloadSubmissions(){
    const p=this.curPage();
    if(!p){ UI.toast("沒有頁面","err"); return; }
    const arr=this.sortedPages();
    const no=arr.findIndex(x=>x.id===p.id)+1;
    const subs=this.submissions.filter(s=>s.pageId===p.id);
    if(!subs.length){ UI.toast("本頁沒有可下載的回應","err"); return; }
    const t=this.itType(p.interaction);
    if(t==="text"){
      const txt=`第 ${no} 頁 文字回饋\n================================\n\n`+
        subs.map(s=>`[${s.name}]:\n${s.value}\n\n--------------------------------`).join("\n\n");
      UI.download(`第${no}頁_文字回饋.txt`, txt, "text/plain;charset=utf-8");
    }else if(t==="draw"){
      UI.toast("打包圖片中…","info");
      if(!window.JSZip){
        await new Promise((res,rej)=>{ const s=document.createElement("script");
          s.src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
      }
      const zip=new JSZip();
      subs.forEach(s=>{ if(typeof s.value==="string"&&s.value.startsWith("data:")) zip.file(`${s.name}.jpg`, s.value.split(",")[1], {base64:true}); });
      const blob=await zip.generateAsync({type:"blob"});
      UI.download(`第${no}頁_塗鴉回饋.zip`, blob);
    }else if(t==="choice"){
      const it=p.interaction;
      const rows=["學生姓名,答案,結果", ...subs.map(s=>`${s.name},${this.chLabel(it,s.value)},${it.answer!=null?(s.value===it.answer?"正確":"錯誤"):""}`)];
      UI.download(`第${no}頁_選擇題結果.csv`, "﻿"+rows.join("\n"), "text/csv");
    }else{
      UI.download(`簡報提交_${State.roomCode}.json`, JSON.stringify(subs.map(({id,...r})=>r),null,2));
    }
  },

  /** 結束簡報：選擇是否先儲存，然後清空雲端資料、學生回到等待畫面 */
  async endPresentation(){
    const box=UI.modal(`
      <h3 style="margin:0 0 6px;font-weight:900">🏁 結束簡報</h3>
      <p class="hint" style="margin:0 0 14px">結束後將刪除本簡報的所有雲端資料（頁面與學生提交），學生端回到「等待老師發送互動」畫面。要先儲存嗎？</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="ctpbtn ctpbtn-grad" id="pe-json">💾 匯出 JSON 後結束</button>
        <button class="ctpbtn ctpbtn-danger" id="pe-clear">🗑 直接清空並結束</button>
      </div>
      <div style="text-align:right;margin-top:12px"><button class="ctpbtn ctpbtn-ghost" id="pe-cancel">取消</button></div>`);
    box.querySelector("#pe-cancel").onclick=()=>UI.closeModal();
    const finish=async(save)=>{
      UI.closeModal();
      try{
        if(save==="json") UI.download(`簡報_${State.roomCode}.json`, JSON.stringify({pages:this.sortedPages().map(({id,...r})=>r)}));
        const b=UI.modal(`<div style="text-align:center;padding:20px;font-weight:900">🧹 正在清空簡報資料…</div>`);
        for(const col of [this.pageCol(), this.subCol()]) await FS.deleteTree(col); // 伺服器端一次清空，不需先下載頁面圖片
        await FS.deleteDoc(this.sessRef());
        await FS.setDoc(FS.doc(Fire.roomCol("tools"),"control"), {mode:null, payload:{}, paused:false, round:String(Date.now())});
        await RoomService.setMode("tools");
        UI.closeModal();
        UI.toast("✅ 簡報已結束並清空","ok");
        document.body.classList.remove("ppt-fs");
        Shell.onModeChanged("tools", false);
      }catch(e){
        UI.closeModal();
        UI.toast("結束簡報失敗："+(e.message||e.code||e),"err",4000);
      }
    };
    box.querySelector("#pe-json").onclick=()=>finish("json");
    box.querySelector("#pe-clear").onclick=async()=>{
      if(await UI.confirm("確定要刪除這次簡報的所有雲端資料嗎？此操作無法復原。")) finish(null);
    };
  },

  /* ---------- 匯出 / 匯入 ---------- */
  openIO(){
    const box=UI.modal(`
      <h3 style="margin:0 0 8px;font-weight:900">📂 匯入 / 匯出簡報</h3>
      <p class="hint" style="margin:0 0 12px">💡 推薦：把現成的簡報（PowerPoint / Google 簡報）另存為 <b>PDF 上傳</b>，逐頁勾選後即可直接設為簡報內容。</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="ctpbtn" id="io-pdf" style="background:linear-gradient(135deg,#7C3AED,#EC4899);color:#fff">📑 上傳 PDF 設為簡報內容（逐頁勾選）</button>
        <button class="ctpbtn ctpbtn-ghost" id="io-import">📂 從 JSON 匯入</button>
        <button class="ctpbtn ctpbtn-ghost" id="io-export">💾 匯出 JSON 備份</button>
        <input type="file" id="io-jfile" accept=".json" class="hidden">
        <input type="file" id="io-pfile" accept=".pdf" class="hidden">
      </div>
      <div style="text-align:right;margin-top:12px"><button class="ctpbtn ctpbtn-ghost" id="io-close">關閉</button></div>`);
    box.querySelector("#io-close").onclick=()=>UI.closeModal();
    box.querySelector("#io-export").onclick=()=>{
      UI.download(`簡報_${State.roomCode}.json`, JSON.stringify({pages:this.sortedPages().map(({id,...r})=>r)}));
    };
    box.querySelector("#io-import").onclick=()=>box.querySelector("#io-jfile").click();
    box.querySelector("#io-jfile").onchange=async e=>{
      const f=e.target.files[0]; if(!f) return;
      try{
        const data=JSON.parse(await f.text());
        const base=Math.max(-1,...this.pages.map(x=>x.order||0))+1;
        for(const [i,p] of (data.pages||[]).entries()) await FS.addDoc(this.pageCol(),{...p, order:base+i});
        UI.closeModal(); UI.toast("簡報已匯入","ok");
      }catch(err){ UI.toast("匯入失敗："+err.message,"err"); }
    };
    box.querySelector("#io-pdf").onclick=()=>box.querySelector("#io-pfile").click();
    box.querySelector("#io-pfile").onchange=async e=>{
      const f=e.target.files[0]; if(!f) return;
      UI.toast("PDF 解析中…","info");
      try{
        const picked=await PdfUtil.pickPages(f);   // 逐頁預覽勾選
        if(!picked) return;
        const base=Math.max(-1,...this.pages.map(x=>x.order||0))+1;
        for(let i=0;i<picked.length;i++){
          await FS.addDoc(this.pageCol(),{type:"image", bg:picked[i].dataURL, order:base+i, interaction:null, url:"", draw:[]});
        }
        UI.closeModal(); UI.toast(`已從 PDF 建立 ${picked.length} 頁`,"ok");
      }catch(err){ UI.toast("PDF 轉換失敗："+err.message,"err"); }
    };
  },

  /* ================= 學生端 ================= */
  mountStudent(c){
    // 投影區永遠優先取得最大空間；作答區最多佔 45%、內部自行捲動，不會擠壓或裁切投影內容
    c.innerHTML=`
      <div style="height:100%;display:flex;flex-direction:column;gap:8px;min-height:0">
        <div id="ppt-stage" class="glass" style="flex:1 1 auto;min-height:0;position:relative"><div class="slide" id="ppt-slide"></div>
          <canvas id="ppt-stu-annot" style="position:absolute;inset:0;pointer-events:none;z-index:8"></canvas>
          <canvas id="ppt-stu-draw" style="position:absolute;pointer-events:none;z-index:12;touch-action:none"></canvas>
          <div id="ppt-stu-laser" style="position:absolute;width:18px;height:18px;border-radius:50%;background:radial-gradient(circle,#EF4444 30%,rgba(239,68,68,.25) 70%);z-index:15;pointer-events:none;transform:translate(-50%,-50%);display:none"></div>
          <button id="ppt-stu-fs" class="ctpbtn ctpbtn-ghost ctpbtn-sm" title="全螢幕觀看" style="position:absolute;right:8px;top:8px;z-index:25;opacity:.85">⛶</button>
          <div id="ppt-stu-wait" class="hidden" style="position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.55);backdrop-filter:blur(3px)">
            <div class="glass" style="padding:18px 30px;font-weight:900">⏸ 老師暫停同步中，請稍候…</div>
          </div>
        </div>
        <div id="ppt-stu-interact" style="flex:0 1 auto;max-height:45%;overflow-y:auto;min-height:0"></div>
      </div>`;
    this._lastPid=null;
    // renderStudentAnnot 內已負責同步重新定位手繪覆蓋層
    this._onStuResize=()=>this.renderStudentAnnot();
    window.addEventListener("resize", this._onStuResize);
    // 裝置休眠/切到背景再回前景時，強制依最新資料重繪一次，避免畫面停在舊頁面
    this._onStuVis=()=>{
      if(document.visibilityState==="visible"){ this.renderStudent(); this.renderStudentLaser(); }
    };
    document.addEventListener("visibilitychange", this._onStuVis);
    // 學生端全螢幕：隱藏頂部列與邊距，讓投影內容最大化（依比例完整呈現、不裁切）
    $("ppt-stu-fs").onclick=()=>{
      document.body.classList.toggle("ppt-fs");
      $("ppt-stu-fs").textContent=document.body.classList.contains("ppt-fs")?"✕":"⛶";
      setTimeout(()=>this.renderStudentAnnot(), 250);
    };
    this.listen(false);
  },

  renderStudent(){
    const slide=$("ppt-slide"); if(!slide||State.role!=="student") return;
    const wait=$("ppt-stu-wait");
    if(wait) wait.classList.toggle("hidden", this.session?.broadcasting!==false);
    const p=this.curPage();
    if(!p){ slide.innerHTML=`<div style="color:#94A3B8;font-weight:800">等待老師開始簡報…</div>`; slide.style.background="#0F172A"; $("ppt-stu-interact").innerHTML=""; this.renderStudentAnnot(); return; }
    this.renderSlideInto(slide, p);
    this.renderStudentAnnot();
    if(p.id!==this._lastPid){ this._lastPid=p.id; this._stuSent=false; }
    this.renderStudentInteract(p);
  },

  /** 學生端：老師的標記同步顯示（以學生端自己的投影內容區換算） */
  renderStudentAnnot(){
    const cv=$("ppt-stu-annot"); if(!cv) return;
    const st=$("ppt-stage");
    const r=st.getBoundingClientRect();
    if(cv.width!==Math.round(r.width)||cv.height!==Math.round(r.height)){ cv.width=Math.round(r.width); cv.height=Math.round(r.height); }
    const ctx=cv.getContext("2d");
    ctx.clearRect(0,0,cv.width,cv.height);
    this.layoutSlide();
    this.drawPaths(ctx, this.slideRect(st, this.curPage()), this.curPage()?.draw);
    // 投影區若因圖片載入/縮放而重新排版，手繪覆蓋層也要同步對位（避免位移）
    if(this._stuDrawActive){ this.positionDrawCanvas(); this._stuDrawRedraw&&this._stuDrawRedraw(); }
  },

  /** 學生端：老師的雷射筆同步顯示（以學生端自己的投影內容區換算） */
  renderStudentLaser(){
    const dot=$("ppt-stu-laser"); if(!dot) return;
    const l=this.session?.laser;
    const st=$("ppt-stage");
    if(l&&l.on&&st){
      const sr=this.slideRect(st, this.curPage());
      dot.style.display="block";
      dot.style.left=(sr.x + l.x/100*sr.w)+"px";
      dot.style.top=(sr.y + l.y/100*sr.h)+"px";
    }else dot.style.display="none";
  },

  renderStudentSent(){
    const p=this.curPage();
    if(!p) return;
    const mine=this.submissions.find(s=>s.pageId===p.id&&s.name===State.name);
    if(mine&&!this._stuSent){ this._stuSent=true; this.renderStudentInteract(p); }
    // 老師按「重置提交」刪除雲端提交後，解除鎖定讓學生可重新作答
    else if(!mine&&this._stuSent){ this._stuSent=false; this.renderStudentInteract(p); }
  },

  renderStudentInteract(p){
    const box=$("ppt-stu-interact"); if(!box) return;
    const it=p.interaction;
    const mine=this.submissions.find(s=>s.pageId===p.id&&s.name===State.name);
    // 手繪作答進行中且未送出 → 保留現有筆跡，不因老師雷射/快照更新而重建清除
    if(this._stuDrawActive && this.itType(it)==="draw" && p.id===this._stuDrawPid && !mine && !this._stuSent) return;
    this.resetStudentDraw();
    if(!it){ box.innerHTML=""; return; }
    if(mine||this._stuSent){
      box.innerHTML=`<div class="glass sent-overlay" style="padding:18px">✅ 已送出！</div>`;
      return;
    }
    const q=it.question?`<div style="font-weight:900;font-size:16px;margin-bottom:10px;text-align:center">${esc(it.question)}</div>`:"";
    const itT=this.itType(it);
    if(itT==="choice"){
      // 四方格色塊作答：只顯示 ABCD / 1234（題目與選項在投影頁面上）
      const CH_COLORS=["#E21B3C","#1368CE","#D89E00","#26890C"];
      const n=this.chCount(it);
      box.innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:4px">
        ${Array.from({length:n},(_,i)=>`
        <button data-v="${i}" style="background:${CH_COLORS[i%4]};color:#fff;border-radius:16px;padding:26px 10px;
          font-size:34px;font-weight:900;font-family:'Inter','Noto Sans TC';box-shadow:0 5px 16px rgba(15,23,42,.25);
          transition:transform .12s" onpointerdown="this.style.transform='scale(.95)'" onpointerup="this.style.transform=''">
          ${this.chLabel(it,i)}</button>`).join("")}</div>`;
      box.querySelectorAll("[data-v]").forEach(b=>b.onclick=()=>this.studentSubmit(p, Number(b.dataset.v)));
    }else if(itT==="text"){
      box.innerHTML=`<div class="glass" style="padding:14px">${q}
        <textarea class="field" id="ps-text" rows="2" placeholder="輸入你的回覆…"></textarea>
        <button class="ctpbtn ctpbtn-grad" id="ps-send" style="width:100%;margin-top:8px;background:linear-gradient(135deg,var(--ppt-a),var(--ppt-b))">送出</button></div>`;
      box.querySelector("#ps-send").onclick=()=>{
        const v=box.querySelector("#ps-text").value.trim();
        if(!v){ UI.toast("請輸入內容","err"); return; }
        this.studentSubmit(p, v);
      };
    }else if(itT==="draw"){
      // 直接在上方投影頁面上手繪（不另開空白區）
      const PEN=["#1E293B","#EF4444","#2563EB","#16A34A","#F59E0B"];
      box.innerHTML=`<div class="glass" style="padding:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-weight:800;font-size:13.5px">✏️ 直接在上方簡報頁面手繪作答</span>
        ${PEN.map((c2,i)=>`<span class="ps-pen ${i===0?'on':''}" data-c="${c2}" style="width:24px;height:24px;border-radius:50%;background:${c2};cursor:pointer;border:3px solid ${i===0?'#0F172A':'transparent'}"></span>`).join("")}
        <select class="field" id="ps-w" style="width:auto;padding:4px 8px"><option value="3">細</option><option value="6" selected>中</option><option value="12">粗</option></select>
        <span style="flex:1"></span>
        <button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="ps-clear">🗑 清空</button>
        <button class="ctpbtn ctpbtn-grad ctpbtn-sm" id="ps-send" style="background:linear-gradient(135deg,var(--ppt-a),var(--ppt-b))">送出</button>
      </div>`;
      this.setupStudentDraw(p, box, PEN);
    }
  },

  /** 停用學生手繪覆蓋層（切頁/送出/非手繪題時呼叫） */
  resetStudentDraw(){
    const cv=$("ppt-stu-draw"); if(!cv) return;
    cv.style.pointerEvents="none"; cv.style.cursor="";
    cv.onpointerdown=cv.onpointermove=cv.onpointerup=cv.onpointercancel=null;
    cv.getContext("2d").clearRect(0,0,cv.width,cv.height);
    this._stuDrawActive=false; this._stuDrawPaths=[]; this._stuDrawRedraw=null; this._stuDrawPid=null;
  },

  /** 讓學生手繪覆蓋層精準蓋在投影內容區上 */
  positionDrawCanvas(){
    const cv=$("ppt-stu-draw"), st=$("ppt-stage");
    if(!cv||!st) return null;
    const sr=this.slideRect(st, this.curPage());
    cv.style.left=sr.x+"px"; cv.style.top=sr.y+"px"; cv.style.width=sr.w+"px"; cv.style.height=sr.h+"px";
    const W=Math.max(1,Math.round(sr.w)), H=Math.max(1,Math.round(sr.h));
    if(cv.width!==W||cv.height!==H){ cv.width=W; cv.height=H; }
    return cv;
  },

  setupStudentDraw(p, box, PEN){
    // 工具列剛插入會讓投影區高度改變 → 先把投影頁面與手繪覆蓋層用「同一個最終版面」重新對齊
    this.layoutSlide();
    const cv=this.positionDrawCanvas(); if(!cv) return;
    cv.style.pointerEvents="auto"; cv.style.cursor="crosshair";
    this._stuDrawActive=true;
    this._stuDrawPid=p.id;
    this._stuDrawPaths=[];
    let color=PEN[0], width=6, drawing=false, cur=null;
    const ctx=cv.getContext("2d");
    const redraw=()=>{
      ctx.clearRect(0,0,cv.width,cv.height);
      for(const pa of this._stuDrawPaths){
        ctx.strokeStyle=pa.c; ctx.lineWidth=pa.s; ctx.lineCap="round"; ctx.lineJoin="round";
        ctx.beginPath(); ctx.moveTo(pa.p[0]*cv.width, pa.p[1]*cv.height);
        for(let i=2;i<pa.p.length;i+=2) ctx.lineTo(pa.p[i]*cv.width, pa.p[i+1]*cv.height);
        ctx.stroke();
      }
    };
    this._stuDrawRedraw=redraw;
    const npos=e=>{ const r=cv.getBoundingClientRect(); return [(e.clientX-r.left)/r.width, (e.clientY-r.top)/r.height]; };
    cv.onpointerdown=e=>{
      if(this.session?.broadcasting===false) return;
      e.preventDefault(); try{ cv.setPointerCapture(e.pointerId); }catch(err){}
      drawing=true; const pt=npos(e); cur={c:color, s:width, p:[pt[0],pt[1]]}; this._stuDrawPaths.push(cur);
    };
    cv.onpointermove=e=>{
      if(!drawing||!cur) return; e.preventDefault();
      const pt=npos(e), n=cur.p.length;
      ctx.strokeStyle=cur.c; ctx.lineWidth=cur.s; ctx.lineCap="round";
      ctx.beginPath(); ctx.moveTo(cur.p[n-2]*cv.width, cur.p[n-1]*cv.height);
      ctx.lineTo(pt[0]*cv.width, pt[1]*cv.height); ctx.stroke();
      cur.p.push(pt[0],pt[1]);
    };
    const end=()=>{ if(drawing&&cur&&cur.p.length<4) this._stuDrawPaths=this._stuDrawPaths.filter(x=>x!==cur); drawing=false; cur=null; };
    cv.onpointerup=end; cv.onpointercancel=end;
    box.querySelectorAll(".ps-pen").forEach(b=>b.onclick=()=>{
      color=b.dataset.c;
      box.querySelectorAll(".ps-pen").forEach(x=>x.style.borderColor="transparent");
      b.style.borderColor="#0F172A";
    });
    box.querySelector("#ps-w").onchange=e=>width=Number(e.target.value);
    box.querySelector("#ps-clear").onclick=()=>{ this._stuDrawPaths=[]; redraw(); };
    box.querySelector("#ps-send").onclick=async()=>{
      if(!this._stuDrawPaths.length){ UI.toast("請先在簡報上畫些東西","err"); return; }
      this.studentSubmit(p, await this.compositeStudentDrawing(p, cv));
    };
    // 工具列若在窄螢幕換行造成版面再次變動，於下一個畫格再對齊一次
    requestAnimationFrame(()=>{
      if(!this._stuDrawActive) return;
      this.layoutSlide(); this.positionDrawCanvas(); redraw();
    });
  },

  /** 合成「投影頁面背景 + 學生筆跡」成一張提交圖（教師端可看到畫在哪） */
  async compositeStudentDrawing(p, cv){
    const W=cv.width, H=cv.height;
    const off=document.createElement("canvas"); off.width=W; off.height=H;
    const octx=off.getContext("2d");
    if(p.type==="image"&&p.bg){
      await new Promise(res=>{ const im=new Image(); im.onload=()=>{ octx.drawImage(im,0,0,W,H); res(); }; im.onerror=res; im.src=p.bg; });
    }else{ octx.fillStyle=(p.type==="color"?(p.bg||"#fff"):"#fff"); octx.fillRect(0,0,W,H); }
    octx.drawImage(cv,0,0);
    return await UI.compressImage(off.toDataURL("image/png"), 760, .72);
  },

  async studentSubmit(p, value){
    try{
      // 姓名經 encodeURIComponent 處理，避免含 "/" 等字元組出非法文件路徑導致送出失敗
      await FS.setDoc(FS.doc(this.subCol(), p.id+"_"+encodeURIComponent(State.name)),
        {pageId:p.id, name:State.name, value, ts:FS.serverTimestamp()});
      this._stuSent=true;
      this.renderStudentInteract(p);
    }catch(e){ UI.toast("送出失敗："+e.message,"err"); }
  }
};
