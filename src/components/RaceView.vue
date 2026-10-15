<script setup vapor>
import { computed, ref, onUnmounted, watch } from 'vue'
import { autoMeet, game, go, getSchool, getClass, getTeam, getStudent, getSchoolTeamCountForClass, createSchoolWindMeet, recordHeat, timeText, dateText, notify, dismissAutomaticMeetResult, retryAutomaticMeetSave, setAutomaticMeetSpeed, startAutomaticMeet, startNationalAutomaticMeet, terminateNationalAutomaticMeet, toggleAutomaticMeetPause } from '../lib/game.js'
import { createSprintProfile, distanceAt, speedAt } from '../lib/physics.js'
import { setMusicMode, playCountdown, playStartWhistle } from '../lib/audio.js'
import SchoolPicker from './SchoolPicker.vue'
import Track from './Track.vue'
import PixelRunner from './PixelRunner.vue'
import Icon from './Icon.vue'
import GamePageHeader from './GamePageHeader.vue'
import { fetchHistory, fetchRanking, fetchWindHistory, syncState } from '../lib/cloud.js'
import { classFinalists } from '../lib/wind-selection.js'
import { windMeet, startWindMeet, startNationalWindMeet, terminateNationalWindMeet, toggleWindMeetPause, setWindMeetSpeed, retryWindMeetSave, dismissWindMeet } from '../lib/wind-meet.js'
import { compareSchoolOrder } from '../lib/school-order.js'
import WindTitleBadge from './WindTitleBadge.vue'
import WindMeetSummary from './WindMeetSummary.vue'
import NationalWindSummary from './NationalWindSummary.vue'

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
const windPractice = ref(false)
const startingWindMeet = ref(false)
const viewedWindMeet = ref(null)
const showWindHistory = ref(false)
const windHistoryLoading = ref(false)
const windHistoryError = ref('')
let frame, previousTimestamp = 0, countdownCue = 0, viewActive = true

