# 手動新增學生實作計畫

**Goal:** 可從學校資料新增自行設定個資、能力及校隊身分的插班生。

**Architecture:** 原始人口維持不變；手動學生採增量雲端路徑、線上名額保留及本機原子保存。新學生合併到既有索引並沿用比賽系統。

**Tech Stack:** Vue Vapor、Vite、IndexedDB、Firebase Auth／Realtime Database REST。

**Spec:** [需求與設計](../specs/2026-10-17-student-admission-design.md)

## 限制

- 不執行測試，使用 build、語法、JSON 及 diff 檢查。
- 不重置原始固定資料或既有比賽進度。
- 每班最多 50 人，學號沿用縣市英文字母及 7 位數字。
- 能力為 1～10 整數；新學生不手動取得代表隊／冠軍身分。
- 沿用自動 commit／push 授權。

## 步驟

- [x] `student-admission.js`：欄位規則、目的班級、座號及預估學生資料。
- [x] `cloud-schema.js`／`cloud.js`／`database.rules.json`：原始人口識別、名額保留、冪等新增、增量載入、未知學生補取及規則。
- [x] `game.js`：新增學生交易、班級與校隊索引合併、排名刷新及待同步資料保護。
- [x] `StudentCreateDialog.vue`／`SchoolsView.vue`：新增入口、完整表單、預覽、錯誤回饋及新增後導向班級。
- [x] `game.js`／`RaceView.vue`：已開始班級賽的名單快照、頒獎依據與自動賽重整續賽名單。
- [x] 更新 `data-structure.md`、`cloud-sync.md`，完成建置、語法及格式檢查；Firebase 規則 dry-run 通過。
- [x] 完成獨立程式碼檢視並修正確認的續賽及跨裝置讀取問題；交付時 commit／push。
