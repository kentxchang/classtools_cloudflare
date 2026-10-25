// =====================================================================
// 【13 同步白板】 modules/13-whiteboard/whiteboard.js
// 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
// public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
// =====================================================================


/* =====================================================================
 * WhiteboardModule — 白板模式（識別色：橘黃）
 * ===================================================================== */
const WB_COLORS=["#1E293B","#EF4444","#F97316","#FACC15","#16A34A","#3B82F6","#8B5CF6","#EC4899"];
const WB_COLOR_NAMES={"#1E293B":"⚫ 黑","#EF4444":"🔴 紅","#F97316":"🟠 橙","#FACC15":"🟡 黃","#16A34A":"🟢 綠","#3B82F6":"🔵 藍","#8B5CF6":"🟣 紫","#EC4899":"🌸 粉"};
const WhiteboardModule = {
  meta:null, objects:[], tool:"pen", color:"#1E293B", width:4,
  view:{x:0,y:0,s:1}, sel:null, _drag:null, _tempObj:null,
  stickyColor:"#FEF08A", showAuthors:false, _imgCache:{},

  metaRef(){ return FS.doc(Fire.roomCol("whiteboard"), "meta"); },
  objCol(){ return Fire.roomCol("whiteboard","meta","objects"); },

  teardown(){
    this.meta=null; this.objects=[]; this.sel=null; this._drag=null; this._tempObj=null;
    this._imgCache={}; this.showAuthors=false;
    window.removeEventListener("resize", this._onResize);
    document.removeEventListener("ctp:participants", this._onParts);
    document.removeEventListener("keydown", this._onKey);
    document.body.classList.remove("wb-maxed");
  },

  canEdit(){ return State.role==="teacher" || !!this.meta?.studentsCanEdit; },
  /** 是否可修改特定物件：鎖定的物件任何人都不能動（需先右鍵解除鎖定）；學生另受權限開關限制 */
  canModify(o){
    if(!o||o.locked) return false;
    if(State.role==="teacher") return true;
    if(!this.meta?.studentsCanEdit) return false;
    return this.meta.allowEditAll!==false || o.owner===State.name;
  },
  curCanvas(){ return this.meta?.activeCanvas||"main"; },
  curPage(){ return (this.meta?.activePage||{})[this.curCanvas()]||"p1"; },
  pageList(){ return (this.meta?.pages||{})[this.curCanvas()]||[{id:"p1",name:"頁 1"}]; },
  curObjects(){ const cv=this.curCanvas(), pg=this.curPage();
    return this.objects.filter(o=>o.canvasId===cv&&o.pageId===pg).sort((a,b)=>(a.z||0)-(b.z||0)); },

  async ensureMeta(){
    const s=await FS.getDoc(this.metaRef());
    if(!s.exists()){
      await FS.setDoc(this.metaRef(), {
        canvases:[{id:"main",name:"主白板"}], activeCanvas:"main",
        pages:{main:[{id:"p1",name:"頁 1"}]}, activePage:{main:"p1"},
        studentsCanEdit:true, allowEditAll:true, active:true
      });
    }else if(s.data().active===false){
      await FS.updateDoc(this.metaRef(), {active:true});
    }
  },

  /* ---------- 掛載 ---------- */
  mountTeacher(c){ this.mount(c, true); },
  mountStudent(c){ this.mount(c, false); },
  async mount(c, isTeacher){
    const isMobile=matchMedia("(max-width:880px)").matches;
    c.innerHTML=`
      <div class="wb-layout glass">
        <div class="wb-topbar" id="wb-topbar">
          ${isTeacher?`<select class="field" id="wb-canvas-sel" style="width:auto;padding:4px 8px;font-size:12.5px"></select>
          <button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="wb-canvas-add" title="新增畫布">＋畫布</button>`:`<span class="badge badge-amber" id="wb-canvas-name"></span>`}
          <div id="wb-pages" style="display:flex;gap:5px;overflow-x:auto;flex:1;align-items:center"></div>
          ${isTeacher?`<button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="wb-page-add">＋頁</button>`:""}
          <button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="wb-zoom-out">−</button>
          <span class="num" id="wb-zoom-lbl" style="font-size:12px;font-weight:800;min-width:42px;text-align:center">100%</span>
          <button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="wb-zoom-in">＋</button>
          <button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="wb-zoom-fit">⊡</button>
          ${isTeacher?`
          <button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="wb-perm-edit" title="切換：學生可否編輯白板"></button>
          <button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="wb-perm-all" title="切換：學生可否編輯他人物件"></button>
          <button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="wb-export">匯出</button>
          <button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="wb-side-toggle" title="參與者名單">👥</button>
          <button class="ctpbtn ctpbtn-ghost ctpbtn-sm" id="wb-fullscreen" title="全螢幕放大白板">🔳 全螢幕</button>
          <button class="ctpbtn ctpbtn-danger ctpbtn-sm" id="wb-end">🏁 結束白板</button>`:""}
        </div>
        <div id="wb-canvas-wrap">
          <canvas id="wb-canvas"></canvas>
          <div class="wb-toolbar glass" id="wb-toolbar"></div>
          <div id="wb-side"></div>
        </div>
        <div id="wb-gate" class="hidden" style="position:absolute;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;
          background:rgba(241,245,249,.88);backdrop-filter:blur(8px);border-radius:var(--radius)">
          <div class="glass" style="padding:34px 44px;text-align:center;max-width:380px">
            <div style="font-size:46px">🖌️</div>
            <div id="wb-gate-text" style="font-weight:900;font-size:19px;margin:10px 0 16px"></div>
            ${isTeacher?`<button class="ctpbtn ctpbtn-grad" id="wb-open" style="font-size:17px;padding:13px 34px">開啟白板</button>`:""}
          </div>
        </div>
      </div>
      <div id="wb-ctxmenu" class="glass"></div>`;
    this.cv=$("wb-canvas"); this.ctx=this.cv.getContext("2d");
    this._onResize=()=>this.resize(); window.addEventListener("resize", this._onResize);
    this.resize();
    this.renderToolbar();
    this.bindCanvas();
    const openBtn=$("wb-open");
    if(openBtn) openBtn.onclick=async()=>{
      try{ await this.ensureMeta(); UI.toast("白板已開啟","ok"); }
      catch(e){ UI.toast("開啟白板失敗："+(e.message||e),"err"); }
    };
    if(isTeacher){
      $("wb-canvas-add").onclick=()=>this.addCanvas();
      $("wb-page-add").onclick=()=>this.addPage();
      $("wb-export").onclick=()=>this.openExport();
      $("wb-end").onclick=()=>this.endWhiteboard();
      $("wb-perm-edit").onclick=()=>{
        if(!this.meta) return;
        FS.updateDoc(this.metaRef(),{studentsCanEdit:!this.meta.studentsCanEdit}).catch(()=>{});
      };
      $("wb-perm-all").onclick=()=>{
        if(!this.meta||!this.meta.studentsCanEdit) return;
        FS.updateDoc(this.metaRef(),{allowEditAll:this.meta.allowEditAll===false}).catch(()=>{});
      };
      $("wb-side-toggle").onclick=()=>{ $("wb-side").classList.toggle("open"); this.renderSide(); };
      $("wb-fullscreen").onclick=()=>{
        const on=document.body.classList.toggle("wb-maxed");
        const b=$("wb-fullscreen");
        b.innerHTML=on?"🗗 還原":"🔳 全螢幕";
        b.className="ctpbtn ctpbtn-sm "+(on?"ctpbtn-grad":"ctpbtn-ghost");
        requestAnimationFrame(()=>{ this.resize(); setTimeout(()=>this.resize(),60); });
      };
      $("wb-canvas-sel").onchange=e=>FS.updateDoc(this.metaRef(),{activeCanvas:e.target.value});
      this._onParts=()=>this.renderSide();
      document.addEventListener("ctp:participants", this._onParts);
    }
    $("wb-zoom-in").onclick=()=>this.zoom(1.2);
    $("wb-zoom-out").onclick=()=>this.zoom(1/1.2);
    $("wb-zoom-fit").onclick=()=>{ this.view={x:0,y:0,s:1}; this.redraw(); };
    // 監聽
    const u1=FS.onSnapshot(this.metaRef(), s=>{
      const prev=this.meta; this.meta=s.exists()?s.data():null;
      this.renderGate(isTeacher);
      this.renderTopbar(isTeacher);
      if(!isTeacher) this.renderToolbar(); // 權限可能變更
      this.redraw();
    });
    const u2=FS.onSnapshot(this.objCol(), s=>{
      this.objects=s.docs.map(d=>({id:d.id,...d.data()}));
      // 拖曳/縮放中：以本地操作中的版本為準，避免快照中斷拖曳
      const d=this._drag;
      if(d&&d.obj){
        const i=this.objects.findIndex(o=>o.id===d.obj.id);
        if(i>=0) this.objects[i]=d.obj;
      }
      this.redraw();
    });
    State.moduleUnsubs.push(u1,u2);
  },

  resize(){
    const w=$("wb-canvas-wrap"); if(!w||!this.cv) return;
    const r=w.getBoundingClientRect();
    this.cv.width=r.width*devicePixelRatio; this.cv.height=r.height*devicePixelRatio;
    this.cv.style.width=r.width+"px"; this.cv.style.height=r.height+"px";
    this.redraw();
  },
  zoom(f){
    this.view.s=Math.min(4,Math.max(.2,this.view.s*f));
    $("wb-zoom-lbl").textContent=Math.round(this.view.s*100)+"%";
    this.redraw();
  },

  /** 白板開啟/關閉閘門：未開啟時教師看到「開啟白板」、學生看到等待畫面 */
  renderGate(isTeacher){
    const gate=$("wb-gate"); if(!gate) return;
    const active=!!this.meta && this.meta.active!==false;
    gate.classList.toggle("hidden", active);
    const endBtn=$("wb-end"); if(endBtn) endBtn.classList.toggle("hidden", !active);
    const txt=$("wb-gate-text");
    if(txt) txt.textContent=isTeacher?"白板尚未開啟":"白板尚未開啟，等待老師開啟…";
    if(isTeacher) this.renderPermBtns(active);
  },

  /** 頂部列的兩個權限開關按鈕 */
  renderPermBtns(active){
    const b1=$("wb-perm-edit"), b2=$("wb-perm-all");
    if(!b1||!b2) return;
    b1.classList.toggle("hidden", !active);
    b2.classList.toggle("hidden", !active);
    if(!active) return;
    const canEdit=!!this.meta?.studentsCanEdit;
    const editAll=this.meta?.allowEditAll!==false;
    b1.textContent=canEdit?"🔓 學生可編輯":"🔒 學生鎖定中";
    b1.className="ctpbtn ctpbtn-sm "+(canEdit?"ctpbtn-grad":"ctpbtn-danger");
    b2.textContent=editAll?"👥 可動他人物件":"🙋 僅能動自己的";
    b2.className="ctpbtn ctpbtn-sm "+(editAll?"ctpbtn-grad":"ctpbtn-ghost");
    b2.style.opacity=canEdit?"1":".45";
    b2.style.pointerEvents=canEdit?"auto":"none";
  },

  async endWhiteboard(){
    const box=UI.modal(`
      <h3 style="margin:0 0 6px;font-weight:900">🏁 結束白板</h3>
      <p class="hint" style="margin:0 0 14px">結束後白板資料將清空，學生端會回到「等待老師發送互動」畫面。要先儲存白板內容嗎？</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="ctpbtn ctpbtn-grad" id="we-json">💾 儲存 JSON 後結束</button>
        <button class="ctpbtn ctpbtn-grad" id="we-pdf">📑 下載 PDF 後結束</button>
        <button class="ctpbtn ctpbtn-danger" id="we-clear">🗑 直接清空並結束</button>
      </div>
      <div style="text-align:right;margin-top:12px"><button class="ctpbtn ctpbtn-ghost" id="we-cancel">取消</button></div>`);
    box.querySelector("#we-cancel").onclick=()=>UI.closeModal();
    const finish=async(save)=>{
      UI.closeModal();
      try{
        if(save==="json") this.exportJson();
        if(save==="pdf") await this.exportPdf();
        const b=UI.modal(`<div style="text-align:center;padding:20px;font-weight:900">🧹 正在清空白板資料…</div>`);
        // 刪除所有物件（全部畫布）與 meta
        await FS.deleteTree(this.objCol()); // 伺服器端一次清空，不需逐筆讀取
        await FS.deleteDoc(this.metaRef());
        // 學生回到互動工具的等待畫面
        await FS.setDoc(FS.doc(Fire.roomCol("tools"),"control"), {mode:null, payload:{}, paused:false, round:String(Date.now())});
        await RoomService.setMode("tools");
        UI.closeModal();
        UI.toast("✅ 白板已結束並清空","ok");
        Shell.onModeChanged("tools", false);
      }catch(e){
        UI.closeModal();
        UI.toast("結束白板失敗："+(e.message||e.code||e),"err",4000);
      }
    };
    box.querySelector("#we-json").onclick=()=>finish("json");
    box.querySelector("#we-pdf").onclick=()=>finish("pdf");
    box.querySelector("#we-clear").onclick=async()=>{
      if(await UI.confirm("確定不儲存、直接清空白板資料？此動作無法復原。")) finish(null);
    };
  },

  exportJson(){
    const cv=this.curCanvas();
    const data={canvas:this.meta?.canvases?.find(x=>x.id===cv), pages:this.pageList(),
      objects:this.objects.filter(o=>o.canvasId===cv).map(({id,...r})=>r)};
    UI.download(`白板_${State.roomCode}_${cv}.json`, JSON.stringify(data));
  },

  renderTopbar(isTeacher){
    if(!this.meta) return;
    const canvases=this.meta.canvases||[];
    if(isTeacher){
      const sel=$("wb-canvas-sel"); if(sel){
        sel.innerHTML=canvases.map(cn=>`<option value="${cn.id}">${esc(cn.name)}</option>`).join("");
        sel.value=this.curCanvas();
      }
    }else{
      const el=$("wb-canvas-name");
      if(el) el.textContent="🖼 "+(canvases.find(x=>x.id===this.curCanvas())?.name||"白板");
    }
    const pages=this.pageList(), cur=this.curPage();
    const pe=$("wb-pages"); if(!pe) return;
    pe.innerHTML=pages.map((p,i)=>`
      <span class="wb-page-tab ${p.id===cur?'active':''}" data-pid="${p.id}" ${isTeacher?'draggable="true"':''}>${esc(p.name)}
      ${isTeacher&&pages.length>1?`<span data-pdel="${p.id}" style="margin-left:4px;opacity:.6">✕</span>`:""}</span>`).join("");
    if(isTeacher){
      let dragId=null;
      pe.querySelectorAll(".wb-page-tab").forEach(t=>{
        t.onclick=e=>{
          if(e.target.dataset.pdel){ this.delPage(e.target.dataset.pdel); return; }
          FS.updateDoc(this.metaRef(),{["activePage."+this.curCanvas()]:t.dataset.pid});
        };
        t.addEventListener("dragstart",()=>dragId=t.dataset.pid);
        t.addEventListener("dragover",e=>e.preventDefault());
        t.addEventListener("drop",e=>{
          e.preventDefault();
          const arr=[...this.pageList()];
          const from=arr.findIndex(p=>p.id===dragId), to=arr.findIndex(p=>p.id===t.dataset.pid);
          if(from<0||to<0||from===to) return;
          const [m]=arr.splice(from,1); arr.splice(to,0,m);
          FS.updateDoc(this.metaRef(),{["pages."+this.curCanvas()]:arr});
        });
      });
    }else{
      pe.querySelectorAll(".wb-page-tab").forEach(t=>t.style.pointerEvents="none");
    }
  },

  renderToolbar(){
    const bar=$("wb-toolbar"); if(!bar) return;
    if(!this.canEdit()){
      bar.innerHTML=`<div class="badge badge-amber" style="writing-mode:vertical-rl;padding:10px 4px">🔒 老師鎖定編輯中</div>`;
      return;
    }
    const tools=[["select","🖱️","選取/移動 (V)"],["pen","✏️","畫筆 (P)"],["rect","▭","矩形"],["ellipse","◯","圓形"],["arrow","➝","箭頭"],["sticky","🗒️","便利貼 (N)"],["pan","✋","平移畫布 (H)"],["eraser","🧽","橡皮擦 (E)"]];
    bar.innerHTML=tools.map(([id,ic,t])=>`<button class="wb-tool ${this.tool===id?'active':''}" data-tool="${id}" title="${t}">${ic}</button>`).join("")
      +`<button class="wb-tool" id="wb-img" title="插入圖片">🖼️</button>
      <input type="file" id="wb-img-file" accept="image/*" class="hidden">
      <button class="wb-tool" id="wb-pdf" title="插入 PDF 頁面">📄</button>
      <input type="file" id="wb-pdf-file" accept=".pdf" class="hidden">
      <button class="wb-tool" id="wb-del" title="刪除選取 (Delete)">🗑</button>
      ${State.role==="teacher"?`<button class="wb-tool ${this.showAuthors?'active':''}" id="wb-authors" title="顯示/隱藏作者姓名">👤</button>`:""}
      ${this.tool==="sticky"?`<div class="span2" style="display:flex;flex-wrap:wrap;gap:4px;padding:4px 2px;border-top:1px solid rgba(148,163,184,.3)">
        ${STICKY_COLORS.map(c=>`<span class="wb-color ${this.stickyColor===c?'active':''}" data-sc="${c}" style="background:${c};width:17px;height:17px" title="便利貼顏色"></span>`).join("")}</div>`:""}
      <div class="span2" style="display:flex;align-items:center;gap:5px;padding:5px 2px 2px;border-top:1px solid rgba(148,163,184,.3)">
        <span style="width:16px;height:16px;border-radius:50%;background:${this.color};border:1.5px solid rgba(148,163,184,.5);flex:0 0 auto"></span>
        <select class="field" id="wb-color" style="padding:3px;font-size:12px;flex:1;min-width:0">
          ${WB_COLORS.map(c=>`<option value="${c}" ${this.color===c?"selected":""}>${WB_COLOR_NAMES[c]||c}</option>`).join("")}
        </select>
      </div>
      <select class="field span2" id="wb-width" style="padding:3px;font-size:11px;width:100%">
        <option value="2">細</option><option value="4" ${this.width===4?"selected":""}>中</option><option value="8">粗</option><option value="14">特粗</option></select>`;
    bar.querySelectorAll("[data-tool]").forEach(b=>b.onclick=()=>{ this.tool=b.dataset.tool; this.sel=null; this.renderToolbar(); this.redraw(); });
    bar.querySelector("#wb-color").onchange=e=>{
      this.color=e.target.value;
      const o=this.objects.find(x=>x.id===this.sel);
      if(o&&this.canModify(o)&&o.type!=="image") this.updateObj(this.sel,{color:this.color});
      this.renderToolbar();
    };
    bar.querySelectorAll("[data-sc]").forEach(b=>b.onclick=()=>{ this.stickyColor=b.dataset.sc; this.renderToolbar(); });
    bar.querySelector("#wb-width").onchange=e=>{
      this.width=Number(e.target.value);
      const o=this.objects.find(x=>x.id===this.sel);
      if(o&&this.canModify(o)) this.updateObj(this.sel,{width:this.width});
    };
    bar.querySelector("#wb-del").onclick=()=>this.deleteSelected();
    bar.querySelector("#wb-img").onclick=()=>bar.querySelector("#wb-img-file").click();
    bar.querySelector("#wb-img-file").onchange=e=>{ if(e.target.files[0]) this.insertImage(e.target.files[0]); e.target.value=""; };
    bar.querySelector("#wb-pdf").onclick=()=>bar.querySelector("#wb-pdf-file").click();
    bar.querySelector("#wb-pdf-file").onchange=e=>{ if(e.target.files[0]) this.insertPdf(e.target.files[0]); e.target.value=""; };
    const ab=bar.querySelector("#wb-authors");
    if(ab) ab.onclick=()=>{ this.showAuthors=!this.showAuthors; this.renderToolbar(); this.redraw(); };
  },

  deleteSelected(){
    const o=this.objects.find(x=>x.id===this.sel);
    if(o&&this.canModify(o)){ this.deleteObj(o.id); this.sel=null; this.redraw(); }
  },

  /* ---------- 插入圖片 / PDF ---------- */
  viewCenter(){
    const r=this.cv.getBoundingClientRect();
    return {x:(r.width/2-this.view.x)/this.view.s, y:(r.height/2-this.view.y)/this.view.s};
  },
  async insertImage(file){
    if(!this.canEdit()){ UI.toast("目前無編輯權限","err"); return; }
    try{
      const data=await UI.compressImage(await UI.fileToDataURL(file), 1000, .75);
      const im=new Image();
      im.onload=()=>{
        const w=Math.min(420, im.width), h=w*im.height/im.width;
        const c=this.viewCenter();
        this.addObj({type:"image", x:c.x-w/2, y:c.y-h/2, w, h, src:data});
      };
      im.src=data;
    }catch(e){ UI.toast("圖片插入失敗","err"); }
  },
  async insertPdf(file){
    if(!this.canEdit()){ UI.toast("目前無編輯權限","err"); return; }
    UI.toast("PDF 解析中…","info");
    try{
      const picked=await PdfUtil.pickPages(file);   // 逐頁預覽勾選（含全選）
      if(!picked) return;
      const c=this.viewCenter();
      for(let k=0;k<picked.length;k++){
        const pg=picked[k];
        const w=460, h=w*pg.h/pg.w;
        await this.addObj({type:"image", x:c.x-w/2+k*34, y:c.y-h/2+k*34, w, h, src:pg.dataURL});
      }
      UI.toast(`已插入 ${picked.length} 頁 PDF`,"ok");
    }catch(e){ UI.toast("PDF 插入失敗："+e.message,"err"); }
  },

  renderSide(){
    const side=$("wb-side"); if(!side||!side.classList.contains("open")) return;
    const parts=State.participants||[];
    side.innerHTML=`
      <div style="font-weight:900;margin-bottom:8px">👥 參與者（${parts.length}）</div>
      ${parts.map(p=>`<div class="resp-item" style="padding:6px 9px"><span class="nm" style="font-size:13px">${p.role==="teacher"?"🧑‍🏫":"🙋"} ${esc(p.name)}</span>
        ${p.role==="student"?`<button class="ctpbtn ctpbtn-danger ctpbtn-sm" data-kick="${p.id}" style="margin-left:auto;padding:2px 8px">踢出</button>`:""}</div>`).join("")}
      <p class="hint" style="margin-top:10px">物件權限開關位於上方工具列（🔓 學生可編輯／👥 可動他人物件）。</p>`;
    side.querySelectorAll("[data-kick]").forEach(b=>b.onclick=async()=>{
      if(await UI.confirm("確定將此學生移出在線名單？")) FS.deleteDoc(Fire.roomDoc("participants", b.dataset.kick));
    });
  },

  /* ---------- 畫布座標與繪製 ---------- */
  toWorld(e){
    const r=this.cv.getBoundingClientRect();
    const t=e.touches?e.touches[0]:e;
    return {x:(t.clientX-r.left-this.view.x)/this.view.s, y:(t.clientY-r.top-this.view.y)/this.view.s};
  },

  redraw(){
    const ctx=this.ctx; if(!ctx) return;
    ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
    ctx.clearRect(0,0,this.cv.width,this.cv.height);
    ctx.fillStyle="#FFFFFF"; ctx.fillRect(0,0,this.cv.width,this.cv.height);
    ctx.translate(this.view.x,this.view.y); ctx.scale(this.view.s,this.view.s);
    for(const o of this.curObjects()){
      this.drawObj(ctx,o);
      if(this.showAuthors&&o.owner) this.drawAuthorLabel(ctx,o);
    }
    if(this._tempObj) this.drawObj(ctx,this._tempObj);
    // 選取框 + 右下角縮放控制點
    if(this.sel){
      const o=this.objects.find(x=>x.id===this.sel);
      if(o){ const b=this.bounds(o);
        ctx.strokeStyle="#F97316"; ctx.lineWidth=1.5/this.view.s; ctx.setLineDash([6/this.view.s,4/this.view.s]);
        ctx.strokeRect(b.x-6,b.y-6,b.w+12,b.h+12); ctx.setLineDash([]);
        const hs=10/this.view.s;
        ctx.fillStyle="#F97316";
        ctx.fillRect(b.x+b.w+6-hs/2, b.y+b.h+6-hs/2, hs, hs);
        ctx.strokeStyle="#fff"; ctx.lineWidth=1.5/this.view.s;
        ctx.strokeRect(b.x+b.w+6-hs/2, b.y+b.h+6-hs/2, hs, hs);
      }
    }
  },

  drawObj(ctx,o){
    ctx.strokeStyle=o.color||"#1E293B"; ctx.fillStyle=o.color||"#1E293B";
    ctx.lineWidth=o.width||4; ctx.lineCap="round"; ctx.lineJoin="round";
    if(o.type==="pen"&&o.points?.length>=2){
      // points 為扁平陣列 [x0,y0,x1,y1,…]（Firestore 不支援巢狀陣列）
      ctx.beginPath(); ctx.moveTo(o.points[0],o.points[1]);
      for(let i=2;i<o.points.length;i+=2) ctx.lineTo(o.points[i],o.points[i+1]);
      ctx.stroke();
    }else if(o.type==="rect"){
      ctx.strokeRect(o.x,o.y,o.w,o.h);
    }else if(o.type==="ellipse"){
      ctx.beginPath(); ctx.ellipse(o.x+o.w/2,o.y+o.h/2,Math.abs(o.w/2),Math.abs(o.h/2),0,0,Math.PI*2); ctx.stroke();
    }else if(o.type==="arrow"){
      const x2=o.x+o.w, y2=o.y+o.h;
      ctx.beginPath(); ctx.moveTo(o.x,o.y); ctx.lineTo(x2,y2); ctx.stroke();
      const ang=Math.atan2(o.h,o.w), L=10+(o.width||4)*2;
      ctx.beginPath(); ctx.moveTo(x2,y2);
      ctx.lineTo(x2-L*Math.cos(ang-.45),y2-L*Math.sin(ang-.45));
      ctx.lineTo(x2-L*Math.cos(ang+.45),y2-L*Math.sin(ang+.45));
      ctx.closePath(); ctx.fill();
    }else if(o.type==="image"){
      const im=this.imgFor(o.src);
      if(im.complete&&im.naturalWidth){ ctx.drawImage(im, o.x, o.y, o.w, o.h); }
      else{ ctx.fillStyle="rgba(148,163,184,.2)"; ctx.fillRect(o.x,o.y,o.w,o.h); }
    }else if(o.type==="sticky"){
      ctx.fillStyle=o.color||"#FEF08A";
      ctx.shadowColor="rgba(15,23,42,.2)"; ctx.shadowBlur=6; ctx.shadowOffsetY=3;
      ctx.fillRect(o.x,o.y,o.w||160,o.h||120);
      ctx.shadowColor="transparent";
      ctx.fillStyle="#1E293B"; ctx.font="14px 'Noto Sans TC'"; ctx.textBaseline="top";
      const words=String(o.text||"").split(""); let line="",y=o.y+10;
      for(const ch of words){
        if(ctx.measureText(line+ch).width>(o.w||160)-20||ch==="\n"){ ctx.fillText(line,o.x+10,y); y+=19; line=ch==="\n"?"":ch; }
        else line+=ch;
      }
      ctx.fillText(line,o.x+10,y);
    }
    if(o.locked){
      const b=this.bounds(o);
      ctx.font="12px sans-serif"; ctx.fillStyle="#94A3B8"; ctx.fillText("🔒",b.x+b.w-4,b.y-14);
    }
  },

  imgFor(src){
    let im=this._imgCache[src];
    if(!im){
      im=new Image();
      im.onload=()=>this.redraw();
      im.src=src;
      this._imgCache[src]=im;
    }
    return im;
  },

  /** 物件作者標籤（顯示誰畫的） */
  drawAuthorLabel(ctx,o){
    const b=this.bounds(o);
    const fs=12/this.view.s;
    ctx.font=`700 ${fs}px 'Noto Sans TC',sans-serif`;
    const text=o.owner;
    const w=ctx.measureText(text).width+10/this.view.s, h=fs*1.6;
    const x=b.x, y=b.y-h-3/this.view.s;
    ctx.fillStyle="rgba(249,115,22,.85)";
    ctx.beginPath();
    if(ctx.roundRect) ctx.roundRect(x,y,w,h,4/this.view.s); else ctx.rect(x,y,w,h);
    ctx.fill();
    ctx.fillStyle="#fff"; ctx.textBaseline="middle";
    ctx.fillText(text, x+5/this.view.s, y+h/2);
  },

  bounds(o){
    if(o.type==="pen"&&o.points?.length){
      const xs=o.points.filter((_,i)=>i%2===0), ys=o.points.filter((_,i)=>i%2===1);
      const x=Math.min(...xs), y=Math.min(...ys);
      return {x, y, w:Math.max(...xs)-x, h:Math.max(...ys)-y};
    }
    let {x,y,w=0,h=0}=o;
    if(o.type==="sticky"){ w=o.w||160; h=o.h||120; }
    if(w<0){x+=w;w=-w} if(h<0){y+=h;h=-h}
    return {x,y,w,h};
  },
  hitTest(pt){
    const objs=this.curObjects();
    for(let i=objs.length-1;i>=0;i--){
      const b=this.bounds(objs[i]);
      if(pt.x>=b.x-6&&pt.x<=b.x+b.w+6&&pt.y>=b.y-6&&pt.y<=b.y+b.h+6) return objs[i];
    }
    return null;
  },

  /* ---------- 互動 ---------- */
  bindCanvas(){
    const cv=this.cv;
    let pinch=null;
    cv.addEventListener("pointerdown", e=>{
      if(e.button===2) return;
      $("wb-ctxmenu").style.display="none";
      try{ cv.setPointerCapture(e.pointerId); }catch(err){}
      const pt=this.toWorld(e);
      if(this.tool==="pan"||!this.canEdit()){
        this._drag={kind:"pan",sx:e.clientX,sy:e.clientY,vx:this.view.x,vy:this.view.y};
        return;
      }
      if(this.tool==="select"){
        // 先檢查是否點在選取物件的縮放控制點上
        if(this.sel){
          const so=this.objects.find(x=>x.id===this.sel);
          if(so&&this.canModify(so)){
            const b=this.bounds(so);
            if(Math.abs(pt.x-(b.x+b.w+6))<12/this.view.s && Math.abs(pt.y-(b.y+b.h+6))<12/this.view.s){
              this._drag={kind:"resize", obj:so, b, sx:pt.x, sy:pt.y,
                orig:{x:so.x, y:so.y, w:so.w, h:so.h, points:so.points?[...so.points]:null}};
              return;
            }
          }
        }
        const hit=this.hitTest(pt);
        this.sel=hit?hit.id:null;
        if(hit&&this.canModify(hit)) this._drag={kind:"move",obj:hit,sx:pt.x,sy:pt.y,ox:hit.x,oy:hit.y,pts:hit.points?[...hit.points]:null};
        else if(!hit) this._drag={kind:"pan",sx:e.clientX,sy:e.clientY,vx:this.view.x,vy:this.view.y};
        this.redraw(); return;
      }
      if(this.tool==="eraser"){
        const hit=this.hitTest(pt);
        if(hit&&this.canModify(hit)) this.deleteObj(hit.id);
        this._drag={kind:"erase"};
        return;
      }
      if(this.tool==="sticky"){
        UI.promptMultiline("便利貼內容（可多行）：").then(text=>{
          if(text) this.addObj({type:"sticky",x:pt.x,y:pt.y,w:170,h:130,text,color:this.stickyColor});
        });
        return;
      }
      if(this.tool==="pen"){
        this._tempObj={type:"pen",points:[pt.x,pt.y],color:this.color,width:this.width};
        this._drag={kind:"draw"};
      }else{
        this._tempObj={type:this.tool,x:pt.x,y:pt.y,w:0,h:0,color:this.color,width:this.width};
        this._drag={kind:"shape"};
      }
    });
    cv.addEventListener("pointermove", e=>{
      if(!this._drag) return;
      const pt=this.toWorld(e);
      const d=this._drag;
      if(d.kind==="pan"){
        this.view.x=d.vx+(e.clientX-d.sx); this.view.y=d.vy+(e.clientY-d.sy); this.redraw();
      }else if(d.kind==="draw"){
        this._tempObj.points.push(pt.x,pt.y); this.redraw();
      }else if(d.kind==="shape"){
        this._tempObj.w=pt.x-this._tempObj.x; this._tempObj.h=pt.y-this._tempObj.y; this.redraw();
      }else if(d.kind==="move"){
        const dx=pt.x-d.sx, dy=pt.y-d.sy;
        if(d.pts){ d.obj.points=d.pts.map((v,i)=>i%2===0?v+dx:v+dy); }
        else{ d.obj.x=d.ox+dx; d.obj.y=d.oy+dy; }
        this.redraw();
      }else if(d.kind==="resize"){
        // 以選取框左上角為錨點等比縮放
        const fx=Math.max(.05,(d.b.w+(pt.x-d.sx))/Math.max(d.b.w,1));
        const fy=Math.max(.05,(d.b.h+(pt.y-d.sy))/Math.max(d.b.h,1));
        const o=d.obj, g=d.orig;
        if(g.points){
          o.points=g.points.map((v,i)=>i%2===0 ? d.b.x+(v-d.b.x)*fx : d.b.y+(v-d.b.y)*fy);
          o.width=Math.max(1,(o.width||4));
        }else{
          o.x=d.b.x+((g.x??d.b.x)-d.b.x)*fx;
          o.y=d.b.y+((g.y??d.b.y)-d.b.y)*fy;
          if(g.w!=null) o.w=g.w*fx;
          if(g.h!=null) o.h=g.h*fy;
        }
        this.redraw();
      }else if(d.kind==="erase"){
        const hit=this.hitTest(pt);
        if(hit&&this.canModify(hit)) this.deleteObj(hit.id);
      }
    });
    const up=e=>{
      const d=this._drag; this._drag=null;
      if(!d) return;
      if(d.kind==="draw"&&this._tempObj.points.length>=4){
        // 每隔一個取樣點簡化（保留首尾），並四捨五入到 0.1
        const src=this._tempObj.points, pts=[];
        for(let i=0;i<src.length;i+=4){ pts.push(Math.round(src[i]*10)/10, Math.round(src[i+1]*10)/10); }
        const lx=src[src.length-2], ly=src[src.length-1];
        if(pts[pts.length-2]!==lx||pts[pts.length-1]!==ly) pts.push(Math.round(lx*10)/10, Math.round(ly*10)/10);
        this.addObj({...this._tempObj, points:pts});
      }else if(d.kind==="shape"&&(Math.abs(this._tempObj.w)>4||Math.abs(this._tempObj.h)>4)){
        this.addObj(this._tempObj);
      }else if(d.kind==="move"){
        const o=d.obj;
        this.updateObj(o.id, o.points?{points:o.points}:{x:o.x,y:o.y});
      }else if(d.kind==="resize"){
        const o=d.obj;
        this.updateObj(o.id, o.points?{points:o.points}:{x:o.x,y:o.y,w:o.w??null,h:o.h??null});
      }
      this._tempObj=null; this.redraw();
    };
    cv.addEventListener("pointerup",up); cv.addEventListener("pointercancel",up);
    cv.addEventListener("wheel", e=>{ e.preventDefault(); this.zoom(e.deltaY<0?1.1:1/1.1); }, {passive:false});
    // 右鍵選單
    // 雙擊便利貼可編輯文字
    cv.addEventListener("dblclick", e=>{
      const hit=this.hitTest(this.toWorld(e));
      if(hit?.type==="sticky"&&this.canModify(hit)){
        UI.promptMultiline("編輯便利貼內容（可多行）：", hit.text||"").then(t=>{ if(t!==null) this.updateObj(hit.id,{text:t}); });
      }
    });
    cv.addEventListener("contextmenu", e=>{
      e.preventDefault();
      const pt=this.toWorld(e);
      const hit=this.hitTest(pt);
      if(!hit) return;
      // 教師永遠可開選單（才能解除鎖定）；學生需有該物件的編輯權（鎖定物件除外，無法操作）
      if(State.role!=="teacher" && !this.canModify(hit)) return;
      this.sel=hit.id; this.redraw();
      const m=$("wb-ctxmenu");
      m.innerHTML=`
        <button data-act="front">⬆ 移到最上層</button>
        <button data-act="back">⬇ 移到最下層</button>
        <button data-act="dup">📄 複製</button>
        <button data-act="lock">${hit.locked?"🔓 解除鎖定":"🔒 鎖定"}</button>
        <button data-act="del" style="color:#DC2626">🗑 刪除</button>`;
      m.style.display="block";
      m.style.left=Math.min(e.clientX, innerWidth-170)+"px";
      m.style.top=Math.min(e.clientY, innerHeight-200)+"px";
      m.querySelectorAll("button").forEach(b=>b.onclick=()=>{
        m.style.display="none";
        const zs=this.curObjects().map(o=>o.z||0);
        const act=b.dataset.act;
        if(act==="front") this.updateObj(hit.id,{z:Math.max(0,...zs)+1});
        else if(act==="back") this.updateObj(hit.id,{z:Math.min(0,...zs)-1});
        else if(act==="dup"){ const {id,...rest}=hit; this.addObj({...rest, x:(rest.x||0)+20, y:(rest.y||0)+20, points:rest.points?.map(v=>v+20)}); }
        else if(act==="lock") this.updateObj(hit.id,{locked:!hit.locked});
        else if(act==="del") this.deleteObj(hit.id);
      });
    });
    document.addEventListener("click", ()=>{ const m=$("wb-ctxmenu"); if(m) m.style.display="none"; });
    // 鍵盤快捷鍵：V 選取 / P 畫筆 / H 平移 / N 便利貼 / E 橡皮擦 / Delete 刪除選取
    this._onKey=e=>{
      if(State.currentMode!=="whiteboard") return;
      if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||document.getElementById("shell-modal-root").classList.contains("show")) return;
      const map={v:"select", p:"pen", h:"pan", n:"sticky", e:"eraser"};
      const k=e.key.toLowerCase();
      if(map[k]&&this.canEdit()){ this.tool=map[k]; this.sel=null; this.renderToolbar(); this.redraw(); }
      else if(e.key==="Delete"||e.key==="Backspace"){ if(this.sel) this.deleteSelected(); }
    };
    document.addEventListener("keydown", this._onKey);
  },

  async addObj(o){
    if(!this.canEdit()) return;
    const zs=this.curObjects().map(x=>x.z||0);
    const data={...o, canvasId:this.curCanvas(), pageId:this.curPage(),
      z:Math.max(0,...zs)+1, owner:State.name, locked:o.locked||false};
    // 樂觀更新：先放入本地立即顯示，再寫入 Firestore（snapshot 回來時以同 id 覆蓋）
    const ref=FS.doc(this.objCol());
    this.objects.push({id:ref.id, ...data});
    this.redraw();
    try{
      await FS.setDoc(ref, data);
    }catch(e){
      this.objects=this.objects.filter(x=>x.id!==ref.id);
      this.redraw();
      UI.toast("白板同步失敗："+(e.message||e.code||e),"err");
    }
  },
  updateObj(id, patch){ FS.updateDoc(FS.doc(this.objCol(),id), patch).catch(()=>{}); },
  deleteObj(id){ FS.deleteDoc(FS.doc(this.objCol(),id)).catch(()=>{}); },

  /* ---------- 頁面 / 畫布管理 ---------- */
  async addPage(){
    const pages=[...this.pageList()];
    const id="p"+Date.now();
    pages.push({id, name:"頁 "+(pages.length+1)});
    await FS.updateDoc(this.metaRef(),{["pages."+this.curCanvas()]:pages, ["activePage."+this.curCanvas()]:id});
  },
  async delPage(pid){
    if(!await UI.confirm("刪除此頁面及其內容？")) return;
    const pages=this.pageList().filter(p=>p.id!==pid);
    await FS.updateDoc(this.metaRef(),{["pages."+this.curCanvas()]:pages, ["activePage."+this.curCanvas()]:pages[0]?.id||"p1"});
    const dead=this.objects.filter(o=>o.canvasId===this.curCanvas()&&o.pageId===pid);
    const batch=FS.writeBatch(State.db);
    dead.forEach(o=>batch.delete(FS.doc(this.objCol(),o.id)));
    await batch.commit();
  },
  async addCanvas(){
    const name=await UI.prompt("新畫布名稱（例如：第一組）","畫布 "+((this.meta?.canvases?.length||0)+1));
    if(!name) return;
    const id="c"+Date.now();
    await FS.updateDoc(this.metaRef(),{
      canvases:[...(this.meta?.canvases||[]),{id,name}],
      activeCanvas:id,
      ["pages."+id]:[{id:"p1",name:"頁 1"}],
      ["activePage."+id]:"p1"
    });
  },

  /* ---------- 匯出 / 匯入 ---------- */
  openExport(){
    const box=UI.modal(`
      <h3 style="margin:0 0 12px;font-weight:900">匯出 / 匯入</h3>
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="ctpbtn ctpbtn-grad" id="ex-pdf">📑 匯出目前畫布為 PDF（所有頁面）</button>
        <button class="ctpbtn ctpbtn-ghost" id="ex-json">💾 匯出 JSON 備份</button>
        <button class="ctpbtn ctpbtn-ghost" id="im-json">📂 匯入 JSON</button>
        <input type="file" id="im-file" accept=".json" class="hidden">
      </div>
      <div style="text-align:right;margin-top:12px"><button class="ctpbtn ctpbtn-ghost" id="ex-close">關閉</button></div>`);
    box.querySelector("#ex-close").onclick=()=>UI.closeModal();
    box.querySelector("#ex-pdf").onclick=()=>{ UI.closeModal(); this.exportPdf(); };
    box.querySelector("#ex-json").onclick=()=>this.exportJson();
    box.querySelector("#im-json").onclick=()=>box.querySelector("#im-file").click();
    box.querySelector("#im-file").onchange=async e=>{
      const f=e.target.files[0]; if(!f) return;
      try{
        const data=JSON.parse(await f.text());
        const objs=data.objects||[];
        if(!objs.length) throw new Error("無物件");
        const cv=this.curCanvas(), pg=this.curPage();
        for(let i=0;i<objs.length;i+=400){
          const batch=FS.writeBatch(State.db);
          objs.slice(i,i+400).forEach(o=>batch.set(FS.doc(this.objCol(), "imp"+Date.now()+Math.random().toString(36).slice(2,8)),
            {...o, canvasId:cv, pageId:o.pageId&&this.pageList().some(p=>p.id===o.pageId)?o.pageId:pg}));
          await batch.commit();
        }
        UI.closeModal(); UI.toast("匯入完成（共 "+objs.length+" 個物件）","ok");
      }catch(err){ UI.toast("匯入失敗："+err.message,"err"); }
    };
  },

  async exportPdf(){
    UI.toast("產生 PDF 中…","info");
    try{
      const {jsPDF}=window.jspdf;
      const pdf=new jsPDF({orientation:"landscape", unit:"px", format:[1280,720]});
      const pages=this.pageList(), cv=this.curCanvas();
      for(let i=0;i<pages.length;i++){
        const off=document.createElement("canvas"); off.width=1280; off.height=720;
        const ctx=off.getContext("2d");
        ctx.fillStyle="#fff"; ctx.fillRect(0,0,1280,720);
        const objs=this.objects.filter(o=>o.canvasId===cv&&o.pageId===pages[i].id).sort((a,b)=>(a.z||0)-(b.z||0));
        // 自動置入：計算範圍縮放
        if(objs.length){
          const bs=objs.map(o=>this.bounds(o));
          const minX=Math.min(...bs.map(b=>b.x))-30, minY=Math.min(...bs.map(b=>b.y))-30;
          const maxX=Math.max(...bs.map(b=>b.x+b.w))+30, maxY=Math.max(...bs.map(b=>b.y+b.h))+30;
          const s=Math.min(1280/(maxX-minX), 720/(maxY-minY), 1.5);
          ctx.translate((1280-(maxX-minX)*s)/2-minX*s,(720-(maxY-minY)*s)/2-minY*s); ctx.scale(s,s);
        }
        objs.forEach(o=>this.drawObj(ctx,o));
        if(i>0) pdf.addPage([1280,720],"landscape");
        pdf.addImage(off.toDataURL("image/jpeg",.85),"JPEG",0,0,1280,720);
      }
      pdf.save(`白板_${State.roomCode}.pdf`);
    }catch(e){ UI.toast("PDF 匯出失敗："+e.message,"err"); }
  }
};
