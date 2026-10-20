import { shallowReactive } from 'vue'
import { nextRelayMatch, completeRelayMatch } from './relay-rules.js'
import { createRelayRace } from './relay-physics.js'
import { createMeetClock } from './meet-clock.js'
import { setMusicMode, playCountdown, playStartWhistle } from './audio.js'
import { relayLineupSnapshot } from './relay-data.js'

export const relayMeet = shallowReactive({ active: false, meet: null, match: null, plans: [],
  scope: 'school', runId: '', schoolIds: [], schoolIndex: 0, completedSchools: 0, stage: 'school',
  elapsed: 0, paused: false, speed: 1, phase: 'idle', error: '', startedAt: '', finishedAt: '' })
let dependencies, advancing = false, cue = 3, lastCheckpoint = 0, generation = 0
let progressWrites = Promise.resolve()
const clock = createMeetClock(() => { void advance() })
const now = () => performance.timeOrigin + performance.now()
const recentCue = at => !document.hidden && now() - at < 750
const maxTime = () => Math.max(0, ...relayMeet.plans.map(plan => plan.totalTime))
const clone = value => JSON.parse(JSON.stringify(value))
const current = token => relayMeet.active && generation === token
const schoolMeetId = () => `${relayMeet.runId}-${relayMeet.schoolIds[relayMeet.schoolIndex]}`

export function installRelayMeet(api) { dependencies = api }

function snapshot() {
  if (!relayMeet.active || ['finished', 'cancelling'].includes(relayMeet.stage)) return null
  return clone({ active: true, scope: relayMeet.scope, runId: relayMeet.runId,
    schoolIds: relayMeet.schoolIds, schoolIndex: relayMeet.schoolIndex,
    completedSchools: relayMeet.completedSchools, stage: relayMeet.stage,
    meet: relayMeet.meet, matchId: relayMeet.match?.id,
    plans: relayMeet.plans, elapsed: relayMeet.elapsed, paused: relayMeet.paused,
    speed: relayMeet.speed, phase: relayMeet.phase, startedAt: relayMeet.startedAt,
    finishedAt: relayMeet.finishedAt, pendingClock: clock.snapshotPending() })
}

function persistProgress(clear = false) {
  const progress = clear ? null : snapshot()
  const write = progressWrites.then(() => dependencies.saveProgress(progress))
  progressWrites = write.catch(() => {})
  lastCheckpoint = performance.now()
  return write
}

function checkpoint() {
  const token = generation
  void persistProgress().catch(error => {
    if (current(token)) relayMeet.error = `進度暫存失敗：${error.message}`
  })
}

function fail(error, token) {
  if (!current(token)) return
  clock.pause()
  Object.assign(relayMeet, { phase: 'saveerror', paused: true, error: error.message })
}

function prepare(at) {
  const match = nextRelayMatch(relayMeet.meet)
  if (!match) return false
  Object.assign(relayMeet, { match, plans: createRelayRace(match, relayMeet.meet, dependencies.getStudent),
    stage: 'school', elapsed: -3, phase: 'countdown', startedAt: new Date(at).toISOString(), finishedAt: '', error: '' })
  cue = 3
  if (!relayMeet.paused && recentCue(at)) playCountdown(3)
  return true
}

async function finish(token) {
  if (!current(token)) return
  clock.stop()
  relayMeet.stage = 'finished'
  await persistProgress(true)
  if (!current(token)) return
  Object.assign(relayMeet, { active: false, phase: 'complete', paused: false, error: '' })
  setMusicMode('ambient')
}

// Commit the next school cursor before creating its meet. A stable meet ID
// reconciles a refresh between saving a school's final result and its cursor.
async function finishSchool(at, token) {
  if (!current(token)) return
  if (relayMeet.scope !== 'national') return finish(token)
  relayMeet.completedSchools = relayMeet.schoolIndex + 1
  if (relayMeet.completedSchools >= relayMeet.schoolIds.length) return finish(token)
  Object.assign(relayMeet, { schoolIndex: relayMeet.schoolIndex + 1, stage: 'nextschool',
    phase: 'preparing', meet: null, match: null, plans: [], elapsed: 0 })
  await persistProgress()
  if (current(token)) await prepareNationalSchool(at, token)
}

async function prepareNationalSchool(at, token, progress = null) {
  while (current(token)) {
    Object.assign(relayMeet, { phase: 'preparing', meet: null, match: null, plans: [], error: '' })
    const id = schoolMeetId()
    const meet = dependencies.getMeet(id) || await dependencies.createMeet(relayMeet.schoolIds[relayMeet.schoolIndex], [], {
      id, nationalRunId: relayMeet.runId,
    })
    if (!current(token)) return
    relayMeet.meet = meet
    relayMeet.stage = 'school'
    if (meet.status === 'complete') {
      relayMeet.completedSchools = relayMeet.schoolIndex + 1
      if (relayMeet.completedSchools >= relayMeet.schoolIds.length) return finish(token)
      Object.assign(relayMeet, { schoolIndex: relayMeet.schoolIndex + 1, stage: 'nextschool', meet: null })
      await persistProgress()
      progress = null
      continue
    }
    restoreRace(progress, at)
    await persistProgress()
    return
  }
}