const selectedTeam = computed(() => { game.revision; return getTeam(game.raceTeamId) })
const teamMembers = computed(() => {
  game.revision
  const flag = selectedTeam.value && ({ school: 'isSchoolTeam', city: 'isCityTeam', national: 'isNationalTeam' }[selectedTeam.value.type])
  if (!flag) return []
  return selectedTeam.value.memberIds.map(getStudent).filter(student => student?.[flag])
})
const automatic = computed(() => autoMeet.active || autoMeet.phase === 'complete')
const windSelection = computed(() => windMeet.active || windMeet.phase === 'complete')
const nationalWindSelection = computed(() => windSelection.value && windMeet.scope === 'national')
const friendlyRace = computed(() => windSelection.value && windMeet.friendly)
const nationalAutomatic = computed(() => automatic.value && autoMeet.scope === 'national')
const displayedSchoolId = computed(() => windSelection.value ? windMeet.schoolIds[windMeet.schoolIndex] || windMeet.meet?.schoolId : automatic.value ? autoMeet.schoolId : selectedSchoolId.value)
const racePhase = computed(() => windSelection.value ? windMeet.phase : automatic.value ? autoMeet.phase : phase.value)
const raceQueue = computed(() => automatic.value ? autoMeet.queue : queue.value)
const raceHeatIndex = computed(() => windSelection.value ? windMeet.meet?.completedMatches || 0 : automatic.value ? autoMeet.heatIndex : heatIndex.value)
const raceAthletes = computed(() => windSelection.value ? windMeet.athletes : automatic.value ? autoMeet.athletes : athletes.value)
// Cross-class races keep each student's own uniform, independent of the heat.
// Both the track sprite and its card consume this same colour.
const raceParticipants = computed(() => raceAthletes.value.map(athlete => ({
  ...athlete,
  classColor: getClass(athlete.student.classId)?.color || '#d5ee7e',
})))
const raceElapsed = computed(() => windSelection.value ? windMeet.elapsed : automatic.value ? autoMeet.elapsed : elapsed.value)
const racePaused = computed(() => windSelection.value ? windMeet.paused : automatic.value ? autoMeet.paused : paused.value)
const raceSpeed = computed(() => windSelection.value ? windMeet.speed : automatic.value ? autoMeet.speed : speed.value)
const displayedSessionId = computed(() => windSelection.value ? windMeet.meet?.id : automatic.value ? autoMeet.sessionId : sessionId.value)
const school = computed(() => getSchool(displayedSchoolId.value))
const classes = computed(() => school.value?.classes.filter(cls => cls.grade === Number(grade.value)) || [])
const schoolTeamClassIds = computed(() => {
  game.revision
  return new Set((school.value?.classes || []).filter(cls => getSchoolTeamCountForClass(cls.id) >= 5).map(cls => cls.id))
})
const totalStudents = computed(() => selectedClasses.value.reduce((count, id) => count + getClass(id).studentIds.length, 0))
const current = computed(() => windSelection.value ? { ...windMeet.match, heat: (windMeet.meet?.completedMatches || 0) + 1, totalHeats: windMeet.meet?.totalMatches || 0 } : raceQueue.value[raceHeatIndex.value])
const teamRace = computed(() => !windSelection.value && Boolean(current.value?.teamId || game.raceTeamId))
const currentClass = computed(() => current.value ? getClass(current.value.classId) : null)
const currentTeam = computed(() => getTeam(current.value?.teamId || game.raceTeamId))
const displayClassName = computed(() => friendlyRace.value ? '三個年級風速小子友誼賽' : windSelection.value ? !windMeet.match ? '準備選拔賽…' : `${gradeLabels[windMeet.match.grade - 1]} · ${windMeet.match.final ? '年級冠軍決賽' : `第 ${windMeet.match.round} 輪 · 前三名晉級`}` : windPractice.value ? '班級前三名練習' : currentClass.value?.name || (currentTeam.value ? `${currentTeam.value.name} 隊內賽` : ''))
const currentRaceRecord = computed(() => {
  game.revision
  const raceId = windSelection.value ? windMeet.match?.id : automatic.value ? `${autoMeet.sessionId}-heat-${autoMeet.heatIndex + 1}` : currentHeatId.value
  if (windSelection.value) return null
  return raceId ? game.world.races.find(race => race.id === raceId) : null
})
const manualRaceTitle = computed(() => {
  if (automatic.value || !['ready', 'countdown', 'running', 'saving', 'saveerror', 'heatdone'].includes(phase.value)) return ''
  if (teamRace.value && currentTeam.value && current.value) return `${currentTeam.value.name} 隊內賽 第 ${current.value.heat} / ${current.value.totalHeats} 組`
  if (windPractice.value && school.value && current.value) return `${school.value.name} 風速小子練習 第 ${current.value.heat} / ${current.value.totalHeats} 組`
  if (!school.value || !currentClass.value || !current.value) return ''
  return `${school.value.city}${school.value.name} ${currentClass.value.name} 第 ${current.value.heat} / ${current.value.totalHeats} 組`
})
const meetProgress = computed(() => nationalWindSelection.value ? windMeet.completedMatches / Math.max(1, windMeet.totalMatches) * 100 : windSelection.value ? (windMeet.meet?.completedMatches || 0) / Math.max(1, windMeet.meet?.totalMatches || 0) * 100 : automatic.value
  ? autoMeet.completedHeats / Math.max(1, autoMeet.totalHeats) * 100
  : raceHeatIndex.value / Math.max(1, raceQueue.value.length) * 100)
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
function hasNewPersonalBest(athlete) {
  if (raceElapsed.value < athlete.profile.time) return false
  const previousBest = athlete.student.best100
  return !Number.isFinite(previousBest) || previousBest <= 0 || athlete.profile.time < previousBest
}

const runners = computed(() => {
  const now = Math.max(0, raceElapsed.value)
  return raceParticipants.value.map((athlete, index) => {
    const fadeStart = athlete.profile.time + athlete.profile.runoutDuration * 0.68
    const opacity = now <= fadeStart ? 1 : Math.max(0, 1 - (now - fadeStart) / (athlete.profile.runoutDuration * 0.32))
    return {
      id: athlete.student.id, name: athlete.student.name, gender: athlete.student.gender,
      height: athlete.student.height, weight: athlete.student.weight,
      lane: index + 1, color: athlete.classColor,
      opacity,
      speed: speedAt(now, athlete.profile), distance: distanceAt(now, athlete.profile),
    }
  })
})
const results = computed(() => raceParticipants.value.map((athlete, index) => ({ ...athlete.student, lane: index + 1, time: athlete.profile.time })).sort((a, b) => a.time - b.time))
const records = computed(() => { game.revision; return game.world.races.filter(race => race.schoolId === displayedSchoolId.value).sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)) })
const sessionRecords = computed(() => { game.revision; return game.world.races.filter(race => race.sessionId === displayedSessionId.value) })
const sessionResults = computed(() => sessionRecords.value.flatMap(race => race.results).sort((a, b) => a.time - b.time))
const windHistory = computed(() => { game.revision; return game.world.windMeets.filter(meet => meet.schoolId === displayedSchoolId.value).sort((a, b) => b.startedAt.localeCompare(a.startedAt)) })
watch(selectedSchoolId, value => { selectedClasses.value = []; game.schoolId = value; grade.value = 1 })
watch(manualRaceTitle, title => { game.raceTitle = title }, { immediate: true })
watch([showHistory, selectedSchoolId], async ([show, id]) => {
  if (show && id) try { await fetchHistory(id) } catch (error) { notify(error.message) }
})
let historyRequest = 0
watch([showWindHistory, selectedSchoolId, () => syncState.ready], async ([show, id]) => {
  const request = ++historyRequest
  windHistoryError.value = ''
  windHistoryLoading.value = false
  if (!show || !id) return
  windHistoryLoading.value = true
  try { await fetchWindHistory(id) }
  catch (error) { if (request === historyRequest) windHistoryError.value = error.message }
  finally { if (request === historyRequest) windHistoryLoading.value = false }
})

