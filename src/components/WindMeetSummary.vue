<script setup vapor>
import { computed } from 'vue'
import { game, getClass, getStudent, getWindTitle, timeText, dateText } from '../lib/game.js'
import Icon from './Icon.vue'

const props = defineProps({
  meet: Object,
  friendshipResults: { type: Array, default: () => [] },
  backLabel: { type: String, default: '回比賽選單' },
})
defineEmits(['back'])
const gradeLabel = grade => ['一年級', '二年級', '三年級'][grade - 1]
const NODE_HEIGHT = 116
const LEAF_HEIGHT = 92
const ROW_GAP = 152
const TOP = 100
const GUTTER = 84
const SLOT_WIDTH = 160
const regional = computed(() => props.meet.kind === 'regional')
const friendlyResults = computed(() => props.meet.friendly ? props.meet.grades.flatMap(group => group.rounds.flatMap(round => round.matches)) : [])

const raceResultsByMatch = computed(() => {
  game.revision
  return new Map(game.world.races.filter(race => race.windMatchId || race.regionMatchId)
    .map(race => [race.windMatchId || race.regionMatchId, race.results]))
})

function finishersFor(match) {
  if (match?.topThree?.length) return match.topThree
  const raceResults = match && raceResultsByMatch.value.get(match.id)
  if (raceResults?.length) return raceResults.slice().sort((a, b) => a.time - b.time || a.lane - b.lane).slice(0, 3)
  if (match?.winnerStudentId) return [{ studentId: match.winnerStudentId, name: match.winnerName,
    classId: match.winnerClassId, className: match.classNames[match.classIds.indexOf(match.winnerClassId)], time: match.winnerTime }]
  return []
}

function buildTree(group) {
  const nodeHeight = regional.value ? 140 : NODE_HEIGHT
  const leafHeight = regional.value ? 128 : LEAF_HEIGHT
  const rowGap = regional.value ? 182 : ROW_GAP
  const slotWidth = regional.value ? 240 : SLOT_WIDTH
  const entrants = group.entrants
  const firstRoundTimes = new Map()
  const firstRoundByes = new Set()
  for (const match of group.rounds[0]?.matches || []) {
    if (match.status === 'bye') match.studentIds.forEach(id => firstRoundByes.add(id))
    for (const result of raceResultsByMatch.value.get(match.id) || []) firstRoundTimes.set(result.studentId, result.time)
  }
  const counts = group.rounds.map(round => round.matches.length)
  if (!counts.length) counts.push(Math.ceil(entrants.length / 2))
  const hasLegacyChampionRound = Boolean(group.champion && !group.rounds.at(-1)?.isFinal)
  const hasSavedFinalRound = group.rounds.some(round => round.isFinal)
  if (!hasLegacyChampionRound && !hasSavedFinalRound) {
    while (counts.at(-1) > 1) counts.push(Math.ceil(counts.at(-1) / 2))
    if (entrants.length > 1 && !regional.value) counts.push(1) // School selections have a separate three-runner final.
  }
  const roundCount = counts.length
  const width = Math.max(320, GUTTER + entrants.length * slotWidth + 20)
  const leafY = TOP + roundCount * rowGap
  const height = leafY + leafHeight / 2 + 24
  const rows = []
  const nodes = []
  const leaves = entrants.map((entry, index) => {
    const x = GUTTER + (index + 0.5) * (width - GUTTER - 20) / entrants.length
    return { id: entry.schoolId || entry.classId, entry, x, y: leafY, left: x - slotWidth / 2, right: x + slotWidth / 2,
      color: getClass(entry.classId || getStudent(entry.studentIds[0])?.classId)?.color || '#c7cfc1',
      students: entry.studentIds.map(getStudent).filter(Boolean).map(student => ({ ...student,
        raceTime: firstRoundTimes.get(student.id) ?? null, firstRoundBye: firstRoundByes.has(student.id) })) }
  })
  const links = []
  let previous = leaves

  counts.forEach((count, roundIndex) => {
    const savedRound = group.rounds[roundIndex]
    const y = TOP + (roundCount - roundIndex - 1) * rowGap
    const rowNodes = []
    for (let index = 0; index < count; index++) {
      const match = savedRound?.matches[index]
      const children = previous.slice(index * 2, index * 2 + 2)
      const left = children[0]?.left ?? GUTTER
      const right = children.at(-1)?.right ?? left
      const x = (left + right) / 2
      const topThree = finishersFor(match)
      const firstPlace = match?.status === 'bye' ? null : topThree[0]
      const champion = Boolean(group.champion && roundIndex === roundCount - 1)
      const node = {
        id: match?.id || `${group.grade}-${roundIndex}-${index}`,
        match, x, y, left, right, champion,
        status: match?.status || 'pending',
        topThree,
        firstPlace,
        style: {
          left: `${x / width * 100}%`, top: `${y}px`,
          '--class-color': getClass(firstPlace?.classId || match?.winnerClassId)?.color || '#c7cfc1',
        },
        description: `${regional.value ? props.meet.city : gradeLabel(group.grade)} · 第 ${roundIndex + 1} 輪${match?.classNames?.length ? ' · ' + match.classNames.join(' 對 ') : ''}`,
      }
      const jointY = children.length ? (children[0].y + y) / 2 : y
      for (const child of children) {
        links.push({ id: `${child.id}-${node.id}`,
          path: `M ${child.x} ${child.y - (child.entry ? leafHeight : nodeHeight) / 2} V ${jointY} H ${x}`,
          advanced: ['done', 'bye'].includes(match?.status) })
      }
      if (children.length) links.push({ id: `${node.id}-stem`,
        path: `M ${x} ${jointY} V ${y + nodeHeight / 2}`,
        advanced: ['done', 'bye'].includes(match?.status) })
      rowNodes.push(node)
      nodes.push(node)
    }
    rows.push({ number: roundIndex + 1, label: roundIndex === roundCount - 1 ? regional.value ? '縣市冠軍決賽' : '年級冠軍決賽' : `第 ${roundIndex + 1} 輪`, y })
    previous = rowNodes
  })

  return {
    width, height, rows, nodes, leaves, links,
    rootStyle: { left: `${previous[0].x / width * 100}%` },
    style: { minWidth: `${width}px`, height: `${height}px` },
  }
}

