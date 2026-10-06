# Realtime Database 同步設計

## 目標

沿用目前瀏覽器的世界；首次將它分批上傳至 Firebase Realtime Database。啟動先讀 IndexedDB，有固定資料就不再下載固定資料。沒有本機存檔時從已完成初始化的雲端世界還原，不能另生一份隨機世界。

## 分層

- `users/{uid}/manifest`：小型世界識別與初始化完成標記。
- `users/{uid}/worlds/{worldId}/static/meta`、`static/schools/{schoolId}`：唯讀世界中繼資料及逐校的固定學校、班級、学生與隊伍基本資料。
- `dynamic/preferences`：逐 ID 的收藏與關注旗標。
- `dynamic/rosters/{teamId}`、`profiles/{studentId}`、`bests/{studentId}`：動態隊籍、綽號與個人最佳。
- `dynamic/races/{schoolId}/{raceId}`、`awards/{schoolId}/{awardId}`、`teamAwards/{teamId}/{awardId}`：賽事與獎牌快照。
- `rankings/class/{classId}`、`grade/{schoolId}/{grade}`、`school/{schoolId}`、`national`：學生 ID 對應 `{time, best100}`；依秒數索引，名次含同秒並列由下載範圍計算。

## 讀取

固定資料逐校上傳／還原，避免一次超過資料庫單次請求上限。既有本機只查小型 manifest。我的隊伍載入最新偏好與關注隊伍；名單按鈕載入指定校隊；班級／年級／全校各在選擇該範圍後讀取；全國使用伺服器 `orderBy="time" & limitToFirst=300`。排名分頁使用此次快照，不重抓相同 300 名。動態資料回寫本機缓存，讀取失敗顯示本機資料與錯誤狀態。

## 寫入

IndexedDB 升級 object store 版本（保留世界 schemaVersion 3），新增 outbox 與 cloudCache。本機資料與 outbox 同一交易保存。離線或失敗保留待同步動作，重新開啟、連線恢復與手動重試會續傳。收藏、關注、隊籍只寫單一 ID，避免覆蓋其他裝置變更。

每組比賽使用固定 raceId。上傳前只讀八人以内的雲端最佳，採較快成績；同一次多路徑 PATCH 寫入賽事、最佳、四種排名及已頒獎牌。規則禁止已存在的最佳變慢；遇到其他裝置搶先更新則重讀重試，不以舊成績覆蓋新紀錄。

## 初始化與權限

使用 Firebase Auth 的帳號 UID 隔離資料，規則另外限制既有管理者帳號。manifest 以 ETag compare-and-set 防止兩個世界互蓋；固定資料只能在上傳期間建立。逐校完成標記支援上傳中斷後續傳。不同 seed／建立時間的本機存檔不得覆蓋既有雲端世界，應顯示具體錯誤。雲端沒有世界且本機也沒有時，提示由原有存檔的瀏覽器先完成上傳。

## 驗證與交付

依使用者先前要求不新增／執行測試；執行 production build、差異檢查及規則／設定靜態檢查。更新資料結構與部署文件，部署資料庫規則。現有資料位於使用者已登入的瀏覽器，首次資料遷移由該瀏覽器執行並顯示進度，不能把程式上傳當成資料已上傳。
