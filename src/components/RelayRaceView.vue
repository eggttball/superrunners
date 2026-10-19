<script setup vapor>
import { computed, ref, watch } from 'vue'
import { game, getSchool, getClass, getStudent, timeText } from '../lib/game.js'
import { relayMeet, toggleRelayPause, setRelaySpeed, retryRelaySave, dismissRelayMeet } from '../lib/relay-meet.js'
import { relayRaceState } from '../lib/relay-physics.js'
import Icon from './Icon.vue'
import PixelRunner from './PixelRunner.vue'
import RelayTrack from './RelayTrack.vue'
import RelayMeetSummary from './RelayMeetSummary.vue'
import RelayTitleBadge from './RelayTitleBadge.vue'

const emit = defineEmits(['close'])
const selectedClassId = ref('')
const showHistory = ref(false)
const meet = computed(() => relayMeet.meet)
const match = computed(() => relayMeet.match)
const school = computed(() => getSchool(meet.value?.schoolId))
const state = computed(() => relayRaceState(relayMeet.plans || [], Math.max(0, relayMeet.elapsed)))
const teams = computed(() => state.value.teams)
const waitingTeams = computed(() => {
  const byClass = new Map(teams.value.map(team => [team.classId, team]))
  return relayMeet.plans.map(plan => ({ classId: plan.classId, className: plan.className, color: plan.color,
    athletes: plan.legs.filter(leg => leg.index > (byClass.get(plan.classId)?.legIndex ?? 0))
      .map(leg => ({ student: leg.student, legIndex: leg.index })) }))
})
const classBests = computed(() => {
  game.revision
  const bests = new Map()
  for (const race of game.world?.relayRaces || []) {
    if (race.schoolId !== meet.value?.schoolId || race.friendly) continue
    for (const result of race.results || []) {
      if (Number.isFinite(result.time) && result.time > 0 && result.time < (bests.get(result.classId) ?? Infinity)) bests.set(result.classId, result.time)
    }
  }
  return bests
})
const teamDetails = computed(() => teams.value.map(team => {
  const plan = relayMeet.plans.find(item => item.classId === team.classId)
  const currentRunner = plan?.legs?.[team.legIndex]?.student || getStudent(team.studentId)
  const nextRunner = !team.finished && plan?.legs?.[team.legIndex + 1]?.student
  const holder = state.value.runners.find(runner => runner.classId === team.classId && runner.baton && runner.role === 'active')
  return { ...team, currentRunner, nextRunner,
    showPlace: team.distance >= 352,
    currentLane: holder ? Math.max(1, Math.min(8, Math.floor(holder.trackLane + .5))) : team.finished ? null : team.lane,
    classBest: classBests.value.get(team.classId) }
}))
function personalBest(student) {
  return Number.isFinite(student?.best100) && student.best100 > 0 ? `${timeText(student.best100)}s` : '尚無紀錄'
}
const selectedTeam = computed(() => teams.value.find(team => team.classId === selectedClassId.value) || teams.value[0])
const selectedEntrant = computed(() => meet.value?.entrants?.find(entry => entry.classId === selectedTeam.value?.classId))
const selectedPlan = computed(() => (relayMeet.plans || []).find(plan => plan.classId === selectedTeam.value?.classId))
const selectedLineup = computed(() => {
  game.revision
  return (selectedEntrant.value?.studentIds || []).map((id, legIndex) => ({
    id, legIndex, student: selectedPlan.value?.legs?.[legIndex]?.student || getStudent(id),
  }))
})
const countdown = computed(() => Math.max(1, Math.ceil(-relayMeet.elapsed)))
const finishedMatches = computed(() => meet.value?.rounds?.flatMap(round => round.matches || []).filter(item => ['done', 'complete', 'bye'].includes(item.status)).length || 0)
const matchCount = computed(() => meet.value?.rounds?.reduce((count, round) => count + (round.matches?.length || 0), 0) || 0)
const displayedTime = computed(() => Math.min(Math.max(0, relayMeet.elapsed), Math.max(0, ...(relayMeet.plans || []).map(plan => plan.totalTime))))
const leadingDistance = computed(() => Math.min(1600, Math.max(0, ...teams.value.map(team => team.distance))))
const phaseLabel = computed(() => ({ countdown: '各就各位', running: relayMeet.paused ? '已暫停' : '接力進行中', saving: '本組完賽', saveerror: '賽程暫停', complete: '接力賽完成' }[relayMeet.phase] || '準備接力'))
watch(() => match.value?.id, () => { selectedClassId.value = ''; showHistory.value = false })
function closeMeet() {
  dismissRelayMeet()
  emit('close')
}
function runnerFor(team) {
  const plan = (relayMeet.plans || []).find(item => item.classId === team.classId)
  return plan?.legs?.[team.legIndex]?.student || getStudent(team.studentId)
}
function className(team) { return team.className || getClass(team.classId)?.name || '班級' }
function rankClass(place) { return ['rank-first', 'rank-second', 'rank-third'][place - 1] || '' }
function legState(legIndex) {
  const team = selectedTeam.value
  if (!team) return ''
  if (team.finished || legIndex < team.legIndex) return '已完成'
  if (legIndex === team.legIndex) return '持棒中'
  if (legIndex === team.legIndex + 1) return '準備接棒'
  return '待命'
}
</script>

