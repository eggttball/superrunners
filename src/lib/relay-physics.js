import { createSprintProfile } from './physics.js'
import { relayPoint } from './relay-track-geometry.js'

export const RELAY_LEGS = 16
export const RELAY_DISTANCE = RELAY_LEGS * 100
const KNOT_COUNT = 128
const clamp = (value, lower, upper) => Math.min(upper, Math.max(lower, value))
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : fallback
const smooth = value => { const unit = clamp(value, 0, 1); return unit * unit * (3 - 2 * unit) }
const ability = (student, key) => (clamp(finite(student[key], 5.5), 1, 10) - 1) / 9
const activeLane = lane => 1 + (lane - 1) * 0.075

function exchangePlan(incoming, outgoing, fromSprint, toSprint, index) {
  const boundary = (index + 1) * 100
  const incomingSpeed = clamp((fromSprint.peakSpeed - 4.5) / 5.5, 0, 1)
  const outgoingSpeed = clamp((toSprint.peakSpeed - 4.5) / 5.5, 0, 1)
  const late = (incomingSpeed + ability(incoming, 'stamina') + ability(incoming, 'endurance')) / 3
  const early = (outgoingSpeed + ability(outgoing, 'explosiveness')) / 2
  const technique = (ability(incoming, 'technique') + ability(outgoing, 'technique')) / 2
  // All transfers remain inside [-10,+20], with a usable acceleration run.
  const distance = boundary + clamp(5 + 19 * (late - early), -7, 17)
  return { index, fromStudentId: incoming.id, toStudentId: outgoing.id,
    boundary, zoneStart: boundary - 10, zoneEnd: boundary + 20, distance,
    technique, loss: 0.035 + 0.34 * (1 - technique),
    speedRetention: 0.82 + 0.165 * technique,
    overlapDuration: 0.18 + 0.52 * (1 - technique),
    prepareDistance: boundary - 45 }
}

/** Integrate and save every speed knot once. No random or student reads in playback. */
function legProfile(sprint, student, distance, incoming, outgoing) {
  const initialFraction = incoming ? clamp(incoming.preRunSpeed / sprint.peakSpeed, 0.35, 1.1) : 0
  const saving = incoming ? sprint.accelerationDuration / 3 * Math.min(1, initialFraction) : 0
  const time = Math.max(4, sprint.time * distance / 100 - saving + (outgoing?.loss || 0))
  const acceleration = Math.min(time * 0.4, sprint.accelerationDuration * (incoming ? 0.7 : 1))
  const resilience = (ability(student, 'endurance') + ability(student, 'stamina')) / 2
  const fatigueStart = time * (0.58 + 0.14 * resilience)
  const fatigueLoss = 0.36 - 0.29 * resilience
  const exchangeWindow = outgoing ? Math.min(time * 0.25, 0.55 + outgoing.overlapDuration) : 0
  const shapeAt = elapsed => {
    const accelerationProgress = clamp(elapsed / acceleration, 0, 1)
    const accelerationShape = 2 * accelerationProgress - accelerationProgress ** 2
    const fatigueProgress = clamp((elapsed - fatigueStart) / (time - fatigueStart), 0, 1)
    const exchangeProgress = outgoing ? smooth((elapsed - (time - exchangeWindow)) / exchangeWindow) : 0
    return { accelerationShape, attenuation: (1 - fatigueLoss * fatigueProgress ** 2)
      * (1 - (1 - (outgoing?.speedRetention || 1)) * exchangeProgress) }
  }
  const raw = []
  let accelerationArea = 0, initialArea = 0
  let previous = shapeAt(0)
  const step = time / KNOT_COUNT
  raw.push({ time: 0, ...previous })
  for (let index = 1; index <= KNOT_COUNT; index++) {
    const elapsed = index * step
    const current = shapeAt(elapsed)
    accelerationArea += (previous.accelerationShape * previous.attenuation + current.accelerationShape * current.attenuation) * step / 2
    initialArea += ((1 - previous.accelerationShape) * previous.attenuation + (1 - current.accelerationShape) * current.attenuation) * step / 2
    raw.push({ time: elapsed, ...current })
    previous = current
  }
  const initialSpeed = incoming?.preRunSpeed || 0
  const peakSpeed = (distance - initialSpeed * initialArea) / accelerationArea
  let integral = 0, previousSpeed = initialSpeed
  const knots = raw.map((knot, index) => {
    const speed = (initialSpeed * (1 - knot.accelerationShape) + peakSpeed * knot.accelerationShape) * knot.attenuation
    if (index) integral += (previousSpeed + speed) * step / 2
    previousSpeed = speed
    return { time: knot.time, distance: integral, speed }
  })
  knots.at(-1).distance = distance
  return { time, distance, accelerationDuration: acceleration, fatigueStart, fatigueLoss,
    peakSpeed, initialSpeed: knots[0].speed, finishSpeed: knots.at(-1).speed,
    runoutDuration: sprint.runoutDuration, knots, sourceSprint: { ...sprint } }
}

