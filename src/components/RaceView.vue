<script setup vapor>
import { computed, ref, onUnmounted, watch } from 'vue'
import { autoMeet, game, getSchool, getClass, getStudent, recordHeat, timeText, dateText, notify, retryAutomaticMeetSave, setAutomaticMeetSpeed, startAutomaticMeet, toggleAutomaticMeetPause } from '../lib/game.js'
import { createSprintProfile, distanceAt, speedAt } from '../lib/physics.js'
import { setMusicMode, playCountdown, playStartWhistle } from '../lib/audio.js'
import SchoolPicker from './SchoolPicker.vue'
import Track from './Track.vue'
import PixelRunner from './PixelRunner.vue'
import Icon from './Icon.vue'
import GamePageHeader from './GamePageHeader.vue'
import { fetchHistory } from '../lib/cloud.js'

const gradeLabels = ['一年級', '二年級', '三年級']
const selectedSchoolId = ref(game.schoolId)
const selectedClasses = ref([])
const grade = ref(1)
const phase = ref('setup')
const queue = ref([])
const heatIndex = ref(0)
const athletes = ref([])
const elapsed = ref(0)
const paused = ref(false)
const speed = ref(1)
const saveError = ref('')
const sessionId = ref('')
const currentHeatId = ref('')
const startedAt = ref('')
const finishedAt = ref('')
const showHistory = ref(false)
let frame, previousTimestamp = 0, countdownCue = 0

const automatic = computed(() => autoMeet.active)
const displayedSchoolId = computed(() => automatic.value ? autoMeet.schoolId : selectedSchoolId.value)
const racePhase = computed(() => automatic.value ? autoMeet.phase : phase.value)
const raceQueue = computed(() => automatic.value ? autoMeet.queue : queue.value)
const raceHeatIndex = computed(() => automatic.value ? autoMeet.heatIndex : heatIndex.value)
const raceAthletes = computed(() => automatic.value ? autoMeet.athletes : athletes.value)
const raceElapsed = computed(() => automatic.value ? autoMeet.elapsed : elapsed.value)
const racePaused = computed(() => automatic.value ? autoMeet.paused : paused.value)
const raceSpeed = computed(() => automatic.value ? autoMeet.speed : speed.value)
const displayedSessionId = computed(() => automatic.value ? autoMeet.sessionId : sessionId.value)
const school = computed(() => getSchool(displayedSchoolId.value))
const classes = computed(() => school.value?.classes.filter(cls => cls.grade === Number(grade.value)) || [])
const totalStudents = computed(() => selectedClasses.value.reduce((count, id) => count + getClass(id).studentIds.length, 0))
const current = computed(() => raceQueue.value[raceHeatIndex.value])
const currentClass = computed(() => current.value ? getClass(current.value.classId) : null)
const countdown = computed(() => Math.max(1, Math.ceil(-raceElapsed.value)))
const maxTime = computed(() => Math.max(0, ...raceAthletes.value.map(athlete => athlete.profile.time)))
const runoutEnd = computed(() => Math.max(0, ...raceAthletes.value.map(athlete => athlete.profile.time + athlete.profile.runoutDuration)))
const liveRanks = computed(() => {
  const now = Math.max(0, raceElapsed.value)
  const order = raceAthletes.value.map((athlete, lane) => ({
    id: athlete.student.id,
    lane,
    finished: now >= athlete.profile.time,
    time: athlete.profile.time,
    distance: distanceAt(now, athlete.profile),
  })).sort((a, b) => {
    if (a.finished && b.finished) return a.time - b.time || a.lane - b.lane
    if (a.finished !== b.finished) return a.finished ? -1 : 1
    return b.distance - a.distance || a.lane - b.lane
  })
  return new Map(order.map((runner, index) => [runner.id, index + 1]))
})
// A place badge is awarded only when the runner has crossed the finish line.
// Ties use lane order so the display remains stable from frame to frame.
const finishRanks = computed(() => {
  const now = Math.max(0, raceElapsed.value)
  const finished = raceAthletes.value
    .map((athlete, lane) => ({ id: athlete.student.id, lane, time: athlete.profile.time }))
    .filter(athlete => now >= athlete.time)
    .sort((a, b) => a.time - b.time || a.lane - b.lane)
  return new Map(finished.map((runner, index) => [runner.id, index + 1]))
})
function rankClass(rank) {
  if (rank === 1) return 'rank-first'
  if (rank === 2) return 'rank-second'
  if (rank === 3) return 'rank-third'
  return ''
}

