<script setup vapor>
import { computed, ref } from 'vue'
import { game, getSchool, timeText } from '../lib/game.js'
import Icon from './Icon.vue'
import RelayMeetSummary from './RelayMeetSummary.vue'

const props = defineProps({ runId: String, schoolIds: { type: Array, default: () => [] } })
defineEmits(['back'])
const viewedMeet = ref(null)
const page = ref(1)
const pageSize = 100
const rows = computed(() => {
  game.revision
  const meets = new Map((game.world.relayMeets || []).filter(meet => meet.nationalRunId === props.runId).map(meet => [meet.schoolId, meet]))
  return props.schoolIds.map(id => ({ school: getSchool(id), meet: meets.get(id) })).filter(row => row.school)
})
const pages = computed(() => Math.max(1, Math.ceil(rows.value.length / pageSize)))
const displayedRows = computed(() => rows.value.slice((page.value - 1) * pageSize, page.value * pageSize))
</script>

<template>
  <RelayMeetSummary v-if="viewedMeet" :meet="viewedMeet" back-label="回全國總覽" @close="viewedMeet = null" />
  <div v-else class="wind-summary">
    <div class="panel wind-summary-header">
      <div><span class="eyebrow">NATIONAL RELAY CHAMPIONS</span><h1>全國風速小班選拔完成</h1><p>{{ rows.length }} 所學校 · 各校接力冠軍已選出</p></div>
      <button type="button" class="btn primary" @click="$emit('back')"><Icon name="back" :size="17" />回比賽選單</button>
    </div>
    <section class="panel national-wind-summary">
      <div class="section-title"><h2>各校風速小班</h2><div class="national-wind-pagination"><button type="button" class="btn small" :disabled="page === 1" @click="page--">上一頁</button><span>{{ page }} / {{ pages }}</span><button type="button" class="btn small" :disabled="page === pages" @click="page++">下一頁</button></div></div>
      <div class="table-wrap"><table class="data-table"><thead><tr><th>縣市 / 學校</th><th>風速小班</th><th>冠軍賽成績 · 1600m</th><th>選拔歷程</th></tr></thead><tbody>
        <tr v-for="row in displayedRows" :key="row.school.id"><td>{{ row.school.city }}<br /><strong>{{ row.school.name }}</strong></td>
          <td><strong>{{ row.meet?.champion?.className || '—' }}</strong></td>
          <td class="mono">{{ Number.isFinite(row.meet?.champion?.time) ? timeText(row.meet.champion.time) + 's' : '—' }}</td>
          <td><button type="button" class="btn small" :disabled="!row.meet" @click="viewedMeet = row.meet">查看歷程<Icon name="arrow" :size="14" /></button></td>
        </tr>
      </tbody></table></div>
      <div class="national-wind-pagination"><button type="button" class="btn small" :disabled="page === 1" @click="page--">上一頁</button><span>{{ page }} / {{ pages }}</span><button type="button" class="btn small" :disabled="page === pages" @click="page++">下一頁</button></div>
    </section>
  </div>
</template>

