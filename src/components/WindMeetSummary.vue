<script setup vapor>
import { computed } from 'vue'
import { game, getClass, timeText, dateText } from '../lib/game.js'
import Icon from './Icon.vue'

const props = defineProps({ meet: Object })
defineEmits(['back'])
const gradeLabel = grade => ['一年級', '二年級', '三年級'][grade - 1]
const NODE_HEIGHT = 84
const ROW_GAP = 124
const TOP = 84
const GUTTER = 84
const SLOT_WIDTH = 156

function buildTree(group) {
  const firstCount = group.rounds[0]?.matches.length || 1
  const counts = [firstCount]
  while (counts.at(-1) > 1) counts.push(Math.ceil(counts.at(-1) / 2))
  const width = Math.max(320, GUTTER + firstCount * SLOT_WIDTH + 20)
  const height = TOP + (counts.length - 1) * ROW_GAP + NODE_HEIGHT / 2 + 54
  const rows = []
  const nodes = []
  const links = []
  let previous = []

  counts.forEach((count, roundIndex) => {
    const savedRound = group.rounds[roundIndex]
    const y = TOP + (counts.length - roundIndex - 1) * ROW_GAP
    const rowNodes = []
    for (let index = 0; index < count; index++) {
      const match = savedRound?.matches[index]
      const children = previous.slice(index * 2, index * 2 + 2)
      // Parents sit over their descendant span, including uneven bye branches.
      const left = children[0]?.left ?? GUTTER + (index + 0.5) * (width - GUTTER - 20) / firstCount
      const right = children.at(-1)?.right ?? left
      const x = (left + right) / 2
      const champion = Boolean(group.champion && roundIndex === counts.length - 1)
      const node = {
        id: match?.id || `${group.grade}-${roundIndex}-${index}`,
        match, x, y, left, right, champion,
        status: match?.status || 'pending',
        studentId: match?.winnerStudentId,
        name: match?.winnerName,
        time: match?.winnerTime,
        className: match?.classNames?.[match.classIds.indexOf(match.winnerClassId)] || '',
        classPair: roundIndex === 0 ? (match?.classNames || []).map((className, classIndex) => ({
          name: className,
          color: getClass(match.classIds[classIndex])?.color || '#c7cfc1',
        })) : [],
        style: {
          left: `${x / width * 100}%`, top: `${y}px`,
          '--class-color': getClass(match?.winnerClassId)?.color || '#c7cfc1',
        },
        description: `${gradeLabel(group.grade)} · 第 ${roundIndex + 1} 輪${match?.classNames.length ? ' · ' + match.classNames.join(' 對 ') : ''}`,
      }
      const jointY = children.length ? (children[0].y + y) / 2 : y
      for (const child of children) {
        links.push({
          id: `${child.id}-${node.id}`,
          path: `M ${child.x} ${child.y - NODE_HEIGHT / 2} V ${jointY} H ${x}`,
          advanced: Boolean(match?.winnerClassId && match.winnerClassId === child.match?.winnerClassId),
        })
      }
      if (children.length) links.push({
        id: `${node.id}-stem`,
        path: `M ${x} ${jointY} V ${y + NODE_HEIGHT / 2}`,
        advanced: Boolean(match?.winnerClassId),
      })
      rowNodes.push(node)
      nodes.push(node)
    }
    rows.push({ number: roundIndex + 1, label: roundIndex === counts.length - 1 ? '冠軍賽' : `第 ${roundIndex + 1} 輪`, y })
    previous = rowNodes
  })
  return {
    width, height, rows, nodes, links,
    rootStyle: { left: `${previous[0].x / width * 100}%` },
    style: { minWidth: `${width}px`, height: `${height}px` },
  }
}

const grades = computed(() => props.meet.grades.filter(group => group.entrants.length)
  .map(group => ({ ...group, tree: buildTree(group) })))
</script>

<template>
  <div class="wind-summary">
    <div class="panel wind-summary-header">
      <div><span class="eyebrow">WIND RUNNERS</span><h1>風速小子選拔賽</h1><p>{{ meet.schoolName }} · {{ dateText(meet.startedAt) }}</p><span class="muted">{{ meet.completedMatches }} / {{ meet.totalMatches }} 場對戰 · {{ meet.status === 'complete' ? '選拔完成' : '選拔進行中' }}</span></div>
      <button class="btn primary" @click="$emit('back')"><Icon name="back" :size="17" />回比賽選單</button>
    </div>
    <section v-for="group in grades" :key="group.grade" class="panel wind-grade-summary">
      <div class="section-title"><h2>{{ gradeLabel(group.grade) }}</h2><span class="muted">{{ group.entrants.length }} 個班級</span></div>
      <div class="wind-tree-viewport" tabindex="0" role="region" :aria-label="`${gradeLabel(group.grade)}淘汰樹，第一輪在下方，冠軍在上方`">
        <div class="wind-tree" :style="group.tree.style">
          <svg class="wind-tree-links" :viewBox="`0 0 ${group.tree.width} ${group.tree.height}`" preserveAspectRatio="none" aria-hidden="true">
            <path v-for="link in group.tree.links" :key="link.id" :d="link.path" :class="{ advanced: link.advanced }" />
          </svg>
          <span class="wind-tree-crown" :style="group.tree.rootStyle"><Icon name="trophy" :size="19" />{{ group.champion ? '風速小子' : '冠軍' }}</span>
          <span v-for="row in group.tree.rows" :key="row.number" class="wind-tree-round-label" :style="{ top: `${row.y}px` }">{{ row.label }}</span>
          <template v-for="node in group.tree.nodes" :key="node.id">
            <button
              class="wind-tree-node" :class="{ champion: node.champion, bye: node.status === 'bye', pending: node.status === 'pending' }"
              :style="node.style" :disabled="!node.studentId"
              :title="node.description" :aria-label="`${node.description} · ${node.name || (node.status === 'bye' ? '輪空' : '等待比賽')}${node.className ? ' · ' + node.className : ''}${node.time != null ? ' · ' + timeText(node.time) + ' 秒' : ''}`"
              @click="game.studentId = node.studentId"
            >
              <strong>{{ node.name || (node.status === 'bye' ? '輪空' : '等待比賽') }}</strong>
              <small v-if="node.className">{{ node.className }}</small>
              <b class="mono">{{ node.time != null ? timeText(node.time) + 's' : '—' }}</b>
            </button>
            <div v-if="node.classPair.length" class="wind-tree-class-pair" :style="{ left: node.style.left, top: `${node.y + 53}px` }" :aria-label="node.classPair.map(team => team.name).join(' 對 ')">
              <span v-for="(team, index) in node.classPair" :key="`${node.id}-${index}`" :style="{ '--class-color': team.color }">{{ team.name }}</span>
              <span v-if="node.classPair.length === 1" class="wind-tree-bye-label">輪空</span>
            </div>
          </template>
        </div>
      </div>
    </section>
  </div>
</template>
