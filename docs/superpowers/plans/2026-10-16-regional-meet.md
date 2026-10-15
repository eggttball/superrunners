# 區域百米賽 Implementation Plan

**Goal:** 支援縣市正式百米淘汰賽、不記錄友誼賽、風速王子與樹狀歷程。

**Architecture:** 沿用 windMeet 控制器和 RaceView，區域賽新增獨立純賽制模組。正式賽與稱號沿用本機 transaction + outbox，雲端按縣市保存。

**Tech Stack:** Vue Vapor、Vite、IndexedDB、Firebase Auth / Realtime Database REST。

**Spec:** ../specs/2026-10-16-regional-meet-design.md

## Global Constraints

- 參賽者維持自己的班服。
- 正式賽每場最多六人、前三名共同晉級、決賽第一名為唯一王子。
- 友誼賽不保存任何成績、最佳、稱號或雲端工作。
- 本機舊資料與進度保留；略過測試，執行 production build。
- 完成後直接 commit & push。

## Tasks

- [x] 新增 regional-selection.js：schoolRepresentatives、createRegionalMeet、completeRegionalMatch；固定代表、輪空、混校前三名晉級、最後一場授予冠軍。
- [x] 擴充 storage / worker / generator 初始化 regionMeets 與 regionChampions，保留原 schema 與所有資料。
- [x] 擴充 game.recordHeat 的 regional 驗證與保存；在同一 transaction 保存 regionMeets、regionChampions、正式成績和 outbox。
- [x] 擴充 wind-meet 控制器的 regional 模式、正式恢復與無紀錄分組友誼賽，沿用速度和暫停。
- [x] 擴充 cloud REST、正規化與 pending overlay；新增管理者限定資料庫規則、按縣市歷史及稱號讀取。
- [x] 新增 RegionsView、主選單入口與導覽；沿用 RaceView 顯示賽事、學生原校與班級。
- [x] 使 WindMeetSummary 支援學校葉節點、混校晉級節點與王子冠軍；WindTitleBadge 全站優先顯示紅金王子。
- [x] 更新 docs 資料結構／雲端文件；執行 npm run build、git diff --check、規則 JSON 解析。

- [x] 完成獨立程式審查並處理較舊離線冠軍覆蓋新王子的問題。
- [x] 提交並推送。
