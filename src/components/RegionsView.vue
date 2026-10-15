<script setup vapor>
import { computed, ref, watch, onUnmounted } from 'vue'
import { game, autoMeet, createRegionMeet, getSchool, getStudent, getClass, go, notify, timeText, dateText } from '../lib/game.js'
import { COUNTIES, compareSchoolOrder } from '../lib/school-order.js'
import { normalizeRegion, regionalEventName, schoolRepresentatives } from '../lib/regional-selection.js'
import { fetchRegionHistory, fetchWindChampions, fetchRanking, syncState } from '../lib/cloud.js'
import { windMeet, startWindMeet } from '../lib/wind-meet.js'
import RaceView from './RaceView.vue'
import WindMeetSummary from './WindMeetSummary.vue'
import WindTitleBadge from './WindTitleBadge.vue'
import PixelRunner from './PixelRunner.vue'
import GamePageHeader from './GamePageHeader.vue'
import Icon from './Icon.vue'

const city = ref('')
const selected = ref([])
const starting = ref(false)
const preparation = ref('')
const historyError = ref('')
const historyLoading = ref(false)
const viewedMeet = ref(null)
let active = true, historyRequest = 0
const currentRegional = computed(() => windMeet.scope === 'regional' && (windMeet.active || windMeet.phase === 'complete'))
const busy = computed(() => autoMeet.active || windMeet.active)
const schools = computed(() => game.world.schools.filter(school => normalizeRegion(school.city) === city.value).sort(compareSchoolOrder))
const selectedSchools = computed(() => schools.value.filter(school => selected.value.includes(school.id)))
const history = computed(() => { game.revision; return game.world.regionMeets.filter(meet => meet.city === city.value).sort((a, b) => b.startedAt.localeCompare(a.startedAt)) })
const champion = computed(() => { game.revision; return game.world.regionChampions[city.value] })
function representatives(school) { game.revision; return schoolRepresentatives(school, getStudent, game.world.windChampions[school.id]) }
function representativeCount(school) { return [1, 2, 3].filter(grade => school.classes.some(cls => cls.grade === grade && cls.studentIds.length)).length }
function toggleSchool(id) { selected.value = selected.value.includes(id) ? selected.value.filter(value => value !== id) : [...selected.value, id] }
watch(city, () => { selected.value = []; viewedMeet.value = null })
watch([city, () => syncState.ready], async ([name, ready]) => {
  const request = ++historyRequest
  historyError.value = ''
  historyLoading.value = false
  if (!name || !ready) return
  historyLoading.value = true
  try { await fetchRegionHistory(name) }
  catch (error) { if (request === historyRequest) historyError.value = error.message }
  finally { if (request === historyRequest) historyLoading.value = false }
})

async function start() {
  if (starting.value || busy.value || !city.value || selected.value.length === 1) return
  const name = city.value, ids = [...selected.value]
  const entrants = ids.length ? selectedSchools.value : schools.value
  starting.value = true
  let localFallback = !syncState.ready || !navigator.onLine
  try {
    // Read only this event's schools, once, before fixing the representative list.
    for (let offset = 0; offset < entrants.length; offset += 4) {
      if (!syncState.ready || !navigator.onLine) { localFallback = true; break }
      preparation.value = `準備學校代表 ${Math.min(offset + 4, entrants.length)} / ${entrants.length}`
      const results = await Promise.allSettled(entrants.slice(offset, offset + 4).map(async school => {
        await fetchWindChampions(school.id)
        await fetchRanking('school', { schoolId: school.id })
      }))
      if (results.some(result => result.status === 'rejected')) localFallback = true
      if (!active || city.value !== name) return
    }
    if (busy.value) throw new Error('目前已有其他自動賽程進行中。')
    const meet = await createRegionMeet(name, ids)
    startWindMeet(meet)
    viewedMeet.value = null
    if (localFallback) notify('部分學校無法取得雲端資料，已使用本機最新代表與成績。')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } catch (error) { notify(error.message) }
  finally { starting.value = false; preparation.value = '' }
}
onUnmounted(() => { active = false; historyRequest++ })
</script>

