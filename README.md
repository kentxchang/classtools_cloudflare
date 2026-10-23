# 剛好學：課堂互動 so easy — Cloudflare 版

這一版不再使用 Firebase，網站和資料庫都放在 **Cloudflare 免費方案**上：

- **網站**：Cloudflare Workers（靜態網頁）
- **資料庫**：Cloudflare Durable Objects 內建的 SQLite 資料庫（每間教室一個資料庫）
- **即時同步**：WebSocket，老師和學生的畫面會即時更新

老師和學生都**不用再貼任何設定**，打開網址就能用。

---

## 一、資料夾內容

```
剛好學-cloudflare版/
├─ public/
│   ├─ index.html      ← 主程式（由 01classtools.html 改寫而來）
│   └─ cfdb.js         ← 資料存取程式（取代 Firebase）
├─ src/
│   └─ worker.js       ← 後端程式（資料庫與即時同步）
├─ wrangler.jsonc      ← Cloudflare 部署設定檔
├─ 01classtools.html   ← 原本的 Firebase 版（僅保留備份，不會上傳）
└─ README.md           ← 本說明檔
```

> ⚠️ `public/index.html` **不能直接雙擊打開使用**，一定要部署到 Cloudflare（或用第五節的方法在本機測試），因為它需要後端資料庫。

---

## 二、事前準備（只需做一次）

### 1. 註冊 Cloudflare 帳號

1. 打開 <https://dash.cloudflare.com/sign-up>
2. 輸入 Email 和密碼註冊，並到信箱點驗證信。
3. **不需要綁定信用卡**，免費方案就能使用本程式的所有功能。

### 2. 安裝 Node.js

部署工具 Wrangler 需要 Node.js。

1. 打開 <https://nodejs.org/>
2. 下載左邊的 **LTS（長期支援版）**，一路按「下一步」安裝完成。
3. 確認安裝成功：按 `Win` 鍵，輸入 `cmd` 打開「命令提示字元」，輸入：

   ```
   node -v
   ```

   出現像 `v22.x.x` 的版本號就代表成功。

---

## 三、部署到 Cloudflare（用指令，最推薦）

### 步驟 1：在本資料夾打開命令視窗

1. 用檔案總管打開 `剛好學-cloudflare版` 資料夾（看得到 `wrangler.jsonc` 那一層）。
2. 點一下上方的**網址列**，把內容改成 `cmd` 後按 Enter，就會在這個資料夾開啟命令提示字元。

### 步驟 2：登入 Cloudflare

輸入：

```
npx wrangler login
```

- 第一次執行會問 `Need to install the following packages ... Ok to proceed? (y)`，輸入 `y` 按 Enter。
- 瀏覽器會自動打開 Cloudflare 授權頁面，按 **Allow（允許）**。
- 看到 `Successfully logged in` 就完成了，可以關掉該網頁。

### 步驟 3：部署

輸入：

```
npx wrangler deploy
```

- 如果是第一次使用 Cloudflare Workers，會請你設定一個 **workers.dev 子網域**（例如輸入 `mrchang`），這會成為網址的一部分，之後不能隨意更改，請取一個好記的英文名稱。
- 完成後會顯示網址，例如：

  ```
  https://classtools.mrchang.workers.dev
  ```

**這就是你的剛好學網址！** 老師和學生都用這個網址進入。

> 💡 網址前半段 `classtools` 來自 `wrangler.jsonc` 裡的 `"name"`，想改名可以在部署前修改這一行（只能用英文小寫、數字和 `-`）。

### 步驟 4：資料庫設定？——已經自動完成了！

`wrangler.jsonc` 已經寫好資料庫設定，`npx wrangler deploy` 時 Cloudflare 會**自動建立**資料庫，不需要另外到後台建立或貼任何設定。

想確認的話：

1. 登入 <https://dash.cloudflare.com/>
2. 左側選單點 **Workers & Pages**（運算 → Workers & Pages）
3. 點進 `classtools`，在「繫結 / Bindings」區域會看到名為 `ROOMS` 的 **Durable Object**，這就是資料庫。
4. 每開一間教室，就會自動產生一個該教室專用的資料庫；按下「下課」時會清空該教室的資料。

---

## 四、另一種部署方式：透過 GitHub（不想打指令的話）

1. 到 <https://github.com/> 註冊帳號，按右上角 **＋ → New repository** 建立一個新儲存庫（可設為 Private）。
2. 在儲存庫頁面點 **uploading an existing file**，把 `public` 資料夾、`src` 資料夾、`wrangler.jsonc` 拖曳上傳（`01classtools.html` 不用上傳），按 **Commit changes**。
3. 到 Cloudflare 後台 → **Workers & Pages** → **建立應用程式（Create application）** → 選 **匯入存放庫（Import a repository）** → 連結 GitHub 帳號並選擇剛剛的儲存庫。
4. 部署設定保持預設（部署指令為 `npx wrangler deploy`），按 **部署（Deploy）**。
5. 完成後，在該 Worker 的頁面可以看到網址。之後只要在 GitHub 上更新檔案，Cloudflare 會自動重新部署。