const runners = computed(() => {
  const now = Math.max(0, raceElapsed.value)
  return raceAthletes.value.map((athlete, index) => {
    const fadeStart = athlete.profile.time + athlete.profile.runoutDuration * 0.68
    const opacity = now <= fadeStart ? 1 : Math.max(0, 1 - (now - fadeStart) / (athlete.profile.runoutDuration * 0.32))
    return {
      id: athlete.student.id, name: athlete.student.name, gender: athlete.student.gender,
      height: athlete.student.height, weight: athlete.student.weight,
      lane: index + 1, color: currentClass.value?.color || '#d5ee7e',
      opacity,
      speed: speedAt(now, athlete.profile), distance: distanceAt(now, athlete.profile),
    }
  })
})
const results = computed(() => raceAthletes.value.map((athlete, index) => ({ ...athlete.student, lane: index + 1, time: athlete.profile.time, color: currentClass.value?.color || '#d5ee7e' })).sort((a, b) => a.time - b.time))
const records = computed(() => { game.revision; return game.world.races.filter(race => race.schoolId === displayedSchoolId.value).sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)) })
const sessionRecords = computed(() => { game.revision; return game.world.races.filter(race => race.sessionId === displayedSessionId.value) })
const sessionResults = computed(() => sessionRecords.value.flatMap(race => race.results).sort((a, b) => a.time - b.time))
watch(selectedSchoolId, value => { selectedClasses.value = []; game.schoolId = value; grade.value = 1 })
watch([showHistory, selectedSchoolId], async ([show, id]) => {
  if (show && id) try { await fetchHistory(id) } catch (error) { notify(error.message) }
})

function selectClass(id) {
  if (selectedClasses.value.includes(id)) selectedClasses.value = selectedClasses.value.filter(value => value !== id)
  else if (selectedClasses.value.length < 8) selectedClasses.value = [...selectedClasses.value, id]
  else notify('一次最多選擇 8 個班級')
}

function prepareHeat() {
  const heat = queue.value[heatIndex.value]
  currentHeatId.value = `${sessionId.value}-heat-${heatIndex.value + 1}`
  athletes.value = heat.studentIds.map(id => {
    const student = getStudent(id)
    return { student: { ...student }, profile: createSprintProfile(student) }
  })
  elapsed.value = 0
  paused.value = false
  saveError.value = ''
  finishedAt.value = ''
  phase.value = 'ready'
}

