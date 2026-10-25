// cfdb.js — 剛好學 Cloudflare 資料層（取代 Firebase Firestore）
// 提供與程式原本使用的 Firestore 相同名稱的函式（doc / collection / setDoc / onSnapshot …），
// 底層改為透過 WebSocket 連到 Cloudflare Durable Object（內建 SQLite 資料庫）。
// 路由規則：artifacts/{app}/public/data/classrooms/{教室代碼}/... → 每間教室一個資料庫；
//           其餘路徑（如教室清單 classrooms/{代碼}）→ 共用的 root 資料庫。

const ROOM_DEPTH = 6; // artifacts / app / public / data / classrooms / 代碼

// ---------- 參照物件 ----------
class DocumentReference {
  constructor(segs) { this.type = "document"; this.segs = segs; this.id = segs[segs.length - 1]; this.path = segs.join("/"); }
}
class CollectionReference {
  constructor(segs) { this.type = "collection"; this.segs = segs; this.id = segs[segs.length - 1]; this.path = segs.join("/"); }
}
class Query {
  constructor(col, orders) { this.type = "query"; this.col = col; this.orders = orders; }
}

const autoId = () => {
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (const b of crypto.getRandomValues(new Uint8Array(20))) s += c[b % c.length];
  return s;
};

const DB = { type: "cloudflare-db" };
export function getFirestore() { return DB; }

export function doc(parent, ...rest) {
  const base = parent === DB ? [] : parent.segs;
  const segs = [...base, ...rest.flatMap(s => String(s).split("/"))];
  if (parent instanceof CollectionReference && rest.length === 0) segs.push(autoId());
  return new DocumentReference(segs);
}
export function collection(parent, ...rest) {
  const base = parent === DB ? [] : parent.segs;
  return new CollectionReference([...base, ...rest.flatMap(s => String(s).split("/"))]);
}
export function query(col, ...constraints) { return new Query(col, constraints.filter(Boolean)); }
export function orderBy(field, dir = "asc") { return { field, dir }; }

// ---------- 特殊欄位值 ----------
export class Timestamp {
  constructor(ms) { this.seconds = Math.floor(ms / 1000); this.nanoseconds = (ms % 1000) * 1e6; this._ms = ms; }
  toMillis() { return this._ms; }
  toDate() { return new Date(this._ms); }
  valueOf() { return this._ms; }
}
class FieldValue { constructor(kind, n) { this.kind = kind; this.n = n; } }
export const serverTimestamp = () => new FieldValue("ts");
export const increment = (n) => new FieldValue("inc", n);

function encode(v) {
  if (v instanceof FieldValue) return v.kind === "ts" ? { __fv: "ts" } : { __fv: "inc", n: v.n };
  if (v instanceof Timestamp) return { __ts: v.toMillis() };
  if (v instanceof Date) return { __ts: v.getTime() };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === "object") {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = encode(x);
    return o;
  }
  return v;
}
function decode(v) {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === "object") {
    if ("__ts" in v) return new Timestamp(v.__ts);
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = decode(x);
    return o;
  }
  return v;
}

// ---------- 快照物件 ----------
class DocumentSnapshot {
  constructor(ref, raw) { this.ref = ref; this.id = ref.id; this._raw = raw; }
  exists() { return this._raw != null; }
  data() { return this._raw == null ? undefined : decode(this._raw); }
}
class QuerySnapshot {
  constructor(docs) { this.docs = docs; this.size = docs.length; this.empty = docs.length === 0; }
  forEach(fn) { this.docs.forEach(fn); }
}
function buildQuerySnapshot(q, entries) {
  const col = q instanceof Query ? q.col : q;
  let docs = entries.map(([id, raw]) => new DocumentSnapshot(doc(col, id), raw));
  docs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)); // 與 Firestore 相同，預設依文件 ID 排序
  if (q instanceof Query) {
    for (const { field, dir } of [...q.orders].reverse()) {
      const val = (d) => { const x = d._raw?.[field]; return x && typeof x === "object" && "__ts" in x ? x.__ts : x; };
      docs.sort((a, b) => { const x = val(a), y = val(b); const r = x < y ? -1 : x > y ? 1 : 0; return dir === "desc" ? -r : r; });
    }
  }
  return new QuerySnapshot(docs);
}

// ---------- 連線管理（每個資料庫一條 WebSocket，自動重連） ----------
function route(segs) {
  if (segs.length > ROOM_DEPTH) return { shard: segs.slice(0, ROOM_DEPTH).join("/"), rel: segs.slice(ROOM_DEPTH).join("/") };
  return { shard: segs.slice(0, 2).join("/"), rel: segs.slice(2).join("/") };
}

const conns = new Map();
function conn(shard) {
  let c = conns.get(shard);
  if (!c) { c = new Conn(shard); conns.set(shard, c); }
  return c;
}

