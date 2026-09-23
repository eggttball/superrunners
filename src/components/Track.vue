<script setup vapor>
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import PixelRunner from './PixelRunner.vue'
import { TRACK, lapPoint, ovalPath, sprintPoint } from '../lib/track-geometry.js'

const props = defineProps({
  runners: { type: Array, default: () => [] },
  animated: { type: Boolean, default: true },
  raceMode: { type: Boolean, default: false },
  arcade: { type: Boolean, default: false },
})

const prefix = `track-${useId().replaceAll(':', '')}`
const infieldId = `${prefix}-infield`
const surfaceId = `${prefix}-surface`
const grassId = `${prefix}-grass`
const lawnId = `${prefix}-lawn`
const runnerSize = computed(() => props.raceMode ? 3.1 : props.arcade ? 3.7 : 2.6)
const boundaries = Array.from({ length: 9 }, (_, index) => TRACK.innerRadius + index * TRACK.laneWidth)
const lanes = Array.from({ length: 8 }, (_, index) => index + 1)
const stripes = Array.from({ length: 18 }, (_, index) => index)
const checks = Array.from({ length: 16 }, (_, index) => index)
const metreMarks = [0, 25, 50, 75, 100]
const sprintViewBox = [
  TRACK.sprintStartX - 8,
  TRACK.innerRadius - 9,
  TRACK.sprintFinishX - TRACK.sprintStartX + 24,
  TRACK.outerRadius - TRACK.innerRadius + 22,
].join(' ')
const arcadeViewBox = [
  // Leave room for the pixel trees and their shadows beyond the outer lane.
  -TRACK.outerRadius - 12,
  -TRACK.outerRadius - 12,
  TRACK.straightLength + 2 * TRACK.outerRadius + 24,
  2 * TRACK.outerRadius + 24,
].join(' ')
const trees = [
  [-49, -23, 1.05], [-49, 13, 0.8], [-31, -47, 1], [8, -53, 0.9],
  [49, -53, 0.85], [94, -50, 1.1], [124, -32, 0.9], [135, -7, 1.05],
  [130, 25, 0.8], [-35, 47, 0.95], [112, 49, 0.9], [-51, 34, 0.75],
]
const ambient = [
  { id: 'practice-1', name: '晨練跑者', gender: '女', lane: 1, offset: 0.055, duration: 72, color: '#e5f197' },
  { id: 'practice-2', name: '晨練跑者', gender: '男', lane: 2, offset: 0.59, duration: 76, color: '#a4d5e7' },
  { id: 'practice-3', name: '晨練跑者', gender: '女', lane: 3, offset: 0.11, duration: 79, color: '#f5d18b' },
  { id: 'practice-4', name: '晨練跑者', gender: '男', lane: 4, offset: 0.27, duration: 69, color: '#f3b6bf' },
  { id: 'practice-5', name: '晨練跑者', gender: '女', lane: 5, offset: 0.84, duration: 85, color: '#f3efdb' },
  { id: 'practice-6', name: '晨練跑者', gender: '男', lane: 6, offset: 0.53, duration: 82, color: '#bcb2ee' },
  { id: 'practice-7', name: '晨練跑者', gender: '女', lane: 7, offset: 0.38, duration: 91, color: '#d1ed95' },
  { id: 'practice-8', name: '晨練跑者', gender: '男', lane: 8, offset: 0.91, duration: 88, color: '#f5ae79' },
]

const elapsed = ref(0)
const reducedMotion = ref(false)
let frame = null
let previousTimestamp = null
let mounted = false
let mediaQuery = null

const displayedRunners = computed(() => {
  if (props.raceMode || props.runners.length) {
    return props.runners.map((runner) => ({
      ...runner,
      point: sprintPoint(runner.distance, runner.lane),
      moving: props.animated && Number(runner.speed) > 0.05 && Number(runner.opacity ?? 1) > 0 && !reducedMotion.value,
    }))
  }
  return ambient.map((runner) => {
    const point = lapPoint(runner.offset + elapsed.value / runner.duration, runner.lane)
    return { ...runner, point, facing: point.facing, moving: props.animated && !reducedMotion.value }
  })
})