<template>
  <RaceView v-if="currentRegional" regional-only />
  <section v-else class="content-view regions-view">
    <WindMeetSummary v-if="viewedMeet" :meet="viewedMeet" back-label="回區域比賽" @back="viewedMeet = null" />
    <template v-else>
      <GamePageHeader title="區域比賽" caption="REGIONAL SPRINT" description="集合各校風速小子，爭奪縣市最快的王冠。" theme="race"><span class="region-header-flag"><Icon name="flag" :size="22" />風速王子爭奪戰</span></GamePageHeader>
      <div v-if="busy" class="panel region-busy"><p>目前已有自動賽程進行中，完成後即可舉辦區域比賽。</p><button class="btn primary" @click="go('race')">查看目前賽程<Icon name="arrow" :size="17" /></button></div>
      <div class="regional-setup-layout">
        <aside class="panel region-picker">
          <div class="picker-title"><h2>選擇主場縣市</h2><Icon name="pin" :size="24" /></div>
          <label class="field"><span>縣市</span><select v-model="city" :disabled="starting"><option value="">請選擇縣市</option><option v-for="name in COUNTIES" :key="name" :value="name">{{ name }}</option></select></label>
          <div v-if="city" class="region-event-card"><Icon name="flag" :size="30" /><h3>{{ regionalEventName(city) }}</h3><p>{{ schools.length }} 所學校 · 每校每年級一位代表</p></div>
          <div v-if="champion" class="region-current-champion"><span>現任風速王子</span><button class="student-link" @click="game.studentId = champion.studentId"><WindTitleBadge :student-id="champion.studentId" compact />{{ champion.name }}</button><small>{{ getSchool(champion.schoolId)?.name }} · {{ timeText(champion.time) }}s</small></div>
          <p class="region-help">風速小子優先出賽；尚未選出時，由該年級最佳／預估成績第一名代表。</p>
        </aside>
        <div class="panel region-school-panel">
          <template v-if="city">
            <div class="split-heading"><div><h2>{{ selected.length ? '校際友誼賽' : regionalEventName(city) }}</h2><p class="muted">{{ selected.length ? '已選學校出賽 · 不列入紀錄或稱號' : '不勾選學校，直接開始全縣市淘汰賽' }}</p></div><button v-if="selected.length" class="btn small ghost" :disabled="starting" @click="selected = []">清除選擇</button></div>
            <div class="regional-school-grid"><button v-for="school in schools" :key="school.id" class="regional-school-card" :class="{ selected: selected.includes(school.id) }" :aria-pressed="selected.includes(school.id)" :disabled="starting" @click="toggleSchool(school.id)"><span class="checkbox-visual"><Icon v-if="selected.includes(school.id)" name="check" :size="14" /></span><Icon name="school" :size="24" /><strong>{{ school.name }}</strong><small>{{ representativeCount(school) }} 位代表</small></button></div>
            <div v-if="selected.length" class="region-representatives"><div v-for="school in selectedSchools" :key="school.id" class="region-representative-school"><h3>{{ school.name }}</h3><div v-for="student in representatives(school)" :key="student.id" class="region-representative"><PixelRunner :seed="student.id" :gender="student.gender" :height="student.height" :weight="student.weight" :color="getClass(student.classId).color" :size="34" /><span><strong>{{ student.name }}<WindTitleBadge :student-id="student.id" compact /></strong><small>{{ getClass(student.classId).name }}</small></span><b class="mono">{{ timeText(student.best100 ?? student.baseline100) }}s</b></div></div></div>
            <div class="region-start"><p>{{ selected.length ? `已選 ${selected.length} 所學校，每校三名代表。超過 8 人會分組。` : '兩校對跑，每場前三名晉級；決賽第一名成為風速王子。' }}</p><button class="btn primary" :disabled="busy || starting || !schools.length || selected.length === 1" @click="start"><Icon name="play" :size="19" />{{ starting ? preparation || '準備開賽…' : selected.length ? '開始友誼賽' : '開始自動百米賽' }}</button></div>
            <p v-if="selected.length === 1" class="data-note">友誼賽請再選一所學校。</p>
          </template>
          <div v-else class="empty-state school-await"><Icon name="pin" :size="46" /><h2>下一位風速王子，從這裡出發</h2><p>先選擇一個縣市，讓所有學校角逐冠軍，<br />或勾選多所學校進行友誼賽。</p></div>
        </div>
      </div>
      <div v-if="city" class="panel wind-history-panel"><div class="section-title"><h3>歷屆{{ city.endsWith('縣') ? '縣運' : '市運' }}百米賽</h3><span class="muted">{{ history.length }} 屆</span></div><p v-if="historyLoading" class="muted">取得比賽歷程…</p><p v-if="historyError" class="data-note">{{ historyError }}</p><p v-if="!history.length && !historyLoading" class="muted">目前沒有正式賽事紀錄。</p><button v-for="meet in history" :key="meet.id" class="wind-history-entry" @click="viewedMeet = meet"><span>{{ dateText(meet.startedAt) }}<small>{{ meet.completedMatches }} / {{ meet.totalMatches }} 場 · {{ meet.status === 'complete' ? '比賽完成' : '比賽未完成' }}</small></span><span>查看淘汰歷程<Icon name="arrow" :size="16" /></span></button></div>
    </template>
  </section>
</template>
