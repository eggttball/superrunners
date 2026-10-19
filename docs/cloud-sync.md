# Realtime Database 與本機存檔同步

本功能沿用既有遊戲世界：固定的學校、班級及學生身體資料優先讀取 IndexedDB；收藏、隊籍、比賽和排名採增量同步。管理者不需要建立新的登入帳號。

## 資料庫與首次遷移

- Firebase 專案：`superrunners`。
- 資料庫：`superrunners-default-rtdb`，區域 `asia-southeast1`（新加坡）。
- 連線網址：`https://superrunners-default-rtdb.asia-southeast1.firebasedatabase.app`。
- 設定檔：`src/lib/firebase.js`；開發環境可以用 `VITE_FIREBASE_DATABASE_URL` 覆寫。
- 權限：Firebase Auth 已登入的既有管理者，且只能存取自己 UID 底下的世界；前端不顯示管理者 Email。

部署程式與上傳遊戲資料是兩個步驟。資料在原本遊玩的瀏覽器、原本網址來源的 IndexedDB 中，不在 GitHub 或專案資料夾裡。部署完成後，在**原本有存檔的瀏覽器及原本網址**開啟網頁並登入，程式會自動上傳現有資料，顯示逐校進度。首次完成前請保持頁面開啟；中斷後再進入會讀取已完成標記，跳過已上傳學校。

若使用全新的瀏覽器，而雲端還沒有完整存檔，畫面會要求先由原本瀏覽器完成上傳，不會再隨機產生另一個世界。不同世界使用不同識別碼；若本機與既有雲端不相符，會保留兩邊資料並停止上傳，不會自動覆蓋任何一份。

## 開啟網頁時的順序

1. 完成 Firebase Auth 登入狀態確認。
2. Worker 讀取 IndexedDB；啟動時也會申請瀏覽器持久化儲存，避免大型固定資料被自動回收。
3. 本機已有資料：直接使用本機固定資料，讀小型雲端 `manifest` 確認世界，以 `admissionCursor` 查詢增量插班生，並處理待同步動作；不重新下載原始固定資料。
4. 本機沒有資料：先確認雲端已初始化，再逐校下載固定資料，載入動態狀態與既有成績，寫入 IndexedDB；完成後才開始操作。
5. 日常遊玩只在下表的操作發生時讀取相關動態資料。不訂閱全國資料或排名根節點，不背景輪詢全部世界。

## 按需讀取範圍

| 使用者操作 | 從雲端取得 | 未讀取的範圍 |
| --- | --- | --- |
| 開啟學校選擇器 | 收藏學校、關注隊伍的 ID 旗標 | 全國固定學校／學生 |
| 點「我的隊伍」 | 最新關注清單、各關注隊伍的成員／最佳／綽號及獎牌 | 未關注校隊的成員資料 |
| 點「查看田徑隊名單」 | 指定隊伍的名單與成員動態資料 | 其他校隊 |
| 選擇學校與班級 | 該班排名 `{studentId: {time, best100}}` | 同校其他班級排名 |
| 選「年級排名」 | 該校該年級排名 | 其他年級 |
| 選「全校排名」 | 該校排名 | 其他學校 |
| 點「全國排名」 | 伺服器查詢前 300 筆 | 其餘全國名次 |
| 全國排名翻頁 | 已取得的同一份 300 人快照，每頁 100 人 | 不額外請求 |
| 點學生資料 | 該學生的綽號、隊籍、個人最佳 | 不下載全國排名來更新個人卡 |
| 展開校內比賽紀錄 | 該校賽事及獎牌 | 其他学校歷史 |

排名索引儲存秒數和個人最佳，不複製姓名、身高等固定資料。畫面以學生 ID 對回本機資料。相同百分之一秒使用並列名次（例如 1、1、3）。全國資料庫規則要求 `orderByChild === 'time'` 且 `limitToFirst <= 300`；不能由前端先下載全國索引後再切 300 人。