<template>
  <section class="relay-race-view">
    <RelayMeetSummary v-if="relayMeet.phase === 'complete' && meet" :meet="meet" @close="closeMeet" />
    <template v-else>
      <header class="race-header relay-race-header">
        <div>
          <span class="eyebrow"><Icon name="team" :size="16" />{{ meet?.friendly ? '班級友誼賽' : '全校大隊接力' }}</span>
          <h1>{{ school?.name || meet?.schoolName || '大隊接力' }}<span class="heading-dot">.</span></h1>
          <p class="muted">{{ match?.final ? '決賽' : '第 ' + (match?.round || 1) + ' 輪' }} · 第 {{ match?.number || 1 }} 組 · {{ teams.length }} 班 · {{ match?.qualifyCount ? '前 ' + match.qualifyCount + ' 班晉級' : '16 棒同心衝線' }}</p>
        </div>
        <div class="race-clock"><span>{{ phaseLabel }}</span><strong>{{ timeText(displayedTime) }}<small>s</small></strong></div>
      </header>

      <div class="relay-status-bar" role="status"><span><Icon name="flag" :size="16" />16 × 100m · 總程 1600m</span><span v-if="!meet?.friendly">{{ finishedMatches }} / {{ matchCount }} 場已完成 · 各組自動接續</span><span v-else>單場班級友誼賽</span></div>
      <div class="race-progress" role="progressbar" aria-label="領先班級接力進度" aria-valuemin="0" aria-valuemax="1600" :aria-valuenow="Math.round(leadingDistance)"><i :style="{ width: leadingDistance / 16 + '%' }"></i></div>

      <div class="stadium-card race-stadium relay-stadium">
        <div class="stadium-topline"><span>全場接力 <b>400m OVAL · 8 LANES</b></span><div class="race-topline-controls">
          <button type="button" v-if="relayMeet.phase === 'countdown' || relayMeet.phase === 'running'" class="btn small" @click="toggleRelayPause"><Icon :name="relayMeet.paused ? 'play' : 'pause'" :size="16" />{{ relayMeet.paused ? '繼續' : '暫停' }}</button>
          <button type="button" v-if="relayMeet.phase === 'saveerror'" class="btn small primary" @click="retryRelaySave">重試保存</button>
          <button type="button" v-for="rate in [1, 2, 4, 8, 16]" :key="rate" class="speed-button" :class="{ active: relayMeet.speed === rate }" :aria-pressed="relayMeet.speed === rate" @click="setRelaySpeed(rate)">{{ rate }}×</button>
        </div></div>
        <RelayTrack :runners="state.runners" :waiting-teams="waitingTeams" :animated="relayMeet.phase === 'running' && !relayMeet.paused" :paused="relayMeet.paused && relayMeet.phase === 'running'" :playback-rate="relayMeet.speed" :wheel-zoom="false" />
        <div v-if="relayMeet.phase === 'countdown' && !relayMeet.paused" class="countdown-overlay"><span>ONE TEAM · ONE BATON</span><strong :key="countdown">{{ countdown }}</strong></div>
        <div v-if="relayMeet.paused && (relayMeet.phase === 'countdown' || relayMeet.phase === 'running')" class="pause-overlay">PAUSED<span>接力已暫停 · 按繼續開跑</span></div>
      </div>
      <p v-if="relayMeet.error" class="data-note" role="alert">{{ relayMeet.error }}</p>

      <div class="relay-team-cards" aria-label="各班即時接力成績">
        <button type="button" v-for="team in teamDetails" :key="team.classId" class="relay-team-card" :class="{ selected: selectedTeam?.classId === team.classId, finished: team.finished }" :style="{ '--team-color': team.color }" :aria-pressed="selectedTeam?.classId === team.classId" @click="selectedClassId = team.classId">
          <div class="relay-team-card-top"><span class="lane-label">{{ team.finished ? '已完賽' : '目前跑道' }} <b v-if="team.currentLane">{{ team.currentLane }}</b></span><span v-if="team.showPlace && team.place" class="live-rank" :class="rankClass(team.place)">{{ team.finished ? '完賽' : '目前' }}第 {{ team.place }} 名</span></div>
          <div class="relay-team-portrait"><PixelRunner :seed="String(team.studentId || team.classId)" :gender="runnerFor(team)?.gender" :height="runnerFor(team)?.height" :weight="runnerFor(team)?.weight" :color="team.color" :size="32" /><span>{{ team.finished ? 'FINISH' : '第 ' + (team.legIndex + 1) + ' 棒' }}</span></div>
          <strong>{{ className(team) }}<RelayTitleBadge :class-id="team.classId" compact /></strong>
          <div class="relay-runner-details">
            <div><span>{{ team.finished ? '末棒跑者' : '目前持棒' }}<em v-if="team.exchange && !team.finished">交棒中</em></span><strong>{{ team.currentRunner?.name || '接力跑者' }}</strong><small>百米最佳 <b class="mono">{{ personalBest(team.currentRunner) }}</b></small></div>
            <div v-if="team.nextRunner" class="relay-next-runner"><span>下一棒 · 第 {{ team.legIndex + 2 }} 棒</span><strong>{{ team.nextRunner.name }}</strong><small>百米最佳 <b class="mono">{{ personalBest(team.nextRunner) }}</b></small></div>
            <div v-else class="relay-next-runner"><span>{{ team.finished ? '16 棒全員完成' : '最後一棒 · 衝向終點' }}</span></div>
          </div>
          <div class="relay-class-best"><span>班級最佳接力</span><b class="mono">{{ team.classBest != null ? timeText(team.classBest) + 's' : '尚無紀錄' }}</b></div>
          <div class="relay-team-progress"><i :style="{ width: Math.min(100, team.distance / 16) + '%' }"></i></div>
          <div class="relay-team-distance"><span>{{ Math.min(1600, Math.floor(team.distance)) }}<small> / 1600m</small></span><b class="mono">{{ team.finished ? timeText(team.time) + 's' : '—' }}</b></div>
        </button>
      </div>

      <section v-if="selectedTeam" class="panel relay-lineup-panel">
        <div class="section-title"><div><span class="eyebrow">TEAM LINEUP</span><h2>{{ className(selectedTeam) }} · 16 棒名單</h2></div><span class="relay-lineup-caption">{{ selectedTeam.finished ? '全員完成' : '目前第 ' + (selectedTeam.legIndex + 1) + ' 棒' }}</span></div>
        <div class="relay-lineup-grid">
          <button type="button" v-for="athlete in selectedLineup" :key="athlete.id" class="relay-lineup-athlete" :class="{ active: !selectedTeam.finished && athlete.legIndex === selectedTeam.legIndex, done: selectedTeam.finished || athlete.legIndex < selectedTeam.legIndex, next: !selectedTeam.finished && athlete.legIndex === selectedTeam.legIndex + 1 }" :style="{ '--team-color': selectedTeam.color }" @click="game.studentId = athlete.id">
            <b class="relay-leg-number">{{ athlete.legIndex + 1 }}</b><PixelRunner :seed="String(athlete.id)" :gender="athlete.student?.gender" :height="athlete.student?.height" :weight="athlete.student?.weight" :color="selectedTeam.color" :size="34" /><span><strong>{{ athlete.student?.name || '接力隊員' }}</strong><small>{{ legState(athlete.legIndex) }}</small></span><Icon v-if="selectedTeam.finished || athlete.legIndex < selectedTeam.legIndex" name="check" :size="13" />
          </button>
        </div>
      </section>
      <div class="relay-footer"><p class="data-note">切換站內選單後，接力賽仍會繼續。點選班級可查看固定 16 棒名單；點選隊員可查看個人資料。</p><button type="button" class="btn small" :aria-expanded="showHistory" @click="showHistory = !showHistory"><Icon name="flag" :size="16" />{{ showHistory ? '收合歷程' : '查看本屆歷程' }}</button></div>
      <RelayMeetSummary v-if="showHistory && meet" :meet="meet" @close="showHistory = false" />
    </template>
  </section>
