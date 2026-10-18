<script setup vapor>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { game, getClass, getSchool, getStudent, timeText, dateText } from '../lib/game.js'
import Icon from './Icon.vue'
import PixelRunner from './PixelRunner.vue'

const props = defineProps({ meet: { type: Object, required: true } })
defineEmits(['close'])
const collapsedIds = ref(new Set())
const selectedRoster = ref(null)
const treeViewport = ref(null)
const entrants = computed(() => props.meet?.entrants || [])
const entrantsById = computed(() => new Map(entrants.value.map(entry => [entry.classId, entry])))
const rounds = computed(() => (props.meet?.rounds || []).slice().sort((first, second) => first.number - second.number))
const matches = computed(() => rounds.value.flatMap(round => (round.matches || []).map(match => ({ ...match, round: match.round ?? round.number, isFinal: round.isFinal || match.final }))))
const school = computed(() => getSchool(props.meet?.schoolId))
const completedCount = computed(() => matches.value.filter(match => ['done', 'complete', 'bye'].includes(match.status)).length)
const champion = computed(() => props.meet?.champion || (props.meet?.friendly && props.meet.status === 'complete'
  ? matches.value.flatMap(match => match.results || []).find(result => result.place === 1) : null))
const roster = computed(() => {
  game.revision
  const selection = selectedRoster.value
  if (!selection) return []
  const entry = entrantsById.value.get(selection.classId)
  const result = selection.result
  return (result?.studentIds || entry?.studentIds || []).map((id, index) => {
    const leg = result?.legs?.find(item => item.studentId === id) || result?.splits?.find(item => item.studentId === id) || result?.legs?.[index]
    const student = leg?.student || result?.lineup?.find(item => item.id === id || item.studentId === id) || result?.students?.find(item => item.id === id) || getStudent(id)
    const duration = Number.isFinite(leg?.time) ? leg.time : Number.isFinite(leg?.endTime) && Number.isFinite(leg?.startTime) ? leg.endTime - leg.startTime : null
    return { id, index, student, duration }
  })
})
watch(() => props.meet?.id, () => { collapsedIds.value = new Set(); selectedRoster.value = null })