function restoreRace(progress, at) {
  const match = nextRelayMatch(relayMeet.meet)
  if (!match) throw new Error('目前學校沒有可接續的接力對戰，請重試。')
  const sameMatch = match.id === progress?.matchId && progress.plans?.length === match.classIds.length
  if (sameMatch) {
    relayMeet.match = match
    relayMeet.plans = progress.plans
    relayMeet.elapsed = Math.max(-3, Math.min(maxTime() + 3.2, Number(progress.elapsed) || 0))
    relayMeet.phase = relayMeet.elapsed < 0 ? 'countdown' : 'running'
    cue = Math.ceil(-relayMeet.elapsed)
    clock.restorePending(progress.pendingClock)
  } else prepare(at)
}

function startClock() {
  const pending = clock.snapshotPending()
  clock.start(relayMeet.speed)
  clock.restorePending(pending)
  if (relayMeet.paused) clock.pause()
  else setMusicMode('race')
}

function assertCanStart() {
  if (relayMeet.active || advancing || !dependencies.canStart()) throw new Error('請先完成目前的自動賽程。')
  clock.stop()
}

export async function startRelayMeet(meet) {
  assertCanStart()
  const token = ++generation
  advancing = true
  Object.assign(relayMeet, { active: true, scope: 'school', runId: meet.id, schoolIds: [],
    schoolIndex: 0, completedSchools: 0, stage: 'school', meet, match: null, plans: [], elapsed: 0,
    paused: false, speed: 1, phase: 'preparing', error: '' })
  try {
    if (!prepare(now())) { await finish(token); return }
    await persistProgress()
    if (current(token)) startClock()
  } catch (error) { fail(error, token) }
  finally { advancing = false }
}

export async function startNationalRelayMeet(schools) {
  assertCanStart()
  const schoolIds = [...new Set(schools.map(school => school.id))]
  if (!schoolIds.length) throw new Error('目前沒有可參賽的學校。')
  const token = ++generation
  advancing = true
  Object.assign(relayMeet, { active: true, scope: 'national', runId: `relay-national-${crypto.randomUUID()}`,
    schoolIds, schoolIndex: 0, completedSchools: 0, stage: 'nextschool', meet: null, match: null, plans: [],
    elapsed: 0, paused: false, speed: 16, phase: 'preparing', error: '', startedAt: '', finishedAt: '' })
  try {
    await persistProgress()
    if (!current(token)) return
    await prepareNationalSchool(now(), token)
    if (current(token)) startClock()
  } catch (error) { fail(error, token) }
  finally { advancing = false }
}

export async function restoreRelayMeet(progress) {
  const national = progress?.scope === 'national'
  if (!progress?.active || relayMeet.active || !dependencies.canStart()
    || (national ? !progress.runId || !progress.schoolIds?.length : !progress.meet)) return false
  const token = ++generation
  advancing = true
  clock.stop()
  Object.assign(relayMeet, { ...progress, scope: national ? 'national' : 'school',
    runId: progress.runId || progress.meet?.id, schoolIds: national ? progress.schoolIds : [],
    schoolIndex: national ? Math.max(0, Number(progress.schoolIndex) || 0) : 0,
    completedSchools: national ? Number(progress.completedSchools) || 0 : 0,
    stage: progress.stage || 'school', match: null, plans: [], active: true, error: '',
    speed: [1, 2, 4, 8, 16].includes(progress.speed) ? progress.speed : national ? 16 : 1,
    paused: Boolean(progress.paused) })
  try {
    if (national) {
      if (relayMeet.stage === 'finished' || relayMeet.schoolIndex >= relayMeet.schoolIds.length) await finish(token)
      else await prepareNationalSchool(now(), token, progress)
    } else {
      relayMeet.meet = !progress.meet.friendly && dependencies.getMeet(progress.meet.id) || progress.meet
      if (relayMeet.meet.status === 'complete' || !nextRelayMatch(relayMeet.meet)) await finish(token)
      else { restoreRace(progress, now()); await persistProgress() }
    }
    if (current(token)) startClock()
  } catch (error) { fail(error, token) }
  finally { advancing = false }
  return true
}

export function pauseRelayMeet() {
  if (!relayMeet.active || relayMeet.paused) return
  clock.pause()
  relayMeet.paused = true
  checkpoint()
}

export function toggleRelayPause() {
  if (!relayMeet.active || relayMeet.phase === 'saveerror' || ['finished', 'cancelling'].includes(relayMeet.stage)) return
  if (!relayMeet.paused) { pauseRelayMeet(); return }
  relayMeet.paused = false
  clock.resume()
  setMusicMode('race')
  checkpoint()
}

export function setRelaySpeed(speed) {
  if (!relayMeet.active || ![1, 2, 4, 8, 16].includes(speed) || relayMeet.speed === speed) return
  clock.setSpeed(speed)
  relayMeet.speed = speed
  checkpoint()
}