function profileState(profile, elapsed) {
  const t = clamp(elapsed, 0, profile.time)
  const knots = profile.knots
  const approximate = clamp(Math.floor(t / profile.time * (knots.length - 1)), 0, knots.length - 2)
  const first = knots[approximate], second = knots[approximate + 1]
  const unit = clamp((t - first.time) / (second.time - first.time), 0, 1)
  // Integrating the linearly interpolated speed preserves monotonic distance.
  const duration = (second.time - first.time) * unit
  const speed = first.speed + (second.speed - first.speed) * unit
  return { distance: t >= profile.time ? profile.distance
    : first.distance + (first.speed + speed) * duration / 2,
  speed: t >= profile.time ? profile.finishSpeed : speed }
}

function timeAtDistance(leg, distance) {
  const localDistance = clamp(distance - leg.startDistance, 0, leg.profile.distance)
  let lower = 0, upper = leg.profile.time
  for (let count = 0; count < 30; count++) {
    const middle = (lower + upper) / 2
    if (profileState(leg.profile, middle).distance < localDistance) lower = middle
    else upper = middle
  }
  return leg.startTime + (lower + upper) / 2
}

/** Each plan includes immutable student snapshots and all sampled pace data. */
export function createRelayRace(match, meet, getStudent, random = Math.random) {
  if (!match || !Array.isArray(match.classIds) || match.classIds.length < 2 || match.classIds.length > 8
    || new Set(match.classIds).size !== match.classIds.length) throw new Error('接力組別需要二至八個不同班級。')
  const safeRandom = () => clamp(finite(random(), 0.5), 0, 1 - Number.EPSILON)
  const plans = match.classIds.map((classId, laneIndex) => {
    const entrant = meet.entrants.find(entry => entry.classId === classId)
    if (!entrant || entrant.studentIds?.length !== RELAY_LEGS || new Set(entrant.studentIds).size !== RELAY_LEGS) {
      throw new Error('接力組別的十六棒名單不完整。')
    }
    const students = entrant.studentIds.map(id => {
      const student = getStudent(id)
      if (!student || student.classId !== classId || student.schoolId !== meet.schoolId) throw new Error('接力學生與班級快照不符。')
      return structuredClone(student)
    })
    const sprints = students.map(student => createSprintProfile(student, safeRandom))
    const exchanges = students.slice(0, -1).map((student, index) => exchangePlan(student, students[index + 1], sprints[index], sprints[index + 1], index))
    const legs = []
    let startTime = 0
    for (let index = 0; index < RELAY_LEGS; index++) {
      const incoming = exchanges[index - 1], outgoing = exchanges[index]
      const startDistance = incoming?.distance || 0
      const endDistance = outgoing?.distance || RELAY_DISTANCE
      const profile = legProfile(sprints[index], students[index], endDistance - startDistance, incoming, outgoing)
      const leg = { studentId: students[index].id, index, student: students[index],
        startTime, endTime: startTime + profile.time, startDistance, endDistance, profile,
        incomingExchange: incoming ? index - 1 : null, outgoingExchange: outgoing ? index : null }
      legs.push(leg)
      startTime = leg.endTime
      if (outgoing) {
        const zoneEntryTime = timeAtDistance(leg, outgoing.zoneStart)
        const overlapDuration = Math.min(outgoing.overlapDuration, Math.max(0.06, leg.endTime - zoneEntryTime - 0.12))
        const overlapStart = leg.endTime - overlapDuration
        const overlapState = profileState(profile, profile.time - overlapDuration)
        const overlapDistance = startDistance + overlapState.distance
        const preRunLength = overlapDistance - outgoing.zoneStart
        const prepareTime = timeAtDistance(leg, outgoing.prepareDistance)
        const desiredDuration = 2 * preRunLength / Math.max(1, overlapState.speed)
        const preRunDuration = Math.min(desiredDuration, Math.max(0.08, overlapStart - prepareTime))
        Object.assign(outgoing, { time: leg.endTime, preRunStart: overlapStart - preRunDuration,
          preRunDistance: outgoing.zoneStart, preRunLength, preRunDuration,
          preRunSpeed: profile.finishSpeed, catchSpeed: overlapState.speed, overlapDistance,
          overlapDuration, overlapStart, overlapEnd: leg.endTime + overlapDuration * 0.35,
          prepareTime, receivingLane: laneIndex + 1 })
      }
    }
    return { classId, className: entrant.className, color: entrant.color, lane: laneIndex + 1,
      studentIds: entrant.studentIds.slice(), totalTime: legs.at(-1).endTime, legs, exchanges }
  })
  // Save the order at each preparation line. Queue shifts during playback use
  // these same sampled exchange times, including after a reload or pause.
  for (let index = 4; index < RELAY_LEGS - 1; index++) {
    const order = plans.slice().sort((a, b) => a.exchanges[index].prepareTime - b.exchanges[index].prepareTime || a.lane - b.lane)
    for (let position = 0; position < order.length; position++) {
      Object.assign(order[position].exchanges[index], { queuePosition: position,
        queueOrder: order.map(plan => plan.classId), receivingLane: position + 1 })
    }
  }
  return plans
}