---

## 五、在自己電腦上先測試（可選）

在本資料夾的命令視窗輸入：

```
npx wrangler dev
```

看到 `Ready on http://127.0.0.1:8787` 後，用瀏覽器打開 <http://127.0.0.1:8787> 即可測試。
可以再開一個「無痕視窗」當學生端。按 `Ctrl + C` 結束測試。

---

## 六、之後修改程式要怎麼更新？

修改 `public/index.html` 後，在本資料夾的命令視窗再執行一次：

```
npx wrangler deploy
```

幾秒後網站就會更新，原本的教室資料不會遺失。

---

## 七、和 Firebase 版的差異

| 項目 | Firebase 版 | Cloudflare 版 |
|---|---|---|
| 設定 | 要貼 Firebase 設定、產生「異機專用網址」 | **免設定**，網址直接分享給學生 |
| 右上角「Firebase 設定」按鈕 | 有 | 已移除 |
| 學生加入網址 / QR Code | 網址夾帶 Firebase 設定（很長） | 就是網站網址（短、乾淨） |
| 學生在線判斷 | 學生每 30 秒寫入一次心跳 | 依連線狀態判斷：學生關閉分頁或斷網時自動從在線名單移除 |
| 下課清除資料 | 逐筆讀出再逐筆刪除 | 伺服器端一次清空 |

使用者 ID 改存在瀏覽器的 localStorage（重新整理不會變），按「下課」後會換發新 ID，與原本的匿名登入行為相同。

---

## 八、為了減少資料庫讀寫所做的優化

1. **讀取幾乎不碰資料庫**：每間教室的資料在伺服器記憶體中保留一份，老師／學生讀取資料或即時監聽時直接由記憶體回應。只有教室伺服器休眠後再被喚醒時，才從資料庫讀取一次。
2. **寫入合併**：同一份資料在 1.5 秒內被修改多次（例如雷射筆移動、白板拖曳），只會寫入資料庫一次。
3. **只傳送變更**：即時監聽只送出「有變動的那一筆」，不會每次都重送整個清單（例如全班作答圖片）。
4. **取消在線心跳寫入**：原本每位學生每 30 秒寫一次資料庫，改為依 WebSocket 連線判斷，每位學生每次連線只需寫入 2 次（加入、離開）。
5. **一次清空**：開始新互動時清除舊作答、下課、結束白板／簡報、重置投票等，原本要「先下載全部資料再逐筆刪除」，現在由伺服器一次刪除，不必下載任何資料。
6. **閒置休眠**：沒有人操作時伺服器自動休眠，不消耗免費額度；心跳 ping 由 Cloudflare 自動回應，不會喚醒伺服器。

---

## 九、免費額度參考

Cloudflare Workers 免費方案（每日重置，實際以 Cloudflare 官方公告為準）：

| 項目 | 每日免費額度 |
|---|---|
| 網頁檔案（index.html 等）讀取 | 不限次數 |
| Worker / Durable Objects 請求 | 各 10 萬次（每個 WebSocket 訊息約算 1/20 次） |
| 資料庫讀取列數 | 500 萬列 |
| 資料庫寫入列數 | 10 萬列 |
| 資料庫容量 | 5 GB |

一般班級（約 30 人）一整天的課堂使用，遠低於上述額度。若超過額度，當天會暫時無法使用，隔天自動恢復，**不會產生任何費用**。

---

## 十、常見問題

**Q：直接雙擊 `index.html` 打開，畫面出現但無法建立教室？**
A：此版本需要後端，請依第三節部署，或依第五節在本機測試。

**Q：學生在線人數忽高忽低？**
A：學生的手機鎖定螢幕或切到其他 App 時，瀏覽器可能會中斷連線，此時會暫時顯示為離線；回到頁面後會自動重新連線並恢復。

**Q：資料會保存多久？**
A：教室資料會一直保存到老師按「下課」為止（「暫離教室」不會刪除資料）。

**Q：部署時出現 `You need to register a workers.dev subdomain`？**
A：依畫面提示輸入一個英文子網域名稱即可；或到 Cloudflare 後台 **Workers & Pages** 頁面設定子網域後再部署。

**Q：可以用自己的網域嗎？**
A：可以。到 Cloudflare 後台該 Worker 的 **設定 → 網域和路由（Domains & Routes）** 新增自訂網域（該網域需已託管在 Cloudflare）。