每次取得的排名會另存 IndexedDB `cloudCache`。失敗時保留本機資料或上次成功的排名快照，顯示錯誤與重試入口。個人卡上的其他排名仍是本機最近計算／同步的數值，不代表同一時間重新下載了四種全國／校內排名。

## 雲端結構（schemaVersion 1）

```text
users/{uid}/
  manifest
    worldId, schemaVersion, state, schoolCount, studentCount, completedAt
  worlds/{worldId}/
    static/
      meta                       世界版本、國家、seed、createdAt、來源
      schools/{schoolId}/
        school                   學校與內嵌 classes
        students[]               該校學生的固定欄位（含 baseline100）
        team                     校隊名稱、成立時間等固定欄位
    uploaded/{schoolId}: true     首次上傳進度
    uploaded/_meta: true
    dynamic/
      preferences/
        favoriteSchoolIds/{schoolId}: true
        followedTeamIds/{teamId}: true
      rosters/{teamId}/{studentId}: true
      profiles/{studentId}/       nickname、isCityTeam、isNationalTeam
      addedStudents/{studentId}   手動新增學生的固定資料及 admittedAt
      admissionSeats/{classId}/{seat}  跨裝置保留學號及空位
      bests/{studentId}: 14.21
      races/{schoolId}/{raceId}
      awards/{schoolId}/{awardId}
      teamAwards/{teamId}/{awardId}: true
      windMeets/{schoolId}/{meetId}  選拔對戰歷程與歷屆冠軍
      windChampions/{schoolId}/{grade}  現任風速小子
      regionMeets/{city}/{meetId}    區域賽歷程及前三名
      regionRaces/{city}/{raceId}    區域賽逐場成績
      regionChampions/{city}        現任風速王子
      nationalMeets/{meetId}        全國大賽歷程及決賽前六名
      nationalRaces/{raceId}        全國大賽逐場成績
      nationalChampion             唯一現任風神
      nationalHonors/{studentId}/{meetId}  個人歷屆全國決賽名次
    rankings/
      class/{classId}/{studentId}: { time, best100 }
      grade/{schoolId}/{grade}/{studentId}: { time, best100 }
      school/{schoolId}/{studentId}: { time, best100 }
      national/{studentId}: { time, best100 }
```

尚未有實際成績時，排名 `time` 為固定 `baseline100`，`best100` 在 RTDB 中省略，還原為本機 `null`。RTDB 不保留空陣列／空物件，讀取時會轉回本機所需的空陣列。

`worldId` 為世界 schema、seed、建立時間、學校數及原始生成學生數（不含插班生）的 SHA-256。它是世界身份識別，並非完整內容的校驗雜湊。`manifest` 以 ETag 條件寫入確保只有一個世界取得首次上傳位置；條件寫入保留一般回應，不搭配 RTDB 不支援的 `print=silent`，批次 PATCH 則使用靜默回應節省流量。`static` 只能在上傳期間建立，一旦存在就不允許覆寫。

## 寫入、斷線與重試

IndexedDB object store 版本目前為 `5`，原本資料格式 `schemaVersion: 3` 與資料庫名稱不變。新增：

- `outbox`：尚未收到雲端確認的動作，包含 `id`、`uid`、`worldId`、`type`、`payload`、`createdAt`。不含任何登入 token。
- `cloudCache`：按查詢範圍保存的動態快照，包含 `id`、`updatedAt`、`data`。

操作順序：

1. 本機變更及 outbox 動作在同一個 IndexedDB transaction 寫入。
2. 前端立即反映已保存的本機資料；不在每次抵達終點時顯示雲端同步提示。
3. 同步器依順序上傳；成功後才刪除 outbox 動作。
4. 中斷後在重新開啟、恢復連線、每 30 秒重試或點「重試同步」時補傳。權限或世界不符的錯誤會顯示在畫面上，未同步動作仍保留。