const grades = computed(() => props.meet.grades.filter(group => group.entrants.length)
  .map(group => ({ ...group, tree: buildTree(group) })))
</script>

<template>
  <div class="wind-summary" :class="{ 'regional-summary': regional }">
    <div class="panel wind-summary-header">
      <div><span class="eyebrow">{{ regional ? 'REGIONAL CUP' : 'WIND RUNNERS' }}</span><h1>{{ regional ? meet.friendly ? meet.city + '校際友誼賽' : meet.eventName : '風速小子選拔賽' }}</h1><p>{{ regional ? meet.schoolIds.length + ' 所學校' : meet.schoolName }} · {{ dateText(meet.startedAt) }}</p><span class="muted">{{ meet.completedMatches }} / {{ meet.totalMatches }} 場對戰 · {{ meet.status === 'complete' ? '比賽完成' : '比賽進行中' }}{{ meet.friendly ? ' · 不列入正式紀錄' : '' }}</span></div>
      <button class="btn primary" @click="$emit('back')"><Icon name="back" :size="17" />{{ backLabel }}</button>
    </div>

    <section v-if="friendshipResults.length" class="panel wind-friendship-summary">
      <div class="section-title"><h2><Icon name="sprint" :size="21" />風速小子友誼賽</h2><span class="muted">三個年級冠軍 · 不列入正式紀錄</span></div>
      <div class="wind-friendship-results">
        <button v-for="result in friendshipResults" :key="result.studentId" class="wind-friendship-result" @click="game.studentId = result.studentId">
          <b class="mono">{{ result.place }}</b><span><strong>{{ result.name }}</strong><small>{{ result.className }}</small></span><strong class="mono">{{ timeText(result.time) }}s</strong>
        </button>
      </div>
    </section>

    <section v-if="meet.friendly" class="panel region-friendly-summary"><div v-for="match in friendlyResults" :key="match.id" class="region-friendly-heat"><h2>第 {{ match.number }} 組</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>名次</th><th>學生</th><th>學校 / 班級</th><th>秒數</th></tr></thead><tbody><tr v-for="(result, index) in match.results" :key="result.studentId"><td>{{ index + 1 }}</td><td><button class="text-button" @click="game.studentId = result.studentId">{{ result.name }}</button></td><td>{{ result.schoolName }} / {{ result.className }}</td><td class="mono">{{ timeText(result.time) }}s</td></tr></tbody></table></div></div></section>
    <section v-for="group in meet.friendly ? [] : grades" :key="group.grade" class="panel wind-grade-summary">
      <div class="section-title"><h2>{{ regional ? '風速王子爭奪戰' : gradeLabel(group.grade) }}</h2><span class="muted">{{ group.entrants.length }} {{ regional ? '所學校' : '個班級' }}</span></div>
      <div class="wind-tree-viewport" tabindex="0" role="region" :aria-label="`${regional ? meet.city : gradeLabel(group.grade)}淘汰樹，第一輪在下方，冠軍在上方`">
        <div class="wind-tree" :style="group.tree.style">
          <svg class="wind-tree-links" :viewBox="`0 0 ${group.tree.width} ${group.tree.height}`" preserveAspectRatio="none" aria-hidden="true">
            <path v-for="link in group.tree.links" :key="link.id" :d="link.path" :class="{ advanced: link.advanced }" />
          </svg>
          <span class="wind-tree-crown" :class="{ 'wind-prince-badge': regional || getWindTitle(group.champion?.studentId)?.kind === 'prince' }" :style="group.tree.rootStyle"><Icon :name="regional || getWindTitle(group.champion?.studentId)?.kind === 'prince' ? 'flag' : 'trophy'" :size="19" />{{ group.champion ? regional ? '風速王子' : getWindTitle(group.champion.studentId)?.title || '風速小子' : '冠軍' }}</span>
          <span v-for="row in group.tree.rows" :key="row.number" class="wind-tree-round-label" :style="{ top: `${row.y}px` }">{{ row.label }}</span>

          <article v-for="leaf in group.tree.leaves" :key="leaf.id" class="wind-tree-leaf" :style="{ left: `${leaf.x / group.tree.width * 100}%`, top: `${leaf.y}px`, '--class-color': leaf.color }">
            <strong :title="leaf.entry.schoolName || leaf.entry.className">{{ leaf.entry.schoolName || leaf.entry.className }}</strong>
            <span v-for="student in leaf.students" :key="student.id"><strong><small v-if="regional">{{ getClass(student.classId)?.name }} </small>{{ student.name }}</strong><small v-if="student.raceTime !== null" class="mono">{{ timeText(student.raceTime) }}s</small><small v-else-if="student.firstRoundBye">輪空</small></span>
          </article>

          <button
            v-for="node in group.tree.nodes" :key="node.id"
            class="wind-tree-node" :class="{ champion: node.champion, bye: node.status === 'bye', pending: node.status === 'pending' }"
              :style="node.style" :disabled="node.status === 'bye' || !node.firstPlace?.studentId"
            :title="`${node.description} · ${node.topThree.map(result => [result.schoolName, result.className, result.name, result.time != null ? timeText(result.time) + 's' : ''].filter(Boolean).join(' ')).join('，')}`" :aria-label="`${node.description} · ${node.topThree.map((result, index) => `${index + 1}名 ${result.schoolName || ''} ${result.className} ${result.name}${result.time != null ? ' ' + timeText(result.time) + ' 秒' : ''}`).join('，')}`"
            @click="game.studentId = node.firstPlace.studentId"
            >
            <span v-if="node.status === 'bye'" class="wind-tree-bye-label">輪空晉級</span>
            <span v-else v-for="(result, index) in node.topThree" :key="result.studentId" class="wind-tree-place" :class="{ first: index === 0 }">
              <i>{{ index + 1 }}</i><span class="wind-tree-place-name"><small v-if="regional" :title="result.schoolName">{{ result.schoolName }}</small><small>{{ result.className }}</small><strong>{{ result.name }}</strong></span>
              <b v-if="result.time != null" class="mono">{{ timeText(result.time) }}s</b>
            </span>
            <span v-if="!node.topThree.length" class="wind-tree-pending-label">等待比賽</span>
          </button>
        </div>
      </div>
    </section>
  </div>
</template>