function selectClass(id) {
  if (selectedClasses.value.includes(id)) selectedClasses.value = selectedClasses.value.filter(value => value !== id)
  else selectedClasses.value = [...selectedClasses.value, id]
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
  windPractice.value = false
  sessionId.value = crypto.randomUUID()
  heatIndex.value = 0
  prepareHeat()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function enterTeamRace() {
  if (phase.value !== 'setup' || !selectedTeam.value || !teamMembers.value.length) return
  const seeded = teamMembers.value.slice().sort((a, b) => (a.best100 ?? a.baseline100) - (b.best100 ?? b.baseline100))
  const schoolId = teamMembers.value[0].schoolId
  const heats = []
  for (let offset = 0; offset < seeded.length; offset += 8) {
    heats.push({
      teamId: selectedTeam.value.id,
      teamName: selectedTeam.value.name,
      schoolId,
      classId: null,
      heat: offset / 8 + 1,
      totalHeats: Math.ceil(seeded.length / 8),
      studentIds: seeded.slice(offset, offset + 8).map(student => student.id),
    })
  }
  selectedSchoolId.value = schoolId
  game.schoolId = schoolId
  queue.value = heats
  sessionId.value = crypto.randomUUID()
  heatIndex.value = 0
  prepareHeat()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function enterWindRace() {
  if (startingWindMeet.value || !school.value) return
  const schoolId = selectedSchoolId.value
  const ids = [...selectedClasses.value]
  startingWindMeet.value = true
  try {
    // One school ranking read gives current bests without fetching every class.
    try { await fetchRanking('school', { schoolId }) }
    catch { notify('目前使用本機最新成績選出各班前三名。') }
    if (!viewActive || selectedSchoolId.value !== schoolId || racePhase.value !== 'setup') return
    if (ids.length) {
      const studentIds = ids.flatMap(id => classFinalists(getClass(id), getStudent))
      if (!studentIds.length) throw new Error('所選班級沒有可參賽的學生。')
      const heats = []
      for (let offset = 0; offset < studentIds.length; offset += 8) {
        const participants = studentIds.slice(offset, offset + 8)
        heats.push({ schoolId, classIds: [...new Set(participants.map(id => getStudent(id).classId))],
          mode: 'wind-practice', heat: offset / 8 + 1, totalHeats: Math.ceil(studentIds.length / 8), studentIds: participants })
      }
      queue.value = heats
      sessionId.value = crypto.randomUUID()
      heatIndex.value = 0
      windPractice.value = true
      prepareHeat()
    } else {
      startWindMeet(await createSchoolWindMeet(schoolId), speed.value)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (error) { notify(error.message) }
  finally { startingWindMeet.value = false }
}

function enterAutomaticMeet() {
  if (school.value && startAutomaticMeet(selectedSchoolId.value)) window.scrollTo({ top: 0, behavior: 'smooth' })
}

function enterNationalAutomaticMeet() {
  if (phase.value === 'setup' && startNationalAutomaticMeet()) window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function enterNationalWindMeet() {
  if (startingWindMeet.value || phase.value !== 'setup') return
  startingWindMeet.value = true
  try {
    await startNationalWindMeet(game.world.schools.filter(school => school.classes.some(cls => cls.studentIds.length)).sort(compareSchoolOrder))
    if (viewActive) window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (error) { notify(error.message) }
  finally { startingWindMeet.value = false }
}

async function confirmTerminateNationalWindMeet() {
  if (!window.confirm('確定終止全國風速小子選拔賽？已完成的成績與稱號會保留，剩餘賽程取消，重整後也不會續跑。')) return
  try {
    await terminateNationalWindMeet()
    notify('全國風速小子選拔已終止，已完成的成績與稱號保留。')
  } catch (error) { notify(`比賽已停止，但終止狀態無法保存：${error.message}`) }
}

function toggleDisplayedPause() {
  if (windSelection.value) toggleWindMeetPause()
  else if (automatic.value) toggleAutomaticMeetPause()
  else paused.value = !paused.value
}

function setDisplayedSpeed(rate) {
  if (windSelection.value) setWindMeetSpeed(rate)
  else if (automatic.value) setAutomaticMeetSpeed(rate)
  else speed.value = rate
}

function retryDisplayedSave() {
  if (windSelection.value) retryWindMeetSave()
  else if (automatic.value) retryAutomaticMeetSave()
  else finishHeat()
}

async function confirmTerminateNationalMeet() {
  const confirmed = window.confirm('確定終止全國百米賽？已完成或正在保存的當組成績會保留，剩餘賽程將取消，重整後也不會續跑。')
  if (confirmed) await terminateNationalAutomaticMeet()
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
      id: currentHeatId.value, sessionId: sessionId.value, schoolId: current.value.schoolId || selectedSchoolId.value,
      classId: current.value.classId, teamId: current.value.teamId || null,
      classIds: current.value.classIds || [], mode: current.value.mode || 'class',
      heat: current.value.heat, startedAt: startedAt.value, finishedAt: finishedAt.value,
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

function returnToSetup() {
  viewedWindMeet.value = null
  dismissWindMeet()
  dismissAutomaticMeetResult()
  if (!windMeet.active && !autoMeet.active) setMusicMode('ambient')
  phase.value = 'setup'
  queue.value = []
  athletes.value = []
  selectedClasses.value = []
  windPractice.value = false
  if (teamRace.value) { game.raceTeamId = ''; go('teams') }
}
function leaveTeamRaceSetup() { game.raceTeamId = ''; go('teams') }
onUnmounted(() => { viewActive = false; historyRequest++; cancelAnimationFrame(frame); game.raceTitle = ''; if (!automatic.value && !windSelection.value) setMusicMode('ambient') })
</script>

<template>
  <section class="content-view race-view">
    <NationalWindSummary v-if="nationalWindSelection && racePhase === 'complete'" :run-id="windMeet.runId" :school-ids="windMeet.schoolIds" @back="returnToSetup" />
    <WindMeetSummary v-else-if="viewedWindMeet || (windSelection && racePhase === 'complete')" :meet="viewedWindMeet || windMeet.meet" :friendship-results="viewedWindMeet ? [] : windMeet.friendshipResults" @back="returnToSetup" />
    <template v-else-if="racePhase === 'setup'">
      <template v-if="teamRace">
        <GamePageHeader title="田徑隊內賽" caption="TEAM SPRINT" description="由所選隊伍的隊員同場競速，成績會更新個人最佳紀錄。" theme="race"><button class="btn ghost" @click="leaveTeamRaceSetup"><Icon name="back" :size="18" />回我的隊伍</button></GamePageHeader>
        <div class="panel team-race-setup">
          <template v-if="selectedTeam">
            <div class="split-heading"><div><span class="eyebrow">{{ selectedTeam.type === 'school' ? '學校田徑隊' : selectedTeam.type === 'city' ? '縣市代表隊' : '國家代表隊' }}</span><h2>{{ selectedTeam.name }}</h2><p class="muted">所有有效隊員都會參賽，依最佳／預估成績排序，每組最多 8 人。</p></div><span class="selection-counter"><b>{{ teamMembers.length }}</b> 位隊員</span></div>
            <div v-if="teamMembers.length" class="team-race-roster"><div v-for="student in teamMembers" :key="student.id" class="team-race-runner"><PixelRunner :seed="student.id" :gender="student.gender" :height="student.height" :weight="student.weight" :color="getClass(student.classId).color" :size="35" /><span><strong>{{ student.name }}<WindTitleBadge :student-id="student.id" compact /></strong><small>{{ getSchool(student.schoolId).city }} · {{ getSchool(student.schoolId).name }} · {{ getClass(student.classId).name }}</small></span><b class="mono">{{ timeText(student.best100 ?? student.baseline100) }}s</b></div></div>
            <div v-else class="empty-state">這支隊伍目前沒有符合隊籍身份的隊員，無法開始比賽。</div>
            <div class="team-race-footer"><p class="muted">本次比賽會保存每位隊員的成績與個人最佳，不會產生校內班級獎牌。</p><button class="btn primary" :disabled="!teamMembers.length" @click="enterTeamRace"><Icon name="bolt" :size="18" />開始隊內百米賽<Icon name="play" :size="17" /></button></div>
          </template>
          <div v-else class="empty-state"><h2>找不到這支隊伍</h2><button class="btn primary" @click="leaveTeamRaceSetup">返回我的隊伍</button></div>
        </div>
      </template>
      <template v-else>
      <GamePageHeader title="校內比賽" caption="RACE DAY" description="挑一所主場，或依序舉辦全國各校賽事。" theme="race"><div class="national-event-buttons"><button class="btn primary national-meet-button" :disabled="startingWindMeet" @click="enterNationalAutomaticMeet"><Icon name="globe" :size="20" />全國校內自動百米賽<Icon name="play" :size="17" /></button><button class="btn primary national-meet-button national-wind-button" :disabled="startingWindMeet" @click="enterNationalWindMeet"><Icon name="sprint" :size="20" />全國風速小子選拔賽<Icon name="play" :size="17" /></button></div></GamePageHeader>
      <div class="race-setup-layout">
        <SchoolPicker v-model="selectedSchoolId" />
        <div class="race-setup-detail panel">
          <template v-if="school">
            <div class="split-heading"><div><span class="eyebrow">01 / 選擇參賽班級</span><h2>{{ school.name }}</h2><p class="muted">{{ school.city }} · 可跨年級選擇 · 未選班級可直接進行選拔賽</p></div><span class="selection-counter"><b>{{ selectedClasses.length }}</b> 班</span></div>
            <div class="tabs"><button v-for="year in 3" :key="year" :class="{ active: grade === year }" @click="grade = year">{{ gradeLabels[year - 1] }} <span>{{ school.classes.filter(c => c.grade === year).length }} 班</span></button></div>
            <div class="class-grid"><button v-for="cls in classes" :key="cls.id" class="class-card" :class="{ selected: selectedClasses.includes(cls.id), 'has-school-team': schoolTeamClassIds.has(cls.id) }" :title="schoolTeamClassIds.has(cls.id) ? '田徑隊班' : undefined" :aria-label="`${cls.name}，${cls.studentIds.length} 位學生${schoolTeamClassIds.has(cls.id) ? '，田徑隊班' : ''}`" @click="selectClass(cls.id)"><span class="class-kit" :style="{ background: cls.color }"></span><span class="checkbox-visual"><Icon v-if="selectedClasses.includes(cls.id)" name="check" :size="14" /></span><strong class="class-card-name">{{ cls.name }}<span v-if="schoolTeamClassIds.has(cls.id)" class="runner-identity-icon school-team-status school-team-class-icon" title="田徑隊班" aria-label="田徑隊班"><Icon name="sprint" :size="14" /></span></strong><small>{{ cls.studentIds.length }} 位學生</small></button></div>
            <div class="selected-classes"><span class="muted">已選班級</span><span v-if="!selectedClasses.length" class="muted">尚未選擇</span><button v-for="id in selectedClasses" :key="id" class="chip" :title="schoolTeamClassIds.has(id) ? '田徑隊班' : undefined" :aria-label="`${getClass(id).name}${schoolTeamClassIds.has(id) ? '，田徑隊班' : ''}`" @click="selectClass(id)">{{ getClass(id).name }}<span v-if="schoolTeamClassIds.has(id)" class="runner-identity-icon school-team-status school-team-class-icon" title="田徑隊班" aria-label="田徑隊班"><Icon name="sprint" :size="13" /></span><Icon name="close" :size="13" /></button></div>
            <div class="event-selection"><span class="eyebrow">02 / 選擇比賽項目</span><div class="event-buttons"><button class="event-card sprint" :disabled="!selectedClasses.length || selectedClasses.length > 8" @click="enterRace"><Icon name="bolt" :size="28" /><div><strong>一百公尺</strong><small>全班出賽 · 最多 8 班</small></div><Icon name="arrow" :size="24" /></button><button class="event-card wind-event" :disabled="startingWindMeet" @click="enterWindRace"><Icon name="sprint" :size="28" /><div><strong>風速小子選拔賽</strong><small>{{ startingWindMeet ? '準備參賽名單…' : selectedClasses.length ? '已選 ' + selectedClasses.length + ' 班 · 前三名練習' : '全校各年級 · 前三名晉級' }}</small></div><Icon name="play" :size="22" /></button><button class="event-card automatic" @click="enterAutomaticMeet"><Icon name="flag" :size="28" /><div><strong>全校自動百米賽</strong><small>一年級至三年級</small></div><Icon name="play" :size="22" /></button><button class="event-card relay" disabled><Icon name="team" :size="28" /><div><strong>大隊接力</strong><small>下一階段開放</small></div><span class="badge">SOON</span></button></div></div>
            <p class="wind-event-note">風速小子：不選班級時，各年級由兩班前三名對跑，每場前三名晉級，最後三人爭奪年級冠軍；三位年級冠軍再跑一場不列紀錄的友誼賽。選班則為前三名練習，超過 8 人會分組比賽。</p><div class="race-hint"><Icon name="clock" :size="19" /><p>全校自動賽會依一年級、二年級、三年級的班級順序持續進行。<br /><span>可切換到其他頁面；賽程仍會繼續，每組完賽自動存檔。</span></p></div>
          </template>
          <div v-else class="empty-state school-await"><Icon name="school" :size="46" /><h2>選一所主場，或從全國出發</h2><p>從左側選擇學校，安排班級或全校比賽。</p><p>也可以直接按上方「全國校內自動百米賽」，<br />從臺北市、新北市起，逐縣市、逐校完成一年級至三年級。<br />預設 1 倍速度，可隨時暫停與繼續。</p></div>
        </div>
      </div>
      <div v-if="school" class="panel wind-history-panel"><button class="section-title full-width plain-button" @click="showWindHistory = !showWindHistory"><h3><Icon name="sprint" :size="19" />風速小子歷屆選拔 <span class="muted">{{ windHistory.length }} 屆</span></h3><span class="muted">{{ showWindHistory ? '收合 −' : '展開 +' }}</span></button><template v-if="showWindHistory"><p v-if="windHistoryLoading" class="muted" role="status">取得歷屆選拔…</p><p v-else-if="windHistoryError" class="data-note" role="alert">{{ windHistoryError }}</p><p v-if="!windHistory.length && !windHistoryLoading" class="muted">目前沒有選拔紀錄。</p><button v-for="meet in windHistory" :key="meet.id" class="wind-history-entry" @click="viewedWindMeet = meet"><span>{{ dateText(meet.startedAt) }}<small>{{ meet.status === 'complete' ? '選拔完成' : '尚未完成' }} · {{ meet.completedMatches }} / {{ meet.totalMatches }} 場</small></span><span>查看對戰歷程<Icon name="arrow" :size="16" /></span></button></template></div><div v-if="school" class="panel history-panel"><button class="section-title full-width plain-button" @click="showHistory = !showHistory"><h3><Icon name="clock" :size="19" /> 校內比賽紀錄 <span class="muted">{{ records.length }} 組</span></h3><span class="muted">{{ showHistory ? '收合 −' : '展開 +' }}</span></button><template v-if="showHistory"><p v-if="!records.length" class="empty-state">還沒有比賽紀錄。第一聲起跑槍，從今天開始。</p><details v-for="race in records" :key="race.id" class="race-history"><summary><span>{{ race.className || getClass(race.classId).name }} · 第 {{ race.heat }} 組</span><span>{{ dateText(race.finishedAt) }} · {{ race.results.length }} 人 <em v-if="race.syncStatus === 'pending'" class="badge local-pending">本機待同步</em></span></summary><div class="table-wrap"><table class="data-table"><thead><tr><th>名次</th><th>學生</th><th>學號</th><th>秒數</th></tr></thead><tbody><tr v-for="result in race.results" :key="result.studentId"><td>{{ result.place }}</td><td><button class="text-button" @click="game.studentId = result.studentId">{{ result.name }}<WindTitleBadge :student-id="result.studentId" compact /><span v-if="result.personalBest" class="personal-best-result"><Icon name="trophy" :size="13" />{{ result.previousBest100 == null ? '首筆 PB' : '新 PB!' }}</span></button></td><td class="mono">{{ result.studentNumber }}</td><td class="mono">{{ timeText(result.time) }}</td></tr></tbody></table></div></details></template></div>
      </template>
    </template>

    <template v-else-if="racePhase !== 'complete'">
      <div class="race-header"><div><h1>{{ teamRace ? currentTeam.name : school.name }}<span class="heading-dot">.</span></h1><p class="muted"><span v-if="windSelection" class="wind-race-caption">風速小子 · {{ displayClassName }}</span><template v-else>{{ displayClassName }} · 第 {{ current.heat }} / {{ current.totalHeats }} 組</template><span v-if="automatic"> · {{ nationalAutomatic ? '全國校內自動賽' : '全校自動賽' }}</span></p><span v-if="currentRaceRecord?.syncStatus === 'pending'" class="badge local-pending">本機待同步</span></div><div class="race-clock"><strong>{{ timeText(Math.min(maxTime, Math.max(0, raceElapsed))) }}<small>s</small></strong></div></div>
      <div v-if="nationalAutomatic" class="national-meet-status" role="status"><span><Icon name="pin" :size="16" /><strong>{{ school.city }}</strong> · 第 {{ autoMeet.schoolIndex + 1 }} / {{ autoMeet.schoolIds.length }} 所學校</span><span>已完成 {{ autoMeet.completedSchools }} 所 · {{ autoMeet.completedHeats.toLocaleString() }} / {{ autoMeet.totalHeats.toLocaleString() }} 組</span></div>
      <div v-if="nationalWindSelection" class="national-meet-status"><span><Icon name="pin" :size="16" /><strong>{{ school.city }}</strong> · 第 {{ windMeet.schoolIndex + 1 }} / {{ windMeet.schoolIds.length }} 所學校</span><span>已選拔 {{ windMeet.completedSchools }} 所 · 全國 {{ windMeet.completedMatches }} / {{ windMeet.totalMatches }} 場 · 當校 {{ windMeet.meet?.completedMatches || 0 }} / {{ windMeet.meet?.totalMatches || 0 }} 場</span></div>
      <div class="race-progress" role="progressbar" :aria-label="nationalAutomatic ? '全國校內賽程進度' : '賽程進度'" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(meetProgress)"><i :style="{ width: meetProgress + '%' }"></i></div>
      <div class="stadium-card race-stadium"><div class="stadium-topline"><span>百米直道 <b>100 METRES · 8 LANES</b></span><div class="race-topline-controls"><button v-if="racePhase === 'heatdone'" class="btn small primary next-heat-button" @click="nextHeat">{{ raceHeatIndex + 1 === raceQueue.length ? '查看總結' : '下一組' }}<Icon name="arrow" :size="16" /></button><button v-if="racePhase === 'saveerror'" class="btn small primary" @click="retryDisplayedSave">重試保存</button><button v-if="racePhase === 'running' || racePhase === 'countdown' || ((automatic || windSelection) && ['saving', 'preparing'].includes(racePhase))" class="btn small" @click="toggleDisplayedPause"><Icon :name="racePaused ? 'play' : 'pause'" :size="16" />{{ racePaused ? '繼續' : '暫停' }}</button><button v-if="nationalAutomatic && autoMeet.active" class="btn small terminate-national-meet" @click="confirmTerminateNationalMeet"><Icon name="close" :size="15" />終止全國賽</button><button v-if="nationalWindSelection && windMeet.active" class="btn small terminate-national-meet" @click="confirmTerminateNationalWindMeet"><Icon name="close" :size="15" />終止全國選拔</button><button v-for="rate in [1, 2, 4, 8, 16]" :key="rate" class="speed-button" :class="{ active: raceSpeed === rate }" @click="setDisplayedSpeed(rate)">{{ rate }}×</button></div></div><Track :runners="runners" :animated="racePhase === 'running' && !racePaused" :paused="racePhase === 'running' && racePaused" race-mode /><div v-if="racePhase === 'countdown'" class="countdown-overlay"><span>ON YOUR MARKS</span><strong :key="countdown">{{ countdown }}</strong></div><div v-if="racePhase === 'ready'" class="race-ready-overlay"><span class="eyebrow">READY WHEN YOU ARE</span><strong>各就各位</strong><button class="btn primary" @click="startHeat"><Icon name="play" :size="18" />開始比賽</button></div><div v-if="racePaused" class="pause-overlay">PAUSED<span>比賽已暫停</span></div></div>
      <p v-if="racePhase === 'saveerror'" class="data-note" role="alert">{{ windSelection ? windMeet.error : automatic ? autoMeet.error : saveError }}</p>
      <p v-if="windSelection && windMeet.error && racePhase !== 'saveerror'" class="data-note" role="alert">{{ windMeet.error }}</p><div class="lane-cards">
        <button v-for="(athlete, index) in raceParticipants" :key="athlete.student.id" class="lane-card" :class="{ 'new-personal-best': hasNewPersonalBest(athlete) }" @click="game.studentId = athlete.student.id" :style="{ '--runner-color': athlete.classColor }">
          <span class="lane-label">LANE <b>{{ index + 1 }}</b></span>
          <span class="runner-card-portrait">
            <PixelRunner :seed="athlete.student.id" :gender="athlete.student.gender" :height="athlete.student.height" :weight="athlete.student.weight" :speed="speedAt(Math.max(0, raceElapsed), athlete.profile)" :color="athlete.classColor" :size="47" :running="racePhase === 'running' && !racePaused && speedAt(Math.max(0, raceElapsed), athlete.profile) > 0" />
          </span>
          <span v-if="hasNewPersonalBest(athlete)" class="personal-best-badge" :title="athlete.student.best100 == null ? '建立第一筆正式百米最佳' : '刷新個人百米最佳'"><Icon name="trophy" :size="12" />{{ athlete.student.best100 == null ? '首筆 PB' : '新 PB!' }}</span>
          <strong class="lane-card-name"><WindTitleBadge :student-id="athlete.student.id" compact /><span v-if="athlete.student.isSchoolTeam" class="runner-identity-icon school-team-status" title="田徑隊" aria-label="田徑隊"><Icon name="sprint" :size="14" /></span><span v-else-if="athlete.student.isCityTeam" class="runner-identity-icon city-team-status" title="縣市代表隊" aria-label="縣市代表隊"><Icon name="flag" :size="14" /></span><span v-else-if="athlete.student.isNationalTeam" class="runner-identity-icon national-team-status" title="國家代表隊" aria-label="國家代表隊"><Icon name="globe" :size="14" /></span><span class="gender-icon" :class="athlete.student.gender === '男' ? 'gender-male' : 'gender-female'" :title="athlete.student.gender" :aria-label="athlete.student.gender"><Icon :name="athlete.student.gender === '男' ? 'male' : 'female'" :size="13" /></span>{{ athlete.student.name }}</strong>
          <small>{{ windSelection || windPractice ? getClass(athlete.student.classId).name : athlete.student.nickname || getClass(athlete.student.classId).name }}</small>
          <span class="lane-times">
            <span><small>預估</small><b class="mono">{{ timeText(athlete.student.baseline100) }}s</b></span>
            <span><small>{{ hasNewPersonalBest(athlete) ? '新最佳' : '最佳' }}</small><b class="mono">{{ hasNewPersonalBest(athlete) ? timeText(athlete.profile.time) + 's' : athlete.student.best100 === null ? '尚無' : timeText(athlete.student.best100) + 's' }}</b></span>
            <span class="lane-current-time">
              <small><span v-if="finishRanks.has(athlete.student.id)" class="live-rank" :class="rankClass(finishRanks.get(athlete.student.id))">第 {{ finishRanks.get(athlete.student.id) }} 名</span><template v-else>本次</template></small>
              <b class="mono">{{ raceElapsed >= athlete.profile.time ? timeText(athlete.profile.time) + 's' : '—' }}</b>
            </span>
          </span>
        </button>
      </div>
      <p class="data-note">{{ automatic || windSelection ? '自動賽程會在切換站內選單後持續進行；可隨時回到這裡查看、暫停或繼續。' : '切換選單會結束目前未完成的賽程；已完賽的組別與成績會保留。' }}</p>
    </template>

    <template v-else>
      <div class="race-complete-hero"><div class="eyebrow">MEET COMPLETE</div><Icon name="trophy" :size="56" /><h1 v-if="nationalAutomatic">全國校內百米賽<span>全部完成！</span></h1><h1 v-else>好比賽。<span>下一次，更快。</span></h1><p v-if="automatic" class="muted">{{ nationalAutomatic ? autoMeet.completedSchools + ' 所學校' : school.name }} · {{ autoMeet.completedClasses.toLocaleString() }} 個班級 · {{ autoMeet.completedStudents.toLocaleString() }} 位學生 · {{ autoMeet.completedHeats.toLocaleString() }} 組比賽</p><p v-else-if="windPractice" class="muted">{{ school.name }} · 班級前三名練習 · {{ sessionResults.length }} 位學生 · {{ sessionRecords.length }} 組比賽</p><p v-else-if="teamRace" class="muted">{{ currentTeam?.name }} · {{ teamMembers.length }} 位隊員 · {{ sessionRecords.length }} 組比賽</p><p v-else class="muted">{{ school.name }} · {{ selectedClasses.length }} 個班級 · {{ sessionResults.length }} 位學生 · {{ sessionRecords.length }} 組比賽</p><span class="badge green"><Icon name="check" :size="16" />所有成績與獎牌均已保存</span><p v-if="automatic"><button class="btn primary" @click="returnToSetup">返回比賽選單<Icon name="arrow" :size="18" /></button></p></div>
      <div v-if="!automatic" class="panel meet-summary"><div class="section-title"><h2>本次成績總覽</h2><button class="btn primary" @click="returnToSetup">再辦一場<Icon name="arrow" :size="18" /></button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>本次排序</th><th>學生</th><th>班級</th><th>學號</th><th>100m 成績</th><th>比賽時間</th></tr></thead><tbody><tr v-for="(result, index) in sessionResults" :key="result.studentId" :class="{ 'personal-best-row': result.personalBest }"><td>{{ index + 1 }}</td><td><button class="student-link" @click="game.studentId = result.studentId"><PixelRunner :seed="result.studentId" :gender="result.gender || getStudent(result.studentId)?.gender" :height="result.height || getStudent(result.studentId)?.height" :weight="result.weight || getStudent(result.studentId)?.weight" :color="result.classColor || '#c7f36a'" :size="30" />{{ result.name }}<WindTitleBadge :student-id="result.studentId" compact /><span v-if="result.personalBest" class="personal-best-result"><Icon name="trophy" :size="13" />{{ result.previousBest100 == null ? '首筆 PB' : '新 PB!' }}</span></button></td><td>{{ result.className }}</td><td class="mono">{{ result.studentNumber }}</td><td class="mono result-time">{{ timeText(result.time) }} s</td><td>{{ dateText(result.dateTime) }}</td></tr></tbody></table></div></div>
    </template>
  </section>
</template>