收藏、關注與隊籍以單一 ID 路徑設定／移除，不整份覆蓋名單。相同欄位在不同裝置都被修改時，最後成功寫入雲端的值生效；離線裝置稍後補傳的操作也屬於一次新寫入。

每組百米比賽上傳前僅取得該組最多八人的雲端最佳，取較快值後，以一個多路徑 PATCH 同步寫入賽事、個人最佳、四種排名，以及當組完成全班時的獎牌。規則不允許既有最佳變慢；若別台裝置搶先改善成績，整個 PATCH 會被拒絕，前端重讀最佳後重試。固定的 raceId／awardId 讓回應遺失後的重傳不會增加重複紀錄。

讀取結果會經過本機交易佇列，並保留尚未上傳的本機修改。若讀取期間發生新的本機操作，會重新讀取，避免舊回應覆蓋剛編輯的內容。

## 手動插班生

「新增學生」先連線保留班級座號，再保存本機：

1. 讀取該班 `admissionSeats`，排除原始及已保留座號，以 `if-match: null_etag` 建立 01～50 的一個空位。學號格式及班級關聯由規則驗證；相同 creationId 可恢復回應遺失的保留結果。
2. 同一個 IndexedDB transaction 保存學生、學校班級名單、校隊名單及 `student-create` outbox。保存失敗時嘗試釋放尚未建立學生的名額。
3. 同步器以多路徑 PATCH 新增 `addedStudents` 固定個資（不含 nickname／隊籍／最佳／排名）、初始 profile／roster 與四個成績索引；固定資料包含 `baseline100`，以及新增學生才有的預估方式和區間欄位 `baseline100Mode`／`baseline100Min`／`baseline100Max`。若採自訂區間，抽取的預估基準和原區間都會保存，其他裝置讀取後會沿用同一基準；`admittedAt` 使用 Firebase 伺服器時間。若已存在相同 creationId，表示之前寫入成功，直接確認，避免重試重設後續編輯或成績。
4. 本機新增後立即可參賽；若後續寫雲端失敗，保留 outbox 並沿用既有補傳機制。原始 static 快照不改寫，manifest 的 studentCount 只包含原始生成學生。

啟動查詢 `addedStudents` 的 `admittedAt` 索引，自 `admissionCursor - 1000` 毫秒起查詢，保留時間邊界重疊並以 ID 去重；新學生及游標一起保存。全新瀏覽器先驗證原始世界，再合併全部插班生並還原動態欄位。排名／校隊／稱號／比賽歷程讀取如遇本機未知 ID，也只補取該學生的新增個資及動態欄位，不重抓原始全國學生。

自動賽本機進度保存目前學校完整 queue；重整後不依新增學生重排已啟動賽程。需要從賽事紀錄找回進度時，以紀錄的 `classParticipantIds` 重建，舊紀錄則排除學校開賽後才新增的學生，避免同一組 raceId 重跑不同參賽者或把已完成學校判斷為未完成。

保留名額後、尚未保存本機前關閉網頁，可能留下未使用的保留座號；它不會形成學生，也不會覆蓋別人的資料。成功新增的座號固定保留，不能重配或修改固定個資。`admissionCursor` 不上傳到固定 metadata；JSON 匯出仍包含已合併的新增學生。

## 部署

`database.rules.json` 是正式資料庫規則；`firebase.json` 同時包含 Hosting 與 Database 設定。

```sh
npm run build
firebase deploy --only database --project superrunners
```

GitHub Actions 每次推送 `main` 後建置網站，以既有 `FIREBASE_SERVICE_ACCOUNT_SUPPERRUNNERS` 驗證、部署資料庫規則，再部署 Hosting。服務帳號需要部署 Hosting 及 Realtime Database 規則的權限；不需將私人金鑰放到前端或 Git。

## 存檔範圍

