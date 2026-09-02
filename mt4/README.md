# TradingNote MT4 Journal EA v4

這個 EA 不會下單或修改訂單，只負責監控帳戶中的市價單，並在平倉後把交易追加到純文字檔，供 TradingNote local index 貼上匯入。

## 安裝

1. 在 MT4 選擇「檔案 → 開啟資料夾」。
2. 把 `TradingNoteJournalEA.mq4` 複製到 `MQL4/Experts/`。
3. 用 MT4 的 MetaEditor 開啟 `.mq4` 後按 Compile，產生 v4 `.ex4`。未重新編譯前，資料夾內既有的 `.ex4` 不包含 v4 修正。
4. 回到 MT4，在導覽器重新整理 EA，拖到任一張持續有報價的圖表。
5. 保持 MT4、EA 及 AutoTrading 開啟。EA 不會送單，但 MT4 必須允許 EA 執行。

預設 `MagicNumberFilter = -1`，會記錄同一帳戶的手動單與其他 EA 市價單。若只想記錄特定策略，可改成該策略的 Magic Number。

## 匯入網站

1. 在 MT4 選擇「檔案 → 開啟資料夾 → MQL4 → Files」。
2. 用記事本打開 `TradingNote_MT4_Journal_v4.tsv`，全選並複製。
3. 在 local index 選擇「資料管理 → 貼上 MT4 EA 記錄」。
4. 貼上並按「智慧合併」。網站以 `帳號 + Ticket` 去重。
5. 匯入完成後，可手動清空 `TradingNote_MT4_Journal_v4.tsv`。下一筆平倉時 EA 會自動補回標題列。

不要刪除 `TradingNote_MT4_ExportedTickets_v4.txt`，它負責避免清空記事本後重新輸出舊單。`TradingNote_MT4_OpenState_v4.tsv` 保存未平倉交易的路徑與風控事件進度。首次啟動 v4 時，EA 會讀取既有 v3 checkpoint 與 open-state，避免重複輸出並延續尚未平倉的追蹤資料。

## 記錄內容

- Entry、SL、TP、Exit、Lots、Gross/Net P&L 與 R
- Commission、Swap、Spread 估算
- MFE、MAE 與出場效率
- SL／TP 出場滑價（正數代表較有利）
- H1 趨勢／盤整、波動程度、HTF 同向性與券商時段

## v4 完整持倉資料

- 持倉最高／最低可成交價，以及各自發生時間。
- 首次到達 +0.5R、+1R、+1.5R、+2R、+2.5R、+3R 與 -0.5R、-1R 的秒數。
- 完整持倉秒數、實際監控秒數、監控延遲、中斷時間、覆蓋率與取樣數。
- 初始與最終 SL／TP、SL／TP 修改次數、首次修改 SL 與首次移到保本的時間。
- 價格位於有利／不利區域的時間與比例，供後續 TP、保本及持倉效率統計。
- 原定 RR、最大鎖定 R、最大擴大風險 R、最大獲利回吐 R，以及 SL 收緊／放寬次數。
- 進場 ATR、ADX、快慢 EMA 距離、進場位於昨日高低區間的位置。
- 進場時 Balance、Equity、Free Margin、風險占淨值比例、全帳戶與同商品同時持倉數。

## MT4 限制

- 手動下單不會保留「按下買賣按鈕時的要求價」，因此無法可靠計算進場滑價；EA 只記錄成交價。
- 非 SL／TP 的手動或其他 EA 平倉沒有原始要求價，因此該筆出場滑價會留空。
- MFE／MAE 來自 EA 運行期間的 Tick／每秒掃描；MT4 或 EA 關閉期間的極值可能遺失，重啟後會標記為 `resumed_after_restart`。
- MT4 本身沒有可靠的統一新聞事件來源，因此第一版不自動標記新聞。
