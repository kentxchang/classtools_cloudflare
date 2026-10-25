// =====================================================================
// 【同步白板 / 同步簡報 共用 — 共用核心：工具函式、UI、PDF、Shell】 modules/sync-common/ctp-core.js
// 本檔不是獨立的 ES module：build.js 會依 modules/main/index.html 的順序把它組合進
// public/index.html 的 <script type="module">，與同一段的其他檔案共用作用域（變數、函式可直接互相使用）。
// =====================================================================
        import { doc, collection, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, writeBatch, increment, deleteTree } from "./cfdb.js";

        // ====== CTP 子系統：同步白板 / 同步簡報（移植自課堂工具一體化平台 part6/part7） ======
        // 透過 window.__CT 橋接 01classtools 既有的 Firebase 連線與教室代碼。
        const $ = id => document.getElementById(id);
        const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const rand = a => a[Math.floor(Math.random()*a.length)];
        const sleep = ms => new Promise(r=>setTimeout(r,ms));
        const STICKY_COLORS=["#FEF08A","#BBF7D0","#BFDBFE","#FBCFE8","#FED7AA","#DDD6FE"];

        const State = {
            get db(){ return window.__CT.db; },
            get role(){ return window.__CT.role; },
            get name(){ return window.__CT.name || (window.__CT.role==='teacher'?'老師':'同學'); },
            get roomCode(){ return window.__CT.classroomCode; },
            get participants(){ return CTP._participants || []; },
            currentMode:'tools', moduleUnsubs:[]
        };
        const FS = { doc, collection, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, serverTimestamp, writeBatch, increment, deleteTree };
        const Fire = {
            roomCol(...seg){ return collection(State.db,'artifacts',window.__CT.baseAppId,'public','data','classrooms',State.roomCode,...seg); },
            roomDoc(...seg){ return doc(State.db,'artifacts',window.__CT.baseAppId,'public','data','classrooms',State.roomCode,...seg); },
            roomRootDoc(){ return doc(State.db,'artifacts',window.__CT.baseAppId,'public','data','classrooms',State.roomCode); },
            init(){ return Promise.resolve(true); }, bindAutoReconnect(){}
        };
        const ConfigService = { getEffective:()=>({cfg:{projectId:window.__CT.baseAppId}, source:'hardcode'}) };