匯出 JSON 仍為完整的**目前本機**世界快照，包含從雲端還原／更新過的紀錄；按需同步不會為了匯出而重新下載所有學校的新賽事。`outbox` 和 `cloudCache` 是同步控制資料，不列入原有 JSON 匯出格式。全校及全國校內自動賽的控制器在頁面記憶體，未完成進度另存 IndexedDB；已完成組別會寫入本機與雲端待同步佇列，重新整理後會從最後已保存的組別繼續。全國模式為各校分別產生 `sessionId`，沿用相同逐組同步流程，無須新增雲端資料格式或規則。

## 風速小子選拔資料

每場選拔賽的 `heat` 待同步動作包含 `windMeet`；年級決賽另包含 `windChampion`，與 `race`、個人最佳和排名一起多路徑寫入。開賽／暫停狀態使用 `patch` 動作。既有 outbox 的離線保存與網路恢復補傳機制同樣適用。

新稱號不會寫入固定的學校或學生節點。`windChampions/{schoolId}` 僅在進入該校資料、取得隊員／個人詳情或選拔歷史時讀取。展開「風速小子歷屆選拔」僅讀該校 `windMeets` 和稱號，不下載全部校內百米紀錄。查詢結果仍經本機交易佇列及待同步操作覆蓋，避免離線的新冠軍被舊雲端回應覆寫。

全新瀏覽器還原時，各校的選拔歷程與稱號一起還原；有本機固定資料時只升級 IndexedDB 新資料表，不重抓全國學生。

「全國風速小子選拔賽」依縣市／學校順序重用每校選拔與正式成績同步，年級冠軍仍寫入 `users/{uid}/worlds/{worldId}/dynamic/windChampions/{schoolId}/{grade}`，不需新的雲端稱號格式。網路中斷不影響下一場本機比賽，正式成績和稱號待同步操作留在 outbox，恢復連線後按序補傳。

全國模式的學校清單、當前索引、速度與暫停狀態保存於本機 `nationalWindMeetProgress`；完成或終止後清除，不上傳雲端、不匯出。各校歷程的 `nationalRunId` 會隨正常歷程上傳，用來識別該屆賽事，並不包含續跑游標。每校最後的友誼賽不寫雲端紀錄或個人最佳。

## 區域比賽資料

IndexedDB store 版本升為 `4`，新增 `regionMeets`，不重抓固定學校／班級／學生資料。世界 `schemaVersion: 3` 與雲端 schemaVersion 1 保留，擴充動態路徑：

```text
dynamic/regionMeets/{city}/{meetId}     縣市運淘汰歷程與歷史冠軍
dynamic/regionRaces/{city}/{raceId}     每一場正式區域賽成績
dynamic/regionChampions/{city}         唯一現任風速王子
```

正式區域賽的 `heat` outbox 動作包含 `regionMeet`，決賽另帶 `regionChampion`；以一筆多路徑 PATCH 寫入區域成績、歷程、各參賽者個人最佳和四種排名，沿用離線保存／補傳、固定 raceId 與最佳成績不可變慢的規則。新增節點都由 Firebase Rules 驗證管理者 UID、Email 及 worldId；正式區域賽最多六個跑道，友誼賽不得寫入 regionMeets。

啟動時只讀現任王子的小型索引（最多 22 位），供全站標籤辨識；選取縣市時讀該縣市的正式歷程、區域成績和現任王子。開賽前按所選範圍逐校讀取風速小子及全校排名，固定本次代表名單；未連線時採本機資料。進入指定學校／學生／隊伍也取得其縣市的現任王子。pending outbox 會覆蓋雲端讀取，離線的新王子不會被舊快照移除。全新瀏覽器還原涵蓋全部區域動態資料。

王子索引與校內風速小子完全獨立：每次校內選拔不改王子，只有下一屆縣市正式決賽替換。友誼賽只存在當次頁面記憶體，不送出任何正式紀錄或個人最佳。

現任風速王子另附 `awardedAtMs` 決賽完成時間。同步前讀取目前王子，較舊離線決賽只上傳歷史成績，不替換較新的王子；規則也驗證時間不得倒退，若別台裝置搶先更新會重讀並重試。


## 全國大賽與個人決賽榮譽

