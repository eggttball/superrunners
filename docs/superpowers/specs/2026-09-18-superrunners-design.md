# Super Runners 第一階段

使用者補充：所有學生以復古像素角色繪製；本階段略過所有測試，不新增或執行測試，僅進行正式打包。此補充優先於原計畫中的測試步驟。

採用 Vue Vapor SFC、Vite、原生 CSS、SVG 鳥瞰操場、IndexedDB。所有真實學校名稱來自教育部名錄；學生與成績能力均為虛構。首次完整初始化全國資料；固定種子與存檔確保班級、人數、學生不會重抽。學校固定一年級、二年級、三年級，每級 8–12 班、每班 30–40 人，保留規格上限 16 班及 50 人。用背景 worker 生成，避免阻塞介面。每班保存初始化指定的固定班服顏色。

首頁採深綠、暖白、萊姆綠運動視覺，橫向 SVG 俯瞰操場含巡跑動畫。浮動功能入口：我的隊伍、學校資料、校內比賽，及停用的區域比賽、全國大賽、資助隊伍、設定。Web Audio 生成輕音樂，受瀏覽器規則約束於首次互動啟動，可靜音。

操場内緣半徑 36.5m、8 道各寬 1.22m、測量線離內緣 0.30m；直道長度 (400 - 2π×36.8)/2。100m 使用直道延伸，明確起終點，所有跑者維持各自道次。

學校資料可選縣市、搜尋學校、收藏學校、關注田徑隊，查看年級班級學生。學生可編輯綽號及校隊身分，其他初始屬性不變。呈現班、年級、校、全國排名，未比賽者用預估 100m 排序並註明。獎牌區初始為空，校內各班百米完賽前三名累積帶年度、姓名、秒數的獎牌。隊伍頁初始空白，顯示已關注校隊及已有代表隊。依需求後段規則，代表隊不允許手動選人建立，自動選拔留待第二階段。

校內比賽從全國或收藏學校選取 1–8 班，百米按班順序、每組最多 8 人進行。提供起跑倒數、暫停、速度切換、逐組結果，完賽即保存。接力按鈕顯示下一階段且不能啟動。永久紀錄有學生身分與姓名快照、班級、完成秒數、ISO 日期時間；個人最佳只會改善。

使用帶下限的單調時間函式，身高、爆發力、力量、技巧、耐力、體力增加必定改善時間，體重增加必定增加時間。不得低於 10 秒。將加速/巡航/末段衰減的速度積分正規化到相同完賽時間，顯示位置與紀錄一致。

資料匯出為完整 schemaVersion 2 JSON，包括國家、名錄來源、種子、学校、班級、班服顏色、學生、隊伍、關注收藏、比賽、獎項及設定。IndexedDB 分表，增量保存學生和賽事；資料損壞/容量錯誤顯示可恢復錯誤，不自動覆蓋原有資料。

## Shared interfaces

World: { schemaVersion:2, country:{code:'TW',name:'臺灣'}, createdAt, seed, source, schools, students, teams, races:[], awards:[], favoriteSchoolIds:[], followedTeamIds:[], settings:{muted:false} }.
School: { id, officialCode, name, city, cityCode, schoolNumber, address, website, teamId, classes:[{id,schoolId,grade,number,name,color,studentIds}] }.
Student: { id, studentNumber, schoolId, classId, name, nickname:'', gender:'男'|'女', age, height, weight, explosiveness,endurance,stamina,strength,technique, isSchoolTeam,isCityTeam:false,isNationalTeam:false,best100:null,baseline100,ranks:{class,grade,school,national} }.
Team: { id,type:'school'|'city'|'national',name,schoolId,city,createdAt,memberIds,awardIds:[] }.
Catalog: array of {id,officialCode,name,city,cityCode,address,website}; named exports catalog and catalogSource from src/data/schools.js.
Generator: generateWorld(catalog,{seed,createdAt,onProgress}={}) returns World; rankStudents(world) mutates ranks. Export from src/lib/generator.js.
Physics: predict100(student), createSprintProfile(student) => {time,...}, distanceAt(elapsedSeconds,profile) => 0..100. Export from src/lib/physics.js.
Track.vue: props runners:[{id,name,lane,distance,color}], animated:boolean (default true), raceMode:boolean; native responsive SVG, no data store coupling.
