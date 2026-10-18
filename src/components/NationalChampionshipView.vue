<script setup vapor>
import { computed, ref, watch, onUnmounted } from 'vue'
import { game, autoMeet, createNationalMeet, getSchool, getStudent, getClass, go, notify, timeText, dateText } from '../lib/game.js'
import { COUNTIES } from '../lib/school-order.js'
import { regionalDelegation } from '../lib/national-championship.js'
import { fetchRegionalDelegations, fetchNationalHistory, syncState } from '../lib/cloud.js'
import { windMeet, startWindMeet } from '../lib/wind-meet.js'
import { relayMeet } from '../lib/relay-meet.js'
import RaceView from './RaceView.vue'
import WindMeetSummary from './WindMeetSummary.vue'
import WindTitleBadge from './WindTitleBadge.vue'
import PixelRunner from './PixelRunner.vue'
import GamePageHeader from './GamePageHeader.vue'
import Icon from './Icon.vue'

const selected = ref([])
const starting = ref(false)
const loading = ref(false)
const readError = ref('')
const viewedMeet = ref(null)
let active = true, requestId = 0
const currentNational = computed(() => windMeet.scope === 'championship' && (windMeet.active || windMeet.phase === 'complete'))
const busy = computed(() => autoMeet.active || windMeet.active || relayMeet.active)
const counties = computed(() => {
  game.revision
  return COUNTIES.map(city => ({ city, representatives: regionalDelegation(city, game.world.regionMeets, getStudent, getSchool) }))
})
const entrants = computed(() => counties.value.filter(entry => !selected.value.length || selected.value.includes(entry.city)))
const missing = computed(() => entrants.value.filter(entry => entry.representatives.length !== 3))
const champion = computed(() => { game.revision; return game.world.nationalChampion })
const history = computed(() => { game.revision; return game.world.nationalMeets.slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt)) })
function toggleCity(city) { selected.value = selected.value.includes(city) ? selected.value.filter(name => name !== city) : [...selected.value, city] }
async function refresh() {
  const request = ++requestId
  readError.value = ''
  if (!syncState.ready || !navigator.onLine) { readError.value = '目前使用本機已保存的代表名單與歷程。'; return }
  loading.value = true
  try {
    const results = await Promise.allSettled([fetchRegionalDelegations(), fetchNationalHistory()])
    if (active && request === requestId && results.some(result => result.status === 'rejected')) readError.value = '部分雲端資料無法取得，目前使用本機最新資料。'
  } finally { if (request === requestId) loading.value = false }
}
watch(() => syncState.ready, () => { void refresh() }, { immediate: true })
async function start() {
  if (starting.value || busy.value || selected.value.length === 1) return
  const cities = entrants.value.map(entry => entry.city), friendly = selected.value.length > 0
  starting.value = true
  try {
    if (syncState.ready && navigator.onLine) {
      try { await fetchRegionalDelegations() }
      catch { notify('無法取得雲端最新代表，將使用本機已保存的名單。') }
    }
    if (!active) return
    const meet = await createNationalMeet(cities, { friendly })
    startWindMeet(meet)
    viewedMeet.value = null
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (error) { notify(error.message) }
  finally { starting.value = false }
}
onUnmounted(() => { active = false; requestId++ })
</script>

<template>
  <RaceView v-if="currentNational" championship-only />
  <section v-else class="content-view national-championship-view">
    <WindMeetSummary v-if="viewedMeet" :meet="viewedMeet" back-label="回全國大賽" @back="viewedMeet = null" />
    <template v-else>
      <GamePageHeader title="全國大賽" caption="NATIONAL CUP" description="各縣市前三強集結，向風神的王冠衝刺。" theme="race"><span class="region-header-flag"><Icon name="bolt" :size="22" />風神爭奪戰</span></GamePageHeader>
      <div v-if="busy" class="panel region-busy"><p>目前已有自動賽程進行中，完成後即可舉辦全國大賽。</p><button class="btn primary" @click="go('race')">查看目前賽程<Icon name="arrow" :size="17" /></button></div>
      <div class="regional-setup-layout">
        <aside class="panel region-picker">
          <div class="picker-title"><h2>{{ selected.length ? '跨縣市友誼賽' : '全國百米大賽' }}</h2><Icon name="globe" :size="24" /></div>
          <div class="region-event-card"><Icon name="bolt" :size="30" /><h3>{{ selected.length ? selected.length + ' 個縣市出賽' : '全臺 ' + COUNTIES.length + ' 個縣市' }}</h3><p>每縣市派出風速王子、亞軍與季軍</p></div>
          <div v-if="champion" class="region-current-champion national-current-champion"><span>現任風神</span><button class="student-link" @click="game.studentId = champion.studentId"><WindTitleBadge :student-id="champion.studentId" compact />{{ champion.name }}</button><small>{{ champion.city }} · {{ champion.schoolName }} · {{ timeText(champion.time) }}s</small></div>
          <p class="region-help">不選縣市，直接舉辦正式全國賽。複選兩個以上縣市，進行不列入紀錄的友誼淘汰賽。</p>
          <p class="region-help">每場六位跑者，前三名晉級。總冠軍賽開始前自動暫停，按「繼續」才開跑。</p>
          <p v-if="readError" class="data-note">{{ readError }}</p>
        </aside>
        <div class="panel region-school-panel">
          <div class="split-heading"><div><h2>選擇參賽縣市</h2><p class="muted">{{ loading ? '更新縣市代表名單…' : '各縣市最近一屆已完成區域賽的前三名' }}</p></div><button v-if="selected.length" class="btn small ghost" :disabled="starting" @click="selected = []">清除選擇</button></div>
          <div class="regional-school-grid national-county-grid"><button v-for="entry in counties" :key="entry.city" class="regional-school-card" :class="{ selected: selected.includes(entry.city), 'delegation-missing': entry.representatives.length !== 3 }" :aria-pressed="selected.includes(entry.city)" :disabled="starting" @click="toggleCity(entry.city)"><span class="checkbox-visual"><Icon v-if="selected.includes(entry.city)" name="check" :size="14" /></span><Icon name="pin" :size="23" /><strong>{{ entry.city }}</strong><small>{{ entry.representatives.length === 3 ? '三位代表已就緒' : '尚未有完整前三名' }}</small></button></div>
          <div class="region-start"><p>{{ selected.length ? `已選 ${selected.length} 個縣市 · 友誼賽不更新最佳成績或稱號` : '決賽第一名獲得風神稱號，前六名留下個人榮譽紀錄。' }}</p><button class="btn primary" :disabled="busy || starting || loading || missing.length > 0 || selected.length === 1" @click="start"><Icon name="play" :size="19" />{{ starting ? '準備開賽…' : selected.length ? '開始友誼賽' : '開始全國大賽' }}</button></div>
          <p v-if="selected.length === 1" class="data-note">友誼賽請再選一個縣市。</p>
          <p v-if="missing.length" class="data-note">{{ missing.map(entry => entry.city).join('、') }} 尚缺完整前三名，請先完成這些縣市的區域賽。</p>
          <details class="national-delegation-preview"><summary>查看{{ selected.length ? '已選縣市' : '各縣市' }}代表名單</summary><div class="region-representatives"><div v-for="entry in entrants" :key="entry.city" class="region-representative-school"><h3>{{ entry.city }}</h3><p v-if="entry.representatives.length !== 3" class="muted">代表名單尚未完成</p><button v-for="result in entry.representatives" :key="result.studentId" class="region-representative national-delegate" @click="game.studentId = result.studentId"><PixelRunner :seed="result.studentId" :gender="getStudent(result.studentId)?.gender" :height="getStudent(result.studentId)?.height" :weight="getStudent(result.studentId)?.weight" :color="getClass(result.classId)?.color" :size="34" /><span><strong>{{ result.name }}<WindTitleBadge :student-id="result.studentId" compact /></strong><small>{{ ['風速王子', '亞軍', '季軍'][result.place - 1] }} · {{ result.schoolName }} · {{ result.className }}</small></span><b class="mono">{{ timeText(result.time) }}s</b></button></div></div></details>
        </div>
      </div>
      <div class="panel wind-history-panel"><div class="section-title"><h3>歷屆全國百米大賽</h3><span class="muted">{{ history.length }} 屆</span></div><p v-if="!history.length" class="muted">目前沒有正式賽事紀錄。</p><button v-for="meet in history" :key="meet.id" class="wind-history-entry" @click="viewedMeet = meet"><span>{{ dateText(meet.startedAt) }}<small>{{ meet.cities.length }} 個縣市 · {{ meet.completedMatches }} / {{ meet.totalMatches }} 場 · {{ meet.status === 'complete' ? '比賽完成' : '比賽未完成' }}</small></span><span>查看淘汰歷程<Icon name="arrow" :size="16" /></span></button></div>
    </template>
  </section>
</template>