</template>

<style scoped>
.relay-race-view { min-width: 0; }
.relay-race-header .eyebrow { display: inline-flex; align-items: center; gap: 6px; }
.relay-status-bar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px 18px; margin: 0 0 13px; color: #557069; font-size: 12px; }
.relay-status-bar span { display: inline-flex; align-items: center; gap: 6px; }
.relay-stadium { margin-bottom: 20px; }
.relay-stadium .stadium-topline { flex-wrap: wrap; }
.relay-team-cards { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 6px; margin: 12px 0; }
.relay-team-card { min-width: 0; display: flex; flex-direction: column; align-items: stretch; gap: 4px; padding: 7px; border: 1.5px solid #263c59; border-top: 4px solid var(--team-color, #a5c983); border-radius: 5px; background: #fff9e8; color: #263c59; box-shadow: 1px 2px 0 #263c5938; text-align: left; cursor: pointer; }
.relay-team-card:hover, .relay-team-card.selected { background: #fff0bd; }
.relay-team-card.selected { outline: 2px solid #d7843f; outline-offset: 2px; }
.relay-team-card.finished { background: #eef3d9; }
.relay-team-card-top { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 3px; }
.relay-team-card-top .lane-label { font-size: 9px; }
.relay-team-card-top .live-rank { margin: 0; padding: 2px 4px; font-size: 9px; }
.relay-team-portrait { display: flex; align-items: center; gap: 4px; }
.relay-team-portrait :deep(.pixel-runner) { flex: 0 0 32px; }
.relay-team-portrait > span { font: 700 12px var(--mono, monospace); color: #a75132; }
.relay-team-card > strong { min-width: 0; display: flex; align-items: center; gap: 4px; overflow: hidden; font-size: 11px; white-space: nowrap; }
.relay-team-card > strong :deep(.relay-title-badge) { flex-shrink: 0; }
.relay-team-card > small { color: #637879; font-size: 9px; }
.relay-team-card em { margin-left: 7px; padding: 2px 5px; background: #ffd875; color: #854625; border-radius: 3px; font-size: 10px; font-style: normal; font-weight: 800; }
.relay-runner-details { display: grid; gap: 4px; }
.relay-runner-details > div { min-width: 0; display: grid; gap: 2px; }
.relay-runner-details span, .relay-runner-details small { overflow: hidden; font-size: 9px; color: #637879; text-overflow: ellipsis; white-space: nowrap; }
.relay-runner-details strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.relay-runner-details small b { color: #263c59; }
.relay-next-runner { min-width: 0; padding-top: 4px; border-top: 1px dashed #c5c8ac; min-height: 0; }
.relay-class-best { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 2px; padding: 4px; background: #f0e7c9; border-radius: 4px; font-size: 9px; }
.relay-class-best b { color: #87532c; }
.relay-team-progress { height: 5px; overflow: hidden; background: #d8e4d0; border-radius: 2px; }
.relay-team-progress i { display: block; height: 100%; background: #da785b; }
.relay-team-distance { display: flex; justify-content: space-between; gap: 3px; font-size: 9px; }
.relay-team-distance small { color: #7b8b80; font-size: 8px; }
.relay-team-distance b { color: #29735c; font-size: 12px; }
.relay-lineup-panel { padding: 16px 18px 18px; }
.relay-lineup-panel .section-title { margin-top: 0; gap: 10px; }
.relay-lineup-panel h2 { margin: 5px 0 0; font-size: 18px; }
.relay-lineup-caption { padding: 6px 9px; border: 1px solid #c39c5c; border-radius: 4px; background: #ffebb2; color: #845735; font-size: 11px; font-weight: 800; }
.relay-lineup-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.relay-lineup-athlete { min-width: 0; display: flex; align-items: center; gap: 7px; padding: 7px; border: 1px solid #b4c4b3; border-radius: 4px; background: #fffdf4; color: #263c59; text-align: left; cursor: pointer; }
.relay-lineup-athlete:hover { background: #fff0bd; border-color: #bf793d; }
.relay-lineup-athlete.active { background: #ffdf88; border: 2px solid #a45b32; padding: 6px; box-shadow: 1px 2px 0 #a45b3233; }
.relay-lineup-athlete.next { background: #f1f5de; border-color: #7aa56d; }
.relay-lineup-athlete.done { background: #eff2e9; }
.relay-leg-number { display: grid; place-items: center; flex-shrink: 0; width: 20px; height: 23px; border: 1px solid #81937d; border-radius: 3px; background: #e6edda; font: 800 12px var(--mono, monospace); }
.relay-lineup-athlete.active .relay-leg-number { background: #b85b39; border-color: #8f412b; color: #fff9e8; }
.relay-lineup-athlete > span { flex: 1; min-width: 0; }
.relay-lineup-athlete strong { display: block; overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.relay-lineup-athlete small { display: block; margin-top: 3px; color: #708275; font-size: 10px; }
.relay-lineup-athlete.active small { color: #884721; font-weight: 800; }
.relay-lineup-athlete > svg:last-child { color: #478568; flex-shrink: 0; }
.relay-footer { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin: 16px 0; }
.relay-footer .data-note { margin: 0; }
.relay-footer .btn { flex-shrink: 0; }
@media (max-width: 1100px) { .relay-team-cards { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (max-width: 850px) { .relay-team-cards, .relay-lineup-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 480px) { .relay-team-cards { gap: 8px; } .relay-team-card { padding: 9px; } .relay-team-card-top { flex-wrap: wrap; } .relay-team-portrait { gap: 6px; } .relay-team-portrait > span { font-size: 14px; } .relay-team-card > strong { font-size: 12px; } .relay-team-distance { flex-wrap: wrap; } .relay-lineup-panel { padding: 12px; } .relay-lineup-panel .section-title { flex-wrap: wrap; } .relay-lineup-panel h2 { font-size: 15px; } .relay-lineup-athlete { gap: 4px; } .relay-lineup-athlete :deep(.pixel-runner) { width: 28px; height: 28px; } .relay-footer { flex-wrap: wrap; } }
</style>
