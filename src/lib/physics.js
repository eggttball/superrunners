/**
 * Deterministic, game-oriented 100 m model. Heights are cm, weights are kg,
 * abilities are 1–10. Grade contributes a small maturity adjustment; sex,
 * name, and team membership do not directly affect time.
 */
const DEFAULTS = Object.freeze({
  height: 165,
  weight: 55,
  grade: 2,
  explosiveness: 5.5,
  endurance: 5.5,
  stamina: 5.5,
  strength: 5.5,
  technique: 5.5,
})

function finite(value, fallback) {
  const number = Number(value)
  return value !== null && value !== '' && Number.isFinite(number) ? number : fallback
}

function attributes(student = {}) {
  return Object.fromEntries(Object.entries(DEFAULTS).map(([key, fallback]) => [key, finite(student[key], fallback)]))
}

// Stable softplus: unlike clamping a finish time, this retains the ordering
// of every valid combination of student attributes, even near the lower bound.
function softplus(value) {
  return Math.max(value, 0) + Math.log1p(Math.exp(-Math.abs(value)))
}

export function predict100(student) {
  const a = attributes(student)
  const difficulty = 6.5
    - 0.024 * (a.height - 165)
    + 0.038 * (a.weight - 55)
    - 0.16 * (a.grade - 2)
    - 0.34 * (a.explosiveness - 5.5)
    - 0.105 * (a.endurance - 5.5)
    - 0.105 * (a.stamina - 5.5)
    - 0.16 * (a.strength - 5.5)
    - 0.18 * (a.technique - 5.5)

  return 10 + softplus(difficulty)
}

function raceTime(student, random) {
  const a = attributes(student)
  const baseline = finite(student?.baseline100, predict100(student))
  const currentBest = finite(student?.best100, baseline)
  // Ordinary form stays close to the estimate: three samples produce a
  // triangular variation bounded to ±0.10 s. This keeps a 10.50 s runner's
  // usual results near 10.4–10.6 instead of letting noise create huge PB jumps.
  const variation = (random() + random() + random() - 1.5) * (0.20 / 3)
  const explosivePotential = (a.explosiveness - 1) / 9
  const pace = Math.min(baseline, currentBest)
  const remainingHeadroom = Math.max(0, Math.min(1, (pace - 10) / 6))
  const paceDifficulty = remainingHeadroom * remainingHeadroom
  const breakthroughChance = (0.025 + 0.14 * explosivePotential) * paceDifficulty
  let time = baseline + variation

  // Explosiveness adds upside, but faster performances become progressively
  // harder to improve. The fourth-power roll makes large gains much rarer
  // than small ones; slower runners have more room for an occasional jump.
  if (random() < breakthroughChance) {
    const maxImprovement = 0.45 + 0.15 * explosivePotential + 0.26 * Math.max(0, pace - 10.5)
    const improvement = 0.02 + (maxImprovement - 0.02) * random() ** 4
    time = Math.min(time, currentBest - improvement)
  }

  return Math.max(10.01, Math.round(time * 100) / 100)
}

/** Build once at the start of a heat; reuse the profile for animation and saving. */
export function createSprintProfile(student, random = Math.random) {
  const a = attributes(student)
  const time = raceTime(student, random)
  const resilience = (a.endurance + a.stamina - 2) / 18
  const accelerationDuration = 0.75 + 3.4 * Math.exp(
    -0.004 * (a.height - 165)
    +0.006 * (a.weight - 55)
    -0.14 * (a.explosiveness - 1)
    -0.045 * (a.strength - 1)
    -0.025 * (a.technique - 1),
  )
  const fatigueStart = time * (0.58 + 0.14 * resilience)
  const fatigueLoss = 0.36 - 0.29 * resilience
  const area = time - accelerationDuration / 3 - fatigueLoss * (time - fatigueStart) / 3
  const peakSpeed = 100 / area
  const finishSpeed = peakSpeed * (1 - fatigueLoss)
  const runoutDuration = 2.8 + 0.4 * (1 - resilience)

  return Object.freeze({
    time,
    accelerationDuration,
    fatigueStart,
    fatigueLoss,
    peakSpeed,
    finishSpeed,
    runoutDuration,
  })
}

/** Timed distance to 100 m, followed by a linearly decelerating run-out. */
export function distanceAt(elapsedSeconds, profile) {
  const t = Number(elapsedSeconds)
  if (!(t > 0)) return 0
  if (t >= profile.time) {
    const progress = Math.min(1, (t - profile.time) / profile.runoutDuration)
    return 100 + profile.finishSpeed * profile.runoutDuration * (progress - progress * progress / 2)
  }

  const a = profile.accelerationDuration
  const f = profile.fatigueStart
  let area
  if (t <= a) {
    area = t * t / a - t * t * t / (3 * a * a)
  } else if (t <= f) {
    area = 2 * a / 3 + t - a
  } else {
    const late = t - f
    const duration = profile.time - f
    area = 2 * a / 3 + f - a + late
      - profile.fatigueLoss * late * late * late / (3 * duration * duration)
  }
  return Math.min(100, Math.max(0, profile.peakSpeed * area))
}

/** Metres per second, including the visible deceleration beyond the finish. */
export function speedAt(elapsedSeconds, profile) {
  const t = Number(elapsedSeconds)
  if (!(t > 0)) return 0
  if (t > profile.time) {
    const progress = Math.min(1, (t - profile.time) / profile.runoutDuration)
    return profile.finishSpeed * (1 - progress)
  }
  if (t < profile.accelerationDuration) {
    const progress = t / profile.accelerationDuration
    return profile.peakSpeed * (2 * progress - progress * progress)
  }
  if (t <= profile.fatigueStart) return profile.peakSpeed
  const progress = (t - profile.fatigueStart) / (profile.time - profile.fatigueStart)
  return profile.peakSpeed * (1 - profile.fatigueLoss * progress * progress)
}
