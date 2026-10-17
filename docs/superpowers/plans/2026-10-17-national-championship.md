# 全國大賽實作計畫

**目標：**啟用全國大賽，由各縣市最新正式區域賽前三名參賽；友誼賽不寫入正式紀錄，冠軍稱號風神優先於現有稱號。

**架構：**共用區域賽的代表隊淘汰賽資料格式與背景控制器，新增 `kind: national-championship` 和 `scope: championship`。正式全國賽保存 `nationalMeets`、`nationalChampion`、每人決賽 `nationalHonors`，沿用本機交易與雲端 outbox。

**限制：**依使用者指示略過所有測試；執行正式建置、JavaScript 語法與差異檢查。沿用 main 分支與已授權 commit / push。既有固定世界及自動賽進度不得重置。

- [x] 建立縣市代表與全國淘汰賽純資料模型：取最近完整區域賽 podium，舊紀錄由決賽 topThree 還原。每場前三名晉級，決賽保存前六名。
- [x] 接入 IndexedDB v5 新增 nationalMeets 表、world 預設、遊戲交易與背景控制器。區域及全國決賽暫停時清除積存時鐘，繼續才倒數。
- [x] 補齊雲端 bootstrap / restore / 按需讀取 / outbox / 合併與 DB 規則；防止舊離線冠軍覆蓋新一屆冠軍。
- [x] 新增全國大賽頁面、首頁與導覽入口，縣市複選、參賽者預覽、代表缺漏提示及歷屆賽事。
- [x] 擴充比賽畫面、樹狀圖及個人頁：縣市顯示、全部/局部摺疊、決賽前六名、風神最高優先與個人榮譽。
- [x] 更新資料文件；自我檢視正式及友誼賽保存流程、重整恢復、稱號優先與輸入資料完整性。
- [x] 正式建置、JavaScript 語法、規則 JSON 與差異格式檢查通過。提交方式：依既有授權直接 commit / push 至 origin/main。

檢查紀錄：已完成程式流程與資料規則自我檢視；依使用者指示未執行測試。`npm run build`、九個變更 JavaScript 檔案的 `node --check`、規則 JSON 解析、`git diff --check` 於提交前通過。