function runnerTransform(runner) {
  const point = runner.point
  const size = runnerSize.value
  // Upright sprites keep their feet on the lane centre while moving around it.
  return `translate(${point.x} ${point.y}) translate(${-size / 2} ${-size * 0.95})`
}

function tick(timestamp) {
  if (previousTimestamp !== null) elapsed.value += Math.min((timestamp - previousTimestamp) / 1000, 0.08)
  previousTimestamp = timestamp
  frame = requestAnimationFrame(tick)
}

function syncAnimation() {
  if (frame !== null) cancelAnimationFrame(frame)
  frame = null
  previousTimestamp = null
  if (mounted && props.animated && !props.raceMode && !props.runners.length && !reducedMotion.value) {
    frame = requestAnimationFrame(tick)
  }
}

function handleMotionPreference(event) {
  reducedMotion.value = event.matches
  syncAnimation()
}

watch(() => [props.animated, props.raceMode, props.runners.length], syncAnimation)
onMounted(() => {
  mounted = true
  mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotion.value = mediaQuery.matches
  mediaQuery.addEventListener('change', handleMotionPreference)
  syncAnimation()
})
onBeforeUnmount(() => {
  mounted = false
  if (frame !== null) cancelAnimationFrame(frame)
  mediaQuery?.removeEventListener('change', handleMotionPreference)
})
</script>

