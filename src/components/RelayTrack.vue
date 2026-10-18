<script setup vapor>
import { computed, ref, useId } from 'vue'
import { game, getStudent } from '../lib/game.js'
import { TRACK, HOME_TRACK_VIEW, ovalPath } from '../lib/track-geometry.js'
import { relayPoint, relayStartLines, relayBreakLine, relayZoneMarkers } from '../lib/relay-track-geometry.js'
import { useTrackCamera } from '../lib/useTrackCamera.js'
import PixelRunner from './PixelRunner.vue'

const props = defineProps({
  runners: { type: Array, default: () => [] },
  waitingTeams: { type: Array, default: () => [] },
  paused: { type: Boolean, default: false },
  animated: { type: Boolean, default: true },
  playbackRate: { type: Number, default: 1 },
})
const surface = ref(null)
const { viewBox, canZoomOut, interaction, reset, pointerDown, pointerMove, pointerEnd, keyDown } = useTrackCamera(surface)
const prefix = `relay-track-${useId().replaceAll(':', '')}`
const grassId = `${prefix}-grass`
const trackId = `${prefix}-surface`
const lawnId = `${prefix}-lawn`
const fieldId = `${prefix}-field`
const fullViewBox = [HOME_TRACK_VIEW.x, HOME_TRACK_VIEW.y, HOME_TRACK_VIEW.width, HOME_TRACK_VIEW.height].join(' ')
const boundaries = Array.from({ length: 9 }, (_, index) => TRACK.innerRadius + index * TRACK.laneWidth)
const stripes = Array.from({ length: 18 }, (_, index) => index)
const zoneMarkers = relayZoneMarkers()
const startLines = relayStartLines()
const breakLine = relayBreakLine()
const runnerSize = 3.2
const waitingGroups = computed(() => props.waitingTeams.map((team, index) => ({ ...team,
  x: 5 + (index % 4) * 20, y: index < 4 ? -29 : 23,
})))
function waitingPosition(legIndex) {
  const slot = legIndex - 1
  return `translate(${slot % 5 * 3.5} ${Math.floor(slot / 5) * 4})`
}
const trees = [
  [-49, -23, 1.05], [-49, 13, .8], [-31, -47, 1], [8, -53, .9],
  [49, -53, .85], [94, -50, 1.1], [124, -32, .9], [135, -7, 1.05],
  [130, 25, .8], [-35, 47, .95], [112, 49, .9], [-51, 34, .75],
]
const displayedRunners = computed(() => {
  game.revision
  return props.runners.map(runner => {
    const student = getStudent(runner.studentId)
    return {
      ...runner,
      student,
      name: student?.name || runner.name || '接力跑者',
      point: relayPoint(runner.trackDistance, runner.lane, runner.trackLane),
      moving: (props.animated || props.paused) && Number(runner.speed) > .05 && Number(runner.opacity ?? 1) > 0,
    }
  }).sort((first, second) => first.point.y - second.point.y || Number(first.baton) - Number(second.baton))
})
const roleText = role => ({ receiving: '接棒預跑', receiver: '接棒預跑', waiting: '等待接棒', runout: '交棒後減速', outgoing: '交棒後減速', holder: '持棒奔跑' }[role] || '接力跑者')
const markerColor = kind => kind === 'end' || kind === 'exit' ? '#ffdc61' : kind === 'prepare' ? '#79d3e2' : '#fff9e8'
function runnerTransform(runner) {
  // PixelRunner stays upright; only its facing changes with the track tangent.
  return `translate(${runner.point.x - runnerSize / 2} ${runner.point.y - runnerSize * .95})`
}
function strideStyle(runner) {
  const cadence = Math.max(.20, Math.min(.38, .39 - Math.max(0, Number(runner.speed) || 0) * .022))
  const playbackRate = [1, 2, 4, 8, 16].includes(props.playbackRate) ? props.playbackRate : 1
  return { '--relay-stride-duration': `${cadence / playbackRate}s` }
}
</script>