function entrantFor(classId) {
  return entrantsById.value.get(classId) || getClass(classId) || { classId, className: '班級', color: '#b4d890', studentIds: [] }
}
function teamName(team) { return team.className || entrantFor(team.classId).className || getClass(team.classId)?.name || '班級' }
function teamColor(team) { return team.color || entrantFor(team.classId).color || '#b4d890' }
function resultsFor(match) {
  const results = (match.results || []).slice().sort((first, second) => (first.place || Infinity) - (second.place || Infinity) || (first.time ?? Infinity) - (second.time ?? Infinity))
  const known = new Set(results.map(result => result.classId))
  return [...results, ...(match.classIds || []).filter(id => !known.has(id)).map(classId => ({ ...entrantFor(classId), classId, time: null, place: null }))]
}
function qualified(match, classId) { return (match.qualifiedClassIds || []).includes(classId) }
function qualificationLabel(match, team) {
  if (match.status === 'bye') return '輪空晉級'
  if (!['done', 'complete'].includes(match.status)) return '待賽'
  if ((match.isFinal || props.meet?.friendly) && (champion.value?.classId === team.classId || team.place === 1)) return '冠軍'
  if (qualified(match, team.classId)) return '晉級'
  return match.isFinal || props.meet?.friendly ? '完賽' : '止步本輪'
}
function toggleNode(id) {
  const next = new Set(collapsedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsedIds.value = next
}
function expandAll() { collapsedIds.value = new Set() }
function collapseAll() { collapsedIds.value = new Set(matches.value.map(match => match.id)) }
function selectRoster(classId, result = null) { selectedRoster.value = { classId, result } }
function rosterName() { return selectedRoster.value ? teamName({ classId: selectedRoster.value.classId }) : '' }
function representatives(entry) {
  game.revision
  return (entry.studentIds || []).slice(0, 3).map(id => ({ id, student: getStudent(id) }))
}

const tree = computed(() => {
  const allMatches = matches.value
  const byId = new Map(allMatches.map(match => [match.id, match]))
  // A source can feed several later groups. Keep one node and link every edge.
  const referenced = new Set(allMatches.flatMap(match => match.sourceMatchIds || []).filter(id => byId.has(id)))
  const roots = allMatches.filter(match => !referenced.has(match.id))
  const visibleIds = new Set()
  const visibleClassIds = new Set()
  const visit = match => {
    if (!match || visibleIds.has(match.id)) return
    visibleIds.add(match.id)
    if (collapsedIds.value.has(match.id)) return
    const sources = (match.sourceMatchIds || []).map(id => byId.get(id)).filter(Boolean)
    if (sources.length) sources.forEach(visit)
    else (match.classIds || []).forEach(id => visibleClassIds.add(id))
  }
  roots.forEach(visit)
  if (!allMatches.length) entrants.value.forEach(entry => visibleClassIds.add(entry.classId))
  const leafEntries = entrants.value.filter(entry => visibleClassIds.has(entry.classId))
  const visibleRounds = rounds.value.map(round => ({ ...round, matches: allMatches.filter(match => match.round === round.number && visibleIds.has(match.id)) })).filter(round => round.matches.length)
  const padding = 104
  const nodeWidth = 244
  const leafWidth = 148
  const slotWidth = 160
  const width = Math.max(640, leafEntries.length * slotWidth + padding * 2, ...visibleRounds.map(round => round.matches.length * (nodeWidth + 24) + padding * 2))
  const leafX = new Map(leafEntries.map((entry, index) => [entry.classId, padding + (index + .5) * (width - padding * 2) / Math.max(1, leafEntries.length)]))
  const nodes = []
  const rowLabels = []
  const positions = new Map()
  let y = champion.value ? 120 : 42
  // Final at the top, first-round matches above the entrants at the bottom.
  for (const round of visibleRounds.slice().reverse()) {
    const nodeHeight = Math.max(110, ...round.matches.map(match => 50 + resultsFor(match).length * 42))
    const sorted = round.matches.slice().sort((first, second) => first.number - second.number)
    const desired = sorted.map(match => {
      const xs = (match.classIds || []).map(id => leafX.get(id)).filter(Number.isFinite)
      return xs.length ? xs.reduce((sum, value) => sum + value, 0) / xs.length : width / 2
    })
    const centers = desired.slice()
    const lower = padding + nodeWidth / 2
    const upper = width - padding - nodeWidth / 2
    for (let index = 0; index < centers.length; index++) centers[index] = Math.max(lower, centers[index], index ? centers[index - 1] + nodeWidth + 24 : lower)
    if (centers.at(-1) > upper) {
      centers[centers.length - 1] = upper
      for (let index = centers.length - 2; index >= 0; index--) centers[index] = Math.min(centers[index], centers[index + 1] - nodeWidth - 24)
    }
    for (let index = 0; index < sorted.length; index++) {
      const match = sorted[index]
      const x = centers[index]
      const node = { ...match, teams: resultsFor(match), x, y, width: nodeWidth, height: nodeHeight, folded: collapsedIds.value.has(match.id) }
      nodes.push(node)
      positions.set(match.id, node)
    }
    rowLabels.push({ id: round.number, y: y + nodeHeight / 2, label: round.isFinal || sorted.some(match => match.final) ? '決賽' : `第 ${round.number} 輪` })
    y += nodeHeight + 76
  }
  const leaves = leafEntries.map(entry => ({ ...entry, x: leafX.get(entry.classId), y, width: leafWidth, height: 108, representatives: representatives(entry) }))
  const leavesById = new Map(leaves.map(leaf => [leaf.classId, leaf]))
  const links = []
  const pathBetween = (sourceX, sourceY, targetX, targetY) => {
    const middle = (sourceY + targetY) / 2
    return `M ${sourceX} ${sourceY} C ${sourceX} ${middle}, ${targetX} ${middle}, ${targetX} ${targetY}`
  }
  for (const node of nodes) {
    if (node.folded) continue
    const sources = (node.sourceMatchIds || []).map(id => positions.get(id)).filter(Boolean)
    if (sources.length) {
      for (const source of sources) {
        const advancing = (source.qualifiedClassIds || []).filter(id => (node.classIds || []).includes(id))
        links.push({ id: `${source.id}:${node.id}`, path: pathBetween(source.x, source.y, node.x, node.y + node.height), advanced: advancing.length > 0, label: advancing.map(id => teamName({ classId: id })).join('、') || '前輪來源' })
      }
    } else {
      for (const classId of node.classIds || []) {
        const leaf = leavesById.get(classId)
        if (leaf) links.push({ id: `${classId}:${node.id}`, path: pathBetween(leaf.x, leaf.y, node.x, node.y + node.height), advanced: qualified(node, classId), label: teamName({ classId }) })
      }
    }
  }
  const championshipNode = champion.value && nodes.find(node => (node.isFinal || props.meet?.friendly) && (node.classIds || []).includes(champion.value.classId))
  if (championshipNode) links.push({ id: 'champion', path: pathBetween(championshipNode.x, championshipNode.y, width / 2, 88), advanced: true, label: '接力冠軍' })
  return { width, height: y + (leaves.length ? 132 : 0) + 22, nodes, leaves, links, rowLabels, crownX: width / 2 }
})
async function centerTree() {
  await nextTick()
  const viewport = treeViewport.value
  if (viewport) viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2
}
onMounted(centerTree)
watch(() => tree.value.width, centerTree)
</script>

<template>
  <div class="relay-meet-summary">
    <header class="panel relay-summary-header">
      <div><span class="eyebrow">{{ meet.friendly ? 'FRIENDLY RELAY' : 'SCHOOL RELAY MEET' }}</span><h1>{{ school?.name || meet.schoolName || '全校' }} · 大隊接力歷程</h1><p>{{ entrants.length }} 個班級 · 每班 16 棒 · 1600 公尺</p><p class="muted">{{ meet.startedAt ? dateText(meet.startedAt) : '' }}{{ meet.startedAt ? ' · ' : '' }}{{ meet.status === 'complete' ? '賽程完成' : '賽程進行中' }} · {{ completedCount }} / {{ matches.length }} 場</p></div>
      <button type="button" class="btn primary" @click="$emit('close')"><Icon name="back" :size="17" />{{ meet.status === 'complete' ? '回比賽選單' : '返回' }}</button>
    </header>
    <section class="panel relay-tree-panel">
      <div class="section-title relay-tree-heading"><div><h2><Icon name="flag" :size="19" />{{ meet.friendly ? '班級友誼對跑' : '通往風速小班' }}</h2><p class="muted">由下往上查看各輪。每場列出所有班級、總秒數及晉級結果。</p></div><div class="relay-tree-controls"><button type="button" class="btn small" @click="expandAll">全部展開 +</button><button type="button" class="btn small" @click="collapseAll">全部收合 −</button></div></div>
      <div ref="treeViewport" class="relay-tree-viewport" tabindex="0" role="region" aria-label="接力賽歷程樹，底部為參賽班級，依輪次向上至冠軍；可左右捲動">
        <div class="relay-tree" :style="{ width: tree.width + 'px', height: tree.height + 'px' }">
          <svg class="relay-tree-links" :viewBox="`0 0 ${tree.width} ${tree.height}`" aria-hidden="true"><path v-for="link in tree.links" :key="link.id" :d="link.path" :class="{ advanced: link.advanced }"><title>{{ link.label }}</title></path></svg>
          <div v-if="champion" class="relay-tree-crown" :style="{ left: tree.crownX + 'px' }"><Icon name="trophy" :size="25" /><span><small>{{ meet.friendly ? '友誼賽冠軍' : champion.title || '風速小班' }}</small><strong>{{ champion.className || teamName(champion) }}</strong></span><b class="mono">{{ timeText(champion.time) }}s</b></div>
          <span v-for="row in tree.rowLabels" :key="row.id" class="relay-round-label" :style="{ top: row.y + 'px' }">{{ row.label }}</span>
          <article v-for="node in tree.nodes" :key="node.id" class="relay-match-node" :class="{ final: node.isFinal, pending: node.status === 'pending', bye: node.status === 'bye' }" :style="{ left: node.x + 'px', top: node.y + 'px', width: node.width + 'px', height: node.height + 'px' }">
            <header><strong>{{ node.isFinal ? '決賽' : '第 ' + node.round + ' 輪' }} · 第 {{ node.number }} 組</strong><small>{{ node.status === 'bye' ? '單班輪空' : node.status === 'pending' ? '等待比賽' : node.isFinal ? '決賽成績' : '取前 ' + node.qualifyCount + ' 班' }}</small></header>
            <button type="button" v-for="team in node.teams" :key="team.classId" class="relay-match-team" :class="{ qualified: qualified(node, team.classId), champion: (node.isFinal || meet.friendly) && team.place === 1 }" :style="{ '--team-color': teamColor(team) }" :title="teamName(team) + ' · 查看16棒名單'" @click="selectRoster(team.classId, team)">
              <span class="relay-result-place">{{ team.place || '—' }}</span><i class="relay-uniform" aria-hidden="true"></i><span class="relay-result-class"><strong>{{ teamName(team) }}</strong><small :class="{ advance: qualified(node, team.classId) || node.status === 'bye' }">{{ qualificationLabel(node, team) }}</small></span><b class="mono">{{ team.time != null ? timeText(team.time) + 's' : '—' }}</b>
            </button>
            <button type="button" class="relay-node-fold" :aria-expanded="!node.folded" :aria-label="(node.folded ? '展開' : '收合') + '第' + node.round + '輪第' + node.number + '組來源分支'" :title="node.folded ? '展開來源分支' : '收合來源分支'" @click="toggleNode(node.id)">{{ node.folded ? '+' : '−' }}</button>
          </article>
          <button type="button" v-for="entry in tree.leaves" :key="entry.classId" class="relay-entrant-leaf" :style="{ left: entry.x + 'px', top: entry.y + 'px', width: entry.width + 'px', height: entry.height + 'px', '--team-color': entry.color }" :title="teamName(entry) + ' · 查看16棒名單'" @click="selectRoster(entry.classId)"><strong>{{ teamName(entry) }}</strong><span class="relay-leaf-runners"><PixelRunner v-for="athlete in entry.representatives" :key="athlete.id" :seed="String(athlete.id)" :gender="athlete.student?.gender" :height="athlete.student?.height" :weight="athlete.student?.weight" :color="entry.color" :size="28" /></span><small>{{ entry.studentIds?.length || 16 }} 位隊員 · 查看棒次</small></button>
        </div>
      </div>
      <p class="relay-tree-note">點選班級查看 16 棒名單；節點右上角可收合來源分支。橘色連線表示晉級，同一組可能連到多個後續組別。</p>
    </section>
    <section v-if="selectedRoster" class="panel relay-summary-roster">
      <div class="section-title"><div><span class="eyebrow">16 LEGS · ONE TEAM</span><h2>{{ rosterName() }} · 接力名單</h2></div><div class="relay-roster-controls"><b v-if="selectedRoster.result?.time != null" class="mono">{{ timeText(selectedRoster.result.time) }}s</b><button type="button" class="btn small" @click="selectedRoster = null"><Icon name="close" :size="15" />收合名單</button></div></div>
      <div class="relay-summary-roster-grid"><button type="button" v-for="athlete in roster" :key="athlete.id" class="relay-summary-athlete" @click="game.studentId = athlete.id"><b>{{ athlete.index + 1 }}</b><PixelRunner :seed="String(athlete.id)" :gender="athlete.student?.gender" :height="athlete.student?.height" :weight="athlete.student?.weight" :color="teamColor({ classId: selectedRoster.classId })" :size="32" /><span><strong>{{ athlete.student?.name || '接力隊員' }}</strong><small>{{ athlete.student?.studentNumber || '第 ' + (athlete.index + 1) + ' 棒' }}</small></span><small v-if="athlete.duration != null" class="mono">{{ timeText(athlete.duration) }}s</small></button></div>
    </section>
  </div>
</template>

<style scoped>
.relay-meet-summary { display: grid; gap: 20px; min-width: 0; color: #263c59; }
.relay-summary-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; padding: 20px 24px; }
.relay-summary-header h1 { margin: 7px 0; font-size: clamp(21px, 2.8vw, 30px); }
.relay-summary-header p { margin: 8px 0; font-size: 13px; }
.relay-summary-header .muted { font-size: 11px; }
.relay-tree-panel { min-width: 0; padding: 18px; }
.relay-tree-heading { margin-top: 0; align-items: flex-start; flex-wrap: wrap; gap: 12px; }
.relay-tree-heading h2 { display: flex; align-items: center; gap: 7px; margin: 0 0 7px; font-size: 19px; }
.relay-tree-heading p { margin: 0; font-size: 11px; }
.relay-tree-controls { display: flex; flex-wrap: wrap; gap: 8px; }
.relay-tree-viewport { max-width: 100%; overflow: auto; border: 1px solid #c9bda0; border-radius: 6px; background: #f7f1dd; scrollbar-color: #bc9865 #eee5cd; }
.relay-tree-viewport:focus-visible { outline: 3px solid #bf743c; outline-offset: 3px; }
.relay-tree { position: relative; background-image: radial-gradient(#d6cbb1 1px, transparent 1px); background-size: 16px 16px; }
.relay-tree-links { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
.relay-tree-links path { fill: none; stroke: #a7b7a1; stroke-width: 2; }
.relay-tree-links path.advanced { stroke: #cb8050; stroke-width: 3; }
.relay-tree-crown { position: absolute; top: 18px; transform: translateX(-50%); min-height: 68px; display: flex; align-items: center; gap: 13px; padding: 9px 16px; border: 2px solid #a45b32; border-radius: 6px; background: #ffdc7a; color: #8a431d; box-shadow: 3px 3px 0 #a45b3230; white-space: nowrap; }
.relay-tree-crown > span { display: grid; gap: 5px; }
.relay-tree-crown small { font-size: 11px; font-weight: 800; }
.relay-tree-crown strong { font-size: 17px; }
.relay-tree-crown b { font-size: 19px; }
.relay-round-label { position: absolute; left: 14px; transform: translateY(-50%); padding: 5px 7px; border-radius: 4px; background: #e9e0cb; color: #8a6546; font-size: 12px; font-weight: 800; }
.relay-match-node { position: absolute; transform: translateX(-50%); display: flex; flex-direction: column; padding: 7px; border: 2px solid #53665f; border-radius: 6px; background: #fffdf4; box-shadow: 3px 4px 0 #5061532c; }
.relay-match-node.final { background: #fff0bd; border-color: #a66b3c; box-shadow: 3px 4px 0 #a66b3c30; }
.relay-match-node.pending { border-style: dashed; background: #f1ede2; box-shadow: none; }
.relay-match-node.bye { border-style: dashed; background: #f0f2e7; box-shadow: none; }
.relay-match-node > header { display: flex; justify-content: space-between; align-items: center; gap: 7px; min-height: 30px; padding: 0 2px 6px; color: #697a6d; font-size: 10px; }
.relay-match-node > header strong { color: #845232; font-size: 11px; }
.relay-match-node > header small { font-size: 9px; white-space: nowrap; }
.relay-match-team { display: grid; grid-template-columns: 14px 19px minmax(0, 1fr) auto; align-items: center; gap: 6px; min-height: 42px; padding: 4px; border: 0; border-top: 1px solid #d6dccc; border-radius: 3px; background: transparent; color: #263c59; text-align: left; cursor: pointer; }
.relay-match-team:hover, .relay-match-team:focus-visible { outline: 2px solid #c7793c; outline-offset: -1px; background: #ffefc0; }
.relay-match-team.qualified { background: #f0f5db; }
.relay-match-team.champion { background: #ffdf8c; }
.relay-result-place { color: #a05a36; font-size: 10px; font-weight: 800; text-align: center; }
.relay-uniform { width: 17px; height: 16px; background: var(--team-color, #b4d890); border: 1px solid #263c595e; clip-path: polygon(22% 0, 38% 0, 43% 14%, 57% 14%, 62% 0, 78% 0, 100% 23%, 84% 42%, 73% 32%, 73% 100%, 27% 100%, 27% 32%, 16% 42%, 0 23%); }
.relay-result-class { min-width: 0; display: grid; gap: 3px; }
.relay-result-class strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.relay-result-class small { color: #899382; font-size: 9px; }
.relay-result-class small.advance { width: fit-content; padding: 1px 4px; border: 1px solid #96af7b; border-radius: 3px; background: #e2edba; color: #4f783f; font-size: 8px; font-weight: 800; }
.relay-match-team > b { color: #94532e; font-size: 12px; white-space: nowrap; }
.relay-node-fold { position: absolute; top: -11px; right: -11px; width: 25px; height: 25px; display: grid; place-items: center; border: 2px solid #fff9e8; border-radius: 50%; background: #a64c2e; color: #fff9e8; box-shadow: 1px 2px 0 #49321c50; font-size: 18px; font-weight: 800; line-height: 1; cursor: pointer; }
.relay-node-fold:hover, .relay-node-fold:focus-visible { background: #793025; outline: 2px solid #f4c56c; outline-offset: 2px; }
.relay-entrant-leaf { position: absolute; transform: translateX(-50%); display: grid; align-content: center; justify-items: center; gap: 8px; padding: 8px; border: 2px solid #67796b; border-top: 5px solid var(--team-color, #b4d890); border-radius: 6px; background: #fffdf4; color: #263c59; box-shadow: 2px 3px 0 #50615330; cursor: pointer; }
.relay-entrant-leaf:hover, .relay-entrant-leaf:focus-visible { background: #fff0bd; outline: 2px solid #c7793c; outline-offset: 2px; }
.relay-entrant-leaf > strong { max-width: 100%; overflow: hidden; color: #845232; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.relay-leaf-runners { display: flex; gap: 4px; }
.relay-entrant-leaf > small { color: #7a8878; font-size: 10px; }
.relay-tree-note { margin: 12px 0 0; color: #846849; font-size: 10px; line-height: 1.6; }
.relay-summary-roster { padding: 18px; }
.relay-summary-roster .section-title { flex-wrap: wrap; gap: 12px; margin-top: 0; }
.relay-summary-roster h2 { margin: 5px 0 0; font-size: 18px; }
.relay-roster-controls { display: flex; align-items: center; gap: 12px; }
.relay-roster-controls > b { color: #9c5530; font-size: 20px; }
.relay-summary-roster-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.relay-summary-athlete { min-width: 0; display: flex; align-items: center; gap: 7px; padding: 8px; border: 1px solid #b4c4b3; border-radius: 4px; background: #fffdf4; color: #263c59; text-align: left; cursor: pointer; }
.relay-summary-athlete:hover { border-color: #bf793d; background: #fff0bd; }
.relay-summary-athlete > b { flex-shrink: 0; width: 16px; color: #9e6a42; font: 800 11px var(--mono, monospace); text-align: center; }
.relay-summary-athlete > span { min-width: 0; flex: 1; display: grid; gap: 4px; }
.relay-summary-athlete strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.relay-summary-athlete small { color: #788875; font-size: 9px; }
.relay-summary-athlete > small { color: #9e6a42; white-space: nowrap; }
@media (max-width: 900px) { .relay-summary-roster-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 480px) { .relay-summary-header { padding: 16px; } .relay-tree-panel, .relay-summary-roster { padding: 12px; } .relay-summary-athlete { padding: 6px; gap: 4px; } .relay-summary-athlete :deep(.pixel-runner) { width: 26px; height: 26px; } .relay-summary-athlete > small { display: none; } }
</style>