<template>
  <div class="track-viewport" :class="{ 'is-race': raceMode, 'is-arcade': arcade }">
    <svg
      class="track-svg"
      :viewBox="raceMode ? sprintViewBox : arcade ? arcadeViewBox : TRACK.viewBox"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      :aria-label="raceMode ? '放大的八道 100 公尺直線賽道，由左向右起跑，終點後設有減速區' : '八道 400 公尺田徑場鳥瞰圖，像素跑者正在練習，附設 100 公尺直道'"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient :id="surfaceId" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="arcade ? '#f69077' : '#d49470'" />
          <stop offset="100%" :stop-color="arcade ? '#e76d60' : '#be7053'" />
        </linearGradient>
        <linearGradient :id="grassId" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" :stop-color="arcade ? '#6bb778' : '#32634b'" />
          <stop offset="100%" :stop-color="arcade ? '#4e9b72' : '#264e3d'" />
        </linearGradient>
        <pattern v-if="arcade" :id="lawnId" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M1 2h.5v.5H1zM5 6h.5v.5H5z" fill="#619955" opacity=".32" />
        </pattern>
        <clipPath :id="infieldId"><path :d="ovalPath(TRACK.innerRadius)" /></clipPath>
      </defs>

      <rect x="-65" y="-65" width="215" height="132" :fill="arcade ? '#b5e18b' : '#dce5d1'" />
      <rect v-if="arcade" x="-65" y="-65" width="215" height="132" :fill="`url(#${lawnId})`" />
      <path :d="ovalPath(TRACK.outerRadius + 5)" fill="none" :stroke="arcade ? '#d9efb6' : '#d0d7c4'" stroke-width="2.3" />
      <path :d="ovalPath(TRACK.outerRadius + 2.2)" :fill="arcade ? '#689e71' : '#c5cfbc'" />

      <g v-for="(tree, index) in trees" :key="index" :transform="`translate(${tree[0]} ${tree[1]}) scale(${tree[2]})`" shape-rendering="crispEdges">
        <path d="M-2-1h6v5h-6zM-3 0h8v3h-8z" fill="#809779" opacity=".27" />
        <path d="M-2-3h4v7h-4zM-4-1h8v3h-8zM-3-2h6v5h-6z" :fill="arcade ? '#397e60' : '#42634a'" />
        <path d="M-2-3h3v5h-3zM-3-1h5v2h-5z" :fill="arcade ? '#62b468' : '#547754'" />
        <path d="M-2-2h2v2h-2z" :fill="arcade ? '#a6dc7c' : '#6f8a5e'" />
      </g>

      <path :d="ovalPath(TRACK.outerRadius)" :fill="`url(#${surfaceId})`" />
      <path
        v-for="lane in [2, 4, 6, 8]"
        :key="lane"
        :d="ovalPath(TRACK.innerRadius + (lane - 0.5) * TRACK.laneWidth)"
        fill="none"
        stroke="#a75b44"
        :stroke-width="TRACK.laneWidth"
        opacity=".08"
      />
      <path :d="ovalPath(TRACK.innerRadius)" :fill="`url(#${grassId})`" />
      <g :clip-path="`url(#${infieldId})`">
        <rect v-for="stripe in stripes" :key="stripe" :x="-40 + stripe * 10" y="-37" width="5" height="74" fill="#a1bf87" :opacity="arcade ? .15 : .04" />
      </g>

      <g fill="none" stroke="#bdceb1" stroke-width=".22" opacity=".44">
        <rect :x="TRACK.straightLength / 2 - 35" y="-23" width="70" height="46" />
        <path :d="`M ${TRACK.straightLength / 2} -23 V 23`" />
        <circle :cx="TRACK.straightLength / 2" cy="0" r="6.3" />
        <circle :cx="TRACK.straightLength / 2" cy="0" r=".35" fill="#bdceb1" stroke="none" />
        <rect :x="TRACK.straightLength / 2 - 35" y="-12" width="10" height="24" />
        <rect :x="TRACK.straightLength / 2 + 25" y="-12" width="10" height="24" />
        <rect :x="TRACK.straightLength / 2 - 35" y="-6" width="4" height="12" />
        <rect :x="TRACK.straightLength / 2 + 31" y="-6" width="4" height="12" />
        <rect :x="TRACK.straightLength / 2 - 38" y="-4" width="3" height="8" />
        <rect :x="TRACK.straightLength / 2 + 35" y="-4" width="3" height="8" />
      </g>
      <g v-if="arcade" :transform="`translate(${TRACK.straightLength / 2} -3)`" class="arcade-field-title" aria-hidden="true">
        <text x=".65" y=".65" class="field-title-shadow">SUPER</text>
        <text y="0">SUPER</text>
        <text x=".65" y="9.65" class="field-title-shadow">RUNNERS</text>
        <text y="9">RUNNERS</text>
        <text y="15" class="field-title-sub">YOUR HOME GROUND</text>
        <path d="M-30 1h2v-2h2v2h2v2h-2v2h-2V3h-2zM24 1h2v-2h2v2h2v2h-2v2h-2V3h-2z" fill="#ffdc61" shape-rendering="crispEdges" />
      </g>
      <!-- The measured oval has an 84.389 m tangent. This apron extends
           its bottom straight to the left to make an actual 100 m sprint. -->
      <rect :x="TRACK.sprintStartX - 3" :y="TRACK.innerRadius" width="118" :height="8 * TRACK.laneWidth" :fill="`url(#${surfaceId})`" />
      <rect v-for="lane in [2, 4, 6, 8]" :key="lane" :x="TRACK.sprintStartX - 3" :y="TRACK.innerRadius + (lane - 1) * TRACK.laneWidth" width="118" :height="TRACK.laneWidth" fill="#a75b44" opacity=".08" />
      <path v-for="(radius, index) in boundaries" :key="index" :d="ovalPath(radius)" fill="none" stroke="#f5e8d0" :stroke-width="index === 0 || index === 8 ? 0.2 : 0.11" opacity=".88" />
      <path v-for="(radius, index) in boundaries" :key="index" :d="`M ${TRACK.sprintStartX - 3} ${radius} H ${TRACK.sprintFinishX + 15}`" fill="none" stroke="#f5e8d0" :stroke-width="index === 0 || index === 8 ? 0.2 : 0.11" opacity=".92" />
      <path :d="`M ${TRACK.sprintStartX} ${TRACK.innerRadius} V ${TRACK.outerRadius}`" stroke="#fff6de" stroke-width=".22" />

      <g v-for="check in checks" :key="check" shape-rendering="crispEdges">
        <rect :x="TRACK.sprintFinishX" :y="TRACK.innerRadius + check * TRACK.laneWidth / 2" width=".32" :height="TRACK.laneWidth / 2" :fill="check % 2 ? '#f8edda' : '#3c4839'" />
        <rect :x="TRACK.sprintFinishX + .32" :y="TRACK.innerRadius + check * TRACK.laneWidth / 2" width=".32" :height="TRACK.laneWidth / 2" :fill="check % 2 ? '#3c4839' : '#f8edda'" />
      </g>
      <text v-for="lane in lanes" :key="lane" :x="TRACK.sprintStartX - 1.65" :y="TRACK.innerRadius + (lane - .5) * TRACK.laneWidth + .34" class="lane-number">{{ lane }}</text>

      <g class="line-sign">
        <rect :x="TRACK.sprintStartX - 7.5" :y="TRACK.innerRadius - 6.8" width="15" height="4.2" rx=".6" />
        <text :x="TRACK.sprintStartX" :y="TRACK.innerRadius - 4">START 起跑</text>
        <rect :x="TRACK.sprintFinishX - 8.2" :y="TRACK.innerRadius - 6.8" width="16.4" height="4.2" rx=".6" />
        <text :x="TRACK.sprintFinishX" :y="TRACK.innerRadius - 4">FINISH 終點</text>
      </g>
      <g v-for="metres in metreMarks" :key="metres" class="distance-mark">
        <path :d="`M ${TRACK.sprintStartX + metres} ${TRACK.outerRadius + 1} v 1.2`" />
        <text :x="TRACK.sprintStartX + metres" :y="TRACK.outerRadius + 4.8">{{ metres }} m</text>
      </g>

      <g v-for="runner in displayedRunners" :key="runner.id" :transform="runnerTransform(runner)" :data-lane="runner.lane" :data-distance="runner.distance" :opacity="runner.opacity ?? 1">
        <title>{{ runner.name }} · 第 {{ runner.lane }} 道</title>
        <PixelRunner :seed="String(runner.id)" :gender="runner.gender" :height="runner.height" :weight="runner.weight" :speed="runner.speed" :facing="runner.facing" :color="runner.color || '#e3ee94'" :running="runner.moving" :size="runnerSize" :backdrop="false" />
      </g>
    </svg>
  </div>