<template>
  <div class="relay-track-explorer">
    <div ref="surface" class="relay-track-surface" :class="{ 'is-zoomed': canZoomOut, 'is-dragging': interaction.dragging }" tabindex="0" role="region" aria-label="完整四百公尺接力操場，可縮放與拖曳；加減鍵縮放，方向鍵移動，Home 回到全景"
      @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="pointerEnd" @pointercancel="pointerEnd" @lostpointercapture="pointerEnd" @keydown="keyDown">
      <svg class="relay-track-svg" :viewBox="viewBox || fullViewBox" preserveAspectRatio="xMidYMid meet" role="img" aria-label="八道四百公尺橢圓操場，十六棒逆時針接力，設階梯起跑線、三十公尺接力區及三百二十公尺搶道線" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient :id="trackId" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f69077" /><stop offset="100%" stop-color="#e76d60" /></linearGradient>
          <linearGradient :id="grassId" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#6bb778" /><stop offset="100%" stop-color="#4e9b72" /></linearGradient>
          <pattern :id="lawnId" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M1 2h.5v.5H1zM5 6h.5v.5H5z" fill="#619955" opacity=".32" /></pattern>
          <clipPath :id="fieldId"><path :d="ovalPath(TRACK.innerRadius)" /></clipPath>
        </defs>
        <rect x="-1000" y="-1000" width="2000" height="2000" fill="#b5e18b" />
        <rect x="-1000" y="-1000" width="2000" height="2000" :fill="`url(#${lawnId})`" />
        <path :d="ovalPath(TRACK.outerRadius + 5)" fill="none" stroke="#d9efb6" stroke-width="2.3" />
        <path :d="ovalPath(TRACK.outerRadius + 2.2)" fill="#689e71" />
        <g v-for="(tree, index) in trees" :key="index" :transform="`translate(${tree[0]} ${tree[1]}) scale(${tree[2]})`" shape-rendering="crispEdges" aria-hidden="true">
          <path d="M-2-1h6v5h-6zM-3 0h8v3h-8z" fill="#42634a" opacity=".27" />
          <path d="M-2-3h4v7h-4zM-4-1h8v3h-8zM-3-2h6v5h-6z" fill="#397e60" />
          <path d="M-2-3h3v5h-3zM-3-1h5v2h-5z" fill="#62b468" />
          <path d="M-2-2h2v2h-2z" fill="#a6dc7c" />
        </g>
        <path :d="ovalPath(TRACK.outerRadius)" :fill="`url(#${trackId})`" stroke="#8b5147" stroke-width=".5" />
        <path v-for="lane in [2, 4, 6, 8]" :key="lane" :d="ovalPath(TRACK.innerRadius + (lane - .5) * TRACK.laneWidth)" fill="none" stroke="#a75b44" :stroke-width="TRACK.laneWidth" opacity=".1" />
        <path :d="ovalPath(TRACK.innerRadius)" :fill="`url(#${grassId})`" />
        <g :clip-path="`url(#${fieldId})`" aria-hidden="true"><rect v-for="stripe in stripes" :key="stripe" :x="-40 + stripe * 10" y="-37" width="5" height="74" fill="#a1bf87" opacity=".15" /></g>
        <g fill="none" stroke="#d9e9bb" stroke-width=".22" opacity=".5" aria-hidden="true">
          <rect :x="TRACK.straightLength / 2 - 35" y="-23" width="70" height="46" />
          <path :d="`M ${TRACK.straightLength / 2} -23 V 23`" />
          <circle :cx="TRACK.straightLength / 2" cy="0" r="6.3" />
          <rect :x="TRACK.straightLength / 2 - 35" y="-12" width="10" height="24" />
          <rect :x="TRACK.straightLength / 2 + 25" y="-12" width="10" height="24" />
        </g>
        <g :transform="`translate(${TRACK.straightLength / 2} -5)`" class="relay-field-title" aria-hidden="true">
          <text x=".55" y=".55" class="field-shadow">RELAY</text><text>RELAY</text>
          <text y="8" class="relay-field-distance">16 × 100m</text>
          <text y="14" class="relay-field-sub">ONE TEAM · ONE BATON</text>
          <path d="M-26 4h2V2h2v2h2v2h-2v2h-2V6h-2zM20 4h2V2h2v2h2v2h-2v2h-2V6h-2z" fill="#ffdc61" shape-rendering="crispEdges" />
        </g>
        <g v-for="team in waitingGroups" :key="team.classId" :transform="`translate(${team.x} ${team.y})`" class="relay-waiting-group">
          <text v-if="team.athletes.length" x="7" y="-3.5" :fill="team.color" stroke="#263c59" stroke-width=".06" paint-order="stroke">{{ team.className }}</text>
          <g v-for="athlete in team.athletes" :key="athlete.student.id" :transform="waitingPosition(athlete.legIndex)">
            <title>{{ team.className }} · 第 {{ athlete.legIndex + 1 }} 棒 · {{ athlete.student.name }} · 等待上場</title>
            <ellipse cx="1.6" cy="3.05" rx="1.3" ry=".35" fill="#32534e" opacity=".2" />
            <PixelRunner :seed="athlete.student.id" :gender="athlete.student.gender" :height="athlete.student.height" :weight="athlete.student.weight" :color="team.color" :size="runnerSize" :backdrop="false" :running="false" facing="right" />
          </g>
        </g>
        <path v-for="(radius, index) in boundaries" :key="index" :d="ovalPath(radius)" fill="none" stroke="#fff1d9" :stroke-width="index === 0 || index === 8 ? .22 : .12" opacity=".94" />
        <g v-for="marker in zoneMarkers" :key="marker.id">
          <path :d="marker.path" fill="none" :stroke="markerColor(marker.kind)" :stroke-width="marker.kind === 'prepare' ? .17 : .32" :stroke-dasharray="marker.kind === 'prepare' ? '.6 .45' : undefined" opacity=".94"><title>{{ marker.label || '30 公尺接力區標記' }}</title></path>
        </g>
        <g v-for="line in startLines" :key="line.lane" class="relay-start-line">
          <path :d="line.path" fill="none" stroke="#fff9e8" stroke-width=".4" />
          <text :x="line.labelX" :y="line.labelY">{{ line.lane }}</text>
        </g>
        <path :d="breakLine.path" fill="none" stroke="#ffdc61" stroke-width=".48"><title>累積 320 公尺搶道線，第四棒通過後切入內道</title></path>
        <g v-for="(cone, index) in breakLine.cones" :key="index" :transform="`translate(${cone.x} ${cone.y})`" shape-rendering="crispEdges">
          <title>搶道角錐</title><path d="M-.55.3H.55V.6H-.55z" fill="#263c59" /><path d="M-.4.3H.4L.15-.65H-.15z" fill="#ffdc61" stroke="#a75533" stroke-width=".1" /><path d="M-.26-.1H.26V.08H-.26z" fill="#fff9e8" />
        </g>
        <g v-for="runner in displayedRunners" :key="runner.id" class="relay-sprite" :style="strideStyle(runner)" :transform="runnerTransform(runner)" :opacity="runner.opacity ?? 1" :data-lane="runner.lane" :data-role="runner.role" :data-distance="runner.trackDistance">
          <title>{{ runner.name }} · 第 {{ runner.lane }} 道 · {{ runner.baton ? '持棒' : roleText(runner.role) }}</title>
          <PixelRunner :seed="String(runner.studentId || runner.id)" :gender="runner.student?.gender" :height="runner.student?.height" :weight="runner.student?.weight" :color="runner.color || '#c4ed79'" :speed="Number(runner.speed) || 0" :size="runnerSize" :backdrop="false" :facing="runner.point.facing" :running="runner.moving" :paused="paused" />
          <g v-if="runner.baton" :transform="runner.point.facing === 'left' ? `translate(${runnerSize} 0) scale(-1 1)` : undefined" shape-rendering="crispEdges" aria-hidden="true"><rect :x="runnerSize * .69" :y="runnerSize * .58" width=".64" height=".16" rx=".03" fill="#ffdc61" stroke="#263c59" stroke-width=".055" /></g>
        </g>
      </svg>
    </div>
    <button type="button" v-if="canZoomOut" class="relay-camera-reset" title="回到全景（Home）" @click="reset">全景</button>
    <div class="relay-track-legend" aria-hidden="true"><span><i class="exchange"></i>30m 接力區</span><span><i class="break"></i>320m 搶道線</span><span><b>▰</b>接力棒</span></div>
  </div>
