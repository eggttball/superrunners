# 大隊接力 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement this plan task by task; user explicitly skips tests and authorizes commit/push.

**Goal:** 啟用完整 16×100m 班級接力、全校淘汰賽、交棒與搶道動畫、持久資料及背景進度。

**Architecture:** 接力規則及物理為可序列化純模組，背景控制器與 game.js 安裝的保存介面連接。畫面使用獨立操場與樹狀摘要，雲端沿用 scope read / outbox。

**Tech Stack:** Vue Vapor、JavaScript、SVG、Vite、IndexedDB、Firebase REST。

**Spec:** docs/superpowers/specs/2026-10-18-relay-meet-design.md

## Global Constraints

- 略過所有測試；只使用建置、語法、格式及程式審查。
- 保留原有本機資料；不改變個人百米最佳或排名。
- 同一屆名單固定，中間棒次只在前 16 排序變更後重新隨機。
- 比賽預設 1x，正式結果及新稱號使用 outbox 同步。

## Task 1: 接力規則、幾何與物理

- [x] 建立 relay-rules.js：`prepareRelayLineup(cls,getStudent,saved,random)`、`createRelayMeet(school,lineups,classIds)`、`nextRelayMatch(meet)`、`completeRelayMatch(meet,matchId,results,finishedAt)`；分組及晉級規則依 spec。
- [x] 建立 relay-track-geometry.js，輸出 `relayPoint(distance,lane,mergedLane)`、`relayStartLines`、`relayBreakLine` 及 30m 交棒區標記；座標遵循既有 TRACK。
- [x] 建立 relay-physics.js：`createRelayRace(match,meet,getStudent)` 產生序列化 plans；`relayRaceState(plans,elapsed)` 輸出每隊總路程、目前棒、跑者/接棒者/減速者狀態及 finish 秒數，prepare order 依實際時間。

## Task 2: 操場與歷程畫面

- [x] 建立 RelayTrack.vue 使用完整操場、幾何標記、正向像素動畫及每班上衣颜色，配合放大观察。
- [x] 建立 RelayRaceView.vue 消費 relayMeet 控制器，顯示完整操場、目前棒次與即時名次、每班固定16棒名單、起跑/暫停/繼續/速度及完成摘要。
- [x] 建立 RelayMeetSummary.vue：由 match source IDs 連接下輪，多個晉級者共享原場歷史，節點显示总秒數/晉級，冠軍在頂端。
- [x] 建立 RelayTitleBadge.vue 讀取 game.world.relayChampions 標示風速小班。

## Task 3: 本機與雲端資料

- [x] 增加 IndexedDB store/版本與 metadata 分離，本機進度不匯出、不上傳固定 metadata，載入舊世界補空集合。
- [x] 新增雲端 relay paths 與 normalize、scope history read；正式 relay operation 不寫個人 best/ranks，新冠軍以時間防止舊離線比賽覆蓋。
- [x] 補上 RTDB 規則及 docs/data-structure.md、docs/cloud-sync.md。

## Task 4: 背景控制與入口整合

- [x] relay-meet.js 安裝 saveMatch/saveProgress，使用 createMeetClock 逐組倒數/比賽/保存/自動下一場，保存抽取結果可恢復。
- [x] game.js 將進場名單及結果放入原 mutation queue；整合啟動互斥、持久棒次及 relay scope merge。
- [x] RaceView 開啟大隊接力，0班全校、2～8班友誼、1班及>8班禁用；友誼可跨年級選班。
- [x] App Tab title / logout 暫停 / 頁面切換背景保持；学校与比賽班級顯示風速小班。

## Task 5: 驗證、審查及發布

- [x] 對接分工介面並完整審查賽程、進度、交棒幾何、資料同步。
- [x] `npm run build`、`node --check` 新/改 JS、`git diff --check`、JSON 解析。
- [x] commit & push 至 main，確認工作目錄乾淨。

## 完成紀錄

- 已實作規則、幾何、速度曲線、四個 Vue Vapor 元件、本機／雲端及入口整合。
- 獨立程式審查修正：首次啟動與重整前先保存曲線、暫停時保存待消耗時鐘區段、結果／下一場保存間隙恢復、舊雲端歷程及結果重試保護、完成摘要與新賽程優先順序。
- 動畫採固定班級視覺偏移，交棒和終點回到真實座標；近距離超車仍可能短暫交疊，以維持內道比例與連續動作。
- 使用者要求略過測試；驗證限建置、語法、JSON、diff 及程式審查。