function enterRace() {
  if (phase.value !== 'setup' || !school.value || !selectedClasses.value.length || selectedClasses.value.length > 8) return
  const heats = []
  // Preserve the chosen order and complete every heat of a class before changing class.
  for (const id of selectedClasses.value) {
    const cls = getClass(id)
    for (let offset = 0; offset < cls.studentIds.length; offset += 8) {
      heats.push({ classId: id, heat: offset / 8 + 1, totalHeats: Math.ceil(cls.studentIds.length / 8), studentIds: cls.studentIds.slice(offset, offset + 8) })
    }
  }
  queue.value = heats
  sessionId.value = crypto.randomUUID()
  heatIndex.value = 0
  prepareHeat()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function enterAutomaticMeet() {
  if (school.value && startAutomaticMeet(selectedSchoolId.value)) window.scrollTo({ top: 0, behavior: 'smooth' })
}

function toggleDisplayedPause() {
  if (automatic.value) toggleAutomaticMeetPause()
  else paused.value = !paused.value
}

function setDisplayedSpeed(rate) {
  if (automatic.value) setAutomaticMeetSpeed(rate)
  else speed.value = rate
}

function retryDisplayedSave() {
  if (automatic.value) retryAutomaticMeetSave()
  else finishHeat()
}

function startHeat() {
  if (phase.value !== 'ready') return
  setMusicMode('race')
  countdownCue = 3
  playCountdown(3)
  startedAt.value = new Date().toISOString()
  elapsed.value = -3
  phase.value = 'countdown'
  previousTimestamp = 0
  frame = requestAnimationFrame(tick)
}

function tick(timestamp) {
  if (!previousTimestamp) previousTimestamp = timestamp
  const delta = Math.min((timestamp - previousTimestamp) / 1000, 0.1)
  previousTimestamp = timestamp
  if (!paused.value) elapsed.value += delta * (phase.value === 'countdown' ? 1 : speed.value)
  if (phase.value === 'countdown') {
    const cue = Math.max(1, Math.ceil(-elapsed.value))
    if (cue !== countdownCue) { countdownCue = cue; playCountdown(cue) }
  }
  if (elapsed.value >= 0 && phase.value === 'countdown') {
    phase.value = 'running'
    playStartWhistle()
  }
  if (phase.value === 'running' && elapsed.value >= maxTime.value && !finishedAt.value) finishedAt.value = new Date().toISOString()
  if (phase.value === 'running' && elapsed.value >= runoutEnd.value) {
    elapsed.value = runoutEnd.value
    finishHeat()
    return
  }
  frame = requestAnimationFrame(tick)
}

async function finishHeat() {
  if (phase.value !== 'running' && phase.value !== 'saveerror') return
  cancelAnimationFrame(frame)
  setMusicMode('ambient')
  // Retries retain the actual finish instant as well as the original heat ID/results.
  if (!finishedAt.value) finishedAt.value = new Date().toISOString()
  phase.value = 'saving'
  saveError.value = ''
  try {
    await recordHeat({
      id: currentHeatId.value, sessionId: sessionId.value, schoolId: selectedSchoolId.value,
      classId: current.value.classId, heat: current.value.heat, startedAt: startedAt.value, finishedAt: finishedAt.value,
      results: results.value.map((student, index) => ({ studentId: student.id, lane: student.lane, time: student.time, place: index + 1 })),
    })
    phase.value = 'heatdone'
  } catch (error) {
    saveError.value = error.message || '存檔失敗，請保留此畫面再試一次。'
    phase.value = 'saveerror'
  }
}

function nextHeat() {
  if (phase.value !== 'heatdone') return
  if (heatIndex.value + 1 === queue.value.length) phase.value = 'complete'
  else { heatIndex.value++; prepareHeat() }
}

function returnToSetup() { setMusicMode('ambient'); phase.value = 'setup'; selectedClasses.value = [] }
onUnmounted(() => { cancelAnimationFrame(frame); if (!automatic.value) setMusicMode('ambient') })
</script>

<template>
  <section class="content-view race-view">
    <template v-if="racePhase === 'setup'">
      <GamePageHeader title="校內比賽" caption="RACE DAY" description="選好班級，今天就來刷新紀錄！" theme="race"><span class="badge"><Icon name="flag" :size="15" />100m SPRINT</span></GamePageHeader>
      <div class="race-setup-layout">
        <SchoolPicker v-model="selectedSchoolId" />
        <div class="race-setup-detail panel">
          <template v-if="school">
            <div class="split-heading"><div><span class="eyebrow">01 / 選擇參賽班級</span><h2>{{ school.name }}</h2><p class="muted">{{ school.city }} · 可跨年級選擇，最多 8 班</p></div><span class="selection-counter"><b>{{ selectedClasses.length }}</b> / 8</span></div>
            <div class="tabs"><button v-for="year in 3" :key="year" :class="{ active: grade === year }" @click="grade = year">{{ gradeLabels[year - 1] }} <span>{{ school.classes.filter(c => c.grade === year).length }} 班</span></button></div>
            <div class="class-grid"><button v-for="cls in classes" :key="cls.id" class="class-card" :class="{ selected: selectedClasses.includes(cls.id) }" @click="selectClass(cls.id)"><span class="class-kit" :style="{ background: cls.color }"></span><span class="checkbox-visual"><Icon v-if="selectedClasses.includes(cls.id)" name="check" :size="14" /></span><strong>{{ cls.name }}</strong><small>{{ cls.studentIds.length }} 位學生</small></button></div>
            <div class="selected-classes"><span class="muted">已選班級</span><span v-if="!selectedClasses.length" class="muted">尚未選擇</span><button v-for="id in selectedClasses" :key="id" class="chip" @click="selectClass(id)">{{ getClass(id).name }}<Icon name="close" :size="13" /></button></div>
            <div class="event-selection"><span class="eyebrow">02 / 選擇比賽項目</span><div class="event-buttons"><button class="event-card sprint" :disabled="!selectedClasses.length" @click="enterRace"><Icon name="bolt" :size="28" /><div><strong>一百公尺</strong><small>選取班級比賽</small></div><Icon name="arrow" :size="24" /></button><button class="event-card automatic" @click="enterAutomaticMeet"><Icon name="flag" :size="28" /><div><strong>全校自動百米賽</strong><small>一年級至三年級</small></div><Icon name="play" :size="22" /></button><button class="event-card relay" disabled><Icon name="team" :size="28" /><div><strong>大隊接力</strong><small>下一階段開放</small></div><span class="badge">SOON</span></button></div></div>
            <div class="race-hint"><Icon name="clock" :size="19" /><p>全校自動賽會依一年級、二年級、三年級的班級順序持續進行。<br /><span>可切換到其他頁面；賽程仍會繼續，每組完賽自動存檔。</span></p></div>
          </template>
          <div v-else class="empty-state school-await"><Icon name="school" :size="46" /><h2>先選一所學校</h2><p>從全國名錄或收藏學校中，選擇今天的主場。</p></div>
        </div>
      </div>
      <div v-if="school" class="panel history-panel"><button class="section-title full-width plain-button" @click="showHistory = !showHistory"><h3><Icon name="clock" :size="19" /> 校內比賽紀錄 <span class="muted">{{ records.length }} 組</span></h3><span class="muted">{{ showHistory ? '收合 −' : '展開 +' }}</span></button><template v-if="showHistory"><p v-if="!records.length" class="empty-state">還沒有比賽紀錄。第一聲起跑槍，從今天開始。</p><details v-for="race in records" :key="race.id" class="race-history"><summary><span>{{ race.className || getClass(race.classId).name }} · 第 {{ race.heat }} 組</span><span>{{ dateText(race.finishedAt) }} · {{ race.results.length }} 人</span></summary><div class="table-wrap"><table class="data-table"><thead><tr><th>名次</th><th>學生</th><th>學號</th><th>秒數</th></tr></thead><tbody><tr v-for="result in race.results" :key="result.studentId"><td>{{ result.place }}</td><td><button class="text-button" @click="game.studentId = result.studentId">{{ result.name }}</button></td><td class="mono">{{ result.studentNumber }}</td><td class="mono">{{ timeText(result.time) }}</td></tr></tbody></table></div></details></template></div>
    </template>

    <template v-else-if="racePhase !== 'complete'">
      <div class="race-header"><div><h1>{{ school.name }}<span class="heading-dot">.</span></h1><p class="muted">{{ currentClass.name }} · 第 {{ current.heat }} / {{ current.totalHeats }} 組<span v-if="automatic"> · 全校自動賽</span></p></div><div class="race-clock"><strong>{{ timeText(Math.min(maxTime, Math.max(0, raceElapsed))) }}<small>s</small></strong></div></div>
      <div class="race-progress"><i :style="{ width: (raceHeatIndex / raceQueue.length * 100) + '%' }"></i></div>
      <div class="stadium-card race-stadium"><div class="stadium-topline"><span>百米直道 <b>100 METRES · 8 LANES</b></span><div class="race-topline-controls"><button v-if="racePhase === 'heatdone'" class="btn small primary next-heat-button" @click="nextHeat">{{ raceHeatIndex + 1 === raceQueue.length ? '查看總結' : '下一組' }}<Icon name="arrow" :size="16" /></button><button v-if="racePhase === 'saveerror'" class="btn small primary" @click="retryDisplayedSave">重試保存</button><button v-if="racePhase === 'running' || racePhase === 'countdown'" class="btn small" @click="toggleDisplayedPause"><Icon :name="racePaused ? 'play' : 'pause'" :size="16" />{{ racePaused ? '繼續' : '暫停' }}</button><button v-for="rate in [1, 2, 4]" :key="rate" class="speed-button" :class="{ active: raceSpeed === rate }" @click="setDisplayedSpeed(rate)">{{ rate }}×</button></div></div><Track :runners="runners" :animated="racePhase === 'running' && !racePaused" :paused="racePhase === 'running' && racePaused" race-mode /><div v-if="racePhase === 'countdown'" class="countdown-overlay"><span>ON YOUR MARKS</span><strong :key="countdown">{{ countdown }}</strong></div><div v-if="racePhase === 'ready'" class="race-ready-overlay"><span class="eyebrow">READY WHEN YOU ARE</span><strong>各就各位</strong><button class="btn primary" @click="startHeat"><Icon name="play" :size="18" />開始比賽</button></div><div v-if="racePaused" class="pause-overlay">PAUSED<span>比賽已暫停</span></div></div>
      <div class="lane-cards">
        <button v-for="(athlete, index) in raceAthletes" :key="athlete.student.id" class="lane-card" @click="game.studentId = athlete.student.id" :style="{ '--runner-color': currentClass.color }">
          <span class="lane-label">LANE <b>{{ index + 1 }}</b></span>
          <span class="runner-card-portrait">
            <PixelRunner :seed="athlete.student.id" :gender="athlete.student.gender" :height="athlete.student.height" :weight="athlete.student.weight" :speed="speedAt(Math.max(0, raceElapsed), athlete.profile)" :color="currentClass.color" :size="47" :running="racePhase === 'running' && !racePaused && speedAt(Math.max(0, raceElapsed), athlete.profile) > 0" />
          </span>
          <strong class="lane-card-name"><span v-if="athlete.student.isSchoolTeam" class="runner-identity-icon school-team-status" title="田徑隊" aria-label="田徑隊"><Icon name="sprint" :size="14" /></span><span v-else-if="athlete.student.isCityTeam" class="runner-identity-icon city-team-status" title="縣市代表隊" aria-label="縣市代表隊"><Icon name="flag" :size="14" /></span><span v-else-if="athlete.student.isNationalTeam" class="runner-identity-icon national-team-status" title="國家代表隊" aria-label="國家代表隊"><Icon name="globe" :size="14" /></span><span class="gender-icon" :class="athlete.student.gender === '男' ? 'gender-male' : 'gender-female'" :title="athlete.student.gender" :aria-label="athlete.student.gender"><Icon :name="athlete.student.gender === '男' ? 'male' : 'female'" :size="13" /></span>{{ athlete.student.name }}</strong>
          <small>{{ athlete.student.nickname || currentClass.name }}</small>
          <span class="lane-times">
            <span><small>預估</small><b class="mono">{{ timeText(athlete.student.baseline100) }}s</b></span>
            <span><small>最佳</small><b class="mono">{{ athlete.student.best100 === null ? '尚無' : timeText(athlete.student.best100) + 's' }}</b></span>
            <span class="lane-current-time">
              <small><span v-if="finishRanks.has(athlete.student.id)" class="live-rank" :class="rankClass(finishRanks.get(athlete.student.id))">第 {{ finishRanks.get(athlete.student.id) }} 名</span><template v-else>本次</template></small>
              <b class="mono">{{ raceElapsed >= athlete.profile.time ? timeText(athlete.profile.time) + 's' : '—' }}</b>
            </span>
          </span>
        </button>
      </div>
      <p class="data-note">{{ automatic ? '全校自動賽會在切換選單後持續進行；可隨時回到這裡查看、暫停或繼續。' : '切換選單會結束目前未完成的賽程；已完賽的組別與成績會保留。' }}</p>
    </template>

    <template v-else>
      <div class="race-complete-hero"><div class="eyebrow">MEET COMPLETE</div><Icon name="trophy" :size="56" /><h1>好比賽。<span>下一次，更快。</span></h1><p class="muted">{{ school.name }} · {{ selectedClasses.length }} 個班級 · {{ sessionResults.length }} 位學生 · {{ sessionRecords.length }} 組比賽</p><span class="badge green"><Icon name="check" :size="16" />所有成績與獎牌均已保存</span></div>
      <div class="panel meet-summary"><div class="section-title"><h2>本次成績總覽</h2><button class="btn primary" @click="returnToSetup">再辦一場<Icon name="arrow" :size="18" /></button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>本次排序</th><th>學生</th><th>班級</th><th>學號</th><th>100m 成績</th><th>比賽時間</th></tr></thead><tbody><tr v-for="(result, index) in sessionResults" :key="result.studentId"><td>{{ index + 1 }}</td><td><button class="student-link" @click="game.studentId = result.studentId"><PixelRunner :seed="result.studentId" :gender="result.gender || getStudent(result.studentId)?.gender" :height="result.height || getStudent(result.studentId)?.height" :weight="result.weight || getStudent(result.studentId)?.weight" :color="result.classColor || '#c7f36a'" :size="30" />{{ result.name }}</button></td><td>{{ result.className }}</td><td class="mono">{{ result.studentNumber }}</td><td class="mono result-time">{{ timeText(result.time) }} s</td><td>{{ dateText(result.dateTime) }}</td></tr></tbody></table></div></div>
    </template>
  </section>
</template>
