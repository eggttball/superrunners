<script setup vapor>
import { computed, ref } from 'vue'
import { game, getSchool, timeText } from '../lib/game.js'
import Icon from './Icon.vue'
import WindMeetSummary from './WindMeetSummary.vue'
import WindTitleBadge from './WindTitleBadge.vue'

const props = defineProps({ runId: String, schoolIds: Array })
defineEmits(['back'])
const viewedMeet = ref(null)
const page = ref(1)
const pageSize = 100
const grades = ['一年級', '二年級', '三年級']
const rows = computed(() => {
  game.revision
  const meets = new Map(game.world.windMeets.filter(meet => meet.nationalRunId === props.runId).map(meet => [meet.schoolId, meet]))
  return props.schoolIds.map(id => ({ school: getSchool(id), meet: meets.get(id) })).filter(row => row.school)
})
const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / pageSize)))
const displayedRows = computed(() => rows.value.slice((page.value - 1) * pageSize, page.value * pageSize))
</script>

<template>
  <WindMeetSummary v-if="viewedMeet" :meet="viewedMeet" back-label="回全國總覽" @back="viewedMeet = null" />
  <div v-else class="wind-summary">
    <div class="panel wind-summary-header">
      <div><span class="eyebrow">NATIONAL WIND RUNNERS</span><h1>全國風速小子選拔完成</h1><p>{{ rows.length }} 所學校 · 各校年級冠軍已選出</p></div>
      <button class="btn primary" @click="$emit('back')"><Icon name="back" :size="17" />回比賽選單</button>
    </div>
    <section class="panel national-wind-summary">
      <div class="section-title"><h2>各校風速小子</h2><div class="national-wind-pagination"><button class="btn small" :disabled="page === 1" @click="page--">上一頁</button><span>{{ page }} / {{ pages }}</span><button class="btn small" :disabled="page === pages" @click="page++">下一頁</button></div></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>學校</th><th v-for="grade in grades" :key="grade">{{ grade }}</th><th>選拔歷程</th></tr></thead><tbody>
        <tr v-for="row in displayedRows" :key="row.school.id"><td>{{ row.school.city }}<br /><strong>{{ row.school.name }}</strong></td>
          <td v-for="grade in 3" :key="grade"><button v-if="row.meet?.grades[grade - 1]?.champion" class="text-button national-wind-champion" @click="game.studentId = row.meet.grades[grade - 1].champion.studentId"><strong><WindTitleBadge :student-id="row.meet.grades[grade - 1].champion.studentId" compact />{{ row.meet.grades[grade - 1].champion.name }}</strong><small>{{ row.meet.grades[grade - 1].champion.className }}</small><span class="mono">{{ timeText(row.meet.grades[grade - 1].champion.time) }}s</span></button><span v-else>—</span></td>
          <td><button class="btn small" :disabled="!row.meet" @click="viewedMeet = row.meet">查看歷程<Icon name="arrow" :size="14" /></button></td>
        </tr>
      </tbody></table></div>
      <div class="national-wind-pagination"><button class="btn small" :disabled="page === 1" @click="page--">上一頁</button><span>{{ page }} / {{ pages }}</span><button class="btn small" :disabled="page === pages" @click="page++">下一頁</button></div>
    </section>
  </div>
</template>
