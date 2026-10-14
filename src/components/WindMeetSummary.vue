<script setup vapor>
import { computed } from 'vue'
import { game, getStudent, getClass, timeText, dateText } from '../lib/game.js'
import PixelRunner from './PixelRunner.vue'
import Icon from './Icon.vue'
const props = defineProps({ meet: Object })
defineEmits(['back'])
const grades = computed(() => props.meet.grades.filter(group => group.entrants.length))
const gradeLabel = grade => ['一年級', '二年級', '三年級'][grade - 1]
function roundLabel(group, index) {
  if (group.champion && index === group.rounds.length - 1) return '冠軍賽'
  return `第 ${index + 1} 輪`
}
</script>

<template>
  <div class="wind-summary">
    <div class="panel wind-summary-header"><div><span class="eyebrow">WIND RUNNERS</span><h1>風速小子選拔賽</h1><p>{{ meet.schoolName }} · {{ dateText(meet.startedAt) }}</p><span class="muted">{{ meet.completedMatches }} / {{ meet.totalMatches }} 場對戰 · {{ meet.status === 'complete' ? '選拔完成' : '選拔進行中' }}</span></div><button class="btn primary" @click="$emit('back')"><Icon name="back" :size="17" />回比賽選單</button></div>
    <section v-for="group in grades" :key="group.grade" class="panel wind-grade-summary">
      <div class="section-title"><h2>{{ gradeLabel(group.grade) }}</h2><span class="muted">{{ group.entrants.length }} 個班級</span></div>
      <button v-if="group.champion" class="wind-champion-card" @click="game.studentId = group.champion.studentId">
        <PixelRunner :seed="group.champion.studentId" :gender="getStudent(group.champion.studentId)?.gender" :height="getStudent(group.champion.studentId)?.height" :weight="getStudent(group.champion.studentId)?.weight" :color="getClass(group.champion.classId)?.color || '#ffbf65'" :size="70" />
        <span><span class="wind-title-badge"><Icon name="sprint" :size="17" />風速小子</span><strong>{{ group.champion.name }}</strong><small>{{ group.champion.className }} · 冠軍班級</small></span><b class="mono">{{ timeText(group.champion.time) }}<small>s</small></b>
      </button>
      <div class="wind-rounds"><div v-for="(round, index) in group.rounds" :key="round.number" class="wind-round"><h3>{{ roundLabel(group, index) }}</h3><div class="wind-match-grid"><article v-for="match in round.matches" :key="match.id" class="wind-match-card" :class="{ bye: match.status === 'bye', final: group.champion && index === group.rounds.length - 1 }">
        <div class="wind-match-pair"><span v-for="(id, classIndex) in match.classIds" :key="id" :class="{ winner: id === match.winnerClassId }"><i :style="{ background: getClass(id)?.color }"></i>{{ match.classNames[classIndex] }}<Icon v-if="id === match.winnerClassId" name="check" :size="15" /><small v-if="classIndex === 0 && match.classIds.length === 2">VS</small></span></div>
        <p v-if="match.status === 'bye'">輪空晉級</p><p v-else-if="match.status === 'pending'" class="muted">等待比賽</p><div v-else class="wind-match-result"><span>{{ match.classNames[match.classIds.indexOf(match.winnerClassId)] }} 出線</span><button class="text-button" @click="game.studentId = match.winnerStudentId">第一名 {{ match.winnerName }} <b class="mono">{{ timeText(match.winnerTime) }}s</b></button></div>
      </article></div></div></div>
    </section>
  </div>
</template>
