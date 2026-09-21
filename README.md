# Super Runners 超級跑者

以臺灣國中校園為舞臺的 2D 田徑遊戲。完整橢圓跑道採水平鳥瞰畫面，學生使用原生 SVG 像素角色；可瀏覽學校與學生、關注校隊，並舉辦逐班進行的百米比賽。

## 啟動

使用 Node.js 22.12+ 與 npm：

```sh
npm install
npm run dev
```

開啟終端機顯示的本機網址，預設為 `http://127.0.0.1:5173`。首次開啟時會在背景 Worker 產生完整全國學生資料，再寫入 IndexedDB；畫面會顯示生成、排名與保存進度。重新整理或再次開啟相同網址時讀取既有存檔，不會重新抽取學生。

其他指令：

```sh
npm run build
npm run preview
npm run update:schools
```

`build` 產生 `dist/`，`preview` 預覽該產物；`update:schools` 從教育部重新下載固定為 115 學年度的名錄。名錄已隨專案提供，遊戲執行時不需要連線查詢教育部。若不重新下載，可用 `node scripts/fetch-schools.mjs --offline` 從專案保存的來源快照重建名錄。

專案使用 **Vue 3.6.0-rc.8 Vapor**、Vite 8.3 與原生 CSS。入口是 `createVaporApp`，元件使用 `<script setup vapor>`；這是 Vue 3.6 的候選版本，請保留目前固定的套件版本與 lockfile。瀏覽器需支援 IndexedDB、Web Worker、SVG 與 Web Crypto；背景音樂由 Web Audio 合成，在首次互動後啟動。

## 本階段功能

- 首頁顯示八道完整操場、像素巡跑與功能選單，提供背景音樂靜音控制；百米倒數後會切換成速度較快且會輪替樂句的競賽配樂。
- 學校資料支援依縣市篩選、搜尋、收藏、班級與學生瀏覽、關注校隊。學生可編輯綽號與校隊身分；身體數值和能力不會因重新開啟頁面改變。個人能力值 1–5、6–8、9–10 分別顯示為綠、黃、紅。
- 學生有班級、年級、學校及全國排名。已有成績使用個人最佳，尚未參賽使用預估百米時間；排名以顯示的百分之一秒判斷同名次。
- 每所學校初始化時會隨機產生 8–16 名田徑隊員；依校內成績排序後，第 1–5 名有 90%、第 6–10 名 80%、第 11–15 名 70%、第 16–20 名 60%、第 21 名以後 50% 機率入選，名單會和世界資料一起保存。
- 舊版存檔首次載入時，若有少於 8 名的學校隊伍，系統會依同一套機率補足並保存，避免沿用舊版的空隊伍。
- 「我的隊伍」呈現已關注校隊與資料中已有的代表隊。依本階段範圍，區域、國家代表隊的自動選拔與建立留待下一階段，沒有手動組建入口。
- 校內百米可跨年級選擇 1–8 個班級，每組最多 8 人。依所選班級的順序，讓一個班全部跑完，再進入下一班。
- 比賽畫面會裁切並放大八道百米直線、起終點與終點後減速區，不顯示其餘橢圓跑道；另提供 3、2、1 倒數提示音、起跑哨音、暫停、1×／2×／4×播放速度與分組結果。人物上方不顯示會遮擋角色的名次浮標，即時名次、預估成績、個人最佳與本次成績改在下方選手卡呈現，校隊及代表隊員另有身分圖示。每組完成後自動保存成績並更新個人最佳；全班完成後，依全班結果頒發金、銀、銅牌。播放速度不改變紀錄時間。
- 百米比賽固定使用 D 側身快跑像素步態；人物實際奔跑時呈現朝右側身、前後肢體交錯的快跑輪廓，停止或尚未起跑時保留靜態正面像素頭像。
- 首頁橢圓跑道會依跑道切線方向自動切換跑者朝向：下方直道向右、上方直道向左，彎道過半後在中點翻轉，避免出現倒退跑。
- 大隊接力、區域比賽、全國大賽、資助隊伍與設定頁目前顯示「下一階段」，不會啟動未完成流程。

## 學校與虛構學生

真實學校名錄來自教育部統計處 **115 學年度（2026–2027）** 的「國民中學」與「附設國中部」兩份資料，涵蓋全臺 **22 縣市、970 所學校**：740 所國民中學及 230 所附設國中部。擷取日期為 2026-09-18。保留官方校名、六位數學校代碼、地址及網址；沒有為空白的官方網址猜測替代值。來源、範圍、原始快照及重建方式見 [學校名錄來源](docs/school-source.md)。

