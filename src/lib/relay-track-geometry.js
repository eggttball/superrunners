import { TRACK, lapPoint } from './track-geometry.js'

export const RELAY_LEGS = 16
export const RELAY_DISTANCE = RELAY_LEGS * 100
const LAP_DISTANCE = 400
const baseRadius = TRACK.measurementRadius
const laneRadius = lane => TRACK.innerRadius + (lane - 0.5) * TRACK.laneWidth
const boundedLane = lane => Math.min(8.5, Math.max(0.5, Number.isFinite(Number(lane)) ? Number(lane) : 1))
const positiveModulo = (value, modulus) => ((value % modulus) + modulus) % modulus

/**
 * Metric progress uses the existing 36.8 m measurement radius (exactly 400 m).
 * Sprites use the existing lane-centre radii, which are 0.31 m farther out.
 * Keeping arc angles rather than scaling a whole lap preserves the common
 * straight finish. The full-lap stagger is spent on the first two bends;
 * every lane therefore reaches the final straight together before 320 m.
 */
function metricSection(distance, originalLane) {
  const firstLap = distance >= 0 && distance < LAP_DISTANCE
  const radius = baseRadius + (firstLap ? Math.max(0, boundedLane(originalLane) - 1) * TRACK.laneWidth : 0)
  const stagger = firstLap ? 2 * Math.PI * (radius - baseRadius) : 0
  const length = 2 * TRACK.straightLength + 2 * Math.PI * radius
  let remaining = positiveModulo(distance + stagger, length)
  if (!firstLap) remaining = positiveModulo(distance, LAP_DISTANCE)
  // The common finish is the bottom-right tangent, immediately before bend 1.
  if (remaining <= Math.PI * radius) return { section: 'right', amount: remaining / radius }
  remaining -= Math.PI * radius
  if (remaining <= TRACK.straightLength) return { section: 'top', amount: remaining }
  remaining -= TRACK.straightLength
  if (remaining <= Math.PI * radius) return { section: 'left', amount: remaining / radius }
  remaining -= Math.PI * radius
  return { section: 'bottom', amount: remaining }
}

function sectionPoint(section, lane) {
  const radius = laneRadius(lane)
  const length = 2 * TRACK.straightLength + 2 * Math.PI * radius
  const distance = section.section === 'right' ? TRACK.straightLength + section.amount * radius
    : section.section === 'top' ? TRACK.straightLength + Math.PI * radius + section.amount
      : section.section === 'left' ? 2 * TRACK.straightLength + Math.PI * radius + section.amount * radius
        : section.amount
  return lapPoint(distance / length, lane)
}

/** Fractional lanes interpolate equal arc angles, never lapPoint's rounded lane. */
export function relayPoint(trackDistance, lane = 1, trackLane = lane) {
  const distance = Number.isFinite(Number(trackDistance)) ? Number(trackDistance) : 0
  const visualLane = boundedLane(trackLane)
  const section = metricSection(distance, lane)
  const lower = Math.max(1, Math.min(8, Math.floor(visualLane)))
  const upper = Math.min(8, lower + 1)
  const first = sectionPoint(section, lower)
  if (visualLane >= 1 && visualLane <= 8 && visualLane === lower) return first
  // On an oval, each tangent/arc coordinate is linear in radius. Extrapolating
  // half a lane is also exact and lets markings reach the track boundaries.
  const second = sectionPoint(section, lower === 8 ? 7 : upper)
  const difference = lower === 8 ? lower - 7 : upper - lower
  const weight = lower === 8 ? (lower - visualLane) / difference : (visualLane - lower) / difference
  return { x: first.x + (second.x - first.x) * weight, y: first.y + (second.y - first.y) * weight,
    angle: first.angle, facing: first.facing }
}

const coordinate = value => Number(value.toFixed(3))
const move = point => `${coordinate(point.x)} ${coordinate(point.y)}`
const pathThrough = points => points.map((point, index) => `${index ? 'L' : 'M'} ${move(point)}`).join(' ')
function transverse(distance, originalLane = 1, from = 0.5, to = 8.5) {
  return pathThrough([relayPoint(distance, originalLane, from), relayPoint(distance, originalLane, to)])
}

export function relayStartLines() {
  return Array.from({ length: TRACK.laneCount }, (_, index) => {
    const lane = index + 1
    const point = relayPoint(-1.8, lane, lane)
    // Negative distances are common-lap runouts, so use a point just behind
    // the actual staggered start to place the lane label along its tangent.
    const start = relayPoint(0, lane, lane)
    const radians = start.angle * Math.PI / 180
    return { lane, path: transverse(0, lane, lane - 0.5, lane + 0.5),
      labelX: coordinate(lane === 1 ? point.x : start.x - Math.cos(radians) * 1.8),
      labelY: coordinate(lane === 1 ? point.y : start.y - Math.sin(radians) * 1.8) }
  })
}

export function relayBreakLine() {
  const lanes = Array.from({ length: 17 }, (_, index) => 0.5 + index / 2)
  const points = lanes.map(lane => {
    const point = relayPoint(320, 1, lane)
    // The shallow arc meets every original-lane runner immediately before the
    // shared 320 m threshold, leaving the final straight available to merge.
    return { ...point, x: point.x - 0.015 * (lane - 1) ** 2 }
  })
  return { path: pathThrough(points), cones: Array.from({ length: 8 }, (_, index) => {
    const lane = index + 1
    const point = relayPoint(320, 1, lane - 0.5)
    return { x: coordinate(point.x - 0.015 * (lane - 1) ** 2), y: coordinate(point.y) }
  }) }
}

/** First-lap staggered zones, followed by the four shared zones reused each lap. */
export function relayZoneMarkers() {
  const markers = []
  for (let boundary = 1; boundary <= 3; boundary++) {
    for (let lane = 1; lane <= TRACK.laneCount; lane++) {
      for (const [kind, offset] of [['start', -10], ['end', 20]]) {
        markers.push({ id: `first-${boundary}-${lane}-${kind}`, kind,
          path: transverse(boundary * 100 + offset, lane, lane - 0.5, lane + 0.5),
          label: `第 ${boundary + 1} 棒第 ${lane} 道：接力區${kind === 'start' ? '起點' : '終點'}` })
      }
    }
  }
  for (let boundary = 4; boundary <= 7; boundary++) {
    for (const [kind, offset] of [['prepare', -45], ['start', -10], ['end', 20]]) {
      markers.push({ id: `shared-${boundary}-${kind}`, kind,
        path: transverse(boundary * 100 + offset),
        label: kind === 'prepare' ? '接棒準備線：依通過先後排位' : `共用三十公尺接力區${kind === 'start' ? '起點' : '終點'}` })
    }
  }
  markers.push({ id: 'finish', kind: 'finish', label: '1600 公尺共同終點', path: transverse(RELAY_DISTANCE) })
  return markers
}