function laneAtDistance(plan, distance) {
  if (distance <= 320) return plan.lane
  return plan.lane + (activeLane(plan.lane) - plan.lane) * smooth((distance - 320) / 32)
}

function receivingLane(plan, exchange, plans, elapsed) {
  if (exchange.index === 3) return plan.lane // Fifth runner waits in the original lane.
  if (exchange.index < 3) return plan.lane
  let position = exchange.queuePosition || 0
  const before = exchange.queueOrder?.slice(0, position) || []
  for (const classId of before) {
    const other = plans.find(plan => plan.classId === classId)?.exchanges[exchange.index]
    // Once a recipient accelerates its assigned corridor stays fixed. The
    // waiting queue behind it can still slide after each successful transfer.
    if (other) position -= smooth((Math.min(elapsed, exchange.preRunStart) - other.time) / 0.8)
  }
  return 1 + clamp(position, 0, 7) * 0.9
}

function holderLane(plan, leg, distance, elapsed, plans) {
  let lane = laneAtDistance(plan, distance)
  const incoming = plan.exchanges[leg.index - 1], outgoing = plan.exchanges[leg.index]
  if (incoming && leg.index >= 4) {
    const transferLane = receivingLane(plan, incoming, plans, incoming.time)
    lane = transferLane + (activeLane(plan.lane) - transferLane) * smooth((distance - leg.startDistance) / 22)
  }
  if (outgoing?.index >= 3) {
    const transferLane = receivingLane(plan, outgoing, plans, outgoing.time)
    const approach = smooth((elapsed - (outgoing.overlapStart - 0.9)) / 0.9)
    lane += (transferLane - lane) * approach
  }
  return lane
}

function runner(plan, leg, trackDistance, trackLane, speed, opacity, baton, role, trueDistance = trackDistance) {
  return { id: `${plan.classId}-${leg.studentId}`, studentId: leg.studentId, classId: plan.classId,
    color: plan.color, lane: plan.lane, trackDistance, distance: trueDistance, trackLane, speed: Math.max(0, speed),
    opacity: clamp(opacity, 0, 1), baton, role, facing: relayPoint(trackDistance, plan.lane, trackLane).facing }
}