**學生、班級、人數、身體數值、能力、隊伍與賽事成績皆為虛構。** 每校固定為一年級、二年級、三年級，每年級 8–12 班，每班 30–40 人；校隊初始名單由生成器配置，不代表真實校隊或成績選拔。姓名依不同姓氏、名字與命名形式組合，學生以唯一學號識別，不要求姓名互不重複。每個班在初始化時取得一個固定班服顏色，且只套用於上衣。學生的性別輪廓、長短髮、直髮或捲髮、五階膚色、眼鏡、褲色與鞋色都由學號穩定決定，重新開啟頁面不會改變。

每位學生保存年級、性別、年齡、身高、體重，以及 1–10 的爆發力、耐力、體力、力量、技巧。身高與體重以有稀少極端值的分布生成，體重透過 BMI 與身高連動；平均身高與能力會隨年級小幅成長，因此三年級的預估成績通常略快於二年級，二年級通常又略快於一年級，但個人差異仍可超過年級差。第一次初始化產生隨機種子並將完整結果保存；換頁不會抽取新資料。

學號由縣市英文字母加上七位數字組成，例如 `TP0110101`：`TP` 為臺北市、`01` 為該縣市內的遊戲學校代號、`1` 為一年級、`01` 為班級、`01` 為座號。新北市、臺中市、高雄市各超過 99 所學校，因此第 100 所起使用第三個字母分組，例如 `NTA0110101`，仍保留兩位學校代號與七位數字。`officialCode` 另存教育部六位數學校代碼，不與遊戲學號混用。

## 百米與跑道模型

跑道的 SVG 座標單位是公尺。內緣半徑 36.5 公尺，第一道測量線距內緣 0.30 公尺，因此 **400 公尺使用的測量半徑為 36.8 公尺**；兩段直道各長 `(400 − 2π × 36.8) / 2 ≈ 84.389` 公尺。八道各寬 1.22 公尺，跑者沿各道中央前進。100 公尺直道向左延伸約 15.611 公尺，使起跑線到終點線恰好為 100 公尺。

預估排序時間為 `10 + softplus(z)`；`z` 由年級成熟度、身高、體重與五項能力的線性組合決定。其他數值相同時，較高、較輕、能力較高的學生更快。這個連續函式趨近 10 秒，不以硬性截斷製造大量同速；有效資料的成績不會低於 10 秒。性別、姓名與校隊身分不直接改動時間。

每班會獨立抽取成績分布，約 50–75% 學生落在 14–16 秒，且每班中心值不同；年級每增加一年，班級中心約快 0.20 秒。13–14 秒及 16 秒以上較少，12–13 秒更少，11–12 秒極少。10–11 秒選手由學校層級控制，多數學校沒有，少數學校有一位，單校最多兩位。綜合身體能力較好的學生會優先取得較快的班級基準，因此分布不會脫離個人數值。

每組起跑前建立速度曲線：零速加速、最高速巡航、末段衰減。身高、體重、爆發力、力量及技巧影響到達最高速所需時間；肌耐力與體力影響衰減開始時間與幅度。爆發力也代表突破潛力，數值越高，單場突破基準或既有最佳的機率與幅度越高。每次出賽另有小幅鐘形波動，並以百分之一秒保存。跑者過線後會依進線速度繼續前進約三秒、逐步減速並淡出；即時名次依當下位置計算，已過線者則鎖定正式完賽順序。完整公式與元件 API 見 [百米模擬與跑道](docs/race-model.md)。

## 存檔與完整 JSON 匯出

存檔保存在目前瀏覽器、目前網站來源的 IndexedDB，資料庫名為 `superrunners-taiwan-v3`。使用 `meta`、`schools`、`students`、`teams`、`races`、`awards` 六個 object store。啟動 v3 時會刪除舊的 `superrunners-taiwan-v1` 與 `superrunners-taiwan-v2` 資料庫；若舊版仍在其他分頁開啟，會在該分頁關閉後完成刪除。首次初始化完成後才寫入完成標記；成績與個人最佳共同保存，全班最後一組會將該班獎牌及校隊獎項關聯納入同一筆交易。重新開啟會從已保存的個人最佳重新計算排名；匯出期間會依序處理資料變更，以保持同一份完整快照。