const UI = {
  toast(msg, type="info", ms=2600){
    const el=document.createElement("div");
    el.className="toast "+(type==="ok"?"ok":type==="err"?"err":"info");
    el.textContent=msg;
    $("shell-toast-root").appendChild(el);
    setTimeout(()=>{ el.style.opacity="0"; el.style.transition="opacity .3s"; setTimeout(()=>el.remove(),320); }, ms);
  },
  modal(html, {wide=false, onClose=null}={}){
    const root=$("shell-modal-root"), box=$("shell-modal-box");
    box.className="glass"+(wide?" wide":"");
    box.innerHTML=html;
    root.classList.add("show");
    root.onclick=(e)=>{ if(e.target===root){ this.closeModal(); onClose&&onClose(); } };
    return box;
  },
  closeModal(){ $("shell-modal-root").classList.remove("show"); $("shell-modal-box").innerHTML=""; },
  async confirm(msg, title="確認"){
    return new Promise(res=>{
      const box=this.modal(`<h3 style="margin:0 0 10px;font-weight:900">${esc(title)}</h3><p style="margin:0 0 18px;line-height:1.6">${esc(msg)}</p>
        <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="ctpbtn ctpbtn-ghost" id="m-no">取消</button><button class="ctpbtn ctpbtn-grad" id="m-yes">確定</button></div>`);
      box.querySelector("#m-no").onclick=()=>{ this.closeModal(); res(false); };
      box.querySelector("#m-yes").onclick=()=>{ this.closeModal(); res(true); };
    });
  },
  async prompt(msg, def=""){
    return new Promise(res=>{
      const box=this.modal(`<h3 style="margin:0 0 10px;font-weight:900">${esc(msg)}</h3>
        <input class="field" id="m-in" value="${esc(def)}">
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
        <button class="ctpbtn ctpbtn-ghost" id="m-no">取消</button><button class="ctpbtn ctpbtn-grad" id="m-yes">確定</button></div>`);
      const inp=box.querySelector("#m-in"); inp.focus(); inp.select();
      inp.onkeydown=e=>{ if(e.key==="Enter") box.querySelector("#m-yes").click(); };
      box.querySelector("#m-no").onclick=()=>{ this.closeModal(); res(null); };
      box.querySelector("#m-yes").onclick=()=>{ const v=inp.value; this.closeModal(); res(v); };
    });
  },
  /** 多行文字輸入（便利貼等用）。Enter 換行，Ctrl/⌘+Enter 或按鈕確定 */
  async promptMultiline(msg, def=""){
    return new Promise(res=>{
      const box=this.modal(`<h3 style="margin:0 0 10px;font-weight:900">${esc(msg)}</h3>
        <textarea class="field" id="m-in" rows="4" style="font-size:15px;line-height:1.6">${esc(def)}</textarea>
        <p class="hint" style="margin:6px 0 0">可換行輸入多行文字</p>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
        <button class="ctpbtn ctpbtn-ghost" id="m-no">取消</button><button class="ctpbtn ctpbtn-grad" id="m-yes">確定</button></div>`);
      const inp=box.querySelector("#m-in"); inp.focus(); inp.select();
      inp.onkeydown=e=>{ if(e.key==="Enter"&&(e.ctrlKey||e.metaKey)) box.querySelector("#m-yes").click(); };
      box.querySelector("#m-no").onclick=()=>{ this.closeModal(); res(null); };
      box.querySelector("#m-yes").onclick=()=>{ const v=inp.value; this.closeModal(); res(v); };
    });
  },
  qr(el, text, size=170){
    el.innerHTML="";
    try{ new QRCode(el, {text, width:size, height:size, correctLevel:QRCode.CorrectLevel.M}); }
    catch(e){ el.textContent="QR 產生失敗"; }
  },
  /** 影像壓縮：回傳 dataURL（JPEG） */
  compressImage(src, maxW=800, quality=0.7){
    return new Promise((res,rej)=>{
      const img=new Image();
      img.onload=()=>{
        const sc=Math.min(1, maxW/img.width);
        const c=document.createElement("canvas");
        c.width=Math.round(img.width*sc); c.height=Math.round(img.height*sc);
        const ctx=c.getContext("2d");
        ctx.fillStyle="#fff"; ctx.fillRect(0,0,c.width,c.height);
        ctx.drawImage(img,0,0,c.width,c.height);
        res(c.toDataURL("image/jpeg", quality));
      };
      img.onerror=rej;
      img.src=src;
    });
  },
  fileToDataURL(file){
    return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });
  },
  download(filename, content, type="application/json"){
    const blob = content instanceof Blob ? content : new Blob([content],{type});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=filename; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
  },
  renderCfgBadges(source, connected){
    const sb=$("cfg-source-badge"), cb=$("cfg-conn-badge");
    const map={ hardcode:["使用原始碼內建設定","badge-amber"], canvas:["使用平台注入設定","badge-amber"], web:["使用網頁自訂設定","badge-blue"], url:["使用網址帶入設定","badge-blue"], none:["尚未設定","badge-gray"] };
    const [t,cls]=map[source]||map.none;
    sb.textContent=t; sb.className="badge "+cls;
    cb.textContent=connected?"✅ 已連線":"未連線";
    cb.className="badge "+(connected?"badge-green":"badge-gray");
  },
  showTransition(text){
    let t=$("shell-transition");
    if(t) t.remove();
    t=document.createElement("div"); t.id="shell-transition";
    t.innerHTML=`<div class="box glass">${esc(text)}</div>`;
    $("shell-main").appendChild(t);
    setTimeout(()=>{ t.style.opacity="0"; t.style.transition="opacity .35s"; setTimeout(()=>t.remove(),360); }, 1000);
  }
};