IndexedDB v5 新增 `nationalMeets`，保留固定世界與既有進度。世界與雲端 schemaVersion 維持 3／1；新動態路徑如上。

進入全國大賽或準備開賽時，`fetchRegionalDelegations()` 先讀各縣市現任冠軍，再依 `meetId` 只讀該屆區域賽歷程，不下載歷屆所有區域樹、區域賽逐場成績或學生固定資料。`fetchNationalHistory()` 讀全國歷程、現任風神及全國逐場成績，用於淘汰樹第一輪時間與歷史總覽。個人頁額外只讀 `nationalHonors/{studentId}` 與現任風神，無須下載全部學生榮譽。

每場正式全國賽的 `heat` outbox 動作帶有 `nationalMeet`，最後決賽另帶 `nationalChampion`。同一筆多路徑 PATCH 寫入 `nationalRaces`、`nationalMeets`、參賽者最佳成績與四種排名。決賽同時將前六名分別寫到 `nationalHonors/{studentId}/{meetId}`，保存稱號／名次及時間快照；友誼賽不入 outbox、不寫雲端。

現任風神以 `awardedAtMs` 防止舊離線決賽覆蓋較新冠軍；舊場次仍補傳為歷史紀錄。所有新增路徑仍須管理者的 Auth UID、Email 及 worldId 驗證；`nationalMeets` 僅接受正式賽，成績／榮譽至少 10 秒，跑道及決賽名次限制為 1～6。規則隨 GitHub Actions 在 Hosting 前部署。

## 大隊接力同步

接力新增以下動態路徑，既有固定學校、班級及學生資料無須重新下載或生成：

```text
dynamic/relayLineups/{classId}             可重用的固定十六棒名單
dynamic/relayMeets/{schoolId}/{meetId}     正式淘汰賽與完整晉級歷程
dynamic/relayRaces/{schoolId}/{raceId}     正式團隊總時間、分段、交棒及名單快照
dynamic/relayChampions/{schoolId}         唯一現任風速小班
```

學校資料頁選擇學校時取得該校接力歷程、正式團隊紀錄與現任稱號，供班級顯示 1600m 最佳成績；切換班級只從本機已取得的該校成績篩選，不重讀雲端。接力開賽前取得該校排名及已保存棒次，排名未變則沿用棒次；離線時使用本機快照。校內比賽頁展開接力歷程時取得該校接力賽事和團隊紀錄，其他學校不讀取。

每場正式接力先在同一個 IndexedDB transaction 保存 `relayRaces`、更新 `relayMeets`、必要時更新 `relayChampions`，並新增 `type: 'relay'` 的 outbox 動作。同步動作以 REST PATCH 上傳團隊結果及歷程，不寫個人 `bests` 或百米排名。斷線不阻止接力繼續；未上傳結果保留 `syncStatus: 'pending'`，網路恢復後重試並移除注記。重試沿用場次 ID，避免重複紀錄。

冠軍依 `awardedAtMs` 比較，只允許最新一屆替換現任稱號，舊離線賽事仍保存歷史但不覆蓋新冠軍。固定棒次也採更新時間保護。`relayMeetProgress` 含目前動畫計畫和本機游標，完全不上傳，不從雲端恢復。友誼接力不送正式結果、歷程或稱號。

「全國風速小班選拔賽」依本機的全國學校、班級、學生、最佳百米成績及棒次逐校準備接力，不額外下載全國固定資料。各校正式 `relayMeets` 加上 `nationalRunId`，穩定賽事 ID 為 `${nationalRunId}-${schoolId}`；既有 `relay` outbox 同步各場正式結果、樹狀歷程和每校冠軍，無須新增雲端路徑。全國的學校順序、目前游標、暫停與速度、當場已抽取計畫皆只在本機 `relayMeetProgress`，開啟同一瀏覽器才可續跑。終止清除該進度，既有成績及等待補傳的 outbox 保留，重整不會再接續未完成全國賽程。
