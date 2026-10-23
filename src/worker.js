// 剛好學 Cloudflare 後端
// - 靜態網頁（public/）由 Workers Static Assets 直接提供，不經過本程式。
// - /api/ws：WebSocket 連線，轉交給對應的 Durable Object（每間教室一個，另有一個 root 存放教室清單）。
// - 每個 Durable Object 內建 SQLite 資料庫，資料常駐記憶體：讀取全部由記憶體回應，
//   寫入則合併後延遲批次落地，以減少資料庫讀寫次數。

import { DurableObject } from "cloudflare:workers";

const FLUSH_DELAY_MS = 1500;           // 寫入合併時間窗：同一文件在此期間多次修改只寫入資料庫一次
const MAX_DOC_BYTES = 1900 * 1024;     // 單一文件上限（SQLite 單列上限 2MB）

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/ws") {
      const name = url.searchParams.get("db") || "";
      if (!name || name.length > 300) return new Response("bad db name", { status: 400 });
      if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
      return env.ROOMS.get(env.ROOMS.idFromName(name)).fetch(request);
    }
    return new Response("Not found", { status: 404 });
  }
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec("CREATE TABLE IF NOT EXISTS docs (path TEXT PRIMARY KEY, data TEXT NOT NULL)");
    this.docs = new Map();
    for (const row of this.sql.exec("SELECT path, data FROM docs")) this.docs.set(row.path, JSON.parse(row.data));
    this.dirty = new Set();
    this.flushTimer = null;
    this.atts = new Map(); // WebSocket → { subs: {sid: [path, isCollection]}, own: [presence paths] }
    // 用戶端心跳 ping 由系統直接回 pong，不喚醒物件、不計費
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch() {
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    this.saveAtt(pair[1], { subs: {}, own: [] });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  att(ws) {
    let a = this.atts.get(ws);
    if (!a) { a = ws.deserializeAttachment() || { subs: {}, own: [] }; this.atts.set(ws, a); }
    return a;
  }
  saveAtt(ws, a) { this.atts.set(ws, a); ws.serializeAttachment(a); }

  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const reply = (body) => ws.send(JSON.stringify({ id: msg.id, ...body }));
    try {
      switch (msg.op) {
        case "get":
          return reply({ data: this.docs.get(msg.path) ?? null });
        case "list":
          return reply({ docs: this.listCol(msg.path) });
        case "write":
          this.applyWrites(msg.writes);
          return reply({ ok: true });
        case "presence": {
          // 在線狀態：連線中有效，WebSocket 斷線時伺服器自動刪除（取代定時心跳寫入）
          this.applyWrites([{ type: "set", path: msg.path, data: msg.data, merge: true }]);
          const a = this.att(ws);
          if (!a.own.includes(msg.path)) { a.own.push(msg.path); this.saveAtt(ws, a); }
          return reply({ ok: true });
        }
        case "sub": {
          const a = this.att(ws);
          a.subs[msg.sid] = [msg.path, !!msg.col];
          this.saveAtt(ws, a);
          ws.send(JSON.stringify(msg.col
            ? { t: "snap", sid: msg.sid, docs: this.listCol(msg.path) }
            : { t: "snap", sid: msg.sid, data: this.docs.get(msg.path) ?? null }));
          return;
        }
        case "unsub": {
          const a = this.att(ws);
          delete a.subs[msg.sid];
          this.saveAtt(ws, a);
          return;
        }
      }
    } catch (e) {
      reply({ err: String(e.message || e), code: e.code || "unknown" });
    }
  }

  async webSocketClose(ws, code, reason) {
    this.dropSocket(ws);
    try { ws.close(code, reason); } catch { /* 已關閉 */ }
  }
  async webSocketError(ws) { this.dropSocket(ws); }

  dropSocket(ws) {
    const own = this.att(ws).own;
    this.atts.delete(ws);
    const stillOwned = new Set();
    for (const other of this.ctx.getWebSockets()) {
      if (other !== ws) this.att(other).own.forEach(p => stillOwned.add(p));
    }
    const gone = own.filter(p => !stillOwned.has(p) && this.docs.has(p));
    if (gone.length) this.applyWrites(gone.map(path => ({ type: "delete", path })));
  }

  listCol(colPath) {
    const prefix = colPath + "/";
    const out = [];
    for (const [p, d] of this.docs) {
      if (p.startsWith(prefix) && !p.includes("/", prefix.length)) out.push([p.slice(prefix.length), d]);
    }
    return out;
  }

  /** 套用一組寫入（全部檢查通過才生效），通知訂閱者，並排程寫入資料庫。 */
  applyWrites(writes) {
    const staged = new Map();
    const cur = (p) => (staged.has(p) ? staged.get(p) : this.docs.get(p));
    for (const w of writes) {
      if (w.type === "deleteTree") {
        const prefix = w.path ? w.path + "/" : "";
        for (const p of this.docs.keys()) if (p === w.path || p.startsWith(prefix)) staged.set(p, undefined);
        for (const p of staged.keys()) if (p === w.path || p.startsWith(prefix)) staged.set(p, undefined);
        continue;
      }
      const old = cur(w.path);
      let next;
      if (w.type === "delete") next = undefined;
      else if (w.type === "set") next = w.merge && old ? mergeDeep(old, w.data) : resolve(w.data, undefined);
      else if (w.type === "update") {
        if (!old) throw Object.assign(new Error("No document to update: " + w.path), { code: "not-found" });
        next = structuredClone(old);
        for (const [k, v] of Object.entries(w.data)) setDotted(next, k.split("."), v);
      } else throw new Error("unknown write type " + w.type);
      if (next && JSON.stringify(next).length > MAX_DOC_BYTES) {
        throw Object.assign(new Error("文件超過大小上限"), { code: "resource-exhausted" });
      }
      staged.set(w.path, next);
    }
    for (const [p, d] of staged) {
      if (d === undefined) this.docs.delete(p); else this.docs.set(p, d);
      this.dirty.add(p);
    }
    this.broadcast(staged);
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), FLUSH_DELAY_MS);
  }

  broadcast(changed) {
    for (const ws of this.ctx.getWebSockets()) {
      const subs = this.att(ws).subs;
      const out = [];
      for (const [sid, [path, isCol]] of Object.entries(subs)) {
        for (const [p, d] of changed) {
          if (isCol ? (p.startsWith(path + "/") && !p.includes("/", path.length + 1)) : p === path) {
            out.push([sid, isCol ? p.slice(path.length + 1) : null, d ?? null]);
          }
        }
      }
      if (out.length) { try { ws.send(JSON.stringify({ t: "chg", c: out })); } catch { /* 已斷線 */ } }
    }
  }

  flush() {
    this.flushTimer = null;
    for (const p of this.dirty) {
      const d = this.docs.get(p);
      if (d === undefined) this.sql.exec("DELETE FROM docs WHERE path = ?", p);
      else this.sql.exec("INSERT OR REPLACE INTO docs (path, data) VALUES (?, ?)", p, JSON.stringify(d));
    }
    this.dirty.clear();
  }
}

// ---- 欄位值處理：{__fv:"ts"} = 伺服器時間、{__fv:"inc",n} = 遞增；{__ts:ms} = 時間戳 ----
const isMap = (v) => v && typeof v === "object" && !Array.isArray(v) && !("__ts" in v) && !("__fv" in v);

function resolve(v, old) {
  if (v && typeof v === "object" && "__fv" in v) {
    if (v.__fv === "ts") return { __ts: Date.now() };
    if (v.__fv === "inc") return (typeof old === "number" ? old : 0) + v.n;
  }
  if (Array.isArray(v)) return v.map(x => resolve(x, undefined));
  if (isMap(v)) {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = resolve(x, isMap(old) ? old[k] : undefined);
    return o;
  }
  return v;
}

function mergeDeep(old, data) {
  const out = { ...old };
  for (const [k, v] of Object.entries(data)) {
    out[k] = isMap(v) && isMap(old[k]) ? mergeDeep(old[k], v) : resolve(v, old[k]);
  }
  return out;
}

function setDotted(obj, keys, v) {
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (!isMap(o[k])) o[k] = {};
    o = o[k];
  }
  const last = keys[keys.length - 1];
  o[last] = resolve(v, o[last]);
}