class Conn {
  constructor(shard) {
    this.shard = shard;
    this.nextId = 1;
    this.pending = new Map();   // id → {msg, resolve, reject}
    this.subs = new Map();      // sid → {rel, col, onData}
    this.presence = new Map();  // rel → data（斷線重連後自動補送）
    this.retry = 0;
    this.open();
  }
  open() {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${location.host}/api/ws?db=${encodeURIComponent(this.shard)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      for (const [sid, s] of this.subs) this.raw({ op: "sub", sid, path: s.rel, col: s.col });
      for (const [path, data] of this.presence) this.raw({ op: "presence", path, data });
      for (const p of this.pending.values()) this.raw(p.msg);
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => { if (ws.readyState === 1) ws.send("ping"); }, 25000);
    };
    ws.onmessage = (e) => {
      if (e.data === "pong") return;
      const m = JSON.parse(e.data);
      if (m.t === "snap") { this.subs.get(m.sid)?.onSnap(m); return; }
      if (m.t === "chg") { for (const [sid, id, data] of m.c) this.subs.get(sid)?.onChange(id, data); return; }
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.err) p.reject(Object.assign(new Error(m.err), { code: m.code })); else p.resolve(m);
    };
    ws.onclose = () => {
      clearInterval(this.pingTimer);
      if (this.ws !== ws) return;
      const delay = Math.min(5000, 500 * 2 ** this.retry++);
      setTimeout(() => this.open(), delay);
    };
  }
  raw(msg) { if (this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  request(msg) {
    return new Promise((resolve, reject) => {
      msg.id = this.nextId++;
      this.pending.set(msg.id, { msg, resolve, reject });
      this.raw(msg);
    });
  }
}

// ---------- 讀取 ----------
export async function getDoc(ref) {
  const { shard, rel } = route(ref.segs);
  const r = await conn(shard).request({ op: "get", path: rel });
  return new DocumentSnapshot(ref, r.data);
}
export async function getDocs(q) {
  const col = q instanceof Query ? q.col : q;
  const { shard, rel } = route(col.segs);
  const r = await conn(shard).request({ op: "list", path: rel });
  return buildQuerySnapshot(q, r.docs);
}

// ---------- 寫入 ----------
function writeMsg(type, ref, data, opts) {
  const { shard, rel } = route(ref.segs);
  return { shard, w: { type, path: rel, data: data === undefined ? undefined : encode(data), merge: !!opts?.merge } };
}
async function commit(list) {
  const byShard = new Map();
  for (const { shard, w } of list) { if (!byShard.has(shard)) byShard.set(shard, []); byShard.get(shard).push(w); }
  await Promise.all([...byShard].map(([shard, writes]) => conn(shard).request({ op: "write", writes })));
}
export const setDoc = (ref, data, opts) => commit([writeMsg("set", ref, data, opts)]);
export const updateDoc = (ref, data) => commit([writeMsg("update", ref, data)]);
export const deleteDoc = (ref) => commit([writeMsg("delete", ref)]);
export async function addDoc(col, data) { const ref = doc(col); await setDoc(ref, data); return ref; }
export function writeBatch() {
  const list = [];
  return {
    set(ref, data, opts) { list.push(writeMsg("set", ref, data, opts)); return this; },
    update(ref, data) { list.push(writeMsg("update", ref, data)); return this; },
    delete(ref) { list.push(writeMsg("delete", ref)); return this; },
    commit: () => commit(list)
  };
}

/** Cloudflare 版新增：一次刪除某個集合或文件底下的全部資料（伺服器端處理，不需先讀出每份文件）。
 *  傳入教室文件（classrooms/{代碼}）時，會連同該教室的所有子資料一起刪除。 */
export async function deleteTree(ref) {
  const { shard, rel } = route(ref.segs);
  const jobs = [conn(shard).request({ op: "write", writes: [{ type: "deleteTree", path: rel }] })];
  if (ref.segs.length === ROOM_DEPTH) jobs.push(conn(ref.segs.join("/")).request({ op: "write", writes: [{ type: "deleteTree", path: "" }] }));
  await Promise.all(jobs);
}

/** Cloudflare 版新增：寫入「在線狀態」文件。連線期間有效，斷線時伺服器自動刪除，重連後自動補回，
 *  因此不需要每隔幾秒寫一次心跳。 */
export async function setPresence(ref, data) {
  const { shard, rel } = route(ref.segs);
  const c = conn(shard);
  const enc = encode(data);
  c.presence.set(rel, enc);
  await c.request({ op: "presence", path: rel, data: enc });
}

// ---------- 即時監聽 ----------
let nextSid = 1;
export function onSnapshot(q, onNext, onError) {
  const isDoc = q instanceof DocumentReference;
  const col = q instanceof Query ? q.col : q;
  const { shard, rel } = route(col.segs);
  const c = conn(shard);
  const sid = String(nextSid++);
  const cache = new Map();
  let ready = false;
  const emit = () => {
    try {
      onNext(isDoc ? new DocumentSnapshot(q, cache.get("")) : buildQuerySnapshot(q, [...cache]));
    } catch (e) {
      if (onError) onError(e); else console.error(e);
    }
  };
  c.subs.set(sid, {
    rel, col: !isDoc,
    onSnap(m) {
      cache.clear();
      if (isDoc) cache.set("", m.data); else for (const [id, d] of m.docs) cache.set(id, d);
      ready = true;
      emit();
    },
    onChange(id, data) {
      if (!ready) return;
      if (isDoc) cache.set("", data);
      else if (data == null) cache.delete(id);
      else cache.set(id, data);
      emit();
    }
  });
  c.raw({ op: "sub", sid, path: rel, col: !isDoc });
  return () => {
    if (!c.subs.delete(sid)) return;
    c.raw({ op: "unsub", sid });
  };
}

// ---------- 使用者識別（取代 Firebase 匿名登入） ----------
const UID_KEY = "cfdbUserId";
/** 取得此瀏覽器的使用者 ID（存於 localStorage，重新整理後不變）；renew=true 時換發新 ID。 */
export function getUserId(renew = false) {
  let id = renew ? null : localStorage.getItem(UID_KEY);
  if (!id) { id = autoId(); localStorage.setItem(UID_KEY, id); }
  return id;
}
