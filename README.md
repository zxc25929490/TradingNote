# TradingNote

交易紀錄與分析網站，由四個彼此連動的系統組成，全部是純前端（HTML／CSS／JavaScript），資料存在瀏覽器的 localStorage。

## 資料夾結構

```
TradingNote/
├── live-system/        實盤中樞：交易紀錄、今日總覽、深度分析、進階統計、TP 統計、挑戰目標、風控計算
│   └── data/trades.js  內建的實盤交易資料（由 data/source 的 Excel 轉出）
├── research-system/    歷史回測：回測紀錄、Rule Book、錯誤資料庫、策略版本、TP 模擬器
├── review-system/      實盤復盤：復盤工作台、執行落差、復盤結論、改善追蹤
├── analysis-system/    差異分析：回測 × 實盤 × 復盤 三層診斷、執行落差、Monte Carlo
├── shared/             四個系統共用的模組（見下表）
├── mt4/                MT4 Expert Advisor：把實盤交易與價格路徑匯出成可匯入的 CSV
├── tradingnote-site/   線上網站（Next.js）；public/ 底下是上面四個系統的副本，請勿直接修改
├── scripts/
│   ├── sync-site.mjs   把四個系統與 shared/ 同步到 tradingnote-site/public/
│   └── test.mjs        執行全部測試
└── data/
    ├── source/         原始 Excel（實盤、回測樣本）
    └── backups/        網站匯出的備份 JSON / CSV / ZIP
```

每個系統資料夾的慣例：`index.html` 入口、`app.js` 主程式、`*.css` 樣式、`tests/*.test.mjs` 測試。

## shared/ 模組

| 檔案 | 用途 |
|---|---|
| `stats.js` | 純統計函式：信賴區間、t 檢定、Sharpe／SQN、回撤、Monte Carlo 存活率、交叉表等 |
| `backtest-r.js` | 回測 R 的唯一定義：研究紀錄存「最大到達 R」，一律經這裡換算成已實現 R |
| `partial-exit.js` | 分批出場設定與 R 換算 |
| `review-loop.js` | 復盤閉環分析：錯誤成本排名、月度趨勢、改善行動追蹤 |
| `sidebar.js/.css` | 共用側欄：分組摺疊、窄條模式、手機版頂端列與抽屜選單 |
| `responsive.css` | 研究／復盤／差異分析系統的手機版版面 |
| `cursor-fx.js/.css` | 滑鼠特效 |
| `system-transition.js/.css` | 系統之間切換的轉場 |

## 常用指令

```bash
node scripts/test.mjs
```

```bash
node scripts/sync-site.mjs
```

修改任何系統或 `shared/` 後，先跑同步再 commit；`shared/tests/site-sync.test.mjs` 會在副本過期時失敗。

## 本機預覽

```bash
python -m http.server 8765
```

然後開啟 `http://localhost:8765/live-system/index.html`。直接用 `file://` 開啟也可以，但部分瀏覽器會限制 localStorage。

## 資料儲存

所有資料都在瀏覽器 localStorage（同一網域的四個系統共用）。換電腦或清除瀏覽資料前，請先在實盤中樞「資料管理 → 完整備份」匯出，存到 `data/backups/`。