</template>

<style scoped>
.relay-track-explorer { position: relative; width: 100%; isolation: isolate; background: #b5e18b; }
.relay-track-surface { width: 100%; height: clamp(270px, 48vw, 610px); overflow: hidden; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; cursor: zoom-in; }
.relay-track-surface.is-zoomed { cursor: grab; }
.relay-track-surface.is-dragging { cursor: grabbing; }
.relay-track-surface:focus-visible { outline: 3px solid #263c59; outline-offset: -4px; }
.relay-track-svg { display: block; width: 100%; height: 100%; }
.relay-waiting-group > text { font-size: 1.5px; font-weight: 800; text-anchor: middle; }
.relay-sprite :deep(.pose-a), .relay-sprite :deep(.pose-b) { animation-duration: var(--relay-stride-duration) !important; }
.relay-field-title text { fill: #fff2bf; font-family: var(--mono, monospace); font-size: 8px; font-weight: 900; text-anchor: middle; letter-spacing: .7px; }
.relay-field-title .field-shadow { fill: #284e4b; }
.relay-field-title .relay-field-distance { fill: #ffdc61; font-size: 5px; letter-spacing: .3px; }
.relay-field-title .relay-field-sub { font-size: 1.8px; letter-spacing: .38px; }
.relay-start-line text { fill: #fff9e8; font-size: 1.1px; font-family: var(--mono, monospace); font-weight: 800; text-anchor: middle; dominant-baseline: middle; }
.relay-camera-reset { position: absolute; top: 10px; right: 10px; min-width: 52px; min-height: 36px; padding: 0 10px; border: 2px solid #263c59; border-radius: 6px; background: #fff9e8; color: #263c59; box-shadow: 2px 2px 0 #263c593b; font-size: 11px; font-weight: 800; touch-action: manipulation; }
.relay-camera-reset:hover { background: #ffdc61; }
.relay-track-legend { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px 18px; padding: 9px 12px; border-top: 1px solid #679563; background: #d8edab; color: #32534e; font-size: 10px; }
.relay-track-legend span { display: inline-flex; align-items: center; gap: 5px; }
.relay-track-legend i { display: inline-block; width: 15px; height: 4px; background: #fff9e8; border: 1px solid #8d886a; }
.relay-track-legend i.break { background: #ffdc61; }
.relay-track-legend b { color: #b07520; }
@media (pointer: coarse) { .relay-camera-reset { min-height: 44px; min-width: 58px; } }
@media (max-width: 480px) { .relay-track-surface { height: 280px; } .relay-track-legend { gap: 8px 12px; font-size: 9px; } }
</style>