/** A pure read of saved plans; elapsed may be negative, paused, or past finish. */
export function relayRaceState(plans, elapsed) {
  const t = Math.max(0, finite(elapsed, 0))
  const teams = [], runners = []
  for (const plan of plans || []) {
    const finished = t >= plan.totalTime
    const legIndex = finished ? RELAY_LEGS - 1 : Math.max(0, plan.legs.findIndex(leg => t < leg.endTime))
    const leg = plan.legs[legIndex]
    const state = profileState(leg.profile, t - leg.startTime)
    const distance = finished ? RELAY_DISTANCE : clamp(leg.startDistance + state.distance, 0, RELAY_DISTANCE)
    teams.push({ classId: plan.classId, className: plan.className, color: plan.color, lane: plan.lane,
      distance, legIndex, studentId: leg.studentId, place: 0, finished, time: plan.totalTime,
      exchange: plan.exchanges.some(exchange => t >= exchange.overlapStart && t <= exchange.overlapEnd) })
    if (!finished) runners.push(runner(plan, leg, distance, holderLane(plan, leg, distance, t, plans),
      t > 0 ? state.speed : 0, 1, true, 'active'))
    // A recipient exists before the transfer and continues under the same
    // sprite ID afterward. Both sprites occupy the transfer point together.
    const nextExchange = plan.exchanges[legIndex]
    if (nextExchange && t >= Math.min(nextExchange.prepareTime - 1, nextExchange.preRunStart) && t < nextExchange.time) {
      const recipient = plan.legs[legIndex + 1]
      const progress = clamp((t - nextExchange.preRunStart) / nextExchange.preRunDuration, 0, 1)
      const length = nextExchange.preRunLength, duration = nextExchange.preRunDuration
      let recipientDistance = nextExchange.zoneStart + length * (3 * progress ** 2 - 2 * progress ** 3)
        + nextExchange.catchSpeed * duration * (progress ** 3 - progress ** 2)
      let recipientSpeed = (length * (6 * progress - 6 * progress ** 2)
        + nextExchange.catchSpeed * duration * (3 * progress ** 2 - 2 * progress)) / duration
      if (t >= nextExchange.overlapStart) {
        recipientDistance = distance
        recipientSpeed = state.speed
      }
      const queueLane = receivingLane(plan, nextExchange, plans, t)
      runners.push(runner(plan, recipient, recipientDistance, queueLane,
        t >= nextExchange.preRunStart ? recipientSpeed : 0, 1, false, 'receiving'))
    }
    // Previous runners visibly decelerate and fade instead of disappearing at
    // a baton handoff. The final runner carries the baton through its runout.
    for (const outgoing of plan.legs) {
      const after = t - outgoing.endTime
      const duration = outgoing.profile.runoutDuration
      if (after < 0 || after > duration || (outgoing.index === legIndex && !finished)) continue
      const exchange = plan.exchanges[outgoing.index]
      const coRunDuration = exchange ? exchange.overlapEnd - exchange.time : 0
      const runoutStart = outgoing.endTime + coRunDuration
      const following = plan.legs[outgoing.index + 1]
      const coRunState = following ? profileState(following.profile, Math.min(after, coRunDuration)) : null
      const runoutOrigin = coRunState ? following.startDistance + coRunState.distance : outgoing.endDistance
      const startSpeed = coRunState?.speed || outgoing.profile.finishSpeed
      const deceleration = Math.max(0, after - coRunDuration)
      const unit = clamp(deceleration / Math.max(0.1, duration - coRunDuration), 0, 1)
      const runoutDistance = runoutOrigin + startSpeed * (duration - coRunDuration) * (unit - unit ** 2 / 2)
      const atTransfer = following ? holderLane(plan, following, runoutOrigin, Math.min(t, runoutStart), plans)
        : holderLane(plan, outgoing, outgoing.endDistance, outgoing.endTime, plans)
      const trackLane = atTransfer + (Math.min(8, atTransfer + 0.7) - atTransfer) * smooth(unit)
      runners.push(runner(plan, outgoing, runoutDistance, trackLane,
        startSpeed * (1 - unit), 1 - smooth((unit - 0.55) / 0.45),
        outgoing.index === RELAY_LEGS - 1, 'runout'))
    }
  }
  const ordered = teams.slice().sort((a, b) => Number(b.finished) - Number(a.finished)
    || (a.finished && b.finished ? a.time - b.time : b.distance - a.distance) || a.lane - b.lane)
  ordered.forEach((team, index) => { team.place = index + 1 })
  separateSharedRunners(runners, plans, t)
  return { teams, runners, finished: teams.length > 0 && teams.every(team => team.finished) }
}

/** Display offsets preserve every baton metre and disappear in the transfer/finish zones. */
function separateSharedRunners(runners, plans) {
  const shared = runners.filter(runner => runner.role === 'active' && runner.distance > 355 && runner.distance < 1580)
  for (const current of shared) {
    const plan = plans.find(plan => plan.classId === current.classId)
    const leg = plan.legs.find(leg => leg.studentId === current.studentId)
    const incoming = plan.exchanges[leg.index - 1], outgoing = plan.exchanges[leg.index]
    // Fixed original-lane offsets are continuous when two teams overtake.
    // The 40 m ramps bound the extra apparent velocity and leave exact
    // positions at overlap start/end and at the common finish line.
    const incomingDistance = incoming ? leg.startDistance + profileState(leg.profile, incoming.overlapEnd - incoming.time).distance : leg.startDistance
    const outgoingDistance = outgoing?.overlapDistance ?? leg.endDistance
    const zoneFade = Math.min(smooth((current.distance - incomingDistance) / 40),
      smooth((outgoingDistance - current.distance) / 40),
      smooth((current.distance - 355) / 40), smooth((1580 - current.distance) / 40))
    const nearest = Math.min(80, ...shared.filter(other => other !== current).map(other => Math.abs(other.distance - current.distance)))
    const crowdFade = smooth((80 - nearest) / 48)
    current.trackDistance -= (current.lane - 1) * 3.4 * zoneFade * crowdFade
    current.facing = relayPoint(current.trackDistance, current.lane, current.trackLane).facing
  }
}
