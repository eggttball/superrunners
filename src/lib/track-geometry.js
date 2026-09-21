// SVG coordinates are metres. The two semicircle centres are (0, 0) and
// (straightLength, 0); lane 1 is nearest the infield.
const innerRadius = 36.5
const measurementOffset = 0.3
const measurementRadius = innerRadius + measurementOffset
const laneWidth = 1.22
const laneCount = 8
const straightLength = (400 - 2 * Math.PI * measurementRadius) / 2
const outerRadius = innerRadius + laneCount * laneWidth

export const TRACK = Object.freeze({
  innerRadius,
  measurementOffset,
  measurementRadius,
  laneWidth,
  laneCount,
  straightLength,
  outerRadius,
  sprintStartX: straightLength - 100,
  sprintFinishX: straightLength,
  viewBox: `${-outerRadius - 10} ${-outerRadius - 14} ${straightLength + 2 * outerRadius + 20} ${2 * outerRadius + 28}`,
})

function validLane(lane) {
  const number = Number(lane)
  return Number.isFinite(number) ? Math.min(laneCount, Math.max(1, Math.round(number))) : 1
}

export function laneRadius(lane) {
  return innerRadius + (validLane(lane) - 0.5) * laneWidth
}

export function ovalPath(radius = innerRadius) {
  return `M 0 ${radius} H ${straightLength} A ${radius} ${radius} 0 0 0 ${straightLength} ${-radius} H 0 A ${radius} ${radius} 0 0 0 0 ${radius} Z`
}

export function sprintPoint(distance, lane = 1) {
  const metres = Number(distance)
  const bounded = Number.isFinite(metres) ? Math.min(112, Math.max(0, metres)) : 0
  return { x: TRACK.sprintStartX + bounded, y: laneRadius(lane), angle: 0, facing: 'right' }
}

/** Counterclockwise lap, starting at the bottom left tangent. */
export function lapPoint(progress, lane = 1) {
  const radius = laneRadius(lane)
  const lapLength = 2 * straightLength + 2 * Math.PI * radius
  const numeric = Number(progress)
  const unit = Number.isFinite(numeric) ? ((numeric % 1) + 1) % 1 : 0
  let distance = unit * lapLength
  if (distance <= straightLength) return { x: distance, y: radius, angle: 0, facing: 'right' }
  distance -= straightLength
  if (distance <= Math.PI * radius) {
    const angle = Math.PI / 2 - distance / radius
    return { x: straightLength + radius * Math.cos(angle), y: radius * Math.sin(angle), angle: angle * 180 / Math.PI - 90, facing: angle > 0 ? 'right' : 'left' }
  }
  distance -= Math.PI * radius
  if (distance <= straightLength) return { x: straightLength - distance, y: -radius, angle: 180, facing: 'left' }
  distance -= straightLength
  const angle = -Math.PI / 2 - distance / radius
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle), angle: angle * 180 / Math.PI - 90, facing: angle < -Math.PI ? 'right' : 'left' }
}
