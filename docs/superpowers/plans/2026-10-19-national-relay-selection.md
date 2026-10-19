# 全國風速小班選拔與班級接力最佳成績實作計畫

**目標：** 班級頁顯示正式 1600m 接力最佳成績；全國逐校自動舉辦既有大隊接力淘汰賽，每校選出一班風速小班。

**架構：** 擴充既有 `relay-meet.js` 的 school／national scope；共用計時、比賽曲線、暫停、結果 outbox、冠軍和樹狀歷程。全國游標及當場曲線保存在既有本機 `relayMeetProgress`，賽事增加 `nationalRunId` 和穩定 ID；雲端沿用現有接力資料路徑。

**約束：** 使用者已授權直接實作、commit／push；略過所有測試，以正式建置、差異與流程檢閱驗證。不重新下載全國固定資料。全國模式預設 16×，單校模式維持 1×。

- [x] 擴充 `relay-rules.js`、`game.js`：穩定逐校賽事 ID、授權當前全國賽建立下一校，排除已終止全國賽的單校自動還原。
- [x] 擴充 `relay-meet.js`：依縣市學校排序逐校開賽、保存每場曲線與全國游標、背景接續、重整還原、暫停／繼續、終止、保存失敗重試。所有非同步返回須檢查 runId，防止終止後又開下一場。
- [x] 更新 `RaceView.vue`、`RelayRaceView.vue`、`App.vue` 與新 `NationalRelaySummary.vue`：入口、全國進度、控制、Tab 標題、每頁 100 校完成總覽及各校樹狀歷程。
- [x] 更新 `SchoolsView.vue`：讀取選定學校最新接力動態資料，依正式接力紀錄計算選定班級最低總秒數，顯示成績或尚無紀錄。
- [x] 更新資料結構與雲端文件，確認本機 progress 不匯出／上傳，成績與冠軍沿用 outbox。
- [x] 執行 `npm run build`、`git diff --check`，檢閱開始／切校／背景／重整／離線／重試／終止／單校相容性；依使用者授權 commit／push。
