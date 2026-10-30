# 部署到 Cloudflare Pages（含 D1 雲端同步）

完成後：網站只有你的 Email 能登入，電腦、手機打開同一個網址，資料會自動同步。全部使用 Cloudflare 免費方案。

整體架構：

- **Cloudflare Pages**：放網站本體（四個系統）。
- **Pages Function** `functions/api/sync.js`：同步 API。
- **D1**：存資料，每個 localStorage 項目一列，帶版本號。
- **Cloudflare Access**：網站入口的登入。API 會自己再驗證一次 Access 的簽章，沒設定好就一律拒絕。

## 1. 把程式推上 GitHub

建議把 repo 設為 **Private**。Pages 支援私人 repo，網站內建的 `live-system/data/trades.js` 含真實交易，不該公開。

## 2. 建立 Pages 專案

Cloudflare 後台 → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → 選 `TradingNote` repo。

| 設定 | 值 |
|---|---|
| Framework preset | None |
| Build command | `node scripts/build-pages.mjs` |
| Build output directory | `dist` |
| Root directory | （留空） |

按 **Save and Deploy**。完成後會得到網址，例如 `https://tradingnote-xxx.pages.dev`。

> 這時網站已經能開，但還沒有登入保護，同步也會顯示「雲端同步尚未設定」。**先別把網址給別人**，繼續做完第 3、4 步。

## 3. 建立 D1 並綁定

1. 後台 → **Storage & Databases** → **D1 SQL Database** → **Create**，名稱填 `tradingnote`。
2. 回到 Pages 專案 → **Settings** → **Bindings** → **Add** → **D1 database**。
   - Variable name：`DB`（一定要大寫 DB）
   - D1 database：選 `tradingnote`

資料表會在第一次同步時自動建立，不需要手動執行 SQL。

## 4. 設定 Cloudflare Access（登入）

1. 後台 → **Zero Trust**。第一次會要求取一個 team 名稱，並選擇 **Free** 方案（50 人以內免費）。
2. **Access** → **Applications** → **Add an application** → **Self-hosted**。
   - Application domain：你的 `xxx.pages.dev`
   - 再加一個 `*.xxx.pages.dev`，把預覽網址也保護起來
3. **Policy**：Action 選 **Allow**，Include 選 **Emails**，填你自己的 Email。
4. 登入方式用預設的 **One-time PIN** 即可：登入時會寄驗證碼到你的信箱。
5. 建好後打開這個 Application，複製 **Application Audience (AUD) Tag**。
6. 回到 Pages 專案 → **Settings** → **Variables and Secrets**，新增兩個變數（Production）：

| 名稱 | 值 |
|---|---|
| `ACCESS_TEAM_DOMAIN` | `你的team名稱.cloudflareaccess.com` |
| `ACCESS_AUD` | 剛剛複製的 AUD Tag |

7. **Deployments** → 最新一筆 → **Retry deployment**，讓變數生效。

## 5. 開始使用

1. **先用電腦**打開網址並登入：電腦上的資料會上傳到雲端。側欄最下面會顯示「已同步 · 時間」。
2. 再用手機打開同一個網址登入：資料會下載下來，頁面會自動重新整理一次。
3. 手機 Safari 可以「分享 → 加入主畫面」，用起來就像 App。

## 同步規則

- 每次修改約 1 秒後上傳。打開網站、切回分頁時、以及每分鐘，都會下載其他裝置的變更。另一台裝置有新資料時，側欄會出現「有新資料 · 重新載入」。
- 兩台裝置在同步前改了同一份資料時，會自動合併，不會丟資料：
  - 交易、斷點、回測紀錄：依 ID 合併。
  - 已刪除清單：取聯集。
  - 標籤與評級：逐筆合併。
  - 單一設定值：最後修改的那一方為準。
- 這些只存在各自裝置、不會同步：深淺色模式、側欄收合、動態特效、斷點比較的勾選。
- 刪除也會同步。例如「清除本機資料」會連雲端和其他裝置一起清掉，操作前請先下載完整備份。
- 單一項目超過約 1.9 MB 無法同步，側欄會顯示警告。通常是交易附了很多大張截圖。
- 用 `python -m http.server` 在本機開啟時沒有同步 API，網站會自動維持純本機模式，和以前一樣。

## 本機測試同步（選用）

```bash
node scripts/build-pages.mjs
```

```bash
npx wrangler pages dev dist --compatibility-date=2026-05-01 --d1 DB=tn-local --binding DEV_USER=me@local
```

`DEV_USER` 只對 localhost 生效，用來在本機略過 Access 驗證。
