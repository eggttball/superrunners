# 風速小子 Implementation Plan

**Goal:** 完成各年級班級淘汰選拔、前三名練習、完整歷程與持久化稱號。

**Architecture:** `wind-selection.js` 處理純對戰規則；`wind-meet.js` 使用既有 meet clock 控制背景賽程；`game.js` 負責原子保存與雲端待同步。Vue 共用稱號徽章與對戰總覽，沿用原有跑道。

**Tech Stack:** Vue Vapor、Vite、IndexedDB、Firebase Realtime Database。

**Spec:** `docs/superpowers/specs/2026-10-14-wind-selection-design.md`

## Global Constraints

- 不重新生成既有資料，保留 world schemaVersion 3。
- 每組最多八人，稱號每校每年級一人。
- 使用者要求略過所有測試；驗證採建置與差異檢查。
- 沿用已授權的 commit / push 流程，在目前工作目錄執行。

## Tasks

- [x] 新增 `src/lib/wind-selection.js`：`createWindMeet`、`nextWindMatch`、`completeWindMatch`，固定每班前三名，對戰／輪空／冠軍以純資料函式處理。
- [x] 擴充 `storage.js` 新表、`cloud-schema.js` 固定／動態分離、`cloud.js` 按需讀取與同筆雲端寫入，`game.js` 提供開賽與原子保存，資料庫規則允許新節點及跨班百米。
- [x] 新增 `src/lib/wind-meet.js`：背景時鐘、連續對戰、暫停與繼續、保存失敗重試及重整續跑。
- [x] 整合 `RaceView.vue`：新賽事入口、不限班數的前三名練習、六人對戰標題、歷史與最終總覽。
- [x] 新增 `WindTitleBadge.vue`、`WindMeetSummary.vue`；個人、學校、隊伍、比賽名單顯示稱號，加入遊戲風格與手機版面樣式。
- [x] 更新 `docs/data-structure.md`、`docs/cloud-sync.md` 與操作說明。
- [x] 執行 `npm run build`、`git diff --check`，人工檢閱對戰規則與儲存／讀取流程，commit / push。