</template>

<style scoped>
.track-viewport { width: 100%; overflow: hidden; border-radius: inherit; background: #dce5d1; }
.track-svg { display: block; width: 100%; height: auto; }
.is-arcade { height: 100%; background: #b5e18b; border-radius: 0; }
.is-arcade .track-svg { height: 100%; }
.arcade-field-title text { font-family: ui-monospace, monospace; font-weight: 900; font-size: 8.5px; letter-spacing: .4px; text-anchor: middle; fill: #fff5d9; }
.arcade-field-title .field-title-shadow { fill: #347359; }
.arcade-field-title .field-title-sub { font-size: 1.9px; letter-spacing: .75px; fill: #dcf0cf; }
.lane-number { font-family: ui-monospace, monospace; font-size: 1.02px; font-weight: 800; text-anchor: middle; fill: #fff2d9; }
.line-sign rect { fill: #294f3d; }
.line-sign text { font-family: sans-serif; font-size: 1.65px; font-weight: 700; text-anchor: middle; letter-spacing: .04px; fill: #f8f2dd; }
.distance-mark path { fill: none; stroke: #6b8060; stroke-width: .16; }
.distance-mark text { font-family: ui-monospace, monospace; font-size: 1.65px; text-anchor: middle; fill: #5d7053; }
.is-race { border: 1px solid #d5ddcc; border-radius: 14px; }
</style>