async function saveMatch(at, token) {
  const { match, meet, startedAt } = relayMeet
  relayMeet.phase = 'saving'
  const finishedAt = relayMeet.finishedAt || new Date(at).toISOString()
  const results = relayMeet.plans.map(plan => ({ classId: plan.classId, className: plan.className,
    color: plan.color, lane: plan.lane, time: plan.totalTime, studentIds: [...plan.studentIds],
    lineup: plan.legs.map(leg => relayLineupSnapshot(dependencies.getStudent(leg.studentId), leg.index + 1)),
    splits: plan.legs.map(leg => ({ studentId: leg.studentId, leg: leg.index + 1,
      time: leg.endTime - leg.startTime, startDistance: leg.startDistance, endDistance: leg.endDistance })),
    exchanges: plan.exchanges }))
  const saved = meet.friendly ? completeRelayMatch(meet, match.id, results, finishedAt)
    : await dependencies.saveMatch(meet, match, results, startedAt, finishedAt)
  if (!current(token)) return
  relayMeet.meet = saved
  if (!prepare(at)) { await finishSchool(at, token); return }
  // Store the new random plans before consuming any subsequent clock time.
  await persistProgress()
}

export async function retryRelaySave() {
  if (!relayMeet.active || relayMeet.phase !== 'saveerror' || advancing) return
  const token = generation
  advancing = true
  try {
    if (relayMeet.stage === 'cancelling') await completeTermination(token)
    else if (relayMeet.stage === 'finished') await finish(token)
    else if (relayMeet.scope === 'national' && (relayMeet.stage === 'nextschool' || !relayMeet.meet)) {
      await persistProgress()
      if (current(token)) await prepareNationalSchool(now(), token)
    } else if (relayMeet.meet.status === 'complete') await finishSchool(now(), token)
    else if (!relayMeet.match) {
      restoreRace(null, now())
      await persistProgress()
    } else if (relayMeet.elapsed >= maxTime()) await saveMatch(now(), token)
    else {
      await persistProgress()
      if (current(token)) Object.assign(relayMeet, { phase: relayMeet.elapsed < 0 ? 'countdown' : 'running', error: '' })
    }
    if (current(token) && relayMeet.phase !== 'saveerror') {
      relayMeet.paused = false
      startClock()
      checkpoint()
    }
  } catch (error) { fail(error, token) }
  finally { advancing = false }
}

export async function terminateNationalRelayMeet() {
  if (!relayMeet.active || relayMeet.scope !== 'national') return false
  const token = ++generation
  clock.stop()
  Object.assign(relayMeet, { phase: 'saving', stage: 'cancelling', paused: true, error: '' })
  setMusicMode('ambient')
  try { return await completeTermination(token) }
  catch (error) { fail(error, token); throw error }
}

async function completeTermination(token) {
  // Queued progress writes finish first; the tombstone is always the last write.
  // Keep the paused controller available for retry until that clear succeeds.
  await persistProgress(true)
  if (!current(token)) return false
  Object.assign(relayMeet, { active: false, phase: 'idle', stage: 'finished', paused: false,
    runId: '', meet: null, match: null, plans: [], schoolIds: [], error: '' })
  return true
}

export function dismissRelayMeet() {
  if (relayMeet.active) return
  ++generation
  clock.stop()
  Object.assign(relayMeet, { scope: 'school', runId: '', schoolIds: [], schoolIndex: 0,
    completedSchools: 0, stage: 'school', meet: null, match: null, plans: [], phase: 'idle', error: '' })
}

async function advance() {
  if (!relayMeet.active || relayMeet.paused || advancing || !['countdown', 'running'].includes(relayMeet.phase)) return
  const token = generation
  advancing = true
  try {
    let transitions = 0
    while (current(token) && !relayMeet.paused && ['countdown', 'running'].includes(relayMeet.phase) && transitions++ < 12) {
      const end = relayMeet.phase === 'countdown' ? 0 : maxTime() + 3.2
      const tick = clock.take(Math.max(0, end - relayMeet.elapsed), { realtime: relayMeet.phase === 'countdown' })
      relayMeet.elapsed += tick.seconds
      if (relayMeet.phase === 'countdown') {
        const remaining = Math.ceil(-relayMeet.elapsed)
        if (remaining > 0 && remaining !== cue) {
          cue = remaining
          if (recentCue(tick.at || now())) playCountdown(remaining)
        }
        if (relayMeet.elapsed >= 0) {
          relayMeet.phase = 'running'
          if (recentCue(tick.at || now())) playStartWhistle()
        } else break
      } else if (relayMeet.elapsed >= end) {
        relayMeet.finishedAt = new Date(tick.at || now()).toISOString()
        await saveMatch(tick.at || now(), token)
      } else break
      if (!tick.seconds && relayMeet.phase === 'running') break
    }
    if (current(token) && performance.now() - lastCheckpoint > 5000) checkpoint()
  } catch (error) { fail(error, token) }
  finally { advancing = false }
}