const PdfUtil = {
  async ensureLib(){
    if(window.pdfjsLib) return;
    await new Promise((res,rej)=>{ const s=document.createElement("script");
      s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
    pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  },
  /** 顯示逐頁預覽勾選視窗，回傳所選頁的高解析圖 [{page,dataURL,w,h}]；取消回傳 null */
  async pickPages(file){
    await this.ensureLib();
    const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
    // 先渲染縮圖
    const thumbs=[];
    for(let i=1;i<=pdf.numPages;i++){
      const page=await pdf.getPage(i);
      const vp=page.getViewport({scale:160/page.getViewport({scale:1}).width});
      const cv=document.createElement("canvas"); cv.width=vp.width; cv.height=vp.height;
      await page.render({canvasContext:cv.getContext("2d"), viewport:vp}).promise;
      thumbs.push(cv.toDataURL("image/jpeg",.6));
    }
    const picked=await new Promise(resolve=>{
      const box=UI.modal(`
        <h3 style="margin:0 0 8px;font-weight:900">📄 選擇要插入的 PDF 頁面 <span class="hint" style="font-weight:500">（共 ${pdf.numPages} 頁）</span></h3>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <label style="display:flex;align-items:center;gap:6px;font-weight:700;font-size:13.5px">
            <input type="checkbox" id="pp-all" checked> 全選</label>
          <span class="badge badge-blue">已選 <span class="num" id="pp-n">${pdf.numPages}</span> 頁</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;max-height:52vh;overflow:auto">
          ${thumbs.map((t,i)=>`
          <label style="position:relative;cursor:pointer;border-radius:10px;overflow:hidden;border:2.5px solid var(--mode-a);display:block" class="pp-cell" data-i="${i}">
            <img src="${t}" style="width:100%;display:block;background:#fff">
            <span style="position:absolute;left:5px;top:4px;font-size:11px;font-weight:900;background:rgba(15,23,42,.6);color:#fff;padding:1px 7px;border-radius:99px" class="num">${i+1}</span>
            <input type="checkbox" class="pp-ck" data-i="${i}" checked style="position:absolute;right:6px;top:6px;width:18px;height:18px;accent-color:var(--mode-a)">
          </label>`).join("")}
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px">
          <button class="ctpbtn ctpbtn-ghost" id="pp-cancel">取消</button>
          <button class="ctpbtn ctpbtn-grad" id="pp-ok">插入選取頁面</button>
        </div>`,{wide:true, onClose:()=>resolve(null)});
      const refresh=()=>{
        const cks=[...box.querySelectorAll(".pp-ck")];
        box.querySelector("#pp-n").textContent=cks.filter(c=>c.checked).length;
        cks.forEach(c=>{ c.closest(".pp-cell").style.borderColor=c.checked?"var(--mode-a)":"rgba(148,163,184,.4)";
          c.closest(".pp-cell").style.opacity=c.checked?"1":".55"; });
        box.querySelector("#pp-all").checked=cks.every(c=>c.checked);
      };
      box.querySelectorAll(".pp-ck").forEach(c=>c.onchange=refresh);
      box.querySelector("#pp-all").onchange=e=>{ box.querySelectorAll(".pp-ck").forEach(c=>c.checked=e.target.checked); refresh(); };
      box.querySelector("#pp-cancel").onclick=()=>{ UI.closeModal(); resolve(null); };
      box.querySelector("#pp-ok").onclick=()=>{
        const sel=[...box.querySelectorAll(".pp-ck")].filter(c=>c.checked).map(c=>Number(c.dataset.i)+1);
        UI.closeModal(); resolve(sel);
      };
    });
    if(!picked||!picked.length) return null;
    // 渲染所選頁高解析圖
    const out=[];
    for(const n of picked){
      const page=await pdf.getPage(n);
      const vp=page.getViewport({scale:1.3});
      const cv=document.createElement("canvas"); cv.width=vp.width; cv.height=vp.height;
      await page.render({canvasContext:cv.getContext("2d"), viewport:vp}).promise;
      out.push({page:n, dataURL:await UI.compressImage(cv.toDataURL("image/jpeg",.8), 1100, .75), w:vp.width, h:vp.height});
    }
    return out;
  }
};

        const Shell = {
            onModeChanged(mode){ if(mode==='tools') CTP.close(); },
            refreshConnHint(){}, refreshDrawer(){}, init(){}
        };
        const RoomService = {
            async setMode(mode){ await window.__CT.setActiveMode(mode==='tools'?'waiting':mode); }
        };
