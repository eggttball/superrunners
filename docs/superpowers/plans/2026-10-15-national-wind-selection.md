# 全國風速小子選拔 Implementation Plan

**Goal:** 一鍵依縣市與學校順序完成全國各校選拔，支援背景進行、暫停／繼續、16×、本機續跑及終止，並沿用雲端稱號保存。

**Architecture:** 擴充既有 `wind-meet.js` 控制器，使單校與全國模式共用對戰、友誼賽和背景時鐘。各校以固定的本屆 ID 建立選拔，本機游標記錄當前學校及階段；每場正式比賽仍透過 `recordHeat` 原子保存成績、歷程、冠軍及 outbox。

**Tech Stack:** Vue Vapor、Vite、IndexedDB、Firebase Realtime Database。

**Spec:** 使用者本次「新增全國風速小子選拔賽，跟全國校內自動百米賽一樣」及既有 `docs/superpowers/specs/2026-10-14-wind-selection-design.md`。

## Global Constraints

- 沿用每場前三名晉級、各年級三人決賽、各校最後三冠軍友誼賽。
- 友誼賽不寫成績、個人最佳、稱號或淘汰樹。
- 全國模式預設 16×，可切換 1／2／4／8／16×。
- 只把全國游標存於本機，不重新生成或下載固定全國資料。
- 稱號依既有 `dynamic/windChampions/{schoolId}/{grade}` 雲端路徑保存。
- 使用者要求略過測試，驗證採正式建置、差異檢查與程式流程檢閱。
- 使用者已授權直接 commit／push，在目前工作目錄實作。

## Tasks

- [x] 擴充 `src/lib/wind-meet.js`：全國 scope、學校清單和游標、依序建立各校選拔、背景接續、重整還原、暫停／速度保存、終止及失敗重試。等待保存時檢查執行屆次，避免終止後又啟動下一校。
- [x] 整合 `src/lib/game.js`：安裝建立／尋找選拔與存進度依賴，確保同一校固定屆次 ID 可重試，優先還原全國游標，已終止的全國選拔不當作單校賽重新啟動。
- [x] 更新 `src/lib/storage.js` 與 `src/lib/cloud-schema.js`：全量 meta 保存保留最新本機游標，JSON 匯出及雲端固定 meta 排除游標。
- [x] 更新 `RaceView.vue`、`WindMeetSummary.vue`、`App.vue` 與 CSS：入口按鈕、全國／當校進度、終止、全國完成總覽、可查看各校淘汰樹及 Tab 標題。
- [x] 核對冠軍 outbox、雲端多路徑寫入、規則和還原；更新資料結構與雲端說明。
- [x] 執行 `npm run build`、`git diff --check`，檢閱切校／重整／離線／终止／友誼賽邊界，commit／push。
