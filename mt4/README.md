# TradingNote MT4 Journal EA

這個 EA 不會下單或修改訂單，只負責監控帳戶中的市價單，並在平倉後把交易追加到純文字檔，供 TradingNote local index 貼上匯入。

## 安裝

1. 在 MT4 選擇「檔案 → 開啟資料夾」。
2. 把 `TradingNoteJournalEA.mq4` 與已編譯的 `TradingNoteJournalEA.ex4` 複製到 `MQL4/Experts/`。
3. 如有修改 `.mq4`，再用 MetaEditor 開啟並按 Compile；未修改可直接使用附帶的 `.ex4`。
4. 回到 MT4，在導覽器重新整理 EA，拖到任一張持續有報價的圖表。
5. 保持 MT4、EA 及 AutoTrading 開啟。EA 不會送單，但 MT4 必須允許 EA 執行。

預設 `MagicNumberFilter = -1`，會記錄同一帳戶的手動單與其他 EA 市價單。若只想記錄特定策略，可改成該策略的 Magic Number。

## 匯入網站

1. 在 MT4 選擇「檔案 → 開啟資料夾 → MQL4 → Files」。
2. 用記事本打開 `TradingNote_MT4_Journal.tsv`，全選並複製。
3. 在 local index 選擇「資料管理 → 貼上 MT4 EA 記錄」。
4. 貼上並按「智慧合併」。網站以 `帳號 + Ticket` 去重。
5. 匯入完成後，可手動清空 `TradingNote_MT4_Journal.tsv`。下一筆平倉時 EA 會自動補回標題列。

不要刪除 `TradingNote_MT4_ExportedTickets.txt`，它負責避免清空記事本後重新輸出舊單。`TradingNote_MT4_OpenState.tsv` 保存未平倉交易的 MFE／MAE 進度。

## 記錄內容

- Entry、SL、TP、Exit、Lots、Gross/Net P&L 與 R
- Commission、Swap、Spread 估算
- MFE、MAE 與出場效率
- SL／TP 出場滑價（正數代表較有利）
- H1 趨勢／盤整、波動程度、HTF 同向性與券商時段

## MT4 限制

- 手動下單不會保留「按下買賣按鈕時的要求價」，因此無法可靠計算進場滑價；EA 只記錄成交價。
- 非 SL／TP 的手動或其他 EA 平倉沒有原始要求價，因此該筆出場滑價會留空。
- MFE／MAE 來自 EA 運行期間的 Tick／每秒掃描；MT4 或 EA 關閉期間的極值可能遺失，重啟後會標記為 `resumed_after_restart`。
- MT4 本身沒有可靠的統一新聞事件來源，因此第一版不自動標記新聞。
