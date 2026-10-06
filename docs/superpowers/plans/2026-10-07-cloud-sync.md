# Realtime Database 同步實作計畫

**Goal:** IndexedDB 優先、固定資料一次還原、按需動態讀取與可重試的增量寫入。
**Spec:** ../specs/2026-10-07-cloud-sync-design.md
**Architecture:** Firebase Auth 共用 app；独立 cloud transport、資料轉換與同步控制器；game 負責本機交易及畫面合併。
**Constraints:** 現有資料保留、預設 1 倍賽速、無自動化測試、使用者已授權完成後 commit/push。

- [x] 設定共用 Firebase app 與 database URL；資料庫規則限定 UID、管理者、固定資料不可覆寫及排名索引。
- [x] 升級 IndexedDB，新增原子 outbox 與動態快照存取；保持舊版存檔可讀。
- [x] 新增 cloud-schema.js 處理逐校固定資料、動態拆分與排名；cloud.js 處理 REST、初始化 claim／續傳、還原、按需讀取及增量寫入。
- [x] 改造 world.worker.js 與 game.js 啟動流程：本機優先、無本機時雲端還原、不重新隨機產生；所有操作與每組比賽加入 durable outbox。
- [x] 在學校、隊伍、學生、比賽歷史和應用外框接上按需資料讀取、讀取中／本機 fallback、同步狀態與重試。
- [ ] 更新 docs/data-structure.md、README 和部署設定；production build、git diff --check、靜態檢查、commit/push 與可用的規則部署。
