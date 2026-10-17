<script setup vapor>
import { computed, ref, watch } from 'vue'
import { game, getClass, getStudent, getSchool, getWindTitle, timeText, dateText } from '../lib/game.js'
import Icon from './Icon.vue'
import { nationalPodiumLabel } from '../lib/national-championship.js'

const props = defineProps({
  meet: Object,
  friendshipResults: { type: Array, default: () => [] },
  backLabel: { type: String, default: '回比賽選單' },
})
defineEmits(['back'])
const treeExpanded = ref(true)
const collapsedNodeIds = ref(new Set())
watch(() => props.meet.id, () => { treeExpanded.value = true; collapsedNodeIds.value = new Set() })
function toggleNode(id) {
  const next = new Set(collapsedNodeIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsedNodeIds.value = next
}
function collapseWholeTree() { treeExpanded.value = false }
function expandWholeTree() { treeExpanded.value = true; collapsedNodeIds.value = new Set() }
const gradeLabel = grade => ['一年級', '二年級', '三年級'][grade - 1]
const NODE_HEIGHT = 116
const LEAF_HEIGHT = 92
const ROW_GAP = 152
const TOP = 100
const GUTTER = 84
const SLOT_WIDTH = 160
const regional = computed(() => props.meet.kind === 'regional')
const national = computed(() => props.meet.kind === 'national-championship')
const representative = computed(() => regional.value || national.value)
const eventLabel = computed(() => national.value ? '全國大賽' : regional.value ? props.meet.city : '')
function crownTitle(group) {
  if (!group.champion) return '冠軍'
  if (props.meet.friendly) return '友誼賽冠軍'
  if (national.value) return '風神'
  return getWindTitle(group.champion.studentId)?.title || (regional.value ? '風速王子' : '風速小子')
}
function crownKind(group) {
  if (props.meet.friendly) return 'friendly'
  return national.value ? 'god' : getWindTitle(group.champion?.studentId)?.kind || (regional.value ? 'prince' : 'school')
}
const friendlyResults = computed(() => props.meet.friendly ? props.meet.grades.flatMap(group => group.rounds.flatMap(round => round.matches)) : [])

const raceResultsByMatch = computed(() => {
  game.revision
  return new Map(game.world.races.filter(race => race.windMatchId || race.regionMatchId || race.nationalMatchId)
    .map(race => [race.windMatchId || race.regionMatchId || race.nationalMatchId, race.results]))
})

function finishersFor(match) {
  if (match?.topThree?.length) return match.topThree
  const raceResults = match && (raceResultsByMatch.value.get(match.id) || match.results)
  if (raceResults?.length) return raceResults.slice().sort((a, b) => a.time - b.time || a.lane - b.lane).slice(0, 3)
  if (match?.winnerStudentId) return [{ studentId: match.winnerStudentId, name: match.winnerName,
    classId: match.winnerClassId, className: match.classNames[match.classIds.indexOf(match.winnerClassId)], time: match.winnerTime }]
  return []
}

function buildTree(group, collapsedIds) {
  const nodeHeight = representative.value ? 140 : NODE_HEIGHT
  const leafHeight = representative.value ? 128 : LEAF_HEIGHT
  const rowGap = representative.value ? 182 : ROW_GAP
  const slotWidth = representative.value ? 240 : SLOT_WIDTH
  const entrants = group.entrants
  const firstRoundTimes = new Map()
  const firstRoundByes = new Set()
  for (const match of group.rounds[0]?.matches || []) {
    if (match.status === 'bye') match.studentIds.forEach(id => firstRoundByes.add(id))
    for (const result of raceResultsByMatch.value.get(match.id) || match.results || []) firstRoundTimes.set(result.studentId, result.time)
  }
  const counts = group.rounds.map(round => round.matches.length)
  if (!counts.length) counts.push(Math.ceil(entrants.length / 2))
  const hasLegacyChampionRound = Boolean(group.champion && !group.rounds.at(-1)?.isFinal)
  const hasSavedFinalRound = group.rounds.some(round => round.isFinal)
  if (!hasLegacyChampionRound && !hasSavedFinalRound) {
    while (counts.at(-1) > 1) counts.push(Math.ceil(counts.at(-1) / 2))
    if (entrants.length > 1 && !representative.value) counts.push(1) // School selections have a separate three-runner final.
  }
  const roundCount = counts.length
  const rows = []
  const nodes = []
  const leaves = entrants.map(entry => {
    return { id: entry.city || entry.schoolId || entry.classId, entry, x: 0, y: 0, left: 0, right: 0, children: [],
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
      const topThree = finishersFor(match)
      const firstPlace = match?.status === 'bye' ? null : topThree[0]
      const champion = Boolean(group.champion && roundIndex === roundCount - 1)
      const node = {
        id: match?.id || `${group.grade}-${roundIndex}-${index}`,
        match, x: 0, y, left: 0, right: 0, champion, roundIndex, children,
        status: match?.status || 'pending',
        topThree,
        firstPlace,
        description: `${eventLabel.value || gradeLabel(group.grade)} · 第 ${roundIndex + 1} 輪${match?.classNames?.length ? ' · ' + match.classNames.join(' 對 ') : ''}`,
      }
      rowNodes.push(node)
      nodes.push(node)
    }
    rows.push({ number: roundIndex + 1, label: roundIndex === roundCount - 1 ? national.value ? '全國總冠軍賽' : regional.value ? '縣市冠軍決賽' : '年級冠軍決賽' : `第 ${roundIndex + 1} 輪`, y })
    previous = rowNodes
  })

  const roots = previous
  const visibleNodes = []
  const visibleLeaves = []
  let slotCount = 0
  const leafY = TOP + roundCount * rowGap
  const hiddenDescendantCount = item => item.children.reduce((count, child) =>
    count + 1 + (child.entry ? 0 : hiddenDescendantCount(child)), 0)
  function allocateSlot(item) {
    item.x = GUTTER + (slotCount + 0.5) * slotWidth
    item.left = item.x - slotWidth / 2
    item.right = item.x + slotWidth / 2
    slotCount++
  }
  function layoutItem(item) {
    if (item.entry) {
      allocateSlot(item)
      item.y = leafY
      visibleLeaves.push(item)
      return item
    }
    item.folded = collapsedIds.has(item.id) && item.children.length > 0
    if (item.folded) {
      item.hiddenCount = hiddenDescendantCount(item)
      allocateSlot(item)
    } else if (item.children.length) {
      const children = item.children.map(layoutItem)
      item.left = children[0].left
      item.right = children.at(-1).right
      item.x = (item.left + item.right) / 2
    } else {
      allocateSlot(item)
    }
    visibleNodes.push(item)
    return item
  }
  roots.forEach(layoutItem)

  const width = Math.max(320, GUTTER + slotCount * slotWidth + 20)
  for (const node of visibleNodes) node.style = {
    left: `${node.x / width * 100}%`, top: `${node.y}px`,
    '--class-color': getClass(node.firstPlace?.classId || node.match?.winnerClassId)?.color || '#c7cfc1',
  }
  const maxVisibleY = Math.max(TOP, ...visibleNodes.map(node => node.y + nodeHeight / 2),
    ...visibleLeaves.map(leaf => leaf.y + leafHeight / 2))
  const height = maxVisibleY + 24
  const visibleRoundIndexes = new Set(visibleNodes.map(node => node.roundIndex))
  for (const round of rows) round.visible = visibleRoundIndexes.has(round.number - 1)

  function createLinks(node) {
    if (node.folded) return
    const children = node.children
    if (!children.length) return
    const jointY = (children[0].y + node.y) / 2
    for (const child of children) {
      links.push({ id: `${child.id}-${node.id}`,
        path: `M ${child.x} ${child.y - (child.entry ? leafHeight : nodeHeight) / 2} V ${jointY} H ${node.x}`,
        advanced: ['done', 'bye'].includes(node.match?.status) })
    }
    links.push({ id: `${node.id}-stem`,
      path: `M ${node.x} ${jointY} V ${node.y + nodeHeight / 2}`,
      advanced: ['done', 'bye'].includes(node.match?.status) })
    for (const child of children) if (!child.entry) createLinks(child)
  }
  roots.forEach(createLinks)

  return {
    width, height, rows: rows.filter(row => row.visible), nodes: visibleNodes, leaves: visibleLeaves, links,
    rootStyle: { left: `${roots[0].x / width * 100}%` },
    style: { minWidth: `${width}px`, height: `${height}px` },
  }
}

const grades = computed(() => props.meet.grades.filter(group => group.entrants.length)
  .map(group => ({ ...group, tree: buildTree(group, collapsedNodeIds.value) })))
</script>

<template>
  <div class="wind-summary" :class="{ 'regional-summary': representative, 'national-championship-summary': national }">
    <div class="panel wind-summary-header">
      <div><span class="eyebrow">{{ national ? 'NATIONAL CUP' : regional ? 'REGIONAL CUP' : 'WIND RUNNERS' }}</span><h1>{{ national ? meet.eventName : regional ? meet.friendly ? meet.city + '校際友誼賽' : meet.eventName : '風速小子選拔賽' }}</h1><p>{{ national ? meet.cities.length + ' 個縣市' : regional ? meet.schoolIds.length + ' 所學校' : meet.schoolName }} · {{ dateText(meet.startedAt) }}</p><span class="muted">{{ meet.completedMatches }} / {{ meet.totalMatches }} 場對戰 · {{ meet.status === 'complete' ? '比賽完成' : '比賽進行中' }}{{ meet.friendly ? ' · 不列入正式紀錄' : '' }}</span></div>
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

    <section v-if="national && meet.grades[0].podium?.length" class="panel national-final-summary">
      <div class="section-title"><h2><Icon name="trophy" :size="22" />全國總冠軍賽成績</h2><span class="muted">{{ meet.friendly ? '友誼賽 · 不列入正式紀錄' : '前六名列入個人榮譽紀錄' }}</span></div>
      <div class="national-final-results"><button v-for="result in meet.grades[0].podium" :key="result.studentId" class="national-final-result" :class="{ winner: result.place === 1 }" @click="game.studentId = result.studentId"><b>{{ nationalPodiumLabel(result.place, meet.friendly) }}</b><span><strong>{{ result.name }}</strong><small>{{ result.city }} · {{ result.schoolName }} · {{ result.className }}</small></span><strong class="mono">{{ timeText(result.time) }}s</strong></button></div>
    </section>

    <section v-if="regional && meet.friendly" class="panel region-friendly-summary"><div v-for="match in friendlyResults" :key="match.id" class="region-friendly-heat"><h2>第 {{ match.number }} 組</h2><div class="table-wrap"><table class="data-table"><thead><tr><th>名次</th><th>學生</th><th>學校 / 班級</th><th>秒數</th></tr></thead><tbody><tr v-for="(result, index) in match.results" :key="result.studentId"><td>{{ index + 1 }}</td><td><button class="text-button" @click="game.studentId = result.studentId">{{ result.name }}</button></td><td>{{ result.schoolName }} / {{ result.className }}</td><td class="mono">{{ timeText(result.time) }}s</td></tr></tbody></table></div></div></section>
    <section v-for="group in regional && meet.friendly ? [] : grades" :key="group.grade" class="panel wind-grade-summary">
      <div class="section-title wind-bracket-heading"><div><h2>{{ national ? meet.friendly ? '跨縣市友誼淘汰賽' : '風神爭奪戰' : regional ? '風速王子爭奪戰' : gradeLabel(group.grade) }}</h2><span class="muted">{{ group.entrants.length }} {{ national ? '個縣市' : regional ? '所學校' : '個班級' }}</span></div><div v-if="representative" class="wind-tree-controls" role="group" aria-label="樹狀歷程顯示方式"><button class="btn secondary" :disabled="!treeExpanded" @click="collapseWholeTree">全部摺疊</button><button class="btn secondary" :disabled="treeExpanded && collapsedNodeIds.size === 0" @click="expandWholeTree">全部展開</button></div></div>
      <div v-if="representative && !treeExpanded" class="wind-tree-collapsed" role="status"><Icon name="flag" :size="19" /><span>淘汰歷程已摺疊</span><strong v-if="group.champion">{{ crownTitle(group) }}：{{ group.champion.name }} · {{ timeText(group.champion.time) }} 秒</strong><strong v-else>比賽進行中 · {{ meet.completedMatches }} / {{ meet.totalMatches }} 場</strong></div>
      <div v-else class="wind-tree-viewport" tabindex="0" role="region" :aria-label="`${eventLabel || gradeLabel(group.grade)}淘汰樹，第一輪在下方，冠軍在上方`">
        <div class="wind-tree" :style="group.tree.style">
          <svg class="wind-tree-links" :viewBox="`0 0 ${group.tree.width} ${group.tree.height}`" preserveAspectRatio="none" aria-hidden="true">
            <path v-for="link in group.tree.links" :key="link.id" :d="link.path" :class="{ advanced: link.advanced }" />
          </svg>
          <span class="wind-tree-crown" :class="{ 'wind-prince-badge': crownKind(group) === 'prince', 'wind-god-badge': crownKind(group) === 'god' }" :style="group.tree.rootStyle"><Icon :name="crownKind(group) === 'god' ? 'bolt' : crownKind(group) === 'prince' ? 'flag' : 'trophy'" :size="19" />{{ crownTitle(group) }}</span>
          <span v-for="row in group.tree.rows" :key="row.number" class="wind-tree-round-label" :style="{ top: `${row.y}px` }">{{ row.label }}</span>

          <article v-for="leaf in group.tree.leaves" :key="leaf.id" class="wind-tree-leaf" :style="{ left: `${leaf.x / group.tree.width * 100}%`, top: `${leaf.y}px`, '--class-color': leaf.color }">
            <strong :title="leaf.entry.city || leaf.entry.schoolName || leaf.entry.className">{{ leaf.entry.city || leaf.entry.schoolName || leaf.entry.className }}</strong>
            <span v-for="student in leaf.students" :key="student.id"><strong><small v-if="representative">{{ national ? getSchool(student.schoolId)?.name : '' }} {{ getClass(student.classId)?.name }} </small>{{ student.name }}</strong><small v-if="student.raceTime !== null" class="mono">{{ timeText(student.raceTime) }}s</small><small v-else-if="student.firstRoundBye">輪空</small></span>
          </article>

          <div
            v-for="node in group.tree.nodes" :key="node.id"
            class="wind-tree-node"
            :style="node.style"
            >
            <button class="wind-tree-node-select" :class="{ champion: node.champion, bye: node.status === 'bye', pending: node.status === 'pending' }" :disabled="node.status === 'bye' || !node.firstPlace?.studentId"
              :title="`${node.description} · ${node.topThree.map(result => [result.city, result.schoolName, result.className, result.name, result.time != null ? timeText(result.time) + 's' : ''].filter(Boolean).join(' ')).join('，')}`" :aria-label="`${node.description} · ${node.topThree.map((result, index) => `${index + 1}名 ${result.schoolName || ''} ${result.className} ${result.name}${result.time != null ? ' ' + timeText(result.time) + ' 秒' : ''}`).join('，')}`"
              @click="node.firstPlace?.studentId && (game.studentId = node.firstPlace.studentId)">
              <span v-if="node.status === 'bye'" class="wind-tree-bye-label">輪空晉級</span>
              <span v-else v-for="(result, index) in node.topThree" :key="result.studentId" class="wind-tree-place" :class="{ first: index === 0 }">
                <i>{{ index + 1 }}</i><span class="wind-tree-place-name"><small v-if="representative" :title="[result.city, result.schoolName].filter(Boolean).join(' · ')">{{ national ? result.city + ' · ' : '' }}{{ result.schoolName }}</small><small>{{ result.className }}</small><strong>{{ result.name }}</strong></span>
                <b v-if="result.time != null" class="mono">{{ timeText(result.time) }}s</b>
              </span>
              <span v-if="!node.topThree.length" class="wind-tree-pending-label">等待比賽</span>
            </button>
            <button v-if="node.children.length" class="wind-tree-node-fold" :aria-expanded="!node.folded" :aria-label="`${node.folded ? '展開' : '摺疊'}${node.description}下方分支`" :title="node.folded ? `展開分支（${node.hiddenCount} 個項目）` : '摺疊下方分支'" @click="toggleNode(node.id)">{{ node.folded ? '+' : '−' }}</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