畫面上的匯出按鈕會下載 `superrunners-tw-YYYY-MM-DD.json`，包含整個世界的資料。檔案內的秒數保存未四捨五入的數值，日期時間為 ISO 字串。此階段提供完整匯出，尚未提供 JSON 匯入介面。瀏覽器與網址／連接埠不同時使用不同存檔；清除網站資料也會清除本機世界，因此需要保留匯出的備份。

JSON 的 `schemaVersion` 為 `3`，最上層結構如下：

| 欄位 | 內容 |
| --- | --- |
| `schemaVersion` | `3` |
| `country` | `{ code: "TW", name: "臺灣" }` |
| `createdAt`, `exportedAt` | 世界建立與匯出時間 |
| `seed` | 生成世界時使用的種子 |
| `source` | 名錄名稱、發布者、公告網址、學年度、擷取時間、範圍、筆數、來源與雜湊資訊 |
| `schools` | 所有學校，包含每所學校的班級陣列 |
| `students` | 所有學生、能力、身分、最佳紀錄及排名 |
| `teams` | 所有隊伍、成員與獎項關聯 |
| `races` | 已保存的分組賽事及選手結果快照 |
| `awards` | 已頒發的個人獎牌紀錄 |
| `favoriteSchoolIds` | 收藏學校的 ID 陣列 |
| `followedTeamIds` | 關注隊伍的 ID 陣列 |
| `settings` | `{ muted: boolean }` |

各類紀錄保存的欄位：

| 類型 | 欄位 |
| --- | --- |
| School | `id`, `officialCode`, `name`, `city`, `cityCode`, `address`, `website`, `schoolNumber`, `teamId`, `classes` |
| Class（位於 `school.classes`） | `id`, `schoolId`, `grade`, `number`, `name`, `color`, `studentIds` |
| Student | `id`, `studentNumber`, `schoolId`, `classId`, `name`, `nickname`, `gender`, `grade`, `age`, `height`, `weight`, `explosiveness`, `endurance`, `stamina`, `strength`, `technique`, `isSchoolTeam`, `isCityTeam`, `isNationalTeam`, `best100`, `baseline100`, `ranks` |
| Student.ranks | `class`, `grade`, `school`, `national` |
| Team | `id`, `type`, `name`, `schoolId`, `city`, `createdAt`, `memberIds`, `awardIds`；目前產生的 `type` 為 `school` |
| Race | `id`, `sessionId`, `schoolId`, `schoolName`, `classId`, `className`, `classColor`, `heat`, `event`, `startedAt`, `finishedAt`, `results` |
| Race.results[] | `studentId`, `lane`, `time`, `place`, `name`, `nickname`, `gender`, `height`, `weight`, `studentNumber`, `className`, `classColor`, `schoolName`, `dateTime` |
| Award | `id`, `sessionId`, `classId`, `className`, `classColor`, `schoolId`, `schoolName`, `studentId`, `studentName`, `studentNumber`, `year`, `dateTime`, `event`, `competition`, `type`, `medal`, `place`, `time` |

`source` 的完整欄位為 `name`, `publisher`, `url`, `year`, `academicYear`, `retrievedAt`, `schoolCount`, `cityCount`, `juniorSchoolCount`, `attachedDivisionCount`, `missingWebsiteCount`, `scope`, `note`, `sources`。其中 `sources[]` 保存 `name`, `year`, `url`, `yearSpecificUrl`, `retrievedAt`, `responseSha256`, `recordsSha256`, `recordCount`。校名和班級名保存於賽事結果中，可追溯比賽時的資料快照。

## 主要檔案

| 路徑 | 用途 |
| --- | --- |
| `src/App.vue`, `src/components/` | 主介面、學校與隊伍、比賽流程、跑道及像素學生 |
| `src/data/schools.js` | 官方學校名錄與來源描述 |
| `src/lib/generator.js` | 一次性產生全國學生及計算排名 |
| `src/lib/world.worker.js` | 背景初始化與讀取存檔 |
| `src/lib/storage.js` | IndexedDB 分表保存及完整 JSON 匯出 |
| `src/lib/game.js` | 遊戲狀態、學生編輯、成績與獎牌保存 |
| `src/lib/physics.js`, `src/lib/track-geometry.js` | 百米速度模型與公尺比例幾何 |
| `scripts/fetch-schools.mjs`, `scripts/school-sources/` | 官方名錄重建腳本與來源快照 |

## 驗證狀態

依使用者明確要求，本次跳過所有測試，未新增或執行自動化測試，也未進行瀏覽器操作測試。已執行 `npm run build` 並成功產生正式版 `dist/`；建置通過不代表互動流程已經測試。功能與資料流程說明來自程式碼和來源資料檢查。
